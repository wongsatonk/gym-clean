import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../core/types';
import { GymDb } from '../db';
import {
  CHAT_KEEP_DAYS,
  COACH_UI_KEY,
  addMessage,
  clearChat,
  getCoachUi,
  listThread,
  patchCoachUi,
  pruneChat,
  updateCard,
} from './store';

const DAY = 86_400_000;
const NOW = Date.UTC(2030, 0, 31, 12); // made-up clock

let db: GymDb;
let n = 0;

beforeEach(async () => {
  db = new GymDb(`chat-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  createdAt: NOW,
  role: 'user',
  text: 'How is my week?',
  source: 'chip',
  phase: 'today',
  ...over,
});

describe('chat store (M12)', () => {
  it('keeps 30 days', () => {
    expect(CHAT_KEEP_DAYS).toBe(30);
  });

  it('round-trips every field of a message, with a card and chips', async () => {
    const m = msg({
      role: 'coach',
      text: 'Here is a lighter day.',
      say: 'Lighter today?',
      source: 'rules',
      phase: 'workout',
      card: {
        kind: 'proposal',
        title: 'Lighter today',
        lines: [{ before: '4 × 8', after: '3 × 8' }],
        why: 'One set fewer.',
        status: 'pending',
        baseVersion: 3,
      },
      chips: [{ id: 'lighter', label: 'Lighter today', args: { exerciseId: 'x' } }],
      note: 'Answered by quick replies.',
    });
    const id = await addMessage(db, m);
    expect(id).toBeGreaterThan(0);
    expect(await listThread(db, NOW)).toEqual([{ ...m, id }]);
  });

  it('ignores a caller-supplied id and never mutates the input', async () => {
    const m = msg({ id: 999 });
    const id = await addMessage(db, m);
    expect(id).not.toBe(999);
    expect(m.id).toBe(999);
    expect((await listThread(db, NOW))[0]?.id).toBe(id);
  });

  it('lists the thread oldest first; same time keeps insert order', async () => {
    await addMessage(db, msg({ createdAt: NOW - 5, text: 'b' }));
    await addMessage(db, msg({ createdAt: NOW - 10, text: 'a' }));
    await addMessage(db, msg({ createdAt: NOW - 5, text: 'c' }));
    expect((await listThread(db, NOW)).map((m) => m.text)).toEqual(['a', 'b', 'c']);
  });

  it('lists only the last 30 days (older rows stay until pruned)', async () => {
    await addMessage(db, msg({ createdAt: NOW - 30 * DAY - 1, text: 'old' }));
    await addMessage(db, msg({ createdAt: NOW - 30 * DAY, text: 'edge' }));
    await addMessage(db, msg({ createdAt: NOW - DAY, text: 'new' }));
    expect((await listThread(db, NOW)).map((m) => m.text)).toEqual(['edge', 'new']);
    expect(await db.chatMessages.count()).toBe(3);
  });

  it('prunes messages older than 30 days and returns how many', async () => {
    await addMessage(db, msg({ createdAt: NOW - 40 * DAY, text: 'older' }));
    await addMessage(db, msg({ createdAt: NOW - 30 * DAY - 1, text: 'old' }));
    await addMessage(db, msg({ createdAt: NOW - 30 * DAY, text: 'edge' }));
    await addMessage(db, msg({ createdAt: NOW, text: 'now' }));
    expect(await pruneChat(db, NOW)).toBe(2);
    expect((await db.chatMessages.toArray()).map((m) => m.text)).toEqual(['edge', 'now']);
    expect(await pruneChat(db, NOW)).toBe(0);
  });

  it('clears the whole thread and nothing else', async () => {
    await addMessage(db, msg());
    await addMessage(db, msg({ role: 'coach', source: 'rules' }));
    await db.settings.put({ key: 'unit', value: 'kg' });
    await clearChat(db);
    expect(await db.chatMessages.count()).toBe(0);
    expect(await listThread(db, NOW)).toEqual([]);
    expect(await db.settings.count()).toBe(1);
  });

  it('updates a card status (and changeId) in place', async () => {
    const id = await addMessage(
      db,
      msg({
        role: 'coach',
        source: 'rules',
        card: {
          kind: 'proposal',
          title: 't',
          lines: [],
          why: 'w',
          status: 'pending',
          baseVersion: 1,
        },
      }),
    );
    expect(await updateCard(db, id, { status: 'applied', changeId: 7 })).toBe(true);
    expect((await db.chatMessages.get(id))?.card).toEqual({
      kind: 'proposal',
      title: 't',
      lines: [],
      why: 'w',
      status: 'applied',
      baseVersion: 1,
      changeId: 7,
    });
    expect(await updateCard(db, id, { status: 'undone' })).toBe(true);
    expect((await db.chatMessages.get(id))?.card).toMatchObject({ status: 'undone', changeId: 7 });
  });

  it('updates a food card’s logged list', async () => {
    const id = await addMessage(
      db,
      msg({ role: 'coach', source: 'rules', card: { kind: 'food', suggestions: [], logged: [] } }),
    );
    expect(await updateCard(db, id, { logged: [0, 2] })).toBe(true);
    expect((await db.chatMessages.get(id))?.card).toEqual({
      kind: 'food',
      suggestions: [],
      logged: [0, 2],
    });
  });

  it('marks a check-in card done or skipped, and ignores other statuses', async () => {
    const card = { kind: 'checkIn', weekStart: '2026-11-09', status: 'pending' } as const;
    const id = await addMessage(db, msg({ role: 'coach', source: 'rules', card }));
    expect(await updateCard(db, id, { status: 'applied' })).toBe(true);
    expect((await db.chatMessages.get(id))?.card).toEqual(card);
    expect(await updateCard(db, id, { checkIn: 'done' })).toBe(true);
    expect((await db.chatMessages.get(id))?.card).toEqual({ ...card, status: 'done' });
    const id2 = await addMessage(db, msg({ role: 'coach', source: 'rules', card }));
    expect(await updateCard(db, id2, { checkIn: 'skipped' })).toBe(true);
    expect((await db.chatMessages.get(id2))?.card).toEqual({ ...card, status: 'skipped' });
  });

  it('never changes a card’s kind and ignores fields the kind lacks', async () => {
    const id = await addMessage(
      db,
      msg({ role: 'coach', source: 'rules', card: { kind: 'focusBlock', blockId: 'b1', status: 'pending' } }),
    );
    const patch = { kind: 'redFlag', status: 'applied', logged: [1] } as unknown as Parameters<
      typeof updateCard
    >[2];
    expect(await updateCard(db, id, patch)).toBe(true);
    expect((await db.chatMessages.get(id))?.card).toEqual({
      kind: 'focusBlock',
      blockId: 'b1',
      status: 'applied',
    });
  });

  it('returns false for an unknown id or a message without a card', async () => {
    expect(await updateCard(db, 12345, { status: 'applied' })).toBe(false);
    const id = await addMessage(db, msg());
    expect(await updateCard(db, id, { status: 'applied' })).toBe(false);
    expect((await db.chatMessages.get(id))?.card).toBeUndefined();
  });
});

describe('coach UI state (settings key "coach")', () => {
  it('defaults to nothing answered and no recap', async () => {
    expect(COACH_UI_KEY).toBe('coach');
    expect(await getCoachUi(db)).toEqual({ missedAnswered: [] });
  });

  it('patches and reads back, keeping other fields in the row', async () => {
    await db.settings.put({ key: 'coach', value: { model: 'x' } });
    await patchCoachUi(db, { missedAnswered: ['2030-01-28', '2030-01-28', 'bad'] });
    await patchCoachUi(db, { lastWeekRecap: '2030-01-21' });
    await patchCoachUi(db, { lastBlockRecap: 'block-1' });
    expect(await getCoachUi(db)).toEqual({
      missedAnswered: ['2030-01-28'],
      lastWeekRecap: '2030-01-21',
      lastBlockRecap: 'block-1',
    });
    expect((await db.settings.get('coach'))?.value).toMatchObject({ model: 'x' });
  });

  it('M12 1b: keeps the last review time and deload offer date; drops bad ones', async () => {
    await patchCoachUi(db, { lastReviewAt: 1_900_000_000_000, lastDeloadOfferAt: '2030-01-21' });
    expect(await getCoachUi(db)).toMatchObject({
      lastReviewAt: 1_900_000_000_000,
      lastDeloadOfferAt: '2030-01-21',
    });
    await db.settings.put({ key: 'coach', value: { lastReviewAt: 'x', lastDeloadOfferAt: 'soon' } });
    expect(await getCoachUi(db)).toEqual({ missedAnswered: [] });
  });

  it('reads bad stored values as defaults', async () => {
    await db.settings.put({
      key: 'coach',
      value: { missedAnswered: 'x', lastWeekRecap: 5, lastBlockRecap: null },
    });
    expect(await getCoachUi(db)).toEqual({ missedAnswered: [] });
  });

  it('keeps only the last 60 answered dates', async () => {
    const dates = Array.from({ length: 70 }, (_, i) =>
      new Date(Date.UTC(2030, 0, 1) + i * DAY).toISOString().slice(0, 10),
    );
    await patchCoachUi(db, { missedAnswered: dates });
    const got = (await getCoachUi(db)).missedAnswered;
    expect(got).toHaveLength(60);
    expect(got[0]).toBe(dates[10]);
    expect(got.at(-1)).toBe(dates[69]);
  });
});
