import { describe, expect, it } from 'vitest';
import type { ProgramDay } from '../../core/types';
import { checkCopy } from '../../core/trainer/replies';
import { exerciseName, program } from '../../data/catalog';
import { pairLabel, previewScreen, type PreviewProps, type PreviewRow } from './preview';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

// The first program day with at least 4 exercises; the last two are "paired" for the test.
const DAY = program.days.find((d) => d.exercises.length >= 4) as ProgramDay;
const IDS = DAY.exercises.map((e) => e.exerciseId);
const A = IDS[IDS.length - 2] as string;
const B = IDS[IDS.length - 1] as string;

function rows(paired: boolean): PreviewRow[] {
  return DAY.exercises.map((p) => ({
    exerciseId: p.exerciseId,
    tracking: p.tracking,
    name: exerciseName(p.exerciseId),
    plan: `${p.sets} × 10–12 reps`,
    ...(paired && p.exerciseId === A ? { pairedWith: exerciseName(B) } : {}),
    ...(paired && p.exerciseId === B ? { pairedWith: exerciseName(A) } : {}),
  }));
}

function render(over: Partial<PreviewProps> = {}) {
  const calls = { back: 0, start: [] as string[] };
  const el = asFake(
    previewScreen(
      {
        day: DAY,
        position: 1,
        total: program.days.length,
        rows: rows(true),
        loading: false,
        ...over,
      },
      { onBack: () => calls.back++, onStart: (d) => calls.start.push(d.id) },
    ),
  );
  return { el, calls };
}
const row = (el: FakeEl, id: string) =>
  el.find((e) => e.classes.includes('ex-row') && e.getAttribute('data-ex') === id)[0] as FakeEl;

describe('day preview: pair label (M12 1b short on time)', () => {
  it('pairLabel words', () => {
    expect(pairLabel('Triceps Pushdown')).toBe('Pair: back to back with Triceps Pushdown');
    expect(checkCopy(pairLabel('Triceps Pushdown')).hits).toEqual([]);
  });

  it('both rows of a pair name each other, with an icon and words', () => {
    const { el } = render();
    const paired = el.find((e) => e.hasAttribute('data-pair'));
    expect(paired.map((e) => e.getAttribute('data-ex'))).toEqual([A, B]);
    const a = row(el, A).oneByClass('pair-note');
    expect(a.textContent).toBe(`Pair: back to back with ${exerciseName(B)}`);
    expect(a.byClass('ic')).toHaveLength(1);
    expect(row(el, B).oneByClass('pair-note').textContent).toBe(
      `Pair: back to back with ${exerciseName(A)}`,
    );
  });

  it('the label sits between the name and the plan; other rows have none', () => {
    const { el } = render();
    const kids = row(el, A).children.map((c) => c.classes[0] ?? c.tag);
    expect(kids.indexOf('pair-note')).toBeGreaterThan(kids.indexOf('ex-row-name'));
    expect(kids.indexOf('pair-note')).toBeLessThan(kids.indexOf('ex-row-plan'));
    const first = row(el, IDS[0] as string);
    expect(first.byClass('pair-note')).toHaveLength(0);
    expect(first.hasAttribute('data-pair')).toBe(false);
  });

  it('no pairs: the preview is as before (every exercise is still one .ex-row)', () => {
    const { el, calls } = render({ rows: rows(false) });
    expect(el.byClass('pair-note')).toHaveLength(0);
    expect(el.find((e) => e.hasAttribute('data-pair'))).toHaveLength(0);
    expect(el.byClass('ex-row')).toHaveLength(DAY.exercises.length);
    el.find((e) => e.tag === 'button' && e.textContent === 'Start workout')[0]?.click();
    expect(calls.start).toEqual([DAY.id]);
  });
});
