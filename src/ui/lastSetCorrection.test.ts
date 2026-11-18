import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkSide } from '../core/types';
import { createLastSetCorrection, type LastSetCorrectionOptions } from './lastSetCorrection';
import { FakeEl, asFake } from './screens/testDom';

/** FakeEl plus what the Fix panel touches (dataset, classList, disabled, hidden). */
class PanelEl extends FakeEl {
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  classList = {
    toggle: (c: string, on: boolean) => {
      const set = new Set(this.classes);
      if (on) set.add(c);
      else set.delete(c);
      this.setAttribute('class', [...set].join(' '));
    },
  };
}

const g = globalThis as { document?: unknown };
let saved: unknown;
beforeEach(() => {
  saved = g.document;
  g.document = {
    activeElement: null,
    createElement: (tag: string) => new PanelEl(tag),
    createElementNS: (_ns: string, tag: string) => new PanelEl(tag),
  };
});
afterEach(() => {
  g.document = saved;
});

const q = (root: FakeEl, v: string) => {
  const hit = root.find((e) => e.getAttribute('data-lsc') === v)[0];
  if (!hit) throw new Error(`no [data-lsc=${v}]`);
  return hit as PanelEl;
};

function make(over: Partial<LastSetCorrectionOptions> = {}) {
  const onCorrect = vi.fn<(reps: number, partials: number, side?: WorkSide) => void>();
  const handle = createLastSetCorrection({ reps: 11, partials: 0, onCorrect, ...over });
  return { root: asFake(handle.el), onCorrect, handle };
}

const SIDES = { right: { reps: 12, partials: 0 }, left: { reps: 11, partials: 1 } };

describe('last set Fix: two-sided (unchanged)', () => {
  it('reads "11 reps", has no side picker, Save reports the total without a side', () => {
    const { root, onCorrect } = make();
    expect(q(root, 'summary').textContent).toBe('11 reps');
    expect(q(root, 'sides').hidden).toBe(true);
    q(root, 'fix').click();
    q(root, 'reps-plus').click();
    q(root, 'save').click();
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(12, 0);
  });
});

describe('last set Fix: one-sided (M13b)', () => {
  it('the line reads "R 12 · L 11 · 1 partial" with a spoken label', () => {
    const { root } = make({ sides: SIDES, limb: 'arm' });
    expect(q(root, 'summary').textContent).toBe('R 12 · L 11 · 1 partial');
    expect(q(root, 'summary').getAttribute('aria-label')).toBe('Right 12, left 11 reps');
  });

  it('opens on the right arm; the picker switches the steppers to the left arm', () => {
    const { root } = make({ sides: SIDES, limb: 'arm' });
    q(root, 'fix').click();
    const right = q(root, 'side-right');
    const left = q(root, 'side-left');
    expect(right.textContent).toBe('Right arm');
    expect(left.textContent).toBe('Left arm');
    expect(right.getAttribute('aria-pressed')).toBe('true');
    expect(left.getAttribute('aria-pressed')).toBe('false');
    expect(q(root, 'reps-value').textContent).toBe('12');
    expect(q(root, 'partials-value').textContent).toBe('0');
    left.click();
    expect(left.getAttribute('aria-pressed')).toBe('true');
    expect(q(root, 'reps-value').textContent).toBe('11');
    expect(q(root, 'partials-value').textContent).toBe('1');
  });

  it('Save reports each changed side, right first; an unchanged side is not sent', () => {
    const { root, onCorrect } = make({ sides: SIDES, limb: 'arm' });
    q(root, 'fix').click();
    q(root, 'side-left').click();
    q(root, 'reps-plus').click(); // left 12
    q(root, 'save').click();
    expect(onCorrect.mock.calls).toEqual([[12, 1, 'left']]);
    expect(q(root, 'summary').textContent).toBe('R 12 · L 12 · 1 partial');
    expect(q(root, 'status').textContent).toBe('Saved: R 12 · L 12 · 1 partial');
  });

  it('both sides edited: two reports, right then left; edits survive switching sides', () => {
    const { root, onCorrect } = make({ sides: SIDES, limb: 'arm' });
    q(root, 'fix').click();
    q(root, 'reps-minus').click(); // right 11
    q(root, 'side-left').click();
    q(root, 'partials-minus').click(); // left partials 0
    q(root, 'side-right').click();
    expect(q(root, 'reps-value').textContent).toBe('11');
    q(root, 'save').click();
    expect(onCorrect.mock.calls).toEqual([
      [11, 0, 'right'],
      [11, 0, 'left'],
    ]);
  });

  it("Cancel drops both sides' edits", () => {
    const { root, onCorrect } = make({ sides: SIDES, limb: 'arm' });
    q(root, 'fix').click();
    q(root, 'reps-plus').click();
    q(root, 'cancel').click();
    q(root, 'fix').click();
    expect(q(root, 'reps-value').textContent).toBe('12');
    expect(onCorrect).not.toHaveBeenCalled();
  });

  it('legs say "Right leg" / "Left leg"; a missing left side starts at 0', () => {
    const { root, onCorrect } = make({
      sides: { right: { reps: 10, partials: 0 } },
      limb: 'leg',
    });
    expect(q(root, 'summary').textContent).toBe('R 10');
    q(root, 'fix').click();
    expect(q(root, 'side-right').textContent).toBe('Right leg');
    q(root, 'side-left').click();
    expect(q(root, 'reps-value').textContent).toBe('0');
    q(root, 'save').click();
    expect(onCorrect).not.toHaveBeenCalled();
  });

  it('update() with new sides refreshes the line and closes the editor', () => {
    const { root, handle } = make({ sides: SIDES, limb: 'arm' });
    q(root, 'fix').click();
    handle.update(9, 0, { right: { reps: 9, partials: 0 }, left: { reps: 10, partials: 0 } });
    expect(q(root, 'summary').textContent).toBe('R 9 · L 10');
    expect(q(root, 'editor').hidden).toBe(true);
  });
});

describe('last set Fix: sides dropped from outside', () => {
  it('update() without sides turns the panel back into one total (picker hidden)', () => {
    const { root, handle, onCorrect } = make({ sides: SIDES, limb: 'arm' });
    handle.update(10, 0);
    expect(q(root, 'summary').textContent).toBe('10 reps');
    expect(q(root, 'sides').hidden).toBe(true);
    q(root, 'fix').click();
    q(root, 'reps-plus').click();
    q(root, 'save').click();
    expect(onCorrect.mock.calls).toEqual([[11, 0]]);
  });
});
