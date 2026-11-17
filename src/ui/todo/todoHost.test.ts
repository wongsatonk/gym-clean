// M12 slice 1c review: todoHost's ready signal (e2e waits on it before asserting that the tour or
// the to-do card is absent, instead of a fixed wait). Ready only once a facts refresh and a tour
// check have both finished; each later one moves its own counter on.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GymDb } from '../../data/db';
import { createTodoHost, type ReadySignal } from './todoHost';

let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`todo-host-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const NOW = new Date(2026, 10, 16, 18).getTime();

function host(signals: ReadySignal[]) {
  return createTodoHost({
    db,
    now: () => NOW,
    platform: 'web',
    onChange: () => {},
    logError: (err) => {
      throw err;
    },
    buildId: 'test',
    release: '1.12.0',
    build: 'abc1234',
    signal: (s) => signals.push(s),
  });
}

describe('todoHost ready signal', () => {
  it('is ready only after both a refresh and a tour check finished', async () => {
    const signals: ReadySignal[] = [];
    const h = host(signals);
    await h.start();
    expect(signals.at(-1)).toEqual({ refreshes: 1, tourChecks: 0, ready: false });
    await h.pendingTour();
    expect(signals).toHaveLength(1); // finding the pages is not the check: the app shows them
    h.tourChecked();
    expect(signals.at(-1)).toEqual({ refreshes: 1, tourChecks: 1, ready: true });
  });

  it('counts later refreshes and checks; overlapping refresh calls settle once', async () => {
    const signals: ReadySignal[] = [];
    const h = host(signals);
    h.tourChecked();
    expect(signals.at(-1)?.ready).toBe(false);
    await Promise.all([h.refresh(), h.refresh()]);
    expect(signals.at(-1)).toEqual({ refreshes: 1, tourChecks: 1, ready: true });
    await h.refresh();
    h.tourChecked();
    expect(signals.at(-1)).toEqual({ refreshes: 2, tourChecks: 2, ready: true });
  });
});
