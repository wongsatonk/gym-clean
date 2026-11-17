/**
 * M12 brain router: the seam slices 2 (Apple) and 3 (Claude) plug into (SPEC M12 goal 5).
 *
 * - Chips → the rules directly (source 'chip'); no model brain is checked or asked.
 * - Free text → the first brain, in BRAIN_ORDER (apple → claude → rules), whose `status()` says
 *   available. A brain that is unavailable, errors, hangs or answers empty is skipped and the
 *   next one is tried; the reply then carries a one-line `note` naming who answered and why.
 * - The rules always end the list (added if missing), and if even they throw the router answers
 *   with the help line + quick chips. `ask` never rejects: never a dead end.
 * - Health never reaches Claude (M11-q7): Claude gets no turn with `usedHealth`, no Health /
 *   readiness field of the coach context, and its reply never carries `usedHealth`.
 * - Every brain gets at most the last MAX_TURNS turns.
 * - M12 slice 2: a red flag in the message goes straight to the rules (no model sees it). A
 *   brain whose status carries a `reasonId` (Apple) gets its plain note (notes.ts) **once per
 *   reason**, remembered in the injected note store (settings 'coach' → `brainNotes`); a
 *   rejection carrying a `code` (BrainError) gets its one-line error note **every time**. Other
 *   failures keep the generic "Answered by …: …" note.
 *
 * Lives in src/data (not core) because it deals with async brains and timers.
 */
import { HELP_TEXT } from '../../core/trainer/replies';
import {
  QUICK_CHIPS,
  type CoachArgs,
  type CoachChipId,
  type CoachContext,
} from '../../core/trainer/coach';
import type {
  BrainContext,
  BrainReply,
  BrainSource,
  ChatMessage,
  CoachBrain,
} from '../../core/types';
import { matchIntent } from '../../core/trainer/intents';
import type { BrainErrorCode, BrainUnavailableReason } from '../../core/types';
import { answerChip, rulesBrain } from './rules';
import {
  UNAVAILABLE_COPY,
  brainErrorCode,
  errorNote,
  isUnavailableReason,
  memoryNoteStore,
  type BrainNoteStore,
  type NoteBrain,
} from './notes';

/** Free-text order. 'chip' is not a brain (it's the rules, answering a tap). */
export const BRAIN_ORDER: readonly BrainSource[] = ['apple', 'claude', 'rules'];

/** Most turns any brain sees (SPEC M12: "the last ~8 turns"). */
export const MAX_TURNS = 8;

/** Default wait for a model's answer before falling to the next brain. */
export const ASK_TIMEOUT_MS = 25_000;
/** Default wait for a status check (a native bridge can hang; M11 used 4 s). */
export const STATUS_TIMEOUT_MS = 4_000;

export const BRAIN_LABEL: Record<BrainSource, string> = {
  chip: 'Quick replies',
  rules: 'Quick replies',
  apple: 'Apple Intelligence',
  claude: 'Claude',
};

export type RouterInput = { text: string } | { chip: CoachChipId; args?: CoachArgs };

export type RouterOptions = {
  askTimeoutMs?: number;
  statusTimeoutMs?: number;
  /** Where "note shown" times live (default: in memory). Main passes `coachNoteStore(db)`. */
  notes?: BrainNoteStore;
  /** Clock for the stored note times (default Date.now). */
  now?: () => number;
};

export type BrainStatusLine = {
  id: BrainSource;
  label: string;
  available: boolean;
  reason?: string;
  /** Apple's reason id, when the brain gives one (drives the once-only note). */
  reasonId?: BrainUnavailableReason;
};

/** For Settings: who answers free text now, in one line, and each brain with its reason. */
export type RouterStatus = {
  answering: BrainSource;
  line: string;
  brains: BrainStatusLine[];
};

export type CoachRouter = {
  ask(input: RouterInput, ctx: BrainContext): Promise<BrainReply>;
  status(): Promise<RouterStatus>;
};

/** Context keys that could carry Health data; never sent to Claude. */
const HEALTH_KEY_RE = /^(health|readiness)/i;

/** The turns `brain` may see: the last MAX_TURNS, and for Claude none that used Health. */
export function turnsFor(brain: BrainSource, turns: readonly ChatMessage[]): ChatMessage[] {
  const allowed = brain === 'claude' ? turns.filter((t) => t.usedHealth !== true) : turns;
  return allowed.slice(-MAX_TURNS);
}

function contextFor(brain: BrainSource, ctx: BrainContext): BrainContext {
  let coach = ctx.coach;
  if (brain === 'claude') {
    coach = Object.fromEntries(
      Object.entries(coach).filter(([k]) => !HEALTH_KEY_RE.test(k)),
    ) as CoachContext;
  }
  return { coach, turns: turnsFor(brain, ctx.turns) };
}

class Timeout extends Error {}

/** Runs `run` (sync throws become rejections) and rejects with Timeout after `ms`. */
function within<T>(ms: number, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Timeout()), ms);
    let p: Promise<T>;
    try {
      p = run();
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

const notAvailable = (id: BrainSource) => `${BRAIN_LABEL[id]} isn't available`;

async function checkStatus(brain: CoachBrain, ms: number): Promise<BrainStatusLine> {
  const base = { id: brain.id, label: BRAIN_LABEL[brain.id] };
  try {
    const s = await within(ms, () => brain.status());
    if (s.available === true) return { ...base, available: true };
    const reason = typeof s.reason === 'string' && s.reason.trim() ? s.reason.trim() : '';
    const reasonId = (s as { reasonId?: unknown }).reasonId;
    return {
      ...base,
      available: false,
      reason: reason || notAvailable(brain.id),
      ...(isUnavailableReason(reasonId) && { reasonId }),
    };
  } catch {
    return { ...base, available: false, reason: notAvailable(brain.id) };
  }
}

function isAnswer(r: unknown): r is BrainReply {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.reply === 'string' && o.reply.trim() !== '' && Array.isArray(o.chips);
}

/** Sentence-case label inside a note ("Answered by quick replies: …"). */
const inNote = (id: BrainSource) =>
  id === 'rules' || id === 'chip' ? 'quick replies' : BRAIN_LABEL[id];

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

const WORKOUT_CHIP_IDS: readonly CoachChipId[] = ['easyOn', 'lighter', 'swap'];

/** Last resort when even the rules throw: the help line and the quick chips. */
function helpReply(ctx: BrainContext, source: BrainSource): BrainReply {
  const workout = (ctx.coach as Partial<CoachContext> | undefined)?.phase === 'workout';
  const chips = QUICK_CHIPS.filter((c) => !workout || WORKOUT_CHIP_IDS.includes(c.id)).map((c) => ({
    ...c,
  }));
  return { reply: HELP_TEXT, chips, safety: 'none', intent: 'help', source };
}

/**
 * The router over `brains` (any order; duplicates keep the first; the rules are added if
 * missing). Slice 1 registers `[rulesBrain]`.
 */
export function createRouter(brains: readonly CoachBrain[], opts: RouterOptions = {}): CoachRouter {
  const askMs = opts.askTimeoutMs ?? ASK_TIMEOUT_MS;
  const statusMs = opts.statusTimeoutMs ?? STATUS_TIMEOUT_MS;
  const byId = new Map<BrainSource, CoachBrain>();
  for (const b of brains) if (BRAIN_ORDER.includes(b.id) && !byId.has(b.id)) byId.set(b.id, b);
  if (!byId.has('rules')) byId.set('rules', rulesBrain);
  const chain = BRAIN_ORDER.flatMap((id) => {
    const b = byId.get(id);
    return b ? [b] : [];
  });

  const notes = opts.notes ?? memoryNoteStore();
  const now = opts.now ?? Date.now;
  /** Reasons noted by this router (so a failing store can't repeat the note). */
  const noted = new Set<BrainUnavailableReason>();

  /** True the first time `reason` is seen (stored + remembered); never throws. */
  async function firstTime(reason: BrainUnavailableReason): Promise<boolean> {
    if (noted.has(reason)) return false;
    noted.add(reason);
    const stored = await notes.load().catch(() => ({}) as Awaited<ReturnType<typeof notes.load>>);
    if (stored[reason] !== undefined) return false;
    await notes.save({ ...stored, [reason]: now() }).catch(() => undefined);
    return true;
  }

  type Miss =
    | { kind: 'plain'; text: string }
    | { kind: 'error'; code: BrainErrorCode; brain: NoteBrain }
    | { kind: 'generic'; text: string };

  function noteFor(misses: readonly Miss[], answered: NoteBrain): string | undefined {
    const parts: string[] = [];
    const generic: string[] = [];
    for (const m of misses) {
      if (m.kind === 'plain') parts.push(m.text);
      else if (m.kind === 'error') parts.push(errorNote(m.code, m.brain, answered));
      else generic.push(m.text);
    }
    if (generic.length)
      parts.push(sentence(`Answered by ${inNote(answered)}: ${generic.join('; ')}`));
    return parts.length ? parts.join(' ') : undefined;
  }

  async function askText(text: string, ctx: BrainContext): Promise<BrainReply> {
    const misses: Miss[] = [];
    const redFlag = matchIntent(text).safety === 'redFlag';
    for (const brain of chain) {
      const isRules = brain.id === 'rules';
      if (!isRules) {
        if (redFlag) continue;
        const s = await checkStatus(brain, statusMs);
        if (!s.available) {
          if (s.reasonId) {
            if (await firstTime(s.reasonId))
              misses.push({ kind: 'plain', text: UNAVAILABLE_COPY[s.reasonId].note });
          } else misses.push({ kind: 'generic', text: s.reason ?? notAvailable(brain.id) });
          continue;
        }
      }
      try {
        const raw = await within(askMs, () => brain.ask(text, contextFor(brain.id, ctx)));
        if (!isAnswer(raw)) throw new Error('empty answer');
        const reply: BrainReply = { ...raw, source: brain.id };
        if (brain.id === 'claude') delete reply.usedHealth;
        const note = noteFor(misses, brain.id as NoteBrain);
        if (note) reply.note = note;
        else delete reply.note;
        return reply;
      } catch (err) {
        if (isRules) break;
        const code = err instanceof Timeout ? undefined : brainErrorCode(err);
        misses.push(
          code
            ? { kind: 'error', code, brain: brain.id as NoteBrain }
            : {
                kind: 'generic',
                text:
                  err instanceof Timeout
                    ? `${BRAIN_LABEL[brain.id]} took too long`
                    : `${BRAIN_LABEL[brain.id]} didn't answer`,
              },
        );
      }
    }
    const fallback = helpReply(ctx, 'rules');
    const note = noteFor(misses, 'rules');
    if (note) fallback.note = note;
    return fallback;
  }

  return {
    async ask(input, ctx) {
      if ('chip' in input) {
        try {
          return answerChip(input, contextFor('rules', ctx));
        } catch {
          return helpReply(ctx, 'chip');
        }
      }
      try {
        return await askText(input.text, ctx);
      } catch {
        return helpReply(ctx, 'rules');
      }
    },

    async status() {
      const lines = await Promise.all(
        chain.map((b) =>
          b.id === 'rules'
            ? Promise.resolve<BrainStatusLine>({
                id: 'rules',
                label: BRAIN_LABEL.rules,
                available: true,
              })
            : checkStatus(b, statusMs),
        ),
      );
      const first = lines.find((l) => l.available) ?? lines[lines.length - 1];
      const answering = first?.id ?? 'rules';
      const before = lines.slice(0, Math.max(0, lines.indexOf(first as BrainStatusLine)));
      const why = before[0]?.reason;
      const line =
        answering === 'rules'
          ? sentence(`Quick replies answer your messages${why ? `: ${why}` : ''}`)
          : `${BRAIN_LABEL[answering]} answers your messages.`;
      return { answering, line, brains: lines };
    },
  };
}
