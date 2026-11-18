import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import { LEARN_FOR_INTENT } from '../core/trainer/replies';
import { LEARN_CARDS, learnCard } from './learnCards';
import source from './learnCards.ts?raw';

describe('learn cards', () => {
  it('has the ten topics plus the two M13c cards, each id once', () => {
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
      // M13c: the Learning badge's card and the "Also add abs?" step's Why?.
      'cameraLearning',
      'coreTraining',
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

  it('cameraLearning explains the Learning badge: new counting, may miss or add a rep, fix it on Rest', () => {
    const c = learnCard('cameraLearning');
    expect(c?.title).toBe('Camera still learning');
    const text = `${c?.body} ${c?.why}`;
    expect(text).toMatch(/new/i);
    expect(text).toMatch(/miss/i);
    expect(text).toMatch(/add/i);
    expect(text).toMatch(/\bRest\b/);
    expect(text).toMatch(/fix/i);
    expect(text).toMatch(/tune/i);
  });

  it('coreTraining explains the "Also add abs?" choice: the block, the main focus unchanged', () => {
    const c = learnCard('coreTraining');
    expect(c?.title).toBeTruthy();
    const text = `${c?.title} ${c?.body} ${c?.why}`;
    expect(text).toMatch(/\babs\b/i);
    expect(c?.why).toMatch(/block/i);
    expect(c?.why).toMatch(/main focus/i);
    expect(c?.why).toMatch(/end with the block/i);
    // Coaching, not a promise about how you'll look.
    expect(text).not.toMatch(/burn (belly|stomach) fat|spot|flat (belly|stomach)/i);
  });

  it('every card says "you", never he or she (M13 anyone-scan)', () => {
    for (const c of LEARN_CARDS)
      expect(`${c.title} ${c.body} ${c.why ?? ''}`, c.id).not.toMatch(
        /\b(he|she|his|her|him|hers)\b/i,
      );
  });

  it('is written for anyone (no names or personal numbers)', () => {
    expect(source).not.toMatch(/wongsaton|kampusan|his wife|\bhusband\b/i);
    expect(source).not.toMatch(/\b\d+(\.\d+)?\s?(kg|lb|cm)\b/i);
  });
});
