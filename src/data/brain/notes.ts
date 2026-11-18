/**
 * M12 slice 2 (task 8): the plain notes the chat shows when a model brain can't answer, and the
 * bridge error convention.
 *
 * - Unavailable (Apple's `availability()`): one plain note per reason, **once** (the time it was
 *   shown is stored in settings 'coach' → `brainNotes`); `status` is the short reason Settings and
 *   the router's status line use.
 * - Errors (a failed `respond`): a one-line note **every time**, naming who answered instead.
 * - Error convention: the bridge rejects with an Error (or any object) carrying
 *   `code: BrainErrorCode`; anything else counts as `'other'` in the adapter.
 *
 * Copy is data and passes `checkCopy` (notes.test.ts). No numbers, no message text.
 */
import type {
  BrainErrorCode,
  BrainSource,
  BrainUnavailableReason,
  CoachSettings,
} from '../../core/types';
import type { GymDb } from '../db';
import { COACH_UI_KEY } from '../chat/store';

export const BRAIN_UNAVAILABLE_REASONS = [
  'deviceNotEligible',
  'appleIntelligenceNotEnabled',
  'modelNotReady',
  'unsupported',
  'notNative',
] as const satisfies readonly BrainUnavailableReason[];

export const BRAIN_ERROR_CODES = [
  'guardrail',
  'contextTooLong',
  'unsupportedLanguage',
  'timeout',
  'other',
] as const satisfies readonly BrainErrorCode[];

/** Per reason: the short status (Settings, router status line) and the once-only chat note. */
export const UNAVAILABLE_COPY: Record<BrainUnavailableReason, { status: string; note: string }> = {
  appleIntelligenceNotEnabled: {
    status: 'Apple Intelligence is off',
    note: "Apple Intelligence is off, so I'm using quick replies. Turn it on in Settings > Apple Intelligence & Siri.",
  },
  modelNotReady: {
    status: 'Apple Intelligence is still downloading',
    note: "Apple Intelligence is still downloading. Quick replies until it's ready.",
  },
  deviceNotEligible: {
    status: "This iPhone can't run Apple Intelligence",
    note: "This iPhone can't run Apple Intelligence. Quick replies still work.",
  },
  unsupported: {
    status: "Apple's on-device model isn't available here",
    note: "Apple's on-device model isn't available on this iPhone. Quick replies still work.",
  },
  notNative: {
    status: 'On-device AI needs the iPhone app',
    note: 'On-device AI works in the iPhone app. Quick replies answer here.',
  },
};

export type NoteBrain = Exclude<BrainSource, 'chip'>;

/** Brain names inside a note sentence. */
const BRAIN_LABEL_FOR_NOTES: Record<NoteBrain, string> = {
  apple: 'Apple Intelligence',
  claude: 'Claude',
  rules: 'quick replies',
};

/** Per error code: `{brain}` = who failed, `{who}` = who answered instead. One sentence. */
export const ERROR_NOTE: Record<BrainErrorCode, string> = {
  guardrail: "{brain} wouldn't answer that one, so {who} did.",
  contextTooLong: 'That was too long for {brain}, so {who} answered.',
  unsupportedLanguage: '{brain} answers in English only, so {who} answered.',
  timeout: '{brain} took too long, so {who} answered.',
  other: "{brain} didn't answer, so {who} did.",
};

/** The error note for `code` when `failed` couldn't answer and `answered` did. */
export function errorNote(code: BrainErrorCode, failed: NoteBrain, answered: NoteBrain): string {
  return ERROR_NOTE[code]
    .replace('{brain}', BRAIN_LABEL_FOR_NOTES[failed])
    .replace('{who}', BRAIN_LABEL_FOR_NOTES[answered]);
}

/** Every line above (copy check). */
export function noteCopy(): string[] {
  const brains: NoteBrain[] = ['apple', 'claude'];
  return [
    ...Object.values(UNAVAILABLE_COPY).flatMap((c) => [c.status, c.note]),
    ...BRAIN_ERROR_CODES.flatMap((c) =>
      brains.flatMap((b) => [errorNote(c, b, 'rules'), errorNote(c, 'apple', 'claude')]),
    ),
  ];
}

export function isUnavailableReason(v: unknown): v is BrainUnavailableReason {
  return typeof v === 'string' && (BRAIN_UNAVAILABLE_REASONS as readonly string[]).includes(v);
}

const isErrorCode = (v: unknown): v is BrainErrorCode =>
  typeof v === 'string' && (BRAIN_ERROR_CODES as readonly string[]).includes(v);

/** A failed brain call with its code. The message never holds model or user text. */
export class BrainError extends Error {
  readonly code: BrainErrorCode;
  constructor(code: BrainErrorCode) {
    super(`brain error: ${code}`);
    this.name = 'BrainError';
    this.code = code;
  }
}

/** The `code` a bridge put on a rejection, if it is a known BrainErrorCode. */
export function brainErrorCode(err: unknown): BrainErrorCode | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return isErrorCode(code) ? code : undefined;
}

// ---------- once-per-reason memory (settings 'coach' → brainNotes) ----------

export type BrainNotes = NonNullable<CoachSettings['brainNotes']>;

export type BrainNoteStore = {
  load(): Promise<BrainNotes>;
  save(notes: BrainNotes): Promise<void>;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseBrainNotes(v: unknown): BrainNotes {
  const out: BrainNotes = {};
  if (!isObj(v)) return out;
  for (const r of BRAIN_UNAVAILABLE_REASONS) {
    const t = v[r];
    if (typeof t === 'number' && Number.isFinite(t) && t > 0) out[r] = t;
  }
  return out;
}

/** In memory (tests, and the router's default when main passes no store). */
export function memoryNoteStore(initial: BrainNotes = {}): BrainNoteStore {
  let notes = { ...initial };
  return {
    load: () => Promise.resolve({ ...notes }),
    save: (n) => {
      notes = { ...n };
      return Promise.resolve();
    },
  };
}

/** `brainNotes` inside the settings 'coach' row; every other field of the row is kept. */
export function coachNoteStore(db: GymDb): BrainNoteStore {
  return {
    async load() {
      const row = (await db.settings.get(COACH_UI_KEY))?.value;
      return parseBrainNotes(isObj(row) ? row.brainNotes : undefined);
    },
    async save(notes) {
      await db.transaction('rw', db.settings, async () => {
        const prev = (await db.settings.get(COACH_UI_KEY))?.value;
        const base = isObj(prev) ? prev : {};
        await db.settings.put({
          key: COACH_UI_KEY,
          value: { ...base, brainNotes: parseBrainNotes(notes) },
        });
      });
    },
  };
}
