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
    skipWarmups: 0,
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
      onSkipWarmups: () => calls.skipWarmups++,
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
  const observers: { cb: () => void; observing: boolean }[] = [];
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal(
      'MutationObserver',
      class {
        rec: { cb: () => void; observing: boolean };
        constructor(cb: () => void) {
          this.rec = { cb, observing: false };
          observers.push(this.rec);
        }
        observe() {
          this.rec.observing = true;
        }
        disconnect() {
          this.rec.observing = false;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

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

  describe('Coach row (M10)', () => {
    function mountCoach() {
      const calls = { resume: 0, skip: 0, end: 0, coach: 0 };
      const el = asFake(
        pauseSheet(
          {},
          {
            onResume: () => calls.resume++,
            onSkip: () => calls.skip++,
            onEnd: () => calls.end++,
            onCoach: () => calls.coach++,
          },
        ),
      );
      return { el, calls };
    }

    it('is absent without onCoach', () => {
      const { el } = mount();
      expect(el.byTag('button').map((b) => b.textContent)).toEqual([
        'Resume',
        'Skip exercise',
        'End workout',
      ]);
      expect(el.find((e) => e.getAttribute('data-pause') === 'coach')).toHaveLength(0);
    });

    it('sits under Resume with a chat icon and the word, and calls onCoach only', () => {
      const { el, calls } = mountCoach();
      expect(el.byTag('button').map((b) => b.textContent)).toEqual([
        'Resume',
        'Coach',
        'Skip exercise',
        'End workout',
      ]);
      const coach = buttonByText(el, 'Coach');
      expect(coach.getAttribute('data-pause')).toBe('coach');
      expect(coach.classes).toContain('pause-btn');
      expect(coach.classes).not.toContain('primary-btn');
      expect(coach.byTag('svg')[0]?.getAttribute('data-icon')).toBe('chat');
      coach.click();
      expect(calls).toEqual({ resume: 0, skip: 0, end: 0, coach: 1 });
    });

    it('joins the Tab cycle after Resume', () => {
      const { el } = mountCoach();
      const [resume, coach, skip, end] = ['Resume', 'Coach', 'Skip exercise', 'End workout'].map(
        (t) => buttonByText(el, t),
      );
      const tab = (shift = false) => {
        el.dispatch('keydown', key('Tab', shift));
        return active();
      };
      expect(tab()).toBe(resume);
      expect(tab()).toBe(coach);
      expect(tab()).toBe(skip);
      expect(tab()).toBe(end);
      expect(tab(true)).toBe(skip);
      expect(tab(true)).toBe(coach);
    });
  });

  const key = (k: string, shiftKey = false) => {
    const ev = { key: k, shiftKey, prevented: false, preventDefault: () => (ev.prevented = true) };
    return ev;
  };
  const active = () =>
    (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement;

  it('Escape resumes; other keys do nothing', () => {
    const { el, calls } = mount();
    const esc = key('Escape');
    el.dispatch('keydown', esc);
    expect(calls).toEqual({ resume: 1, skip: 0, end: 0 });
    expect(esc.prevented).toBe(true);
    const enter = key('Enter');
    el.dispatch('keydown', enter);
    expect(calls.resume).toBe(1);
    expect(enter.prevented).toBe(false);
  });

  it('Tab and Shift+Tab cycle Resume → Skip → End inside the sheet', () => {
    const { el } = mount();
    expect(el.getAttribute('tabindex')).toBe('-1');
    const [resume, skip, end] = ['Resume', 'Skip exercise', 'End workout'].map((t) =>
      buttonByText(el, t),
    );
    const tab = (shift = false) => {
      const ev = key('Tab', shift);
      el.dispatch('keydown', ev);
      expect(ev.prevented).toBe(true);
      return active();
    };
    // Focus on the sheet itself: Tab enters at Resume, Shift+Tab at End.
    expect(tab()).toBe(resume);
    expect(tab()).toBe(skip);
    expect(tab()).toBe(end);
    expect(tab()).toBe(resume);
    expect(tab(true)).toBe(end);
    expect(tab(true)).toBe(skip);
    expect(tab(true)).toBe(resume);
    el.focus();
    expect(tab(true)).toBe(end);
  });

  it('Tab cycles Resume ↔ End when Skip is hidden', () => {
    const { el } = mount(false);
    const resume = buttonByText(el, 'Resume');
    const end = buttonByText(el, 'End workout');
    resume.focus();
    el.dispatch('keydown', key('Tab'));
    expect(active()).toBe(end);
    el.dispatch('keydown', key('Tab'));
    expect(active()).toBe(resume);
    el.dispatch('keydown', key('Tab', true));
    expect(active()).toBe(end);
  });

  describe('armed End and sheet removal', () => {
    it('removing the sheet while armed clears the timer and stops watching', () => {
      const { el } = mount();
      const end = buttonByText(el, 'End workout');
      end.click();
      expect(vi.getTimerCount()).toBe(1);
      expect(observers.filter((o) => o.observing)).toHaveLength(1);
      // An unrelated mutation while still mounted keeps the window open.
      observers[0]?.cb();
      expect(vi.getTimerCount()).toBe(1);
      end.isConnected = false;
      observers[0]?.cb();
      expect(vi.getTimerCount()).toBe(0);
      expect(observers.filter((o) => o.observing)).toHaveLength(0);
    });

    it('watches only while armed: disarm and End both disconnect', () => {
      const { el, calls } = mount();
      const end = buttonByText(el, 'End workout');
      expect(observers).toHaveLength(0);
      end.click();
      vi.advanceTimersByTime(END_CONFIRM_MS);
      expect(observers.filter((o) => o.observing)).toHaveLength(0);
      end.click();
      end.click();
      expect(calls.end).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(observers.filter((o) => o.observing)).toHaveLength(0);
    });
  });
});

describe('exerciseScreen: warm-up set (M12 1b task 24)', () => {
  const warm = { warmup: { index: 0, total: 2 }, reps: 8, weightText: '20', unit: 'kg' } as const;
  const strip = (el: FakeEl) => el.find((e) => e.hasAttribute('data-warmup'))[0];

  it('a working set has no warm-up label and no Skip warm-ups', () => {
    const { el } = render();
    expect(strip(el)).toBeUndefined();
    expect(el.byTag('button').some((b) => /warm/i.test(b.textContent))).toBe(false);
    expect(el.find((e) => e.hasAttribute('data-set-counter'))[0]?.textContent).toBe('Set 1 of 4');
  });

  it('label reads "Warm-up 1 of 2 · 20 kg × 8" as text', () => {
    const { el } = render(warm);
    const label = el.find((e) => e.hasAttribute('data-warmup-label'))[0];
    expect(label?.tag).toBe('p');
    expect(label?.textContent).toBe('Warm-up 1 of 2 · 20 kg × 8');
    expect(
      render({ ...warm, warmup: { index: 1, total: 2 }, reps: 4, weightText: '27.5' }).el.find(
        (e) => e.hasAttribute('data-warmup-label'),
      )[0]?.textContent,
    ).toBe('Warm-up 2 of 2 · 27.5 kg × 4');
    expect(
      render({ ...warm, warmup: { index: 0, total: 1 }, weightText: '45', unit: 'lb' }).el.find(
        (e) => e.hasAttribute('data-warmup-label'),
      )[0]?.textContent,
    ).toBe('Warm-up 1 of 1 · 45 lb × 8');
  });

  it('the set badge says Warm-up (never "Set 1 of 4") and no working-set pip is current', () => {
    const { el } = render(warm);
    const badge = el.find((e) => e.hasAttribute('data-set-counter'))[0];
    expect(badge?.textContent).toBe('Warm-up 1 of 2');
    const pips = el.oneByClass('pips').children;
    expect(pips).toHaveLength(4);
    expect(pips.some((p) => p.classes.includes('cur') || p.classes.includes('past'))).toBe(false);
  });

  it('Skip warm-ups is a button that calls onSkipWarmups; Set done still logs the warm-up', () => {
    const { el, calls } = render(warm);
    const skip = buttonByText(el, 'Skip warm-ups');
    expect(skip.hasAttribute('data-skip-warmups')).toBe(true);
    skip.click();
    expect(calls.skipWarmups).toBe(1);
    buttonByText(el, 'Set done').click();
    expect(calls.done).toBe(1);
  });

  it('no onSkipWarmups → the label alone', () => {
    const el = asFake(
      exerciseScreen(props(warm), {
        onList: () => {},
        onPause: () => {},
        onHowTo: () => {},
        onNotes: () => {},
        onAdjust: () => {},
        onSetDone: () => {},
      }),
    );
    expect(strip(el)?.textContent).toBe('Warm-up 1 of 2 · 20 kg × 8');
    expect(el.byTag('button').some((b) => b.textContent === 'Skip warm-ups')).toBe(false);
  });

  it('adds no motion: nothing in the strip animates', () => {
    const proto = FakeEl.prototype as unknown as { animate?: unknown };
    let n = 0;
    proto.animate = () => {
      n++;
      return { cancel: () => {} };
    };
    try {
      render(warm);
    } finally {
      delete proto.animate;
    }
    expect(n).toBe(0);
  });
});
