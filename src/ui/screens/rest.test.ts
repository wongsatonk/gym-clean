import { describe, expect, it } from 'vitest';
import { RING_C, restScreen, ringOffset, type RestProps } from './rest';
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

function render(over: Partial<RestProps> = {}, camera = false) {
  const calls = { list: 0, camera: 0, pause: 0, extend: 0, notes: 0, start: 0 };
  const view = restScreen(props(over), {
    onList: () => calls.list++,
    onCamera: camera ? () => calls.camera++ : undefined,
    onPause: () => calls.pause++,
    onExtend: () => calls.extend++,
    onNotes: () => calls.notes++,
    onStartSet: () => calls.start++,
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
    one(plain.el, (e) => (e.getAttribute('aria-label') ?? '').endsWith('Exercise list'), 'list').click();
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
