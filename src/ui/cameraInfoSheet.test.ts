// M13c goal 4: the Camera sheet (render + open/close/focus), with made-up and real rule data.
import { afterEach, describe, expect, it } from 'vitest';
import { cameraInfo, type CameraInfo } from '../core/exercises';
import { checkCopy } from '../core/trainer/replies';
import {
  CAMERA_COUNTS_HEADING,
  LEARNING_NOTE,
  PRACTICE_NOTE,
  cameraInfoOpen,
  cameraInfoSheet,
  cameraSheetCopy,
  cameraSheetTitle,
  closeCameraInfo,
  distanceText,
  oneSidedLine,
  openCameraInfo,
} from './cameraInfoSheet';
import { FakeEl, asFake, useFakeDom } from './screens/testDom';

useFakeDom();
afterEach(() => closeCameraInfo());

// Made-up: a tuned, two-sided, front-view rule.
const TRACKED: CameraInfo = {
  counts: 'Counts each squat from your knee angle.',
  lines: ['Phone at hip height, facing you', 'Whole body in view'],
  view: 'front',
  facing: 'Facing the phone',
  distanceM: [2, 3],
  heightHint: 'Hip height',
  learning: false,
};
const ONE_SIDED: CameraInfo = { ...TRACKED, view: 'side', oneSided: 'arm' };
const LEARNING: CameraInfo = { ...TRACKED, learning: true };

const hook = (el: FakeEl, attr: string) => el.find((e) => e.hasAttribute(attr));
const one = (el: FakeEl, attr: string): FakeEl => {
  const hit = hook(el, attr)[0];
  if (!hit) throw new Error(`no [${attr}]`);
  return hit;
};

function render(info: CameraInfo, withPractice = true) {
  const calls = { practice: 0, close: 0 };
  const el = asFake(
    cameraInfoSheet(info, {
      name: 'Goblet Squat',
      exerciseId: 'Goblet_Squat',
      onPractice: withPractice ? () => calls.practice++ : undefined,
      onClose: () => calls.close++,
    }),
  );
  return { el, calls };
}

describe('pure copy helpers', () => {
  it('title, distance and the one-sided line', () => {
    expect(cameraSheetTitle('Goblet Squat')).toBe('Camera: Goblet Squat');
    expect(distanceText([2, 3])).toBe('2–3 m');
    expect(distanceText([1.5, 2.5])).toBe('1.5–2.5 m');
    expect(distanceText([2, 2])).toBe('2 m');
    expect(oneSidedLine('arm')).toBe('Right arm first, then tap Next arm.');
    expect(oneSidedLine('leg')).toBe('Right leg first, then tap Next leg.');
  });

  it('every string passes checkCopy and the anyone-scan, for every real rule', () => {
    const infos = [TRACKED, ONE_SIDED, LEARNING, { ...TRACKED, oneSided: 'leg' as const }];
    for (const id of ['Dumbbell_Bicep_Curl', 'Hammer_Curls', 'One-Arm_Dumbbell_Row', 'Pushups']) {
      const real = cameraInfo(id);
      if (real) infos.push(real);
    }
    expect(infos.length).toBeGreaterThanOrEqual(6);
    for (const info of infos) {
      for (const s of cameraSheetCopy(info, 'Goblet Squat')) {
        expect(checkCopy(s).ok, s).toBe(true);
        expect(s, s).not.toMatch(/\b(he|she|his|her|him)\b/i);
      }
    }
  });
});

describe('cameraInfoSheet render', () => {
  it('a tracked rule: dialog, title, counts, pictogram + lines, distance/height, Practice + Close', () => {
    const { el } = render(TRACKED);
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('data-camera-sheet')).toBe('Goblet_Squat');
    expect(el.classes).toContain('mood-pro');
    expect(one(el, 'data-camera-title').textContent).toBe('Camera: Goblet Squat');
    expect(el.textContent).toContain(CAMERA_COUNTS_HEADING);
    expect(one(el, 'data-camera-counts').textContent).toBe(TRACKED.counts);
    expect(
      one(el, 'data-camera-lines')
        .byTag('li')
        .map((l) => l.textContent),
    ).toEqual(TRACKED.lines);
    const pic = el.byClass('setup-pic')[0];
    expect(pic?.getAttribute('data-view')).toBe('front');
    expect(pic?.getAttribute('aria-hidden')).toBe('true');
    expect(one(el, 'data-camera-distance').textContent).toBe('Distance2–3 m');
    expect(one(el, 'data-camera-height').textContent).toBe('HeightHip height');
    expect(hook(el, 'data-camera-onesided')).toHaveLength(0);
    expect(hook(el, 'data-camera-learning')).toHaveLength(0);
    expect(one(el, 'data-camera-practice').textContent).toBe('Practice');
    expect(el.textContent).toContain(PRACTICE_NOTE);
    expect(one(el, 'data-camera-close').textContent).toBe('Close');
    // Only two controls on the sheet.
    expect(el.byTag('button')).toHaveLength(2);
  });

  it('a one-sided rule shows "Right arm first, then tap Next arm." and the side-on pictogram', () => {
    const { el } = render(ONE_SIDED);
    const note = one(el, 'data-camera-onesided');
    expect(note.getAttribute('data-camera-onesided')).toBe('arm');
    expect(note.textContent).toBe('Right arm first, then tap Next arm.');
    expect(el.byClass('setup-pic')[0]?.getAttribute('data-view')).toBe('side');
  });

  it('a learning rule shows the learning note', () => {
    const { el } = render(LEARNING);
    expect(one(el, 'data-camera-learning').textContent).toBe(LEARNING_NOTE);
    expect(LEARNING_NOTE).toMatch(/Fix the count on Rest/);
  });

  it('real data: the one-arm row is one-sided, Hammer Curls is learning', () => {
    const row = cameraInfo('One-Arm_Dumbbell_Row');
    const hammer = cameraInfo('Hammer_Curls');
    expect(row && hammer).toBeTruthy();
    const r = render(row as CameraInfo).el;
    expect(hook(r, 'data-camera-onesided')).toHaveLength(1);
    expect(one(r, 'data-camera-counts').textContent).toBe((row as CameraInfo).counts);
    const hm = render(hammer as CameraInfo).el;
    expect(hook(hm, 'data-camera-learning')).toHaveLength(1);
  });

  it('Practice, Close and the veil call back; no Practice button without onPractice', () => {
    const { el, calls } = render(TRACKED);
    one(el, 'data-camera-practice').click();
    one(el, 'data-camera-close').click();
    one(el, 'data-camera-veil').click();
    expect(calls).toEqual({ practice: 1, close: 2 });
    const bare = render(TRACKED, false).el;
    expect(hook(bare, 'data-camera-practice')).toHaveLength(0);
    expect(bare.byTag('button')).toHaveLength(1);
  });

  it('Escape closes; Tab cycles between Practice and Close', () => {
    const { el, calls } = render(TRACKED);
    const practice = one(el, 'data-camera-practice');
    const close = one(el, 'data-camera-close');
    const key = (k: string, shiftKey = false) =>
      el.dispatch('keydown', { key: k, shiftKey, preventDefault: () => {} });
    practice.focus();
    key('Tab');
    expect(document.activeElement).toBe(close);
    key('Tab');
    expect(document.activeElement).toBe(practice);
    key('Tab', true);
    expect(document.activeElement).toBe(close);
    key('Escape');
    expect(calls.close).toBe(1);
  });
});

describe('openCameraInfo', () => {
  function open(onPractice?: () => void) {
    const parent = new FakeEl('body');
    const opener = new FakeEl('button');
    const calls = { close: 0 };
    const handle = openCameraInfo(
      TRACKED,
      { name: 'Goblet Squat', onPractice, onClose: () => calls.close++ },
      opener as unknown as HTMLElement,
      parent as unknown as HTMLElement,
    );
    return { parent, opener, handle, calls, sheet: asFake(handle.el) };
  }

  it('mounts on the parent, focuses Practice, and Close returns focus to the opener', () => {
    const { parent, opener, sheet, calls } = open(() => {});
    expect(parent.children).toContain(sheet);
    expect(cameraInfoOpen()).toBe(true);
    expect(document.activeElement).toBe(one(sheet, 'data-camera-practice'));
    one(sheet, 'data-camera-close').click();
    expect(cameraInfoOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(calls.close).toBe(1);
  });

  it('focuses Close when there is no Practice', () => {
    const { sheet } = open();
    expect(document.activeElement).toBe(one(sheet, 'data-camera-close'));
  });

  it('Practice closes the sheet quietly (no onClose, no focus jump), then hands over', () => {
    const order: string[] = [];
    const { sheet, calls, opener } = open(() => order.push(cameraInfoOpen() ? 'open' : 'closed'));
    const practice = one(sheet, 'data-camera-practice');
    practice.click();
    expect(order).toEqual(['closed']);
    expect(calls.close).toBe(0);
    expect(document.activeElement).not.toBe(opener);
    practice.click(); // a second tap does nothing
    expect(order).toHaveLength(1);
  });

  it('closeCameraInfo() closes it from outside (a set starts); opening another replaces it', () => {
    const a = open();
    const b = open();
    expect(a.calls.close).toBe(1);
    expect(cameraInfoOpen()).toBe(true);
    closeCameraInfo();
    expect(b.calls.close).toBe(1);
    expect(cameraInfoOpen()).toBe(false);
    closeCameraInfo(); // safe when none is open
  });
});
