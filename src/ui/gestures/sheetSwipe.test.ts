// M13d task 25: swipe down to close, on the fake DOM. Gesture thresholds are core's
// (gestures.test.ts); here: the sheet's own Close runs once, a scrolled sheet scrolls first, the
// follow, Reduce Motion, nothing in a workout, and each sheet kind that has it (Coach, the Fuel
// sheet shell, the report, the Camera sheet, the How-to sheet, the learn card) — the Pause sheet
// has none, and a Fuel sheet with unsaved changes stops offering it.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraInfo } from '../../core/exercises';
import type { LearnCard } from '../../core/types';
import { closeCameraInfo, cameraInfoSheet, openCameraInfo } from '../cameraInfoSheet';
import { coachSheet } from '../coach/coachSheet';
import { learnCardSheet } from '../coach/learnCard';
import { DEMO_IDS } from '../demo3d/ids';
import { sheetShell } from '../fuel/common';
import { createHowToSheet } from '../howToSheet';
import { pauseSheet } from '../screens/pauseSheet';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { reportSheet } from '../todo/reportSheet';
import { installSheetSwipe, scrollAbove, SHEET_SWIPE_ATTR } from './sheetSwipe';
import { fakeSwipe, type FakeSwipe } from './testTouch';

// The How-to's 3D player stays "loading" (no three.js in a unit test).
vi.mock('../demo3d/player', () => ({ createDemoPlayer: () => new Promise(() => {}) }));

useFakeDom();

beforeAll(() => {
  // The How-to sheet sets stage.dataset.mode; the fake DOM has no dataset.
  Object.defineProperty(FakeEl.prototype, 'dataset', {
    configurable: true,
    get(this: FakeEl & { _ds?: Record<string, string> }) {
      this._ds ??= {};
      return this._ds;
    },
  });
});

function setReduced(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce') }));
}
beforeEach(() => setReduced(false));
afterEach(() => {
  vi.unstubAllGlobals();
  closeCameraInfo();
});

const DOWN: Pick<FakeSwipe, 'from' | 'to'> = { from: { x: 200, y: 200 }, to: { x: 200, y: 520 } };
const down = (el: FakeEl, over: Partial<FakeSwipe> = {}) => fakeSwipe(el, { ...DOWN, ...over });

function bare() {
  const sheet = new FakeEl('div');
  const panel = new FakeEl('div');
  sheet.append(panel);
  const close = vi.fn();
  const off = installSheetSwipe(sheet as unknown as HTMLElement, {
    close,
    mover: panel as unknown as HTMLElement,
  });
  return { sheet, panel, close, off };
}

describe('installSheetSwipe', () => {
  it('a long drag down calls Close once; the panel follows, then lets go', () => {
    const { sheet, panel, close } = bare();
    expect(sheet.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    const s = down(sheet, { release: false });
    expect(s.prevented).toBeGreaterThan(0);
    expect(panel.style.transform).toBe('translate3d(0, 320px, 0)');
    expect(close).not.toHaveBeenCalled();
    s.lift();
    expect(close).toHaveBeenCalledTimes(1);
    expect(panel.style.transform).toBe('');
  });

  it('a close that removes the sheet leaves the panel where the finger let go (no snap back)', () => {
    const sheet = new FakeEl('div');
    const panel = new FakeEl('div');
    sheet.append(panel);
    const close = vi.fn(() => {
      sheet.isConnected = false;
      panel.isConnected = false;
    });
    installSheetSwipe(sheet as unknown as HTMLElement, {
      close,
      mover: panel as unknown as HTMLElement,
    });
    const s = down(sheet, { release: false });
    expect(panel.style.transform).toBe('translate3d(0, 320px, 0)');
    s.lift();
    expect(close).toHaveBeenCalledTimes(1);
    expect(panel.style.transform).toBe('translate3d(0, 320px, 0)');
  });

  it('a short drag springs back; up, sideways and taps do nothing', () => {
    const { sheet, panel, close } = bare();
    down(sheet, { to: { x: 200, y: 260 } });
    expect(panel.style.transform).toBe('');
    down(sheet, { to: { x: 200, y: 0 } });
    down(sheet, { to: { x: 20, y: 230 } });
    down(sheet, { to: { x: 200, y: 203 } });
    expect(close).not.toHaveBeenCalled();
  });

  it('a quick flick closes from a short distance', () => {
    const { sheet, close } = bare();
    down(sheet, { to: { x: 200, y: 300 }, steps: 3, holdMs: 0 });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a scrolled sheet scrolls first: no close, no preventDefault, no follow', () => {
    const { sheet, panel, close } = bare();
    // The finger lands on something inside a scrolled box (scrollTop read at touch start).
    const inner = new FakeEl('p');
    const box = Object.assign(new FakeEl('div'), { scrollTop: 120 });
    Object.assign(inner, { parentElement: box });
    Object.assign(box, { parentElement: sheet });
    const s = down(sheet, { target: inner });
    expect(s.prevented).toBe(0);
    expect(panel.style.transform ?? '').toBe('');
    expect(close).not.toHaveBeenCalled();
    // Back at the top: the same drag closes.
    box.scrollTop = 0;
    down(sheet, { target: inner });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('scrollAbove sums the boxes between the finger and the sheet (the sheet itself too)', () => {
    const sheet = Object.assign(new FakeEl('div'), { scrollTop: 0 });
    const box = Object.assign(new FakeEl('div'), { scrollTop: 0, parentElement: sheet });
    const p = Object.assign(new FakeEl('p'), { parentElement: box });
    const S = sheet as unknown as HTMLElement;
    expect(scrollAbove(p, S)).toBe(0);
    sheet.scrollTop = 40;
    expect(scrollAbove(p, S)).toBe(40);
    expect(scrollAbove(null, S)).toBe(40);
  });

  it('Reduce Motion: no follow, the same close', () => {
    setReduced(true);
    const { sheet, panel, close } = bare();
    const s = down(sheet, { release: false });
    expect(panel.style.transform ?? '').toBe('');
    s.lift();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('never in a workout: nothing while a workout is on screen', () => {
    const doc = globalThis.document as unknown as { querySelector?: (s: string) => unknown };
    doc.querySelector = (sel: string) => (sel.includes('[data-in-workout]') ? {} : null);
    const { sheet, panel, close } = bare();
    const s = down(sheet, { release: false });
    expect(s.prevented).toBe(0);
    expect(panel.style.transform ?? '').toBe('');
    s.lift();
    expect(close).not.toHaveBeenCalled();
  });

  it('a touch that starts on a text field, a 3D canvas or the caller’s ignore list is left alone', () => {
    const { sheet, close } = bare();
    const onField = Object.assign(new FakeEl('input'), {
      closest: (sel: string) => (sel.includes('input') ? onField : null),
    });
    Object.assign(sheet, { contains: () => true });
    down(sheet, { target: onField });
    expect(close).not.toHaveBeenCalled();
  });

  it('a nested swipe-down sheet owns its touches (only the innermost closes)', () => {
    const { sheet, close } = bare();
    const inner = new FakeEl('div');
    const target = Object.assign(new FakeEl('p'), {
      closest: (sel: string) => (sel === `[${SHEET_SWIPE_ATTR}]` ? inner : null),
    });
    down(sheet, { target });
    expect(close).not.toHaveBeenCalled();
  });

  it('uninstall removes the swipe', () => {
    const { sheet, close, off } = bare();
    off();
    off();
    expect(sheet.hasAttribute(SHEET_SWIPE_ATTR)).toBe(false);
    down(sheet);
    expect(close).not.toHaveBeenCalled();
  });
});

// ---------- each sheet kind ----------

const INFO: CameraInfo = {
  counts: 'Counts each squat from your knee angle.',
  lines: ['Phone at hip height, facing you'],
  view: 'front',
  facing: 'Facing the phone',
  distanceM: [2, 3],
  heightHint: 'Hip height',
  learning: false,
};

describe('swipe down per sheet kind: close called once', () => {
  it('Coach sheet: Close (the panel follows)', () => {
    const onClose = vi.fn();
    const el = asFake(
      coachSheet(
        { items: [{ kind: 'coach', text: 'Hi.' }] },
        {
          onClose,
          onChip: vi.fn(),
          onArea: vi.fn(),
          onApply: vi.fn(),
          onDismiss: vi.fn(),
        },
      ),
    );
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    const panel = el.oneByClass('cs-panel');
    const s = down(el, { release: false });
    expect(panel.style.transform).toBe('translate3d(0, 320px, 0)');
    s.lift();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Fuel sheet shell: its Close / Cancel (onClose, not onEscape)', () => {
    const onClose = vi.fn();
    const onEscape = vi.fn();
    const shell = sheetShell({
      title: 'Log food',
      key: 'log-sheet',
      closeLabel: 'Close',
      onClose,
      onEscape,
    });
    const el = asFake(shell.el);
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    down(el);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('Report sheet: Close', () => {
    const onClose = vi.fn();
    const el = asFake(
      reportSheet(
        { text: 'Report', nothingNew: false, copy: async () => true },
        { onClose, onCopied: vi.fn(), onCopyAll: vi.fn() },
      ),
    );
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    down(el);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Camera sheet: Close (pure render and the opened sheet), never Practice', () => {
    const onClose = vi.fn();
    const onPractice = vi.fn();
    const el = asFake(cameraInfoSheet(INFO, { name: 'Goblet Squat', onClose, onPractice }));
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    down(el);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPractice).not.toHaveBeenCalled();

    const parent = new FakeEl('body');
    const onClose2 = vi.fn();
    const handle = openCameraInfo(
      INFO,
      { name: 'Goblet Squat', onClose: onClose2, onPractice },
      null,
      parent as unknown as HTMLElement,
    );
    down(asFake(handle.el));
    expect(onClose2).toHaveBeenCalledTimes(1);
    down(asFake(handle.el)); // already closed: the handle's close runs once
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(onPractice).not.toHaveBeenCalled();
  });

  it('Fuel sheet shell: once anything is typed or changed, swipe down no longer closes it', () => {
    for (const type of ['input', 'change']) {
      const onClose = vi.fn();
      const el = asFake(
        sheetShell({ title: 'My food', key: 'food-sheet', closeLabel: 'Cancel', onClose }).el,
      );
      el.dispatch(type, {});
      expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(false);
      const s = down(el);
      expect(s.prevented).toBe(0);
      expect(onClose).not.toHaveBeenCalled();
      // The Close button still closes.
      el.find((e) => e.hasAttribute('data-close'))[0]?.click();
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('How-to sheet: Close once; never from the 3D stage; dispose removes the swipe', () => {
    const onClose = vi.fn();
    const sheet = createHowToSheet({ exerciseId: DEMO_IDS[0] ?? '', tracking: 'manual', onClose });
    const el = asFake(sheet.el);
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    const stage = el.find((e) => e.getAttribute('data-howto') === 'stage')[0];
    const onStage = Object.assign(new FakeEl('svg'), {
      // the 2D map: only `ignore` covers it
      closest: (sel: string) => (sel.includes('[data-howto="stage"]') ? stage : null),
    });
    Object.assign(el, { contains: () => true });
    down(el, { target: onStage });
    expect(onClose).not.toHaveBeenCalled();
    down(el);
    expect(onClose).toHaveBeenCalledTimes(1);
    sheet.dispose();
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(false);
    down(el);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('How-to opened while the Exercise screen is on: the swipe is ignored', () => {
    const doc = globalThis.document as unknown as { querySelector?: (s: string) => unknown };
    doc.querySelector = (sel: string) => (sel.includes('[data-screen="exercise"]') ? {} : null);
    const onClose = vi.fn();
    const sheet = createHowToSheet({ exerciseId: DEMO_IDS[0] ?? '', tracking: 'manual', onClose });
    const s = down(asFake(sheet.el));
    expect(s.prevented).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
    sheet.dispose();
  });

  it('Learn card: Got it once (the panel follows)', () => {
    const card: LearnCard = { id: 'effort', title: 'Effort', body: 'Body.', short: 'Short.' };
    const onClose = vi.fn();
    const el = asFake(learnCardSheet(card, { onClose }));
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(true);
    const panel = el.oneByClass('learn-panel');
    const s = down(el, { release: false });
    expect(panel.style.transform).toBe('translate3d(0, 320px, 0)');
    s.lift();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Pause sheet: excluded (no swipe installed; a swipe down resumes / ends nothing)', () => {
    const a = { onResume: vi.fn(), onSkip: vi.fn(), onEnd: vi.fn(), onCoach: vi.fn() };
    const el = asFake(pauseSheet({ context: 'Bench Press · set 2 of 4' }, a));
    expect(el.find((e) => e.hasAttribute(SHEET_SWIPE_ATTR))).toHaveLength(0);
    expect(el.hasAttribute(SHEET_SWIPE_ATTR)).toBe(false);
    down(el);
    for (const fn of Object.values(a)) expect(fn).not.toHaveBeenCalled();
    expect(el.listeners.get('touchstart') ?? []).toHaveLength(0);
  });
});
