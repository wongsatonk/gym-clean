import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RING_C,
  fig3dState,
  resetSetRing,
  restFigure2d,
  restScreen,
  ringOffset,
  type RestProps,
} from './rest';
import type { SetEffort } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

function props(over: Partial<RestProps> = {}): RestProps {
  return {
    dayName: 'Pull A',
    exIndex: 0,
    exTotal: 5,
    remainingMs: 60_000,
    targetMs: 120_000,
    exerciseId: 'One-Arm_Dumbbell_Row',
    name: 'One-Arm Dumbbell Row',
    setIndex: 1,
    sets: 4,
    reps: 10,
    weightText: '22.5',
    unit: 'kg',
    cue: 'Elbow to hip.',
    figure: new FakeEl('button') as unknown as HTMLElement,
    hasNotes: false,
    ...over,
  };
}

function render(over: Partial<RestProps> = {}, camera = false, effortActions = true) {
  const calls = {
    list: 0,
    camera: 0,
    pause: 0,
    extend: 0,
    notes: 0,
    start: 0,
    effort: [] as SetEffort[],
    why: [] as unknown[],
  };
  const view = restScreen(props(over), {
    onList: () => calls.list++,
    onCamera: camera ? () => calls.camera++ : undefined,
    onPause: () => calls.pause++,
    onExtend: () => calls.extend++,
    onNotes: () => calls.notes++,
    onStartSet: () => calls.start++,
    onEffort: effortActions ? (e) => calls.effort.push(e) : undefined,
    onEffortWhy: effortActions ? (o) => calls.why.push(o) : undefined,
  });
  return { view, el: asFake(view.el), calls };
}

const one = (el: FakeEl, pred: (e: FakeEl) => boolean, what: string) => {
  const hit = el.find(pred)[0];
  if (!hit) throw new Error(`no ${what}`);
  return hit;
};
const attr = (el: FakeEl, name: string) => one(el, (e) => e.hasAttribute(name), `[${name}]`);
const buttonByText = (el: FakeEl, text: string) =>
  one(el, (e) => e.tag === 'button' && e.textContent === text, `button "${text}"`);
const ringFg = (el: FakeEl) => one(el, (e) => e.classes.includes('rest-ring-fg'), '.rest-ring-fg');

describe('ringOffset', () => {
  it('full ring at the start, half at half time, empty at and past zero', () => {
    expect(ringOffset(120_000, 120_000)).toBeCloseTo(0);
    expect(ringOffset(60_000, 120_000)).toBeCloseTo(RING_C / 2);
    expect(ringOffset(0, 120_000)).toBeCloseTo(RING_C);
    expect(ringOffset(-5_000, 120_000)).toBeCloseTo(RING_C);
  });
  it('a target of 0 (or more time than the target after +30 s) stays in range', () => {
    expect(ringOffset(10_000, 0)).toBeCloseTo(RING_C);
    expect(ringOffset(150_000, 120_000)).toBeCloseTo(0);
  });
});

describe('restScreen', () => {
  it('Track mood, the rest hooks, and a 1:00 clock of 2:00', () => {
    const { el } = render();
    expect(el.classes).toEqual(expect.arrayContaining(['screen', 'rest', 'mood-track']));
    expect(el.getAttribute('data-screen')).toBe('rest');
    const clock = attr(el, 'data-rest-clock');
    expect(clock.getAttribute('role')).toBe('timer');
    expect(clock.textContent).toBe('1:00');
    expect(clock.classes).not.toContain('overtime');
    expect(attr(el, 'data-rest-label').textContent).toBe('Rest');
    expect(attr(el, 'data-rest-target').textContent).toBe('of 2:00');
    expect(attr(el, 'data-rest-timer').getAttribute('data-state')).toBe('rest');
    expect(Number(ringFg(el).getAttribute('stroke-dashoffset'))).toBeCloseTo(RING_C / 2, 1);
  });

  it('overtime: amber state with words, not colour alone', () => {
    const { el } = render({ remainingMs: -12_000 });
    const clock = attr(el, 'data-rest-clock');
    expect(clock.textContent).toBe('+0:12');
    expect(clock.classes).toContain('overtime');
    expect(attr(el, 'data-rest-label').textContent).toBe('Over rest');
    expect(attr(el, 'data-rest-timer').getAttribute('data-state')).toBe('over');
    expect(Number(ringFg(el).getAttribute('stroke-dashoffset'))).toBeCloseTo(RING_C, 1);
  });

  it('update() moves the clock, ring, label and state without a re-render', () => {
    const { el, view } = render();
    const clock = attr(el, 'data-rest-clock');
    view.update(30_000, 150_000); // after +30 s
    expect(clock.textContent).toBe('0:30');
    expect(attr(el, 'data-rest-target').textContent).toBe('of 2:30');
    expect(Number(ringFg(el).getAttribute('stroke-dashoffset'))).toBeCloseTo(RING_C * 0.8, 1);
    view.update(-1_000, 150_000);
    expect(clock.textContent).toBe('+0:01');
    expect(clock.classes).toContain('overtime');
    expect(attr(el, 'data-rest-label').textContent).toBe('Over rest');
    view.update(29_000, 180_000); // +30 s again while over
    expect(clock.classes).not.toContain('overtime');
    expect(attr(el, 'data-rest-label').textContent).toBe('Rest');
    expect(attr(el, 'data-rest-timer').getAttribute('data-state')).toBe('rest');
  });

  it('+30 s is a labelled button that calls onExtend', () => {
    const { el, calls } = render();
    const btn = attr(el, 'data-rest-extend');
    expect(btn.tag).toBe('button');
    expect(btn.textContent).toBe('+30 s');
    // Label in name: the accessible name starts with the visible "+30 s".
    expect(btn.getAttribute('aria-label')).toBe('+30 s, add 30 seconds of rest');
    btn.click();
    expect(calls.extend).toBe(1);
  });

  it('no Skip rest, no Skip/End in the footer; Start set is the CTA', () => {
    const { el, calls } = render();
    const texts = el.byTag('button').map((b) => b.textContent);
    expect(texts.some((t) => /skip|end/i.test(t))).toBe(false);
    const start = buttonByText(el, 'Start set');
    expect(start.classes).toEqual(expect.arrayContaining(['primary-btn', 'cta-btn']));
    start.click();
    expect(calls.start).toBe(1);
  });

  it('top bar: list / Pause, and Camera only when given', () => {
    const plain = render();
    expect(plain.el.byTag('button').some((b) => b.textContent === 'Camera')).toBe(false);
    one(
      plain.el,
      (e) => (e.getAttribute('aria-label') ?? '').endsWith('Exercise list'),
      'list',
    ).click();
    buttonByText(plain.el, 'Pause').click();
    expect(plain.calls).toMatchObject({ list: 1, pause: 1 });
    const cam = render({}, true);
    buttonByText(cam.el, 'Camera').click();
    expect(cam.calls.camera).toBe(1);
  });

  it('Next card: the figure, caps eyebrow, mixed-case name, target and the spoken cue', () => {
    const figure = new FakeEl('button');
    const { el } = render({ figure: figure as unknown as HTMLElement });
    const card = one(el, (e) => e.classes.includes('rest-card'), '.rest-card');
    expect(one(card, (e) => e.classes.includes('rest-eyebrow'), 'eyebrow').textContent).toBe(
      'Next · Set 2 of 4',
    );
    const next = one(card, (e) => e.classes.includes('next-up'), '.next-up');
    expect(next.textContent).toContain('One-Arm Dumbbell Row');
    expect(next.textContent).toContain('10 reps × 22.5 kg');
    expect(one(card, (e) => e.classes.includes('focus-cue'), 'cue').textContent).toBe(
      'Elbow to hip.',
    );
    expect(card.find((e) => e === figure)).toHaveLength(1);
  });

  it('no cue → no cue line', () => {
    const { el } = render({ cue: '' });
    expect(el.byClass('focus-cue')).toHaveLength(0);
  });

  it('Fix and coach tip slots go in when given, in that order, before the Next card', () => {
    const fix = new FakeEl('section');
    fix.setAttribute('data-lsc', 'panel');
    const tip = new FakeEl('section');
    tip.setAttribute('data-coach-tip', '');
    const { el } = render({
      fixEl: fix as unknown as HTMLElement,
      coachTipEl: tip as unknown as HTMLElement,
    });
    const order = el.children.map((c) =>
      c === fix ? 'fix' : c === tip ? 'tip' : c.classes.includes('rest-card') ? 'next' : '',
    );
    expect(order.filter(Boolean)).toEqual(['fix', 'tip', 'next']);
    const none = render({ fixEl: null, coachTipEl: null });
    expect(none.el.find((e) => e.hasAttribute('data-lsc'))).toHaveLength(0);
  });

  it('Notes row and Today / Last time lines keep their hooks', () => {
    const { el, calls } = render({
      machine: 'Bench notch 3',
      note: 'Arch a little',
      hasNotes: true,
      today: '8×40 lb',
      last: '8×35 lb',
    });
    const notes = one(
      el,
      (e) => e.getAttribute('aria-label') === 'Notes and machine setting',
      'notes',
    );
    expect(notes.textContent).toContain('Machine: Bench notch 3');
    expect(notes.textContent).toContain('Notes •');
    notes.click();
    expect(calls.notes).toBe(1);
    expect(attr(el, 'data-today').textContent).toBe('Today: 8×40 lb');
    expect(attr(el, 'data-last').textContent).toBe('Last time: 8×35 lb');
    const bare = render();
    expect(bare.el.find((e) => e.hasAttribute('data-today'))).toHaveLength(0);
    expect(bare.el.find((e) => e.hasAttribute('data-last'))).toHaveLength(0);
  });
});

describe('restScreen: set ring (M12)', () => {
  let anims: { el: FakeEl; frames: Keyframe[] }[] = [];
  let reduce = false;
  const g = globalThis as { matchMedia?: unknown };
  let savedMM: unknown;
  const proto = FakeEl.prototype as unknown as { animate?: unknown };
  beforeEach(() => {
    anims = [];
    reduce = false;
    resetSetRing();
    savedMM = g.matchMedia;
    g.matchMedia = (q: string) => ({ matches: q.includes('reduced-motion') && reduce, media: q });
    proto.animate = function (this: FakeEl, frames: Keyframe[]) {
      anims.push({ el: this, frames });
      return { cancel: () => {} };
    };
  });
  afterEach(() => {
    g.matchMedia = savedMM;
    delete proto.animate;
  });
  const arc = (el: FakeEl) => el.byClass('set-ring-fg')[0];

  it('after set 1 of 4: the ring fills quickly from 0 to 25% (final value set first)', () => {
    const { el } = render({ setIndex: 1, sets: 4 });
    const ring = attr(el, 'data-set-ring');
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect([ring.getAttribute('data-done'), ring.getAttribute('data-total')]).toEqual(['1', '4']);
    expect(arc(el)?.style.strokeDashoffset).toBe('75');
    expect(anims).toHaveLength(1);
    expect(anims[0]?.frames).toEqual([{ strokeDashoffset: '100' }, { strokeDashoffset: '75' }]);
  });

  it('a re-render of the same rest shows it filled without replaying', () => {
    render({ setIndex: 2, sets: 4 });
    anims = [];
    const { el } = render({ setIndex: 2, sets: 4, targetMs: 150_000 });
    expect(anims).toEqual([]);
    expect(arc(el)?.style.strokeDashoffset).toBe('50');
  });

  it('the last set of an exercise: app passes setsDone; no ring at set 1 without it', () => {
    expect(render({ setIndex: 0 }).el.find((e) => e.hasAttribute('data-set-ring'))).toEqual([]);
    const { el } = render({ setIndex: 0, exIndex: 1, setsDone: { done: 3, total: 3 } });
    expect(attr(el, 'data-set-ring').getAttribute('data-done')).toBe('3');
    expect(arc(el)?.style.strokeDashoffset).toBe('0');
    expect(anims[0]?.frames[0]).toEqual({ strokeDashoffset: String(100 - 200 / 3) });
  });

  it('reduced motion: no animation, the final arc at once', () => {
    reduce = true;
    const { el } = render({ setIndex: 3, sets: 4 });
    expect(anims).toEqual([]);
    expect(arc(el)?.style.strokeDashoffset).toBe('25');
  });

  it('the eyebrow words are unchanged (the ring is decorative)', () => {
    const { el } = render({ setIndex: 1, sets: 4 });
    expect(el.oneByClass('rest-eyebrow').textContent).toBe('Next · Set 2 of 4');
  });
});

describe('restScreen: effort row (M12 1b task 23)', () => {
  const row = (el: FakeEl) => attr(el, 'data-effort');
  const opt = (el: FakeEl, e: SetEffort) =>
    one(el, (x) => x.getAttribute('data-effort-opt') === e, `effort ${e}`);
  const checked = (el: FakeEl) =>
    (['easy', 'good', 'hard'] as const).filter(
      (e) => opt(el, e).getAttribute('aria-checked') === 'true',
    );
  const key = (target: FakeEl, k: string) => {
    let prevented = false;
    target.dispatch('keydown', { key: k, preventDefault: () => (prevented = true) });
    return prevented;
  };
  const active = () => (globalThis as unknown as { document: { activeElement: unknown } }).document;

  it('absent unless the app asks for it (effort undefined, or no onEffort)', () => {
    expect(render().el.find((e) => e.hasAttribute('data-effort'))).toEqual([]);
    expect(
      render({ effort: null }, false, false).el.find((e) => e.hasAttribute('data-effort')),
    ).toEqual([]);
  });

  it('asks "How was that set?" with Easy / Good / Hard and the reps-left words', () => {
    const { el } = render({ effort: null });
    const r = row(el);
    expect(r.textContent).toContain('How was that set?');
    const group = one(r, (e) => e.getAttribute('role') === 'radiogroup', 'radiogroup');
    const q = one(r, (e) => e.textContent === 'How was that set?' && e.tag === 'p', 'question');
    expect(group.getAttribute('aria-labelledby')).toBe(q.getAttribute('id'));
    const radios = group.find((e) => e.getAttribute('role') === 'radio');
    expect(radios.map((b) => b.tag)).toEqual(['button', 'button', 'button']);
    expect(radios.map((b) => b.oneByClass('effort-name').textContent)).toEqual([
      'Easy',
      'Good',
      'Hard',
    ]);
    expect(radios.map((b) => b.oneByClass('effort-sub').textContent)).toEqual([
      '3+ left',
      '2 left',
      '0–1 left',
    ]);
    // Spoken in full for a screen reader; the name starts with the visible label.
    expect(radios.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Easy, 3 or more reps left',
      'Good, 2 reps left',
      'Hard, 0 to 1 reps left',
    ]);
    expect(checked(el)).toEqual([]);
  });

  it('optional: nothing chosen leaves the timer, +30 s and Start set working', () => {
    const { el, view, calls } = render({ effort: null });
    view.update(30_000, 120_000);
    expect(attr(el, 'data-rest-clock').textContent).toBe('0:30');
    attr(el, 'data-rest-extend').click();
    buttonByText(el, 'Start set').click();
    expect(calls).toMatchObject({ extend: 1, start: 1, effort: [] });
  });

  it('select: a tap marks it in place (aria-checked, data-effort, a check mark) and reports it', () => {
    const { el, calls } = render({ effort: null });
    opt(el, 'good').click();
    expect(calls.effort).toEqual(['good']);
    expect(checked(el)).toEqual(['good']);
    expect(row(el).getAttribute('data-effort')).toBe('good');
    // Not colour alone: every option carries a check mark, shown only on the chosen one.
    for (const e of ['easy', 'good', 'hard'] as const) {
      const mark = opt(el, e).oneByClass('effort-mark');
      expect(mark.find((x) => x.getAttribute('data-icon') === 'check')).toHaveLength(1);
    }
  });

  it('change: another tap moves the selection; the same tap again reports nothing new', () => {
    const { el, calls } = render({ effort: null });
    opt(el, 'easy').click();
    opt(el, 'hard').click();
    opt(el, 'hard').click();
    expect(calls.effort).toEqual(['easy', 'hard']);
    expect(checked(el)).toEqual(['hard']);
  });

  it('a stored answer shows selected on a re-render (+30 s, a sheet closing)', () => {
    const { el, calls } = render({ effort: 'hard' });
    expect(checked(el)).toEqual(['hard']);
    expect(row(el).getAttribute('data-effort')).toBe('hard');
    expect(calls.effort).toEqual([]);
  });

  it('keyboard: one tab stop; arrows move, select and wrap; Home / End', () => {
    const { el, calls } = render({ effort: null });
    const tab = () =>
      (['easy', 'good', 'hard'] as const).map((e) => opt(el, e).getAttribute('tabindex'));
    expect(tab()).toEqual(['0', '-1', '-1']);
    expect(key(opt(el, 'easy'), 'ArrowRight')).toBe(true);
    expect(checked(el)).toEqual(['good']);
    expect(active().activeElement).toBe(opt(el, 'good'));
    expect(tab()).toEqual(['-1', '0', '-1']);
    key(opt(el, 'good'), 'ArrowDown');
    key(opt(el, 'hard'), 'ArrowRight'); // wraps
    expect(checked(el)).toEqual(['easy']);
    key(opt(el, 'easy'), 'ArrowLeft'); // wraps back
    expect(checked(el)).toEqual(['hard']);
    key(opt(el, 'hard'), 'Home');
    key(opt(el, 'easy'), 'End');
    key(opt(el, 'hard'), 'ArrowUp');
    expect(calls.effort).toEqual(['good', 'hard', 'easy', 'hard', 'easy', 'hard', 'good']);
    // Other keys are left alone (Tab leaves the group, Space / Enter are the button's click).
    expect(key(opt(el, 'good'), 'Tab')).toBe(false);
    expect(key(opt(el, 'good'), ' ')).toBe(false);
    expect(calls.effort).toHaveLength(7);
  });

  it('"Why?" is a button that hands its element to onEffortWhy; left out without the callback', () => {
    const { el, calls } = render({ effort: null });
    const why = attr(el, 'data-effort-why');
    expect(why.tag).toBe('button');
    expect(why.textContent).toBe('Why?');
    expect(why.getAttribute('aria-label')).toBe('Why? About set effort');
    why.click();
    expect(calls.why).toEqual([why]);
    expect(calls.effort).toEqual([]);
    const view = restScreen(props({ effort: null }), {
      onList: () => {},
      onPause: () => {},
      onExtend: () => {},
      onNotes: () => {},
      onStartSet: () => {},
      onEffort: () => {},
    });
    expect(asFake(view.el).find((e) => e.hasAttribute('data-effort-why'))).toEqual([]);
  });

  // The coach tip comes first: its Apply must end clear of the docked Start set at 390×844
  // (M4e A22, e2e/layout-dock.spec.ts); the optional effort row can sit below it.
  it('sits after the Fix and the coach tip, before the Next card', () => {
    const fix = new FakeEl('section');
    const tip = new FakeEl('section');
    const { el } = render({
      effort: null,
      fixEl: fix as unknown as HTMLElement,
      coachTipEl: tip as unknown as HTMLElement,
    });
    const order = el.children.map((c) =>
      c === fix
        ? 'fix'
        : c === tip
          ? 'tip'
          : c.hasAttribute('data-effort')
            ? 'effort'
            : c.classes.includes('rest-card')
              ? 'next'
              : '',
    );
    expect(order.filter(Boolean)).toEqual(['fix', 'tip', 'effort', 'next']);
  });
});

describe('restScreen: warm-up label (M12 1b task 24)', () => {
  it('the next set is a warm-up: "Next · Warm-up 1 of 2", no set ring, the target line as usual', () => {
    const { el } = render({
      setIndex: 0,
      warmup: { index: 0, total: 2 },
      reps: 8,
      weightText: '20',
    });
    const eyebrow = el.oneByClass('rest-eyebrow');
    expect(eyebrow.textContent).toBe('Next · Warm-up 1 of 2');
    expect(eyebrow.hasAttribute('data-warmup')).toBe(true);
    expect(el.find((e) => e.hasAttribute('data-set-ring'))).toEqual([]);
    expect(el.oneByClass('next-up').textContent).toContain('8 reps × 20 kg');
    expect(
      render({ warmup: { index: 1, total: 2 } }).el.oneByClass('rest-eyebrow').textContent,
    ).toBe('Next · Warm-up 2 of 2');
  });

  it('no warm-up → the set words, unchanged', () => {
    const eyebrow = render().el.oneByClass('rest-eyebrow');
    expect(eyebrow.textContent).toBe('Next · Set 2 of 4');
    expect(eyebrow.hasAttribute('data-warmup')).toBe(false);
  });
});

// ---------- M13 task 23: the "Next" card placeholder ----------

describe('Rest "Next" card: 2D at once, 3D fades in over it (M13)', () => {
  const figBox = (el: FakeEl) => one(el, (e) => e.classes.includes('rest-card-fig'), 'figure box');

  it('the card shows the 2D map at once, under the slot app.ts passes in', () => {
    const fig = new FakeEl('button');
    const { el } = render({ figure: fig as unknown as HTMLElement });
    const box = figBox(el);
    expect(box.getAttribute('data-3d')).toBe('pending');
    const map = box.children[0] as FakeEl;
    expect(map.hasAttribute('data-rest-fig-2d')).toBe(true);
    expect(map.getAttribute('aria-hidden')).toBe('true');
    expect(map.innerHTML).toContain('class="body-map"');
    expect(map.innerHTML).toContain('muscle primary');
    expect(box.children[1]).toBe(fig);
  });

  it('the placeholder is decorative: no ids (the slot has the same map), no img role', () => {
    const html = restFigure2d('One-Arm_Dumbbell_Row').innerHTML;
    expect(html).not.toMatch(/ id="/);
    expect(html).not.toContain('role="img"');
    expect(html).toContain('aria-hidden="true"');
    // An unknown exercise still draws the figure (never an empty box).
    expect(restFigure2d('no-such-exercise').innerHTML).toContain('class="body"');
  });

  it('fig3dState: pending until a 3D body in the slot has drawn a frame', () => {
    const q = (canvas: unknown) => ({ querySelector: () => canvas }) as unknown as Element;
    expect(fig3dState(q(null))).toBe('pending');
    expect(fig3dState(q({ width: 0, height: 0 }))).toBe('pending');
    expect(fig3dState(q({ width: 360, height: 460 }))).toBe('shown');
  });

  describe('with a MutationObserver (the 3D body arriving, failing, leaving)', () => {
    const g = globalThis as { MutationObserver?: unknown };
    let saved: unknown;
    let fire: (() => void)[] = [];
    let canvas: { width: number; height: number } | null = null;
    let disconnected = 0;
    beforeEach(() => {
      saved = g.MutationObserver;
      fire = [];
      canvas = null;
      disconnected = 0;
      g.MutationObserver = class {
        private on = false;
        constructor(private cb: () => void) {}
        observe() {
          this.on = true;
          fire.push(() => {
            if (this.on) this.cb();
          });
        }
        disconnect() {
          if (this.on) disconnected++;
          this.on = false;
        }
      };
      (FakeEl.prototype as unknown as { querySelector: unknown }).querySelector = () => canvas;
    });
    afterEach(() => {
      g.MutationObserver = saved;
      delete (FakeEl.prototype as unknown as { querySelector?: unknown }).querySelector;
    });
    const mutate = () => fire.forEach((f) => f());

    it('3D drawn → "shown"; moved to the 3D sheet → back to the 2D ("pending")', () => {
      const box = figBox(render().el);
      expect(box.getAttribute('data-3d')).toBe('pending');
      canvas = { width: 360, height: 460 };
      mutate();
      expect(box.getAttribute('data-3d')).toBe('shown');
      canvas = null;
      mutate();
      expect(box.getAttribute('data-3d')).toBe('pending');
    });

    it('the watcher disconnects once the view has gone (shown, then taken off the page)', () => {
      const { view, el } = render(); // FakeEl starts on the page (isConnected)
      const box = figBox(el);
      view.update(1000, 90_000);
      expect(disconnected).toBe(0);
      canvas = { width: 360, height: 460 };
      mutate();
      expect(box.getAttribute('data-3d')).toBe('shown');
      expect(disconnected).toBe(0);
      // The next screen replaced it: the next tick (or mutation) stops the observer.
      box.isConnected = false;
      view.update(0, 90_000);
      expect(disconnected).toBe(1);
      canvas = null;
      mutate();
      expect(box.getAttribute('data-3d')).toBe('shown'); // no longer synced
    });

    it('dispose() stops the watcher at once (main can call it when Rest goes)', () => {
      const { view } = render();
      view.dispose();
      expect(disconnected).toBe(1);
      view.dispose();
      expect(disconnected).toBe(1);
    });

    it('3D never arrives or fails: the card keeps its 2D map', () => {
      const box = figBox(render().el);
      mutate();
      expect(box.getAttribute('data-3d')).toBe('pending');
      expect(box.find((e) => e.hasAttribute('data-rest-fig-2d'))).toHaveLength(1);
    });
  });

  it('rest.css: 3D hidden until shown, the 2D fades out then; slot above; motion from the tokens', () => {
    const css = readFileSync(join(__dirname, 'rest.css'), 'utf8');
    expect(css).toMatch(/\.rest-card-fig \.body3d \{[^}]*opacity: 0;/);
    expect(css).toMatch(/\.rest-card-fig\[data-3d='shown'\] \.body3d \{[^}]*opacity: 1;/);
    expect(css).toMatch(/\.rest-card-fig\[data-3d='shown'\] \.rest-fig-2d \{[^}]*opacity: 0;/);
    expect(css).toMatch(/transition: opacity var\(--dur-slow\)/);
    // Reduced motion: the one global rule in styles.css (the tokens are 0ms), no second block here.
    expect(css).not.toMatch(/@media \(prefers-reduced-motion/);
  });

  it('rest.css: the card figure keeps its layers to itself; the sticky Start set dock is on top', () => {
    const css = readFileSync(join(__dirname, 'rest.css'), 'utf8');
    // The slot's z-index (and the 3D canvas in it) stays inside the figure's own stacking context…
    expect(css).toMatch(/\.rest-card-fig \{[^}]*isolation: isolate;/);
    // …and the dock paints above every in-flow layer of the screen.
    expect(css).toMatch(/\.rest \.sticky-bottom \{[^}]*z-index: \d+;/);
    expect(css).toMatch(/\.rest \.sticky-bottom \{[^}]*position: sticky;/);
  });
});
