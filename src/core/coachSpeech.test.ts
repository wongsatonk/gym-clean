import { describe, expect, it } from 'vitest';
import { createCoachSpeech, hintFor, type SpeechDecision } from './coachSpeech';
import { ruleForFolder, RULES } from './exercises';
import type { RepEvent } from './types';

const CURL = ruleForFolder('curl');
if (!CURL) throw new Error('curl rule missing');

const ev = (over: Partial<RepEvent>): RepEvent => ({
  type: 'partial',
  index: 1,
  eccentricMs: 600,
  concentricMs: 500,
  minAngle: 100,
  maxAngle: 165,
  t: 1000,
  ...over,
});

/** The single 'speak' decision in a list (fails otherwise). */
function spoken(ds: SpeechDecision[]) {
  const s = ds.filter((d) => d.action === 'speak');
  expect(s).toHaveLength(1);
  const d = s[0];
  if (d?.action !== 'speak') throw new Error('no speak');
  return d;
}

describe('hintFor', () => {
  it('maps a partial reason to the rule hint', () => {
    expect(hintFor(CURL, ev({ reason: 'far', shortByDeg: 30 }))).toBe('Curl higher.');
    expect(hintFor(CURL, ev({ reason: 'start', shortByDeg: 30 }))).toBe(
      'Straighten your arm at the bottom.',
    );
  });

  it('has no hint for counted reps or partials without a reason', () => {
    expect(hintFor(CURL, ev({ type: 'rep' }))).toBeNull();
    expect(hintFor(CURL, ev({}))).toBeNull();
  });

  it('every rule gives a hint for both reasons', () => {
    for (const r of RULES) {
      expect(hintFor(r, ev({ reason: 'far' }))).toBe(r.hints.far);
      expect(hintFor(r, ev({ reason: 'start' }))).toBe(r.hints.start);
    }
  });
});

describe('createCoachSpeech: counts', () => {
  it('a count always speaks; it only cancels when something is speaking', () => {
    const s = createCoachSpeech();
    const first = spoken(s.count('One', 0));
    expect(first).toMatchObject({ text: 'One', kind: 'count', cancel: false });
    expect(s.speaking).toBe('count');
    const second = spoken(s.count('Two', 300));
    expect(second).toMatchObject({ text: 'Two', kind: 'count', cancel: true });
    expect(second.id).not.toBe(first.id);
  });

  it('a count interrupts a hint, and the hint is reported as interrupted', () => {
    const s = createCoachSpeech();
    s.hint('Curl higher.', 0);
    const ds = s.count('Three', 400);
    expect(ds).toContainEqual({
      action: 'drop',
      text: 'Curl higher.',
      kind: 'hint',
      reason: 'interrupted',
    });
    expect(spoken(ds)).toMatchObject({ text: 'Three', cancel: true });
    expect(s.speaking).toBe('count');
  });
});

describe('createCoachSpeech: hints', () => {
  it('speaks a hint at once when nothing is speaking', () => {
    const s = createCoachSpeech();
    expect(spoken(s.hint('Curl higher.', 0))).toMatchObject({
      text: 'Curl higher.',
      kind: 'hint',
      cancel: false,
    });
    expect(s.speaking).toBe('hint');
  });

  it('rate limit: at most one hint per 6 s (measured from when the last hint started)', () => {
    const s = createCoachSpeech();
    const a = spoken(s.hint('Curl higher.', 1000));
    s.ended(a.id, 2000);
    expect(s.hint('Curl higher.', 6999)).toEqual([
      { action: 'drop', text: 'Curl higher.', kind: 'hint', reason: 'rate' },
    ]);
    expect(spoken(s.hint('Curl higher.', 7000)).text).toBe('Curl higher.');
  });

  it('a hint waits for the count word to end, then speaks', () => {
    const s = createCoachSpeech();
    const c = spoken(s.count('Four', 0));
    expect(s.hint('Curl higher.', 100)).toEqual([]);
    expect(s.pending).toBe('Curl higher.');
    const d = spoken(s.ended(c.id, 700));
    expect(d).toMatchObject({ text: 'Curl higher.', kind: 'hint', cancel: false });
    expect(s.pending).toBeNull();
    expect(s.speaking).toBe('hint');
  });

  it('a waiting hint more than 1.5 s late is dropped as stale when the count ends', () => {
    const s = createCoachSpeech();
    const c = spoken(s.count('Five', 0));
    s.hint('Curl higher.', 100);
    expect(s.ended(c.id, 1601)).toEqual([
      { action: 'drop', text: 'Curl higher.', kind: 'hint', reason: 'stale' },
    ]);
    expect(s.speaking).toBeNull();
  });

  it('exactly 1.5 s late still speaks', () => {
    const s = createCoachSpeech();
    const c = spoken(s.count('Five', 0));
    s.hint('Curl higher.', 100);
    expect(spoken(s.ended(c.id, 1600)).text).toBe('Curl higher.');
  });

  it('tick drops a stale waiting hint even if the count never reports its end', () => {
    const s = createCoachSpeech();
    const c = spoken(s.count('Six', 0));
    s.hint('Curl higher.', 100);
    expect(s.tick(1000)).toEqual([]);
    expect(s.tick(1601)).toEqual([
      { action: 'drop', text: 'Curl higher.', kind: 'hint', reason: 'stale' },
    ]);
    expect(s.pending).toBeNull();
    expect(s.ended(c.id, 1700)).toEqual([]);
  });

  it('a stale drop does not use up the rate limit', () => {
    const s = createCoachSpeech();
    const c = spoken(s.count('Six', 0));
    s.hint('Curl higher.', 100);
    s.ended(c.id, 2000); // dropped stale
    expect(spoken(s.hint('Curl higher.', 2500)).text).toBe('Curl higher.');
  });

  it('a newer hint replaces a waiting one (the older is reported superseded)', () => {
    const s = createCoachSpeech();
    const c = spoken(s.count('Seven', 0));
    s.hint('Curl higher.', 100);
    expect(s.hint('Straighten your arm at the bottom.', 300)).toEqual([
      { action: 'drop', text: 'Curl higher.', kind: 'hint', reason: 'superseded' },
    ]);
    expect(spoken(s.ended(c.id, 800)).text).toBe('Straighten your arm at the bottom.');
  });

  it("a cancelled count's end event does not release the next count to a waiting hint", () => {
    const s = createCoachSpeech();
    const one = spoken(s.count('One', 0));
    s.hint('Curl higher.', 100);
    const two = spoken(s.count('Two', 300)); // cancels "One"; the browser then fires its end
    expect(s.ended(one.id, 310)).toEqual([]);
    expect(s.speaking).toBe('count');
    expect(s.pending).toBe('Curl higher.');
    expect(spoken(s.ended(two.id, 900)).text).toBe('Curl higher.');
  });

  it('a hint within 6 s of the last one is dropped at once, even while a count speaks', () => {
    const s = createCoachSpeech();
    const h = spoken(s.hint('Curl higher.', 0));
    s.ended(h.id, 1000);
    const c = spoken(s.count('Eight', 5000));
    // Arrives within 6 s of the last hint: dropped at once, never queued.
    expect(s.hint('Curl higher.', 5500)).toEqual([
      { action: 'drop', text: 'Curl higher.', kind: 'hint', reason: 'rate' },
    ]);
    expect(s.ended(c.id, 5600)).toEqual([]);
  });

  it('a hint that never reports its end is released after the stuck timeout', () => {
    const s = createCoachSpeech();
    s.hint('Curl higher.', 0);
    expect(s.tick(4999)).toEqual([]);
    expect(s.speaking).toBe('hint');
    s.tick(5000);
    expect(s.speaking).toBeNull();
    expect(spoken(s.hint('Go lower.', 6000))).toMatchObject({ cancel: false });
  });

  it('options override the timings', () => {
    const s = createCoachSpeech({ hintGapMs: 1000, maxHintDelayMs: 200 });
    const a = spoken(s.hint('A.', 0));
    s.ended(a.id, 100);
    expect(spoken(s.hint('B.', 1000)).text).toBe('B.');
    const c = spoken(s.count('One', 1100));
    s.hint('C.', 2000);
    expect(s.ended(c.id, 2201)).toEqual([
      { action: 'drop', text: 'C.', kind: 'hint', reason: 'stale' },
    ]);
  });

  it('reset forgets speaking, waiting and the rate limit', () => {
    const s = createCoachSpeech();
    s.count('One', 0);
    s.hint('Curl higher.', 100);
    s.reset();
    expect(s.speaking).toBeNull();
    expect(s.pending).toBeNull();
    expect(spoken(s.hint('Curl higher.', 200))).toMatchObject({ cancel: false });
  });
});
