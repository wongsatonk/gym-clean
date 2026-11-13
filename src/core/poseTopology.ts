// MediaPipe Pose Landmarker's 33-point body model (BlazePose topology). Pure data.

export const LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const LANDMARK_COUNT = 33;

const L = LANDMARK;

/** Bones drawn for the skeleton (face reduced to nose–ears). */
export const SKELETON: readonly (readonly [number, number])[] = [
  [L.NOSE, L.LEFT_EAR],
  [L.NOSE, L.RIGHT_EAR],
  [L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
  [L.LEFT_SHOULDER, L.LEFT_ELBOW],
  [L.LEFT_ELBOW, L.LEFT_WRIST],
  [L.LEFT_WRIST, L.LEFT_INDEX],
  [L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
  [L.RIGHT_ELBOW, L.RIGHT_WRIST],
  [L.RIGHT_WRIST, L.RIGHT_INDEX],
  [L.LEFT_SHOULDER, L.LEFT_HIP],
  [L.RIGHT_SHOULDER, L.RIGHT_HIP],
  [L.LEFT_HIP, L.RIGHT_HIP],
  [L.LEFT_HIP, L.LEFT_KNEE],
  [L.LEFT_KNEE, L.LEFT_ANKLE],
  [L.LEFT_ANKLE, L.LEFT_HEEL],
  [L.LEFT_HEEL, L.LEFT_FOOT_INDEX],
  [L.LEFT_ANKLE, L.LEFT_FOOT_INDEX],
  [L.RIGHT_HIP, L.RIGHT_KNEE],
  [L.RIGHT_KNEE, L.RIGHT_ANKLE],
  [L.RIGHT_ANKLE, L.RIGHT_HEEL],
  [L.RIGHT_HEEL, L.RIGHT_FOOT_INDEX],
  [L.RIGHT_ANKLE, L.RIGHT_FOOT_INDEX],
];

/** Joints drawn as dots (skips face detail). */
export const JOINTS: readonly number[] = [
  L.NOSE,
  ...Array.from({ length: LANDMARK_COUNT - 11 }, (_, i) => i + 11),
];

/** Index of the same landmark on the other side of the body. */
export function mirrorIndex(i: number): number {
  if (i === 0) return 0;
  if (i >= 1 && i <= 3) return i + 3;
  if (i >= 4 && i <= 6) return i - 3;
  return i % 2 === 1 ? i + 1 : i - 1; // 7..32: odd = left, even = right
}
