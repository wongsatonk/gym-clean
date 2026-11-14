import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workoutTopBar } from '../topBar';
import { exerciseScreen, type ExerciseProps, type StepField } from './exercise';
import { END_CONFIRM_MS, pauseSheet } from './pauseSheet';
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

function render(over: Partial<ExerciseProps> = {}, camera = true) {
  const calls = {
    list: 0,
    camera: 0,
    pause: 0,
    howto: [] as unknown[],
    notes: 0,
    adjust: [] as [StepField, number][],
    done: 0,
  };
  const p = props(over);
  const el = asFake(
    exerciseScreen(p, {
      onList: () => calls.list++,
      onCamera: camera ? () => calls.camera++ : undefined,
      onPause: () => calls.pause++,
      onHowTo: (o) => calls.howto.push(o),
      onNotes: () => calls.notes++,
      onAdjust: (f, d) => calls.adjust.push([f, d]),
      onSetDone: () => calls.done++,
    }),
  );
  return { el, calls, p };
}

const byLabel = (el: FakeEl, label: string) => {
  const hit = el.find((e) => e.getAttribute('aria-label') === label)[0];
  if (!hit) throw new Error(`no [aria-label=${label}]`);
  return hit;
};
const buttonByText = (el: FakeEl, text: string) => {
  const hit = el.byTag('button').find((b) => b.textContent === text);
  if (!hit) throw new Error(`no button "${text}"`);
  return hit;
};

describe('workoutTopBar', () => {
  it('list / Camera / Pause with labels; segments mark the current exercise', () => {
    const hits: string[] = [];
    const bar = asFake(
      workoutTopBar({
        dayName: 'Pull A',
        exIndex: 2,
        exTotal: 5,
        onList: () => hits.push('list'),
        onCamera: () => hits.push('camera'),
        onPause: () => hits.push('pause'),
      }),
    );
    // Label in name: the accessible name starts with the visible day text.
    const list = byLabel(bar, 'Pull A, 3 of 5, Exercise list');
    expect(list.textContent).toBe('Pull A3 of 5');
    list.click();
    buttonByText(bar, 'Camera').click();
    buttonByText(bar, 'Pause').click();
    expect(hits).toEqual(['list', 'camera', 'pause']);
    const segs = bar.oneByClass('segs').children.map((i) => i.getAttribute('class'));
    expect(segs).toEqual(['past', 'past', 'cur', '', '']);
  });

  it('has no Camera button without onCamera', () => {
    const bar = asFake(
      workoutTopBar({ dayName: 'X', exIndex: 0, exTotal: 1, onList() {}, onPause() {} }),
    );
    expect(bar.byTag('button').map((b) => b.textContent)).toEqual(['X1 of 1', 'Pause']);
  });
});

describe('exerciseScreen', () => {
  it('is a Pro screen keeping the e2e hooks', () => {
    const { el, p } = render();
    expect(el.classes).toEqual(expect.arrayContaining(['screen', 'exercise', 'mood-pro']));
    expect(el.getAttribute('data-screen')).toBe('exercise');
    expect(el.byTag('h1')[0]?.textContent).toBe('One-Arm Dumbbell Row');
    // `.exercise-head [data-muscle-slot]`: the figure slot sits inside .exercise-head.
    const head = el.oneByClass('exercise-head');
    expect(head.find((e) => e === (p.figure as unknown as FakeEl))).toHaveLength(1);
    expect(head.oneByClass('exercise-head-text').byClass('ex-badges')).toHaveLength(1);
    // "Set 1 of 4" as text, with a 72px number in the layout.
    const counter = el.find((e) => e.hasAttribute('data-set-counter'))[0];
    expect(counter?.textContent).toBe('Set 1 of 4');
    expect(counter?.oneByClass('set-num').textContent).toBe('1');
    expect(el.oneByClass('ex-meta').textContent).toContain('Target 8–12 reps');
  });

  it('shows set pips, the muscle legend and the spoken cue panel', () => {
    const { el } = render({ setIndex: 2 });
    expect(el.oneByClass('pips').children.map((i) => i.getAttribute('class'))).toEqual([
      'past',
      'past',
      'cur',
      '',
    ]);
    expect(el.oneByClass('stage-legend').textContent).not.toBe('');
    const cue = el.oneByClass('cue-panel');
    expect(cue.oneByClass('cue-text').textContent).toBe('Elbow to hip, squeeze your back.');
    expect(cue.byTag('svg')[0]?.getAttribute('data-icon')).toBe('speaker');
    expect(render({ cue: '' }).el.byClass('cue-panel')).toHaveLength(0);
  });

  it('steppers: REPS / WEIGHT labels, outputs named Reps and the unit, ±1 steps', () => {
    const { el, calls } = render({ unit: 'lb', weightText: '102.5' });
    expect(byLabel(el, 'Reps').textContent).toBe('12');
    const weight = byLabel(el, 'lb');
    expect(weight.tag).toBe('output');
    expect(weight.textContent).toBe('102.5');
    expect(weight.classes).toContain('long');
    expect(el.byClass('st-label').map((l) => l.textContent)).toEqual(['Repscount', 'Weightlb']);
    byLabel(el, 'Reps minus').click();
    byLabel(el, 'lb plus').click();
    expect(calls.adjust).toEqual([
      ['reps', -1],
      ['weight', 1],
    ]);
  });

  it('Set done is the only CTA; no Skip or End on this screen', () => {
    const { el, calls } = render();
    const ctas = el.byClass('primary-btn');
    expect(ctas).toHaveLength(1);
    expect(ctas[0]?.textContent).toBe('Set done');
    ctas[0]?.click();
    expect(calls.done).toBe(1);
    const texts = el.byTag('button').map((b) => b.textContent);
    expect(texts).not.toContain('Skip exercise');
    expect(texts).not.toContain('End workout');
  });

  it('How to, notes, today / last time', () => {
    const { el, calls } = render({
      machine: 'Seat 4',
      note: 'Bench at 30°',
      hasNotes: true,
      today: '12×22.5 kg',
      last: '10×22.5, 9×22.5 kg',
    });
    const howto = el.find((e) => e.hasAttribute('data-howto-open'))[0];
    expect(howto?.textContent).toBe('How to');
    howto?.click();
    expect(calls.howto).toEqual([howto]);
    const notes = byLabel(el, 'Notes and machine setting');
    expect(notes.textContent).toBe('Machine: Seat 4Notes •');
    notes.click();
    expect(calls.notes).toBe(1);
    expect(el.oneByClass('lasting-note').textContent).toBe('Bench at 30°');
    expect(el.find((e) => e.hasAttribute('data-today'))[0]?.textContent).toBe('Today: 12×22.5 kg');
    expect(el.find((e) => e.hasAttribute('data-last'))[0]?.textContent).toBe(
      'Last time: 10×22.5, 9×22.5 kg',
    );
    const bare = render().el;
    expect(byLabel(bare, 'Notes and machine setting').textContent).toBe('Machine settingNotes');
    expect(bare.byClass('history')).toHaveLength(0);
  });

  it('hides Camera for manual exercises', () => {
    const { el } = render({ tracking: 'manual' }, false);
    expect(el.byTag('button').some((b) => b.textContent === 'Camera')).toBe(false);
  });
});

describe('pauseSheet', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function mount(canSkip?: boolean) {
    const calls = { resume: 0, skip: 0, end: 0 };
    const el = asFake(
      pauseSheet(
        { context: 'One-Arm Dumbbell Row · set 2 of 4', canSkip },
        {
          onResume: () => calls.resume++,
          onSkip: () => calls.skip++,
          onEnd: () => calls.end++,
        },
      ),
    );
    return { el, calls };
  }

  it('is a dialog named Paused with Resume (CTA), Skip exercise and End workout', () => {
    const { el, calls } = mount();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-label')).toBe('Paused');
    expect(el.getAttribute('aria-modal')).toBe('true');
    const resume = buttonByText(el, 'Resume');
    expect(resume.classes).toContain('primary-btn');
    resume.click();
    buttonByText(el, 'Skip exercise').click();
    expect(calls).toEqual({ resume: 1, skip: 1, end: 0 });
    // Only Resume is the action colour.
    expect(el.byClass('primary-btn')).toHaveLength(1);
    expect(el.oneByClass('pause-context').textContent).toBe('One-Arm Dumbbell Row · set 2 of 4');
  });

  it('End needs two taps; it disarms after the confirm window', () => {
    const { el, calls } = mount();
    const end = buttonByText(el, 'End workout');
    expect(end.byTag('svg')[0]?.getAttribute('data-icon')).toBe('flag');
    end.click();
    expect(calls.end).toBe(0);
    expect(end.textContent).toBe('Tap again to end');
    expect(end.hasAttribute('data-armed')).toBe(true);
    vi.advanceTimersByTime(END_CONFIRM_MS);
    expect(end.textContent).toBe('End workout');
    expect(end.hasAttribute('data-armed')).toBe(false);
    end.click();
    end.click();
    expect(calls.end).toBe(1);
  });

  it('can hide Skip', () => {
    const { el } = mount(false);
    expect(el.byTag('button').map((b) => b.textContent)).toEqual(['Resume', 'End workout']);
  });
});
