/**
 * M12 coach chat persistence (Dexie v8 `chatMessages` + settings key 'coach').
 *
 * - The thread stays on the phone: `chatMessages` is in LOCAL_ONLY_TABLES (src/data/backup.ts),
 *   so it is never in a backup and a restore leaves it alone; nothing here writes to the
 *   developer log (which keeps ids and numbers only).
 * - Last 30 days: `listThread` shows only those; `pruneChat` deletes older rows (call it on
 *   app start / when the Coach tab opens). `clearChat` is Settings → Clear chat.
 * - Coach UI state (missed-day dates already answered, the last recaps posted) lives in the
 *   `settings` row 'coach'. It holds dates and ids, never message text, and is backed up.
 *
 * Time is passed in (`now`, ms) so callers and tests control it.
 */
import type { ChatCard, ChatCardStatus, ChatMessage } from '../../core/types';
import type { GymDb } from '../db';

export const CHAT_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

/** Oldest `createdAt` still kept at `now`. */
export const chatCutoff = (now: number): number => now - CHAT_KEEP_DAYS * DAY_MS;

/** Stores a message (any `id` on it is ignored) and returns its new id. */
export async function addMessage(db: GymDb, message: ChatMessage): Promise<number> {
  const row: ChatMessage = { ...message };
  delete row.id;
  return db.chatMessages.add(row);
}

/** The thread of the last 30 days, oldest first (same time → insert order). */
export async function listThread(db: GymDb, now: number): Promise<ChatMessage[]> {
  const rows = await db.chatMessages.where('createdAt').aboveOrEqual(chatCutoff(now)).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt || (a.id ?? 0) - (b.id ?? 0));
}

/** Deletes messages older than 30 days; returns how many went. */
export async function pruneChat(db: GymDb, now: number): Promise<number> {
  return db.chatMessages.where('createdAt').below(chatCutoff(now)).delete();
}

/** Settings → Clear chat: the whole thread goes (nothing else). */
export async function clearChat(db: GymDb): Promise<void> {
  await db.chatMessages.clear();
}

/** What a card can change after it is posted. A card's kind never changes. */
export type ChatCardPatch = {
  status?: ChatCardStatus;
  /** Proposal cards: the applied plan change (for Undo). */
  changeId?: number;
  /** Food cards: indexes of suggestions he logged. */
  logged?: number[];
};

function patched(card: ChatCard, p: ChatCardPatch): ChatCard {
  switch (card.kind) {
    case 'proposal':
      return {
        ...card,
        ...(p.status !== undefined && { status: p.status }),
        ...(p.changeId !== undefined && { changeId: p.changeId }),
      };
    case 'focusBlock':
      return { ...card, ...(p.status !== undefined && { status: p.status }) };
    case 'food':
      return { ...card, ...(p.logged !== undefined && { logged: [...p.logged] }) };
    case 'redFlag':
    case 'recap':
    case 'checkIn': // M12 slice 2: task 17 decides how a check-in card is patched.
      return card;
  }
}

/**
 * Updates the card on message `id` (Apply / Not now / Undo / expired, food logged). Only the
 * fields that kind has are changed. Returns false when there is no such message or no card.
 */
export async function updateCard(db: GymDb, id: number, patch: ChatCardPatch): Promise<boolean> {
  return db.transaction('rw', db.chatMessages, async () => {
    const row = await db.chatMessages.get(id);
    if (!row?.card) return false;
    await db.chatMessages.put({ ...row, card: patched(row.card, patch) });
    return true;
  });
}

// ---------- coach UI state (settings key 'coach') ----------

export const COACH_UI_KEY = 'coach';
/** Answered missed-day dates kept (the prompt only looks back 7 days). */
const MISSED_KEEP = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CoachUiState = {
  /** Missed planned dates (YYYY-MM-DD) whose Today prompt he already answered (Move / Skip). */
  missedAnswered: string[];
  /** Week start (YYYY-MM-DD) of the last week recap posted. */
  lastWeekRecap?: string;
  /** Id of the last focus block whose recap was posted. */
  lastBlockRecap?: string;
  /** M12 1b: when the last goal review was posted in the chat (ms). */
  lastReviewAt?: number;
  /** M12 1b: local date (YYYY-MM-DD) the last deload suggestion was posted in the chat. */
  lastDeloadOfferAt?: string;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function dates(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ok = v.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d));
  return [...new Set(ok)].sort().slice(-MISSED_KEEP);
}

function parseCoachUi(v: unknown): CoachUiState {
  const o = isObj(v) ? v : {};
  const out: CoachUiState = { missedAnswered: dates(o.missedAnswered) };
  if (typeof o.lastWeekRecap === 'string' && DATE_RE.test(o.lastWeekRecap))
    out.lastWeekRecap = o.lastWeekRecap;
  if (typeof o.lastBlockRecap === 'string' && o.lastBlockRecap !== '')
    out.lastBlockRecap = o.lastBlockRecap;
  if (typeof o.lastReviewAt === 'number' && Number.isFinite(o.lastReviewAt) && o.lastReviewAt > 0)
    out.lastReviewAt = o.lastReviewAt;
  if (typeof o.lastDeloadOfferAt === 'string' && DATE_RE.test(o.lastDeloadOfferAt))
    out.lastDeloadOfferAt = o.lastDeloadOfferAt;
  return out;
}

/** The stored coach UI state; bad or missing fields read as defaults. */
export async function getCoachUi(db: GymDb): Promise<CoachUiState> {
  return parseCoachUi((await db.settings.get(COACH_UI_KEY))?.value);
}

/** Merges `patch` into the 'coach' row (other fields in the row are kept). */
export async function patchCoachUi(db: GymDb, patch: Partial<CoachUiState>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const prev = (await db.settings.get(COACH_UI_KEY))?.value;
    const base = isObj(prev) ? prev : {};
    const next = parseCoachUi({ ...base, ...patch });
    await db.settings.put({ key: COACH_UI_KEY, value: { ...base, ...next } });
  });
}
