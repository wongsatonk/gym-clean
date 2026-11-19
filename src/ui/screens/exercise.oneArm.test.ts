// M13b task 13: the Exercise screen for one-sided sets. Right arm first with a full-width Next
// arm (spoken, cuts a count word), then the left arm with Set done; the reps +/- belong to the
// side being worked; "leg" wording for one-leg exercises; two-sided exercises unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { voice } from '../voice';
import { SWITCH_GUARD_MS, type OneSidedView } from '../oneArm';
import { exerciseScreen, type ExerciseProps, type StepField } from './exercise';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

function props(over: Partial<ExerciseProps> = {}): ExerciseProps {
  return {
    dayName: 'Pull A',
    exIndex: 0,
    exTotal: 5,
    exerciseId: 'One-Arm_Dumbbell_Row',
    tracking: 'pose',
    name: 'One-Arm Dumbbell Row',
    repsRange: '8–12',
    setIndex: 0,
    sets: 4,
    reps: 12,
    weightText: '22.5',
    unit: 'kg',
    cue: 'Elbow to hip, squeeze your back.',
    figure: new FakeEl('button') as unknown as HTMLElement,
    hasNotes: false,
    ...over,
  };
}

function render(side: OneSidedView | undefined, over: Partial<ExerciseProps> = {}) {
  const calls = { done: 0, next: 0, adjust: [] as [StepField, number][] };
  const el = asFake(
    exerciseScreen(
      { ...props(over), side },
      {
        onList: () => {},
        onPause: () => {},
        onHowTo: () => {},
        onNotes: () => {},
        onAdjust: (f, d) => calls.adjust.push([f, d]),
        onSetDone: () => calls.done++,
        onNextSide: () => calls.next++,
      },
    ),
  );
  return { el, calls };
}

const attr = (el: FakeEl, name: string) => el.find((e) => e.hasAttribute(name));
const buttonByText = (el: FakeEl, text: string) =>
  el.byTag('button').find((b) => b.textContent === text);

let spoken: string[];
let order: string[];
beforeEach(() => {
  spoken = [];
  order = [];
  vi.spyOn(voice, 'speak').mockImplementation((text: string) => {
    spoken.push(text);
    order.push(`speak:${text}`);
    return null;
  });
  vi.spyOn(voice, 'cancel').mockImplementation(() => {
    order.push('cancel');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('exercise screen, one-sided set: first side', () => {
  const first: OneSidedView = { limb: 'arm', turn: 'first' };

  it('shows "Right arm" over the reps and Next arm in the CTA slot, no Set done', () => {
    const { el } = render(first);
    const labels = attr(el, 'data-side-label');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe('Right arm');
    expect(labels[0]?.getAttribute('data-side-label')).toBe('right');
    // The label sits in the reps stepper: the +/- are this side's.
    const reps = el.find((e) => e.getAttribute('data-stepper') === 'reps')[0];
    expect(reps?.find((e) => e.hasAttribute('data-side-label'))).toHaveLength(1);
    const next = attr(el, 'data-next-side')[0];
    expect(next?.textContent).toBe('Next arm');
    // M13d task 40g: the main round-button pill, the whole row its tap area.
    expect(next?.getAttribute('data-variant')).toBe('main');
    expect(next?.hasAttribute('data-wide-hit')).toBe(true);
    // In the sticky CTA dock, where Set done is on a two-sided exercise.
    const dock = el.oneByClass('sticky-bottom');
    expect(dock.find((e) => e.hasAttribute('data-next-side'))).toHaveLength(1);
    expect(attr(el, 'data-set-done')).toHaveLength(0);
    expect(buttonByText(el, 'Set done')).toBeUndefined();
  });

  it('Next arm cuts any count word, speaks the switch line, then calls onNextSide', () => {
    const { el, calls } = render(first);
    attr(el, 'data-next-side')[0]?.click();
    expect(order).toEqual(['cancel', 'speak:Left arm. Turn so your left arm faces the phone.']);
    expect(calls.next).toBe(1);
    expect(calls.done).toBe(0);
  });

  it('the reps +/- adjust the current side (ADJUST applies to it)', () => {
    const { el, calls } = render(first);
    el.find((e) => e.getAttribute('aria-label') === 'Reps plus')[0]?.click();
    expect(calls.adjust).toEqual([['reps', 1]]);
  });

  it('no first-side done line yet', () => {
    const { el } = render(first);
    expect(attr(el, 'data-side-done')).toHaveLength(0);
  });
});

describe('exercise screen, one-sided set: second side', () => {
  const long = Date.now() - 10_000;
  const second: OneSidedView = { limb: 'arm', turn: 'second', doneReps: 12, switchedAt: long };

  it('shows "Left arm", the right arm\'s reps, and Set done (no Next arm)', () => {
    const { el } = render(second, { reps: 9 });
    const label = attr(el, 'data-side-label')[0];
    expect(label?.textContent).toBe('Left arm');
    expect(label?.getAttribute('data-side-label')).toBe('left');
    expect(attr(el, 'data-side-done')[0]?.textContent).toBe('Right arm: 12 reps');
    expect(attr(el, 'data-next-side')).toHaveLength(0);
    expect(buttonByText(el, 'Set done')).toBeDefined();
  });

  it('"1 rep" for a single rep on the first side', () => {
    const { el } = render({ ...second, doneReps: 1 });
    expect(attr(el, 'data-side-done')[0]?.textContent).toBe('Right arm: 1 rep');
  });

  it('Set done ends the set', () => {
    const { el, calls } = render(second);
    buttonByText(el, 'Set done')?.click();
    expect(calls.done).toBe(1);
  });

  it(`a Set done tap within ${SWITCH_GUARD_MS} ms of Next arm is ignored (double tap)`, () => {
    const { el, calls } = render({ ...second, switchedAt: Date.now() });
    buttonByText(el, 'Set done')?.click();
    expect(calls.done).toBe(0);
  });
});

describe('exercise screen, one-leg exercise', () => {
  it('says "Right leg" and "Next leg"; the switch line names the leg', () => {
    const { el } = render(
      { limb: 'leg', turn: 'first' },
      { exerciseId: 'Split_Squat_with_Dumbbells', name: 'Split Squat', tracking: 'manual' },
    );
    expect(attr(el, 'data-side-label')[0]?.textContent).toBe('Right leg');
    const next = attr(el, 'data-next-side')[0];
    expect(next?.textContent).toBe('Next leg');
    next?.click();
    expect(spoken).toEqual(['Left leg. Turn so your left leg faces the phone.']);
  });

  it('second side: "Left leg" and "Right leg: 10 reps"', () => {
    const { el } = render(
      { limb: 'leg', turn: 'second', doneReps: 10, switchedAt: 0 },
      { exerciseId: 'Split_Squat_with_Dumbbells', tracking: 'manual' },
    );
    expect(attr(el, 'data-side-label')[0]?.textContent).toBe('Left leg');
    expect(attr(el, 'data-side-done')[0]?.textContent).toBe('Right leg: 10 reps');
  });
});

describe('exercise screen, two-sided exercise', () => {
  it('no side label, no Next arm, Set done as before', () => {
    const { el, calls } = render(undefined, {
      exerciseId: 'Dumbbell_Bicep_Curl',
      name: 'Dumbbell Bicep Curl',
    });
    expect(attr(el, 'data-side-label')).toHaveLength(0);
    expect(attr(el, 'data-next-side')).toHaveLength(0);
    buttonByText(el, 'Set done')?.click();
    expect(calls.done).toBe(1);
    expect(spoken).toEqual([]);
  });
});
