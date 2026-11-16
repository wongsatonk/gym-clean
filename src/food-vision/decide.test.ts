// M7b task 7: classifier scores → top 3 + preselect. Pure; imports only ./classMap (not the JSON
// directly, see the ?raw pitfall in classMap.test.ts).
import { describe, expect, it } from 'vitest';
import type { PhotoDecision } from '../ui/fuel/photoSheet';
import { CLASS_MAP, parseClassMap } from './classMap';
import { DEFAULT_THRESHOLD, decide, type ScoredLabel } from './decide';

const map = parseClassMap({
  version: 1,
  classes: {
    pad_kra_pao: { dishes: ['thai:kra-pao-moo', 'thai:kra-pao-gai'] },
    pad_thai: { dishes: ['thai:pad-thai-goong'] },
    tom_yum: { dishes: ['thai:tom-yum'] },
    som_tum: { dishes: ['thai:som-tum'] },
  },
});

const cat = (categoryName: string, score: number): ScoredLabel => ({ categoryName, score });
const opts = { claudeAvailable: false };

describe('decide', () => {
  it('uses 0.6 as the default threshold', () => {
    expect(DEFAULT_THRESHOLD).toBe(0.6);
  });

  it('is confident at exactly 0.6 and preselects the default dish of the top class', () => {
    const d = decide([cat('pad_kra_pao', 0.6), cat('pad_thai', 0.3)], map, opts);
    expect(d.kind).toBe('confident');
    expect(d.preselect).toBe('thai:kra-pao-moo');
    expect(d.options[0]).toEqual({
      label: 'pad_kra_pao',
      dishIds: ['thai:kra-pao-moo', 'thai:kra-pao-gai'],
      score: 0.6,
    });
    expect(d.offerClaude).toBe(false);
  });

  it('is unsure at 0.59 with nothing preselected', () => {
    const d = decide([cat('pad_kra_pao', 0.59), cat('pad_thai', 0.3)], map, opts);
    expect(d.kind).toBe('unsure');
    expect(d.preselect).toBeUndefined();
    expect(d.options.map((o) => o.label)).toEqual(['pad_kra_pao', 'pad_thai']);
  });

  it('honours a custom threshold', () => {
    expect(decide([cat('pad_thai', 0.5)], map, { ...opts, threshold: 0.5 }).kind).toBe('confident');
    expect(decide([cat('pad_thai', 0.5)], map, { ...opts, threshold: 0.51 }).kind).toBe('unsure');
  });

  it('keeps at most 3 options, sorted by score', () => {
    const d = decide(
      [cat('tom_yum', 0.1), cat('pad_thai', 0.4), cat('som_tum', 0.05), cat('pad_kra_pao', 0.3)],
      map,
      opts,
    );
    expect(d.options.map((o) => o.label)).toEqual(['pad_thai', 'pad_kra_pao', 'tom_yum']);
  });

  it('works with fewer than 3 categories', () => {
    const d = decide([cat('tom_yum', 0.9)], map, opts);
    expect(d.options).toHaveLength(1);
    expect(d.kind).toBe('confident');
    expect(d.preselect).toBe('thai:tom-yum');
  });

  it('keeps the input order on equal scores (stable)', () => {
    const d = decide([cat('tom_yum', 0.3), cat('pad_thai', 0.3), cat('som_tum', 0.3)], map, opts);
    expect(d.options.map((o) => o.label)).toEqual(['tom_yum', 'pad_thai', 'som_tum']);
  });

  it('ignores unknown labels, so an unknown top guess does not make it confident', () => {
    const d = decide([cat('pizza', 0.95), cat('pad_thai', 0.03), cat('__proto__', 0.9)], map, opts);
    expect(d.kind).toBe('unsure');
    expect(d.options.map((o) => o.label)).toEqual(['pad_thai']);
  });

  it('ignores NaN, infinite and out-of-range scores', () => {
    const d = decide(
      [
        cat('pad_thai', Number.NaN),
        cat('tom_yum', 1.5),
        cat('som_tum', -0.1),
        cat('pad_kra_pao', Number.POSITIVE_INFINITY),
      ],
      map,
      opts,
    );
    expect(d.kind).toBe('noMatch');
    expect(d.options).toEqual([]);
  });

  it('accepts the edges 0 and 1', () => {
    const d = decide([cat('pad_thai', 1), cat('tom_yum', 0)], map, opts);
    expect(d.options.map((o) => o.score)).toEqual([1, 0]);
  });

  it('gives noMatch for empty input, with no preselect', () => {
    const d = decide([], map, opts);
    expect(d).toEqual({ kind: 'noMatch', options: [], offerClaude: false });
  });

  it('gives noMatch when no label is known', () => {
    expect(decide([cat('burger', 0.8)], map, opts).kind).toBe('noMatch');
  });

  it('deduplicates a label that appears twice (keeps the higher score)', () => {
    const d = decide([cat('pad_thai', 0.2), cat('tom_yum', 0.1), cat('pad_thai', 0.7)], map, opts);
    expect(d.options.map((o) => [o.label, o.score])).toEqual([
      ['pad_thai', 0.7],
      ['tom_yum', 0.1],
    ]);
  });

  it('deduplicates dishes across labels (an unvalidated map that shares a dish)', () => {
    const shared = {
      version: 1,
      classes: {
        a: { dishes: ['thai:x', 'thai:y'] },
        b: { dishes: ['thai:y'] },
        c: { dishes: ['thai:y', 'thai:z'] },
      },
    };
    const d = decide([cat('a', 0.5), cat('b', 0.3), cat('c', 0.2)], shared, opts);
    expect(d.options).toEqual([
      { label: 'a', dishIds: ['thai:x', 'thai:y'], score: 0.5 },
      { label: 'c', dishIds: ['thai:z'], score: 0.2 },
    ]);
  });

  it('never offers Claude when claudeAvailable is false', () => {
    for (const cats of [[], [cat('pad_thai', 0.3)], [cat('pad_thai', 0.9)], [cat('zz', 0.9)]]) {
      expect(decide(cats, map, { claudeAvailable: false }).offerClaude).toBe(false);
    }
  });

  it('offers Claude only when available and unsure or noMatch (for step 4 later)', () => {
    const on = { claudeAvailable: true };
    expect(decide([cat('pad_thai', 0.9)], map, on).offerClaude).toBe(false);
    expect(decide([cat('pad_thai', 0.3)], map, on).offerClaude).toBe(true);
    expect(decide([], map, on).offerClaude).toBe(true);
  });

  it('works with the committed class map and matches the photo sheet prop type', () => {
    const d: PhotoDecision = decide([cat('pad_kra_pao', 0.82)], CLASS_MAP, opts);
    expect(d.kind).toBe('confident');
    expect(d.preselect).toBe(CLASS_MAP.classes.pad_kra_pao?.dishes[0]);
  });

  it('does not mutate its input', () => {
    const input = [cat('tom_yum', 0.1), cat('pad_thai', 0.4)];
    const copy = structuredClone(input);
    decide(input, map, opts);
    expect(input).toEqual(copy);
  });
});
