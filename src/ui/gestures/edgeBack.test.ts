// M13d task 24: the edge swipe back, on a small fake DOM (selectors: tag, .class, [attr], [attr="v"],
// compound and comma lists; enough for edgeBack.ts). Gesture thresholds are core's (gestures.test.ts);
// here: which control is pressed, when nothing happens, the follow, Reduce Motion and feel().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOVING_CLASS, installEdgeBack, swipeBackTarget } from './edgeBack';

type Listener = (e: unknown) => void;

class Node_ {
  attrs = new Map<string, string>();
  children: Node_[] = [];
  parent: Node_ | null = null;
  listeners = new Map<string, Listener[]>();
  style = { transform: '', transition: '' };
  disabled = false;
  clicks = 0;
  doc: Node_ | null = null;
  constructor(
    public tag: string,
    attrs: Record<string, string> = {},
    ...kids: Node_[]
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
    this.append(...kids);
  }
  append(...kids: Node_[]) {
    for (const k of kids) {
      k.parent = this;
      this.children.push(k);
    }
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  get ownerDocument(): Node_ {
    return this.parent ? this.parent.ownerDocument : this;
  }
  get isConnected() {
    return this.ownerDocument.tag === '#document';
  }
  classList = {
    add: (c: string) => {
      const cs = new Set((this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean));
      cs.add(c);
      this.attrs.set('class', [...cs].join(' '));
    },
    remove: (c: string) => {
      const cs = (this.attrs.get('class') ?? '').split(/\s+/).filter((x) => x && x !== c);
      this.attrs.set('class', cs.join(' '));
    },
    contains: (c: string) => (this.attrs.get('class') ?? '').split(/\s+/).includes(c),
  };
  get firstElementChild(): Node_ | null {
    return this.children[0] ?? null;
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  addEventListener(type: string, cb: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  removeEventListener(type: string, cb: Listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== cb),
    );
  }
  fire(type: string, e: unknown) {
    for (const l of this.listeners.get(type) ?? []) l(e);
  }
  click() {
    this.clicks++;
    this.fire('click', {});
  }
  matches(sel: string): boolean {
    return sel.split(',').some((one) => matchOne(this, one.trim()));
  }
  closest(sel: string): Node_ | null {
    if (this.tag === '#document') return null;
    return this.matches(sel) ? this : (this.parent?.closest(sel) ?? null);
  }
  querySelectorAll(sel: string): Node_[] {
    const out: Node_[] = [];
    const walk = (n: Node_) => {
      for (const c of n.children) {
        if (c.matches(sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel: string): Node_ | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

function matchOne(n: Node_, sel: string): boolean {
  const parts = sel.match(/^[a-z]+|\.[\w-]+|\[[^\]]+\]/g) ?? [];
  if (parts.join('') !== sel) throw new Error(`fake DOM: unsupported selector ${sel}`);
  return parts.every((p) => {
    if (p.startsWith('.')) return (n.attrs.get('class') ?? '').split(/\s+/).includes(p.slice(1));
    if (p.startsWith('[')) {
      const m = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(p);
      if (!m?.[1]) return false;
      return m[2] === undefined ? n.attrs.has(m[1]) : n.attrs.get(m[1]) === m[2];
    }
    return n.tag === p;
  });
}

const el = (tag: string, attrs: Record<string, string> = {}, ...kids: Node_[]) =>
  new Node_(tag, attrs, ...kids);
const asEl = (n: Node_) => n as unknown as HTMLElement;

/** document > body > #app > screen; returns the parts. */
function page(screen: Node_, ...bodyExtras: Node_[]) {
  const app = el('div', { id: 'app' }, screen);
  const body = el('body', {}, app, ...bodyExtras);
  el('#document', {}, body);
  return { app, body };
}

const backBtn = (extra: Record<string, string> = {}) =>
  el('button', { 'data-back': '', 'data-swipe-back': '', ...extra });

function aboutScreen() {
  const back = backBtn();
  const screen = el(
    'main',
    { class: 'screen about', 'data-screen': 'about' },
    el('header', { class: 'top-bar' }, back),
  );
  return { screen, back };
}

// ---------- touch driving ----------

const VIEW = { width: 390, height: 844 };

type Fired = { prevented: boolean };

function touch(target: Node_, type: string, x: number, y: number, t: number): Fired {
  const pt = { clientX: x, clientY: y };
  const fired = { prevented: false };
  const ended = type === 'touchend' || type === 'touchcancel';
  target.fire(type, {
    touches: ended ? [] : [pt],
    changedTouches: [pt],
    timeStamp: t,
    cancelable: true,
    preventDefault: () => (fired.prevented = true),
  });
  return fired;
}

/** A slow drag from (x0, y) to (x1, y + dy) over `ms`, then release; returns moves prevented. */
function drag(
  app: Node_,
  x0: number,
  x1: number,
  opts: { dy?: number; ms?: number; end?: boolean } = {},
) {
  const { dy = 0, ms = 600, end = true } = opts;
  const steps = 12;
  const prevented: boolean[] = [];
  touch(app, 'touchstart', x0, 400, 0);
  for (let i = 1; i <= steps; i++) {
    const f = touch(
      app,
      'touchmove',
      x0 + ((x1 - x0) * i) / steps,
      400 + (dy * i) / steps,
      (ms * i) / steps,
    );
    prevented.push(f.prevented);
  }
  if (end) touch(app, 'touchend', x1, 400 + dy, ms + 200); // held still before lifting: no flick
  return prevented;
}

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

function install(app: Node_, opts: Parameters<typeof installEdgeBack>[1] = {}) {
  uninstall = installEdgeBack(asEl(app), { viewport: () => VIEW, ...opts });
  return uninstall;
}

// ---------- target picking ----------

describe('swipeBackTarget', () => {
  it('picks the screen’s single [data-swipe-back] control', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    expect(swipeBackTarget(asEl(app))).toBe(back);
  });

  it('none on a tab root (nothing marked)', () => {
    const screen = el(
      'main',
      { class: 'screen today has-tabbar', 'data-screen': 'today' },
      el('button', { 'data-tab': 'today' }),
      el('button', { 'data-back': '' }), // a Back that did not opt in
    );
    const { app } = page(screen);
    expect(swipeBackTarget(asEl(app))).toBeNull();
  });

  it('none when data-in-workout is set on the root (or above it)', () => {
    const { screen } = aboutScreen();
    const { app, body } = page(screen);
    app.setAttribute('data-in-workout', '');
    expect(swipeBackTarget(asEl(app))).toBeNull();
    app.removeAttribute('data-in-workout');
    body.setAttribute('data-in-workout', '');
    expect(swipeBackTarget(asEl(app))).toBeNull();
  });

  it.each(['exercise', 'rest', 'summary'])(
    'none on the %s screen even if a control is marked',
    (s) => {
      const screen = el('main', { class: 'screen', 'data-screen': s }, backBtn());
      const { app } = page(screen);
      expect(swipeBackTarget(asEl(app))).toBeNull();
    },
  );

  it('none with the camera sheet over a screen', () => {
    const { screen } = aboutScreen();
    const { app } = page(screen);
    app.append(el('div', { class: 'overlay sheet camera-sheet' }));
    expect(swipeBackTarget(asEl(app))).toBeNull();
  });

  it('never guesses: two marked controls → none', () => {
    const { screen } = aboutScreen();
    screen.append(backBtn());
    const { app } = page(screen);
    expect(swipeBackTarget(asEl(app))).toBeNull();
  });

  it('skips hidden and disabled controls', () => {
    const { screen, back } = aboutScreen();
    const hiddenWrap = el('div', { hidden: '' }, backBtn());
    const off = backBtn();
    off.disabled = true;
    screen.append(hiddenWrap, off);
    const { app } = page(screen);
    expect(swipeBackTarget(asEl(app))).toBe(back);
  });

  it('an open sheet decides: its own control, or none (the screen under it is not pressed)', () => {
    const { screen } = aboutScreen();
    const sheet = el(
      'div',
      { role: 'dialog', 'aria-modal': 'true' },
      el('button', { 'data-sheet-close': '' }),
    );
    const { app } = page(screen, sheet);
    expect(swipeBackTarget(asEl(app))).toBeNull();
    const sheetBack = backBtn();
    sheet.append(sheetBack);
    expect(swipeBackTarget(asEl(app))).toBe(sheetBack);
    sheet.setAttribute('hidden', ''); // a closed sheet left in the DOM does not count
    expect(swipeBackTarget(asEl(app))).not.toBe(sheetBack);
  });
});

// ---------- the gesture ----------

describe('installEdgeBack', () => {
  let feel: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    feel = vi.fn<() => void>();
  });

  it('marks the root while installed, and uninstall removes every listener', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    const off = install(app, { feel });
    expect(app.hasAttribute('data-edge-back')).toBe(true);
    off();
    off();
    expect(app.hasAttribute('data-edge-back')).toBe(false);
    drag(app, 4, 300);
    expect(back.clicks).toBe(0);
    expect([...app.listeners.values()].every((l) => l.length === 0)).toBe(true);
  });

  it('past a third of the width: the screen follows, then Back is clicked once and feel() once', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    install(app, { feel });
    const prevented = drag(app, 6, 200, { end: false });
    expect(screen.style.transform).toMatch(/^translate3d\(194px, 0(px)?, 0(px)?\)$/);
    expect(screen.classList.contains(MOVING_CLASS)).toBe(true); // its leading edge shows
    expect(prevented.at(-1)).toBe(true); // ours once tracking: no page scroll underneath
    expect(back.clicks).toBe(0);
    touch(app, 'touchend', 200, 400, 900);
    expect(back.clicks).toBe(1);
    expect(feel).toHaveBeenCalledTimes(1);
    expect(screen.style.transform).toBe('');
    expect(screen.classList.contains(MOVING_CLASS)).toBe(false);
    expect(screen.classList.contains('about')).toBe(true);
  });

  it('a quick flick commits from a short distance', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    install(app, { feel });
    touch(app, 'touchstart', 5, 400, 0);
    touch(app, 'touchmove', 30, 400, 20);
    touch(app, 'touchmove', 70, 400, 40);
    touch(app, 'touchend', 90, 400, 50);
    expect(back.clicks).toBe(1);
    expect(feel).toHaveBeenCalledTimes(1);
  });

  it('a short slow drag springs back: no click, no feel', () => {
    vi.useFakeTimers();
    try {
      const { screen, back } = aboutScreen();
      const { app } = page(screen);
      install(app, { feel });
      drag(app, 6, 80);
      expect(back.clicks).toBe(0);
      expect(feel).not.toHaveBeenCalled();
      expect(screen.style.transform).toBe('');
      expect(screen.style.transition).toMatch(/^transform 220ms /);
      expect(screen.classList.contains(MOVING_CLASS)).toBe(true); // the edge rides back too
      vi.runAllTimers();
      expect(screen.style.transition).toBe('');
      expect(screen.classList.contains(MOVING_CLASS)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('not from the edge, or mostly vertical: left to the browser (never prevented)', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    install(app, { feel });
    expect(drag(app, 60, 300).some(Boolean)).toBe(false);
    expect(drag(app, 4, 20, { dy: 300 }).some(Boolean)).toBe(false);
    expect(back.clicks).toBe(0);
    expect(screen.style.transform).toBe('');
  });

  it('a tap at the edge does nothing', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    install(app, { feel });
    touch(app, 'touchstart', 5, 400, 0);
    touch(app, 'touchend', 5, 400, 80);
    expect(back.clicks).toBe(0);
  });

  it('nothing on a tab root, nothing in a workout', () => {
    const today = el(
      'main',
      { class: 'screen today', 'data-screen': 'today' },
      el('button', { 'data-back': '' }),
    );
    const { app } = page(today);
    install(app, { feel });
    expect(drag(app, 4, 300).some(Boolean)).toBe(false);
    expect(today.style.transform).toBe('');

    const { screen, back } = aboutScreen();
    app.children = [];
    app.append(screen);
    app.setAttribute('data-in-workout', '');
    expect(drag(app, 4, 300).some(Boolean)).toBe(false);
    expect(back.clicks).toBe(0);
    expect(screen.style.transform).toBe('');
    expect(feel).not.toHaveBeenCalled();
  });

  it('Reduce Motion: no follow, the same action', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    install(app, { feel, reducedMotion: () => true });
    const prevented = drag(app, 6, 200, { end: false });
    expect(prevented.at(-1)).toBe(true);
    expect(screen.style.transform).toBe('');
    expect(screen.classList.contains(MOVING_CLASS)).toBe(false);
    touch(app, 'touchend', 200, 400, 900);
    expect(back.clicks).toBe(1);
    expect(feel).toHaveBeenCalledTimes(1);
  });

  it('a second finger cancels', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    install(app, { feel });
    drag(app, 6, 200, { end: false });
    app.fire('touchmove', {
      touches: [
        { clientX: 200, clientY: 400 },
        { clientX: 300, clientY: 500 },
      ],
      changedTouches: [],
      timeStamp: 700,
      cancelable: true,
      preventDefault: () => {},
    });
    touch(app, 'touchend', 200, 400, 900);
    expect(back.clicks).toBe(0);
  });

  it('a failing feel() never blocks Back; without feel it still works', () => {
    const { screen, back } = aboutScreen();
    const { app } = page(screen);
    const off = install(app, {
      feel: () => {
        throw new Error('no haptics');
      },
    });
    drag(app, 6, 220);
    expect(back.clicks).toBe(1);
    off();
    install(app);
    drag(app, 6, 220);
    expect(back.clicks).toBe(2);
  });

  it('moves the open sheet that holds the control, not the screen under it', () => {
    const { screen } = aboutScreen();
    const sheetBack = backBtn();
    const sheet = el('div', { 'aria-modal': 'true' }, sheetBack);
    const { app } = page(screen, sheet);
    install(app, { feel });
    drag(app, 6, 200, { end: false });
    expect(sheet.style.transform).toMatch(/^translate3d\(194px/);
    expect(screen.style.transform).toBe('');
    touch(app, 'touchend', 200, 400, 900);
    expect(sheetBack.clicks).toBe(1);
  });
});
