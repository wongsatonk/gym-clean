// Video aspect (width / height) estimated from the pose itself. Pure: frames in, number out.
//
// Normalized landmarks divide pixel x by the width and pixel y by the height, so 2D angles need
// the aspect. Frames don't carry it, but each MediaPipe frame has the same body twice: metric
// `world` (square) and normalized `landmarks`. A least-squares fit of the image offsets against
// the world offsets between pairs of upper-body points gives one scale per axis:
//   imageDx ≈ f / width · worldDx,   imageDy ≈ f / height · worldDy,
// so width / height = slopeY / slopeX. Sums accumulate over frames until reset().
import { LANDMARK } from './poseTopology';
import type { LandmarkFrame } from './types';

const L = LANDMARK;

/** Points used for the fit: shoulders, elbows, wrists, hips (the ones the front-view rules use). */
const POINTS = [
  L.LEFT_SHOULDER,
  L.RIGHT_SHOULDER,
  L.LEFT_ELBOW,
  L.RIGHT_ELBOW,
  L.LEFT_WRIST,
  L.RIGHT_WRIST,
  L.LEFT_HIP,
  L.RIGHT_HIP,
] as const;

/** Both points of a pair must be at least this visible to enter the fit. */
const MIN_VISIBILITY = 0.7;
/** Minimum summed squared world offset (m²) per axis before the estimate is trusted. */
const MIN_SPREAD = 1e-6;

export type AspectEstimator = {
  /** Add one frame's evidence (frames without world landmarks are ignored). */
  push(frame: LandmarkFrame): void;
  /** Estimated width / height, or null until there is enough evidence. */
  readonly value: number | null;
  reset(): void;
};

export function createAspectEstimator(): AspectEstimator {
  let sxx = 0;
  let sxi = 0;
  let syy = 0;
  let syi = 0;

  function push(frame: LandmarkFrame): void {
    const w = frame.world;
    if (!w || w.length === 0) return;
    for (let i = 0; i < POINTS.length; i++) {
      for (let j = i + 1; j < POINTS.length; j++) {
        const a = frame.landmarks[POINTS[i] ?? -1];
        const b = frame.landmarks[POINTS[j] ?? -1];
        const wa = w[POINTS[i] ?? -1];
        const wb = w[POINTS[j] ?? -1];
        if (!a || !b || !wa || !wb) continue;
        if (!(a.visibility >= MIN_VISIBILITY) || !(b.visibility >= MIN_VISIBILITY)) continue;
        const wx = wa.x - wb.x;
        const wy = wa.y - wb.y;
        const ix = a.x - b.x;
        const iy = a.y - b.y;
        if (![wx, wy, ix, iy].every(Number.isFinite)) continue;
        sxx += wx * wx;
        sxi += wx * ix;
        syy += wy * wy;
        syi += wy * iy;
      }
    }
  }

  return {
    push,
    get value() {
      if (sxx < MIN_SPREAD || syy < MIN_SPREAD) return null;
      // abs: image x may run opposite to world x (mirrored); only the scale matters.
      const slopeX = Math.abs(sxi / sxx);
      const slopeY = Math.abs(syi / syy);
      if (!(slopeX > 0) || !(slopeY > 0)) return null;
      return slopeY / slopeX;
    },
    reset() {
      sxx = 0;
      sxi = 0;
      syy = 0;
      syi = 0;
    },
  };
}
