// Shared joint triplets (landmark indices, angle measured at the middle one).
import type { SidePair, Triplet } from '../angles';
import { LANDMARK as L } from '../poseTopology';

export const ELBOW: SidePair<Triplet> = {
  left: [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST],
  right: [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST],
};

export const KNEE: SidePair<Triplet> = {
  left: [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE],
  right: [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
};

/** Shoulder abduction: hip–shoulder–elbow. */
export const SHOULDER: SidePair<Triplet> = {
  left: [L.LEFT_HIP, L.LEFT_SHOULDER, L.LEFT_ELBOW],
  right: [L.RIGHT_HIP, L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
};
