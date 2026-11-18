import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALL_GOOD_TEXT,
  coachRows,
  createStallCards,
  nextLineText,
  progressChipText,
  type StallCardData,
} from './coachSummary';
import { asFake, useFakeDom } from './screens/testDom';

const NAMES: Record<string, string> = {
  bench: 'Dumbbell Bench Press',
  calf: 'Dumbbell Seated One-Leg Calf Raise',
};
const name = (id: string) => NAMES[id] ?? id;

describe('nextLineText', () => {
  it('drops the exercise name (it is the row heading)', () => {
    expect(nextLineText('Next time on Dumbbell Bench Press: +5 lb.', 'Dumbbell Bench Press')).toBe(
      'Next time: +5 lb.',
    );
    expect(
      nextLineText(
        'Next time on Dumbbell Seated One-Leg Calf Raise: repeat 20 kg.',
        'Dumbbell Seated One-Leg Calf Raise',
      ),
    ).toBe('Next time: repeat 20 kg.');
  });
  it('leaves other texts (or another name) unchanged', () => {
    expect(nextLineText('Keep the weight. Aim for 8 reps.', 'Pushups')).toBe(
      'Keep the weight. Aim for 8 reps.',
    );
    expect(nextLineText('Next time on Pushups: +1 rep per set.', 'Push')).toBe(
      'Next time on Pushups: +1 rep per set.',
    );
  });
});

describe('progressChipText', () => {
  it('drops the leading name from P1/P2 lines', () => {
    expect(
      progressChipText('Dumbbell Bench Press: 22.5 kg, up from 20 kg.', 'Dumbbell Bench Press'),
    ).toBe('22.5 kg, up from 20 kg.');
    expect(progressChipText('Pushups: +3 reps vs last time.', 'Pushups')).toBe(
      '+3 reps vs last time.',
    );
    expect(progressChipText('+3 reps vs last time.', 'Pushups')).toBe('+3 reps vs last time.');
  });
});

describe('coachRows', () => {
  it('keeps day order, names, rule, why and progress; friendly line without advice', () => {
    const rows = coachRows(
      [
        {
          exerciseId: 'bench',
          next: {
            rule: 'N3',
            text: 'Next time on Dumbbell Bench Press: +2.5 kg.',
            why: 'Reps: 8, 8, 8',
          },
          progress: 'Dumbbell Bench Press: 22.5 kg, up from 20 kg.',
        },
        { exerciseId: 'calf', next: null, progress: null },
      ],
      name,
    );
    expect(rows).toEqual([
      {
        exerciseId: 'bench',
        name: 'Dumbbell Bench Press',
        next: 'Next time: +2.5 kg.',
        why: 'Reps: 8, 8, 8',
        rule: 'N3',
        progress: '22.5 kg, up from 20 kg.',
      },
      {
        exerciseId: 'calf',
        name: 'Dumbbell Seated One-Leg Calf Raise',
        next: ALL_GOOD_TEXT,
        why: '',
        rule: '',
        progress: null,
      },
    ]);
  });
  it('is empty for no entries', () => {
    expect(coachRows([], name)).toEqual([]);
  });
});

describe('createStallCards wording (M13 task 21)', () => {
  useFakeDom();
  const STALLS: StallCardData[] = [
    {
      exerciseId: 'bench',
      line: 'Dumbbell Bench Press: same best set for 3 sessions.',
      options: ['lighter', 'addSet'],
    },
  ];

  it('labels the card "Plateau" in sentence case, also in its accessible name', () => {
    const el = asFake(createStallCards(STALLS, () => undefined));
    const card = el.find((e) => e.getAttribute('data-stall') === 'bench')[0];
    expect(card?.oneByClass('stall-label').textContent).toBe('Plateau');
    expect(card?.getAttribute('aria-label')).toBe(
      'Plateau: Dumbbell Bench Press: same best set for 3 sessions.',
    );
    expect(el.textContent).not.toMatch(/stalled|fell short/i);
    // No all-caps status word: the label css has no uppercase transform.
    const css = readFileSync(new URL('./coach.css', import.meta.url), 'utf8');
    const rule = /\.stall-label\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).not.toMatch(/text-transform:\s*uppercase/);
  });
});
