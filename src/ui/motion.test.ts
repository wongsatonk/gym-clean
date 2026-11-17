// M12 task 8: motion helpers. Each one runs a short transform/opacity animation, and is a no-op
// (or jumps to the final value) under prefers-reduced-motion or inside a `data-motion="off"`
// screen (Exercise, camera). vitest runs in node, so elements are small fakes with `animate()`.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DUR,
  EASE,
  MOTION_OFF,
  STAGGER_MS,
  checkMorph,
  countUp,
  enterScreen,
  motionAllowed,
  reducedMotion,
  ringFill,
  staggerIn,
} from './motion';

type Call = { keyframes: Keyframe[]; opts: KeyframeAnimationOptions };

class El {
  calls: Call[] = [];
  cancelled = 0;
  textContent = '';
  style: Record<string, string> & { setProperty: (k: string, v: string) => void } = Object.assign(
    Object.create(null) as Record<string, string>,
    {
      setProperty(this: Record<string, string>, k: string, v: string) {
        this[k] = v;
      },
    },
  );
  children: El[] = [];
  parent: El | null = null;
  attrs: Record<string, string> = {};
  constructor(public cls = '') {}
  animate(keyframes: Keyframe[], opts: KeyframeAnimationOptions) {
    this.calls.push({ keyframes, opts });
    return { cancel: () => (this.cancelled += 1) } as unknown as Animation;
  }
  closest(sel: string): El | null {
    if (sel !== MOTION_OFF) throw new Error(`unexpected selector ${sel}`);
    const off =
      this.attrs['data-motion'] === 'off' ||
      this.attrs['data-screen'] === 'exercise' ||
      this.cls.split(' ').includes('camera-sheet');
    if (off) return this;
    return this.parent ? this.parent.closest(sel) : null;
  }
  querySelector(sel: string): El | null {
    if (sel !== '.ic') throw new Error(`unexpected selector ${sel}`);
    for (const c of this.children) {
      if (c.cls.split(' ').includes('ic')) return c;
      const hit = c.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
  replaceWith(next: El) {
    const p = this.parent;
    if (!p) return;
    p.children[p.children.indexOf(this)] = next;
    next.parent = p;
    this.parent = null;
  }
  prepend(next: El) {
    this.children.unshift(next);
    next.parent = this;
  }
  add(child: El) {
    this.children.push(child);
    child.parent = this;
    return child;
  }
}

const as = (e: El) => e as unknown as HTMLElement;

let reduce = false;
const g = globalThis as { matchMedia?: unknown };
let savedMM: unknown;
beforeEach(() => {
  reduce = false;
  savedMM = g.matchMedia;
  g.matchMedia = (q: string) => ({
    matches: q === '(prefers-reduced-motion: reduce)' ? reduce : false,
    media: q,
  });
});
afterEach(() => {
  g.matchMedia = savedMM;
  vi.useRealTimers();
});

describe('reducedMotion / motionAllowed', () => {
  it('reads prefers-reduced-motion', () => {
    expect(reducedMotion()).toBe(false);
    reduce = true;
    expect(reducedMotion()).toBe(true);
  });

  it('is false without matchMedia (no DOM)', () => {
    g.matchMedia = undefined;
    expect(reducedMotion()).toBe(false);
  });

  it('is off inside a data-motion="off" screen and under reduced motion', () => {
    const screen = new El();
    screen.attrs['data-motion'] = 'off';
    const btn = screen.add(new El());
    expect(motionAllowed(as(btn))).toBe(false);
    expect(motionAllowed(as(new El()))).toBe(true);
    reduce = true;
    expect(motionAllowed(as(new El()))).toBe(false);
  });

  it('is off on the Exercise screen and the camera sheet (existing hooks)', () => {
    const ex = new El('screen exercise');
    ex.attrs['data-screen'] = 'exercise';
    expect(motionAllowed(as(ex.add(new El())))).toBe(false);
    const cam = new El('overlay sheet camera-sheet');
    expect(motionAllowed(as(cam.add(new El())))).toBe(false);
    const today = new El('screen');
    today.attrs['data-screen'] = 'today';
    expect(motionAllowed(as(today.add(new El())))).toBe(true);
  });

  it('is off for an element that cannot animate', () => {
    expect(motionAllowed({} as HTMLElement)).toBe(false);
  });
});

describe('tokens', () => {
  it('match the CSS tokens in styles.css', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toContain(`--dur-fast: ${DUR.fast}ms;`);
    expect(css).toContain(`--dur-base: ${DUR.base}ms;`);
    expect(css).toContain(`--dur-slow: ${DUR.slow}ms;`);
    expect(css).toContain(`--ease-standard: ${EASE.standard};`);
    expect(css).toContain(`--ease-spring: ${EASE.spring};`);
    expect([DUR.fast, DUR.base, DUR.slow]).toEqual([120, 220, 320]);
  });
});

/** Every keyframe property is transform, opacity or (ringFill only) stroke-dashoffset. */
function onlyCheapProps(calls: Call[], extra: string[] = []) {
  const ok = new Set(['transform', 'opacity', 'offset', 'easing', ...extra]);
  for (const c of calls)
    for (const k of c.keyframes)
      for (const p of Object.keys(k)) {
        expect(ok.has(p), p).toBe(true);
      }
}

describe('enterScreen', () => {
  it('fades and slides 8px in the direction of travel', () => {
    const next = new El();
    enterScreen(as(next), 'next');
    const prev = new El();
    enterScreen(as(prev), 'prev');
    const up = new El();
    enterScreen(as(up), 'up');
    expect(next.calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateX(8px)' });
    expect(prev.calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateX(-8px)' });
    expect(up.calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(8px)' });
    expect(next.calls[0]?.keyframes[1]).toEqual({ opacity: 1, transform: 'none' });
    expect(next.calls[0]?.opts).toMatchObject({ duration: DUR.base, easing: EASE.standard });
    onlyCheapProps([...next.calls, ...prev.calls, ...up.calls]);
  });

  it('does nothing under reduced motion or on a motion-off screen', () => {
    reduce = true;
    const el = new El();
    enterScreen(as(el), 'next');
    expect(el.calls).toEqual([]);
    reduce = false;
    const off = new El();
    off.attrs['data-motion'] = 'off';
    enterScreen(as(off), 'next');
    expect(off.calls).toEqual([]);
  });

  it('returns a stop that cancels (interruptible, ends at the final state)', () => {
    const el = new El();
    const stop = enterScreen(as(el), 'up');
    stop();
    expect(el.cancelled).toBe(1);
  });
});

describe('staggerIn', () => {
  it('rises each element in, STAGGER_MS apart, capped so long lists stay quick', () => {
    const els = Array.from({ length: 10 }, () => new El());
    staggerIn(els.map(as));
    const delays = els.map((e) => e.calls[0]?.opts.delay);
    expect(delays.slice(0, 3)).toEqual([0, STAGGER_MS, 2 * STAGGER_MS]);
    expect(Math.max(...(delays as number[]))).toBeLessThanOrEqual(5 * STAGGER_MS);
    expect(els[0]?.calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(8px)' });
    expect(STAGGER_MS).toBeGreaterThanOrEqual(30);
    expect(STAGGER_MS).toBeLessThanOrEqual(50);
    onlyCheapProps(els.flatMap((e) => e.calls));
  });

  it('keeps elements visible before their turn (fill backwards) and stops them all', () => {
    const els = [new El(), new El()];
    const stop = staggerIn(els.map(as));
    expect(els[1]?.calls[0]?.opts.fill).toBe('backwards');
    stop();
    expect(els.map((e) => e.cancelled)).toEqual([1, 1]);
  });

  it('does nothing under reduced motion', () => {
    reduce = true;
    const els = [new El(), new El()];
    staggerIn(els.map(as));
    expect(els.flatMap((e) => e.calls)).toEqual([]);
  });
});

describe('countUp', () => {
  it('counts from 0 to the value and ends exactly on it', () => {
    vi.useFakeTimers();
    const el = new El();
    countUp(as(el), 120);
    expect(el.textContent).toBe('0');
    vi.advanceTimersByTime(DUR.slow);
    const mid = Number(el.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(120);
    vi.advanceTimersByTime(2000);
    expect(el.textContent).toBe('120');
  });

  it('uses the formatter and a start value', () => {
    vi.useFakeTimers();
    const el = new El();
    countUp(as(el), 2150, { from: 2000, format: (n) => `${n} kcal` });
    expect(el.textContent).toBe('2000 kcal');
    vi.runAllTimers();
    expect(el.textContent).toBe('2150 kcal');
  });

  it('shows the final value at once under reduced motion or on a motion-off screen', () => {
    vi.useFakeTimers();
    reduce = true;
    const el = new El();
    countUp(as(el), 18);
    expect(el.textContent).toBe('18');
    expect(vi.getTimerCount()).toBe(0);
    reduce = false;
    const off = new El();
    off.attrs['data-motion'] = 'off';
    countUp(as(off), 7);
    expect(off.textContent).toBe('7');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop jumps to the final value; a second countUp on the same element replaces the first', () => {
    vi.useFakeTimers();
    const el = new El();
    const stop = countUp(as(el), 50);
    vi.advanceTimersByTime(50);
    stop();
    expect(el.textContent).toBe('50');
    expect(vi.getTimerCount()).toBe(0);
    countUp(as(el), 10);
    countUp(as(el), 30);
    vi.runAllTimers();
    expect(el.textContent).toBe('30');
  });

  it('works without matchMedia or animate (counting needs neither)', () => {
    vi.useFakeTimers();
    g.matchMedia = undefined;
    const el = { textContent: '' } as unknown as HTMLElement;
    countUp(el, 3);
    vi.runAllTimers();
    expect(el.textContent).toBe('3');
  });
});

describe('checkMorph', () => {
  it('swaps the button icon for the check and pops it in', () => {
    const btn = new El('cs-btn');
    const old = btn.add(new El('ic'));
    const check = new El('ic');
    checkMorph(as(btn), as(check));
    expect(btn.children[0]).toBe(check);
    expect(old.parent).toBeNull();
    expect(check.calls[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'scale(0.6)' });
    expect(check.calls[0]?.opts).toMatchObject({ duration: DUR.base, easing: EASE.spring });
    onlyCheapProps(check.calls);
  });

  it('prepends the check when the button has no icon', () => {
    const btn = new El('cs-btn');
    const check = new El('ic');
    checkMorph(as(btn), as(check));
    expect(btn.children).toEqual([check]);
  });

  it('only swaps under reduced motion (final state, no animation)', () => {
    reduce = true;
    const btn = new El('cs-btn');
    btn.add(new El('ic'));
    const check = new El('ic');
    checkMorph(as(btn), as(check));
    expect(btn.children[0]).toBe(check);
    expect(check.calls).toEqual([]);
  });
});

describe('ringFill', () => {
  it('sets the final arc and animates the stroke from the old value', () => {
    const ring = new El();
    ring.style['strokeDashoffset'] = '100';
    ringFill(as(ring), 40);
    expect(ring.style['strokeDasharray']).toBe('100 100');
    expect(ring.style['strokeDashoffset']).toBe('60');
    expect(ring.calls[0]?.keyframes).toEqual([
      { strokeDashoffset: '100' },
      { strokeDashoffset: '60' },
    ]);
    expect(ring.calls[0]?.opts).toMatchObject({ duration: DUR.slow, easing: EASE.standard });
    onlyCheapProps(ring.calls, ['strokeDashoffset']);
  });

  it('clamps to 0..100 and starts empty when no arc is set', () => {
    const ring = new El();
    ringFill(as(ring), 140);
    expect(ring.style['strokeDashoffset']).toBe('0');
    expect(ring.calls[0]?.keyframes[0]).toEqual({ strokeDashoffset: '100' });
    const neg = new El();
    ringFill(as(neg), -5);
    expect(neg.style['strokeDashoffset']).toBe('100');
  });

  it('sets the final arc without animating under reduced motion', () => {
    reduce = true;
    const ring = new El();
    ringFill(as(ring), 75);
    expect(ring.style['strokeDashoffset']).toBe('25');
    expect(ring.calls).toEqual([]);
  });
});
