import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import { LEARN_FOR_INTENT } from '../core/trainer/replies';
import { LEARN_CARDS, learnCard } from './learnCards';
import source from './learnCards.ts?raw';

describe('learn cards', () => {
  it('has the ten topics, each id once', () => {
    expect(LEARN_CARDS.map((c) => c.id)).toEqual([
      'progressiveOverload',
      'effort',
      'warmups',
      'protein',
      'sleep',
      'deloads',
      'focusBlocks',
      'shortSessions',
      'measurements',
      'consistency',
    ]);
  });

  it('every title, body and why passes the copy check and stays short', () => {
    for (const c of LEARN_CARDS) {
      for (const t of [c.title, c.body, c.why ?? '']) {
        expect(checkCopy(t), `${c.id}: ${t}`).toEqual({ ok: true, hits: [] });
      }
      expect(c.title.length, c.id).toBeLessThanOrEqual(40);
      expect(c.body.split(/\s+/).length, c.id).toBeLessThanOrEqual(90);
      expect(c.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('no medical claims or promises', () => {
    for (const c of LEARN_CARDS) {
      const all = `${c.title} ${c.body} ${c.why ?? ''}`;
      expect(all, c.id).not.toMatch(/\b(cure|heal|prevent|guarantee|doctor says|clinically)\b/i);
    }
  });

  it('every link from the coach points to a card', () => {
    const ids = new Set(LEARN_CARDS.map((c) => c.id));
    for (const [intent, id] of Object.entries(LEARN_FOR_INTENT))
      expect(ids.has(id ?? ''), `${intent} → ${id}`).toBe(true);
    expect(learnCard('protein')?.title).toBeTruthy();
    expect(learnCard('nope')).toBeUndefined();
  });

  it('is written for anyone (no names or personal numbers)', () => {
    expect(source).not.toMatch(/wongsaton|kampusan|his wife|\bhusband\b/i);
    expect(source).not.toMatch(/\b\d+(\.\d+)?\s?(kg|lb|cm)\b/i);
  });
});
