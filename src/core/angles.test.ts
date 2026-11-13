import { describe, expect, it } from 'vitest';
import {
  angleSource,
  frameAngle,
  jointAngle,
  meanVisibility,
  pickSide,
  tripletVisibility,
  type SidePair,
  type Triplet,
} from './angles';
import { LANDMARK, LANDMARK_COUNT } from './poseTopology';
import type { LandmarkFrame } from './types';

const L = LANDMARK;

describe('jointAngle', () => {
  it('is 90 for a right angle', () => {
    expect(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
  });

  it('is 180 for a straight limb', () => {
    expect(jointAngle({ x: -2, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 0 })).toBeCloseTo(180, 6);
  });

  it('is 0 when fully folded', () => {
    expect(jointAngle({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeCloseTo(0, 6);
  });

  it('is 45 / 135 for diagonals', () => {
    expect(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45, 6);
    expect(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 1 })).toBeCloseTo(135, 6);
  });

  it('uses z when given', () => {
    // (1,0,0) vs (0,0,1) → 90; ignoring z would give a degenerate vector.
    expect(
      jointAngle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    ).toBeCloseTo(90, 6);
  });

  it('is independent of segment length and translation', () => {
    expect(jointAngle({ x: 10 + 5, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 7 + 0.01 })).toBeCloseTo(
      90,
      6,
    );
  });

  it('returns NaN for a zero-length segment', () => {
    expect(jointAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNaN();
  });
});

type P = { x: number; y: number; z: number };

/** Builds a frame with every landmark at the origin, then applies overrides. */
function frame(
  opts: {
    t?: number;
    image?: Record<number, P>;
    world?: Record<number, P>;
    visibility?: Record<number, number>;
    defaultVisibility?: number;
  } = {},
): LandmarkFrame {
  const landmarks = Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
    ...(opts.image?.[i] ?? { x: 0, y: 0, z: 0 }),
    visibility: opts.visibility?.[i] ?? opts.defaultVisibility ?? 0.9,
  }));
  const f: LandmarkFrame = { t: opts.t ?? 0, landmarks };
  if (opts.world) {
    f.world = Array.from(
      { length: LANDMARK_COUNT },
      (_, i) => opts.world?.[i] ?? { x: 0, y: 0, z: 0 },
    );
  }
  return f;
}

const rightElbow: Triplet = [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST];
const leftElbow: Triplet = [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST];
const elbows: SidePair<Triplet> = { left: leftElbow, right: rightElbow };

describe('angle source', () => {
  // Image: right elbow straight (180). World: right elbow at 90.
  const image = {
    [L.RIGHT_SHOULDER]: { x: 0.5, y: 0.2, z: 0.3 },
    [L.RIGHT_ELBOW]: { x: 0.5, y: 0.4, z: -0.4 },
    [L.RIGHT_WRIST]: { x: 0.5, y: 0.6, z: 0.9 },
  };
  const world = {
    [L.RIGHT_SHOULDER]: { x: 0, y: -0.3, z: 0 },
    [L.RIGHT_ELBOW]: { x: 0, y: 0, z: 0 },
    [L.RIGHT_WRIST]: { x: 0, y: 0, z: 0.25 },
  };

  it('uses 3D world landmarks when present', () => {
    const f = frame({ image, world });
    expect(angleSource(f)).toBe('world');
    expect(frameAngle(f, rightElbow)).toBeCloseTo(90, 6);
  });

  it('falls back to 2D normalized x/y (ignoring z) when world is missing', () => {
    const f = frame({ image });
    expect(angleSource(f)).toBe('image');
    // z values would bend the limb if used; 2D x/y is a straight line.
    expect(frameAngle(f, rightElbow)).toBeCloseTo(180, 6);
  });

  it('falls back to 2D when world is an empty array', () => {
    const f = { ...frame({ image }), world: [] };
    expect(angleSource(f)).toBe('image');
    expect(frameAngle(f, rightElbow)).toBeCloseTo(180, 6);
  });

  it('returns null when the frame has no landmarks or a point is missing', () => {
    expect(frameAngle({ t: 0, landmarks: [] }, rightElbow)).toBeNull();
  });

  it('returns null for a degenerate (zero-length) segment', () => {
    expect(frameAngle(frame(), rightElbow)).toBeNull();
  });
});

describe('visibility', () => {
  it('tripletVisibility is the lowest of the three points', () => {
    const f = frame({
      visibility: { [L.RIGHT_SHOULDER]: 0.9, [L.RIGHT_ELBOW]: 0.4, [L.RIGHT_WRIST]: 0.8 },
    });
    expect(tripletVisibility(f, rightElbow)).toBeCloseTo(0.4, 6);
  });

  it('tripletVisibility is 0 for a frame with no landmarks', () => {
    expect(tripletVisibility({ t: 0, landmarks: [] }, rightElbow)).toBe(0);
  });

  it('meanVisibility averages the triplet over frames', () => {
    const a = frame({ defaultVisibility: 0.2 });
    const b = frame({ defaultVisibility: 0.6 });
    expect(meanVisibility([a, b], rightElbow)).toBeCloseTo(0.4, 6);
    expect(meanVisibility([], rightElbow)).toBe(0);
  });
});

describe('pickSide', () => {
  it('picks the right side when the far (left) side has visibility 0.13', () => {
    const frames = [0, 33, 66].map((t) =>
      frame({
        t,
        visibility: {
          [L.LEFT_SHOULDER]: 0.13,
          [L.LEFT_ELBOW]: 0.13,
          [L.LEFT_WRIST]: 0.13,
          [L.RIGHT_SHOULDER]: 0.95,
          [L.RIGHT_ELBOW]: 0.92,
          [L.RIGHT_WRIST]: 0.9,
        },
      }),
    );
    expect(pickSide(frames, elbows)).toBe('right');
  });

  it('picks the left side when the right side has visibility 0.13', () => {
    const frames = [0, 33].map((t) =>
      frame({
        t,
        visibility: {
          [L.RIGHT_SHOULDER]: 0.13,
          [L.RIGHT_ELBOW]: 0.13,
          [L.RIGHT_WRIST]: 0.13,
        },
      }),
    );
    expect(pickSide(frames, elbows)).toBe('left');
  });

  it('decides on the mean over the window, not one frame', () => {
    const leftBetterOnce = frame({
      visibility: { [L.RIGHT_ELBOW]: 0.3 },
    });
    const rightBetter = frame({
      visibility: { [L.LEFT_ELBOW]: 0.2 },
    });
    expect(pickSide([leftBetterOnce, rightBetter, rightBetter], elbows)).toBe('right');
  });

  it('defaults to right with no frames or a tie', () => {
    expect(pickSide([], elbows)).toBe('right');
    expect(pickSide([frame()], elbows)).toBe('right');
  });
});
