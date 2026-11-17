import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import {
  MIC_A11Y_NAME,
  MIC_HINT,
  MIC_LABEL,
  MIC_UNAVAILABLE_FALLBACK,
  MIC_UNAVAILABLE_LINES,
  micButton,
  micUnavailableLine,
  resetMicHold,
  ringOpacity,
  ringScale,
  type MicProps,
} from './micButton';
import { checkCopy } from '../../core/trainer/replies';

useFakeDom();

// A fake window: collects listeners so tests can fire release / Escape / blur.
type L = (ev: unknown) => void;
const g = globalThis as { window?: unknown; matchMedia?: unknown };
let winL: Map<string, L[]>;
let savedWin: unknown;
let savedMM: unknown;
beforeEach(() => {
  resetMicHold();
  winL = new Map();
  savedWin = g.window;
  savedMM = g.matchMedia;
  g.window = {
    addEventListener: (t: string, cb: L) => winL.set(t, [...(winL.get(t) ?? []), cb]),
    removeEventListener: (t: string, cb: L) =>
      winL.set(
        t,
        (winL.get(t) ?? []).filter((x) => x !== cb),
      ),
  };
});
afterEach(() => {
  g.window = savedWin;
  g.matchMedia = savedMM;
});
const fireWin = (t: string, ev: unknown = {}) => [...(winL.get(t) ?? [])].forEach((cb) => cb(ev));
const live = () => [...winL.values()].reduce((n, l) => n + l.length, 0);

function mount(p: MicProps) {
  const log: string[] = [];
  const view = micButton(p, {
    micDown: () => log.push('down'),
    micUp: () => log.push('up'),
    micCancel: () => log.push('cancel'),
  });
  return { view, log, el: view.el ? asFake(view.el) : null };
}
const need = (el: FakeEl | null): FakeEl => {
  if (!el) throw new Error('no mic element');
  return el;
};
const hold = (el: FakeEl) => el.find((e) => e.hasAttribute('data-mic-hold'))[0] as FakeEl;
const ring = (el: FakeEl) => el.find((e) => e.hasAttribute('data-mic-ring'))[0] as FakeEl;
const ev = (extra: Record<string, unknown> = {}) => ({ preventDefault: () => {}, ...extra });

describe('micButton: states', () => {
  it('hidden → nothing at all (PWA, during a set)', () => {
    const { view } = mount({ state: 'hidden' });
    expect(view.el).toBeNull();
    expect(view.hint).toBeNull();
    expect(view.button).toBeNull();
  });

  it('unavailable → one short plain line per reason, no button', () => {
    for (const reason of [
      'unsupported',
      'modelNotInstalled',
      'modelDownloading',
      'permissionDenied',
    ]) {
      const { el, view } = mount({ state: 'unavailable', reason });
      expect(view.button).toBeNull();
      expect(el?.byTag('button')).toHaveLength(0);
      expect(el?.getAttribute('data-mic-unavailable')).toBe(reason);
      expect(el?.textContent).toBe(MIC_UNAVAILABLE_LINES[reason]);
    }
    expect(micUnavailableLine('weird')).toBe(MIC_UNAVAILABLE_FALLBACK);
    expect(micUnavailableLine(undefined)).toBe(MIC_UNAVAILABLE_FALLBACK);
  });

  it('every line is short, plain coaching copy', () => {
    for (const line of [
      ...Object.values(MIC_UNAVAILABLE_LINES),
      MIC_UNAVAILABLE_FALLBACK,
      MIC_HINT,
    ]) {
      expect(checkCopy(line).ok).toBe(true);
      expect(line.split(/\s+/).length).toBeLessThanOrEqual(14);
    }
  });

  it('idle → "Talk" button named "Hold to talk", not pressed, no hint, ring invisible', () => {
    const { el, view } = mount({ state: 'idle' });
    const b = hold(need(el));
    expect(b.tag).toBe('button');
    expect(b.getAttribute('aria-label')).toBe(MIC_A11Y_NAME);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.textContent).toBe(MIC_LABEL);
    expect(need(el).getAttribute('data-mic-state')).toBe('idle');
    expect(asFake(view.hint).hasAttribute('hidden')).toBe(true);
    expect(ring(need(el)).style.opacity).toBe('0');
  });

  it('listening → pressed, same label (no width jump), the hint, the ring follows the level', () => {
    const { el, view } = mount({ state: 'listening', level: 1 });
    const b = hold(need(el));
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toBe(MIC_LABEL);
    expect(asFake(view.hint).textContent).toBe(MIC_HINT);
    expect(asFake(view.hint).hasAttribute('hidden')).toBe(false);
    expect(ring(need(el)).style.transform).toBe('scale(1.2)');
    view.update({ state: 'listening', level: 0 });
    expect(ring(need(el)).style.transform).toBe('scale(1)');
    expect(ring(need(el)).style.opacity).toBe('0.35');
  });

  it('reduced motion → a static ring (no growth), still visible while listening', () => {
    g.matchMedia = () => ({ matches: true });
    const { el } = mount({ state: 'listening', level: 0.9 });
    expect(ring(need(el)).style.transform).toBe('scale(1)');
    expect(ring(need(el)).style.opacity).toBe('0.6');
    expect(ringScale(0.5, true)).toBe(1);
  });

  it('ring maths clamp junk levels', () => {
    expect(ringScale(-3, false)).toBe(1);
    expect(ringScale(9, false)).toBe(1.2);
    expect(ringScale(Number.NaN, false)).toBe(1);
    expect(ringOpacity(undefined, false)).toBe(0.35);
  });
});

describe('micButton: hold to talk', () => {
  it('pointer down → micDown; release over the button → micUp; listeners removed', () => {
    const { el, log } = mount({ state: 'idle' });
    hold(need(el)).dispatch('pointerdown', ev({ button: 0 }));
    expect(log).toEqual(['down']);
    expect(live()).toBeGreaterThan(0);
    fireWin('pointerup', {});
    expect(log).toEqual(['down', 'up']);
    expect(live()).toBe(0);
  });

  it('release survives a re-render: the window hears it, not the old button', () => {
    const first = mount({ state: 'idle' });
    hold(need(first.el)).dispatch('pointerdown', ev({ button: 0 }));
    // main re-renders with the partial text: a brand-new button
    mount({ state: 'listening', partial: 'move push' });
    fireWin('pointerup', {});
    expect(first.log).toEqual(['down', 'up']);
  });

  it('release off the button → micCancel', () => {
    const d = (globalThis as unknown as { document: Record<string, unknown> }).document;
    d.elementFromPoint = () => ({ closest: () => null });
    const { el, log } = mount({ state: 'idle' });
    hold(need(el)).dispatch('pointerdown', ev({ button: 0 }));
    fireWin('pointerup', { clientX: 5, clientY: 5 });
    expect(log).toEqual(['down', 'cancel']);
  });

  it('pointercancel, Escape and the app leaving each cancel', () => {
    for (const [t, e] of [
      ['pointercancel', {}],
      ['keydown', { key: 'Escape' }],
      ['blur', {}],
    ] as const) {
      const { el, log } = mount({ state: 'idle' });
      hold(need(el)).dispatch('pointerdown', ev({ button: 0 }));
      fireWin(t, e);
      expect(log).toEqual(['down', 'cancel']);
      expect(live()).toBe(0);
    }
  });

  it('a second press while held does nothing; a right click does nothing', () => {
    const { el, log } = mount({ state: 'idle' });
    hold(need(el)).dispatch('pointerdown', ev({ button: 2 }));
    expect(log).toEqual([]);
    hold(need(el)).dispatch('pointerdown', ev({ button: 0 }));
    hold(need(el)).dispatch('pointerdown', ev({ button: 0 }));
    expect(log).toEqual(['down']);
  });

  it('keyboard: Space held → micDown once (repeats ignored), Space up → micUp', () => {
    const { el, log } = mount({ state: 'idle' });
    let prevented = 0;
    const key = (k: string, repeat = false) =>
      hold(need(el)).dispatch('keydown', { key: k, repeat, preventDefault: () => prevented++ });
    key(' ');
    key(' ', true);
    key(' ', true);
    expect(log).toEqual(['down']);
    fireWin('keyup', { key: 'a' });
    expect(log).toEqual(['down']);
    fireWin('keyup', { key: ' ' });
    expect(log).toEqual(['down', 'up']);
    expect(prevented).toBe(3);
  });

  it('keyboard: Enter never starts or clicks; Escape mid-hold cancels', () => {
    const { el, log } = mount({ state: 'idle' });
    hold(need(el)).dispatch('keydown', ev({ key: 'Enter' }));
    expect(log).toEqual([]);
    hold(need(el)).dispatch('keydown', ev({ key: ' ' }));
    fireWin('keydown', { key: 'Escape' });
    expect(log).toEqual(['down', 'cancel']);
  });

  it('the long-press menu is blocked', () => {
    const { el } = mount({ state: 'idle' });
    let prevented = false;
    hold(need(el)).dispatch('contextmenu', { preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
  });
});
