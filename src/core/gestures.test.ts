import { describe, expect, it } from 'vitest';
import {
  SWIPE_RULES,
  VELOCITY_WINDOW_MS,
  edgeBack,
  pageSwipe,
  rowReveal,
  sheetDown,
  type TouchPoint,
} from './gestures';

const VIEW = { width: 390, height: 844 };

/** Points from `a` to `b` in `ms`, sampled every ~16 ms (a 60 Hz touch stream). */
function drag(a: [number, number], b: [number, number], ms: number, t0 = 0): TouchPoint[] {
  const steps = Math.max(1, Math.round(ms / 16));
  const out: TouchPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    out.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, t: t0 + ms * f });
  }
  return out;
}

/** Joins strokes; each later stroke starts where the previous ended (its first point dropped). */
function chain(...strokes: TouchPoint[][]): TouchPoint[] {
  return strokes.flatMap((s, i) => (i === 0 ? s : s.slice(1)));
}

const ended = { ended: true } as const;

describe('thresholds are data', () => {
  it('match the M13d plan', () => {
    expect(SWIPE_RULES.edgeBack).toMatchObject({ axis: 'x', dir: 1, edgePx: 24, lockPx: 10, axisRatio: 1.5, flickPxPerMs: 0.5 });
    expect(SWIPE_RULES.edgeBack.commitFraction).toBeCloseTo(1 / 3, 10);
    expect(SWIPE_RULES.pageSwipe).toMatchObject({ axis: 'x', dir: 0, commitFraction: 0.25, flickPxPerMs: 0.5 });
    expect(SWIPE_RULES.sheetDown).toMatchObject({ axis: 'y', dir: 1, commitFraction: 0.3, flickPxPerMs: 0.5 });
    expect(SWIPE_RULES.rowReveal).toMatchObject({ axis: 'x', dir: -1, commitPx: 72 });
    expect(VELOCITY_WINDOW_MS).toBe(100);
  });
});

describe('edgeBack', () => {
  it('is pending until the finger has moved 10 px', () => {
    expect(edgeBack([], VIEW).phase).toBe('pending');
    expect(edgeBack(drag([8, 400], [14, 402], 50), VIEW).phase).toBe('pending');
  });

  it('a tap (released before 10 px) is not a back', () => {
    expect(edgeBack([{ x: 8, y: 400, t: 0 }], VIEW, ended).phase).toBe('rejected');
    expect(edgeBack(drag([8, 400], [12, 401], 80), VIEW, ended).phase).toBe('rejected');
  });

  it('tracks a rightward drag from the edge and follows the finger', () => {
    const r = edgeBack(drag([6, 400], [106, 410], 300), VIEW);
    expect(r.phase).toBe('tracking');
    expect(r.direction).toBe('right');
    expect(r.offset).toBeCloseTo(100, 10);
    expect(r.progress).toBeCloseTo(100 / 130, 10);
  });

  it('never follows left of where it started', () => {
    const r = edgeBack(chain(drag([6, 400], [60, 400], 100), drag([60, 400], [2, 400], 200, 100)), VIEW);
    expect(r.phase).toBe('tracking');
    expect(r.offset).toBe(0);
    expect(r.progress).toBe(0);
  });

  it('commits a slow long drag past a third of the width', () => {
    const r = edgeBack(drag([5, 400], [300, 420], 3000), VIEW, ended);
    expect(r.phase).toBe('committed');
    expect(r.direction).toBe('right');
  });

  it('commits exactly at a third of the width', () => {
    expect(edgeBack(drag([0, 400], [130, 400], 2000), VIEW, ended).phase).toBe('committed');
    expect(edgeBack(drag([0, 400], [129, 400], 2000), VIEW, ended).phase).toBe('cancelled');
  });

  it('cancels a slow drag released short of a third', () => {
    expect(edgeBack(drag([5, 400], [100, 405], 1000), VIEW, ended).phase).toBe('cancelled');
  });

  it('commits a short quick flick (≥ 0.5 px/ms)', () => {
    const r = edgeBack(drag([5, 400], [65, 404], 60), VIEW, ended);
    expect(r.phase).toBe('committed');
  });

  it('cancels a quick move that stopped before release (velocity is from the last 100 ms)', () => {
    const pts = chain(drag([5, 400], [100, 400], 96), drag([100, 400], [100, 400], 304, 96));
    expect(edgeBack(pts, VIEW, ended).phase).toBe('cancelled');
  });

  it('cancels a long drag flicked back towards the edge', () => {
    const pts = chain(drag([5, 400], [220, 400], 600), drag([220, 400], [150, 400], 48, 600));
    expect(edgeBack(pts, VIEW, ended).phase).toBe('cancelled');
  });

  it('does nothing for a vertical scroll that starts near the edge', () => {
    const pts = drag([10, 300], [16, 600], 400);
    expect(edgeBack(pts, VIEW).phase).toBe('rejected');
    expect(edgeBack(pts, VIEW, ended).phase).toBe('rejected');
  });

  it('stays rejected when a vertical start later turns sideways', () => {
    const pts = chain(drag([10, 300], [12, 330], 100), drag([12, 330], [300, 335], 300, 100));
    expect(edgeBack(pts, VIEW, ended).phase).toBe('rejected');
  });

  it('rejects a 45° diagonal (needs |dx| > 1.5·|dy|)', () => {
    expect(edgeBack(drag([10, 400], [40, 430], 100), VIEW).phase).toBe('rejected');
  });

  it('keeps a locked horizontal swipe even if it drifts down later', () => {
    const pts = chain(drag([5, 400], [40, 402], 100), drag([40, 402], [200, 520], 400, 100));
    expect(edgeBack(pts, VIEW, ended).phase).toBe('committed');
  });

  it('ignores swipes that start away from the edge or go left', () => {
    expect(edgeBack(drag([25, 400], [300, 400], 300), VIEW, ended).phase).toBe('rejected');
    expect(edgeBack(drag([24, 400], [300, 400], 300), VIEW, ended).phase).toBe('committed');
    expect(edgeBack(drag([20, 400], [-20, 400], 100), VIEW, ended).phase).toBe('rejected');
  });

  it('scales the commit distance with the viewport width', () => {
    const wide = { width: 1024, height: 768 };
    expect(edgeBack(drag([5, 400], [300, 400], 3000), wide, ended).phase).toBe('cancelled');
    expect(edgeBack(drag([5, 400], [350, 400], 3000), wide, ended).phase).toBe('committed');
  });

  it('a zero-duration stream has no velocity and does not throw', () => {
    const pts: TouchPoint[] = [
      { x: 5, y: 400, t: 0 },
      { x: 60, y: 400, t: 0 },
    ];
    expect(edgeBack(pts, VIEW, ended).phase).toBe('cancelled');
  });
});

describe('pageSwipe', () => {
  it('swipe left past 25% → left (Next)', () => {
    const r = pageSwipe(drag([300, 400], [190, 410], 800), VIEW, ended);
    expect(r).toMatchObject({ phase: 'committed', direction: 'left' });
  });

  it('swipe right past 25% → right (Back)', () => {
    const r = pageSwipe(drag([100, 400], [200, 400], 800), VIEW, ended);
    expect(r).toMatchObject({ phase: 'committed', direction: 'right' });
  });

  it('a short slow move springs back', () => {
    expect(pageSwipe(drag([300, 400], [240, 400], 800), VIEW, ended).phase).toBe('cancelled');
  });

  it('a short flick turns the page', () => {
    expect(pageSwipe(drag([300, 400], [250, 402], 50), VIEW, ended)).toMatchObject({
      phase: 'committed',
      direction: 'left',
    });
  });

  it('tracks with a signed offset', () => {
    const r = pageSwipe(drag([300, 400], [250, 400], 300), VIEW);
    expect(r.phase).toBe('tracking');
    expect(r.offset).toBeCloseTo(-50, 10);
    expect(r.progress).toBeCloseTo(50 / 97.5, 10);
    expect(r.direction).toBe('left');
  });

  it('vertical scroll is not a page swipe', () => {
    expect(pageSwipe(drag([200, 300], [205, 600], 400), VIEW, ended).phase).toBe('rejected');
  });

  it('turns towards where the finger ended', () => {
    const pts = chain(drag([200, 400], [170, 400], 100), drag([170, 400], [320, 400], 900, 100));
    expect(pageSwipe(pts, VIEW, ended)).toMatchObject({ phase: 'committed', direction: 'right' });
  });
});

describe('sheetDown', () => {
  it('closes after 30% of the height when scrolled to the top', () => {
    const r = sheetDown(drag([200, 300], [205, 560], 900), VIEW, { ended: true, scrollTop: 0 });
    expect(r).toMatchObject({ phase: 'committed', direction: 'down' });
  });

  it('springs back when released short', () => {
    expect(sheetDown(drag([200, 300], [200, 450], 900), VIEW, { ended: true, scrollTop: 0 }).phase).toBe('cancelled');
  });

  it('a quick flick down closes', () => {
    expect(sheetDown(drag([200, 300], [202, 360], 60), VIEW, { ended: true, scrollTop: 0 }).phase).toBe('committed');
  });

  it('a scrolled sheet scrolls first', () => {
    expect(sheetDown(drag([200, 300], [205, 700], 900), VIEW, { ended: true, scrollTop: 40 }).phase).toBe('rejected');
  });

  it('missing scrollTop counts as at the top', () => {
    expect(sheetDown(drag([200, 300], [205, 700], 900), VIEW, ended).phase).toBe('committed');
  });

  it('dragging up (scrolling the content) is not a close', () => {
    expect(sheetDown(drag([200, 600], [200, 200], 400), VIEW, { ended: true, scrollTop: 0 }).phase).toBe('rejected');
  });

  it('a sideways drag is not a close', () => {
    expect(sheetDown(drag([100, 300], [300, 330], 400), VIEW, { ended: true, scrollTop: 0 }).phase).toBe('rejected');
  });

  it('follows the finger downwards only', () => {
    const r = sheetDown(drag([200, 300], [200, 400], 300), VIEW, { scrollTop: 0 });
    expect(r.phase).toBe('tracking');
    expect(r.offset).toBeCloseTo(100, 10);
  });
});

describe('rowReveal (meal swipe-delete)', () => {
  it('shows the action after 72 px to the left', () => {
    expect(rowReveal(drag([300, 500], [228, 505], 600), VIEW, ended)).toMatchObject({
      phase: 'committed',
      direction: 'left',
    });
  });

  it('stays closed when released short and slow', () => {
    expect(rowReveal(drag([300, 500], [250, 500], 600), VIEW, ended).phase).toBe('cancelled');
  });

  it('a quick flick left opens it', () => {
    expect(rowReveal(drag([300, 500], [260, 500], 48), VIEW, ended).phase).toBe('committed');
  });

  it('swiping right or scrolling the list does nothing', () => {
    expect(rowReveal(drag([100, 500], [250, 500], 400), VIEW, ended).phase).toBe('rejected');
    expect(rowReveal(drag([300, 500], [296, 200], 400), VIEW, ended).phase).toBe('rejected');
  });

  it('tracks a negative offset with progress against 72 px, capped at 1', () => {
    const half = rowReveal(drag([300, 500], [264, 500], 300), VIEW);
    expect(half.offset).toBeCloseTo(-36, 10);
    expect(half.progress).toBeCloseTo(0.5, 10);
    expect(rowReveal(drag([300, 500], [100, 500], 300), VIEW).progress).toBe(1);
  });
});
