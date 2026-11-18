import { describe, expect, it } from 'vitest';
import { createAspectEstimator } from './aspect';
import { LANDMARK, LANDMARK_COUNT } from './poseTopology';
import type { LandmarkFrame } from './types';

const L = LANDMARK;

type P3 = { x: number; y: number; z: number };

/** A body in metres (world, hip-centred), projected into a W×H video: x/W, y/H (+ centre). */
function project(
  world: Record<number, P3>,
  width: number,
  height: number,
  opts: { visibility?: number; mirrorX?: boolean; noWorld?: boolean; t?: number } = {},
): LandmarkFrame {
  const f = 600; // focal length in pixels; the estimate must not depend on it
  const w = Array.from({ length: LANDMARK_COUNT }, (_, i) => world[i] ?? { x: 0, y: 0, z: 0 });
  const landmarks = w.map((p) => ({
    x: 0.5 + ((opts.mirrorX ? -1 : 1) * p.x * f) / width,
    y: 0.5 + (p.y * f) / height,
    z: 0,
    visibility: opts.visibility ?? 0.95,
  }));
  const frame: LandmarkFrame = { t: opts.t ?? 0, landmarks };
  if (!opts.noWorld) frame.world = w;
  return frame;
}

/** Standing person, arms half raised (metres). */
const BODY: Record<number, P3> = {
  [L.LEFT_SHOULDER]: { x: 0.2, y: -0.5, z: 0 },
  [L.RIGHT_SHOULDER]: { x: -0.2, y: -0.5, z: 0 },
  [L.LEFT_ELBOW]: { x: 0.4, y: -0.35, z: 0.05 },
  [L.RIGHT_ELBOW]: { x: -0.4, y: -0.35, z: 0.05 },
  [L.LEFT_WRIST]: { x: 0.55, y: -0.15, z: 0.1 },
  [L.RIGHT_WRIST]: { x: -0.55, y: -0.15, z: 0.1 },
  [L.LEFT_HIP]: { x: 0.1, y: 0, z: 0 },
  [L.RIGHT_HIP]: { x: -0.1, y: 0, z: 0 },
};

describe('createAspectEstimator', () => {
  it('is null before any usable frame', () => {
    expect(createAspectEstimator().value).toBeNull();
  });

  it.each([
    [480, 640],
    [720, 960],
    [1280, 720],
    [720, 1280],
  ])('recovers width/height of a %d×%d video from one frame', (w, h) => {
    const est = createAspectEstimator();
    est.push(project(BODY, w, h));
    expect(est.value).toBeCloseTo(w / h, 6);
  });

  it('accumulates over frames and ignores frames without world landmarks', () => {
    const est = createAspectEstimator();
    est.push(project(BODY, 480, 640, { noWorld: true }));
    expect(est.value).toBeNull();
    est.push(project(BODY, 480, 640));
    est.push(project(BODY, 480, 640, { noWorld: true }));
    expect(est.value).toBeCloseTo(0.75, 6);
  });

  it('ignores low-visibility landmarks', () => {
    const est = createAspectEstimator();
    est.push(project(BODY, 480, 640, { visibility: 0.3 }));
    expect(est.value).toBeNull();
  });

  it('works when image x runs opposite to world x (mirrored)', () => {
    const est = createAspectEstimator();
    est.push(project(BODY, 480, 640, { mirrorX: true }));
    expect(est.value).toBeCloseTo(0.75, 6);
  });

  it('reset() forgets the estimate (a new camera may have another aspect)', () => {
    const est = createAspectEstimator();
    est.push(project(BODY, 480, 640));
    est.reset();
    expect(est.value).toBeNull();
    est.push(project(BODY, 1280, 720));
    expect(est.value).toBeCloseTo(16 / 9, 6);
  });

  it('stays null for a degenerate frame (all landmarks in one point)', () => {
    const est = createAspectEstimator();
    est.push(project({}, 480, 640));
    expect(est.value).toBeNull();
  });
});
