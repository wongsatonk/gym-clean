import { describe, expect, it } from 'vitest';
import { LANDMARK, LANDMARK_COUNT, SKELETON, mirrorIndex } from './poseTopology';
import { FpsMeter } from './fps';

describe('pose topology', () => {
  it('names 33 landmarks with unique indices 0..32', () => {
    const idx = Object.values(LANDMARK);
    expect(LANDMARK_COUNT).toBe(33);
    expect(new Set(idx).size).toBe(idx.length);
    expect(Math.min(...idx)).toBe(0);
    expect(Math.max(...idx)).toBe(32);
    expect(LANDMARK.LEFT_SHOULDER).toBe(11);
    expect(LANDMARK.RIGHT_ANKLE).toBe(28);
  });

  it('connects the limbs and torso with valid, unique bones', () => {
    const key = ([a, b]: readonly [number, number]) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    for (const [a, b] of SKELETON) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(33);
      expect(a).not.toBe(b);
    }
    expect(new Set(SKELETON.map(key)).size).toBe(SKELETON.length);
    const has = (a: number, b: number) => SKELETON.some((bone) => key(bone) === key([a, b]));
    expect(has(LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW)).toBe(true);
    expect(has(LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST)).toBe(true);
    expect(has(LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE)).toBe(true);
    expect(has(LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)).toBe(true);
    expect(has(LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER)).toBe(true);
    expect(has(LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP)).toBe(true);
  });

  it('mirrors left/right landmarks and keeps the nose', () => {
    expect(mirrorIndex(LANDMARK.NOSE)).toBe(LANDMARK.NOSE);
    expect(mirrorIndex(LANDMARK.LEFT_ELBOW)).toBe(LANDMARK.RIGHT_ELBOW);
    expect(mirrorIndex(LANDMARK.RIGHT_FOOT_INDEX)).toBe(LANDMARK.LEFT_FOOT_INDEX);
    for (let i = 0; i < 33; i++) expect(mirrorIndex(mirrorIndex(i))).toBe(i);
  });
});

describe('FpsMeter', () => {
  it('reports frames per second over a rolling 1 s window', () => {
    const m = new FpsMeter();
    expect(m.fps).toBe(0);
    for (let t = 0; t <= 1000; t += 40) m.tick(t); // 25 fps
    expect(m.fps).toBeCloseTo(25, 0);
    for (let t = 1010; t <= 3000; t += 100) m.tick(t); // drops to 10 fps
    expect(m.fps).toBeCloseTo(10, 0);
  });
});
