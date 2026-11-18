import { describe, expect, it } from 'vitest';
import type { LandmarkFrame } from './types';
import {
  BYTES_PER_FULL_FRAME,
  FrameEncoder,
  decodeFrames,
  encodeFrames,
  type DevLogFrame,
} from './devlogCodec';

/** Made-up but realistic frame: 33 normalized points + 33 world points. */
function frame(t: number, seed = 1, world = true): LandmarkFrame {
  const r = (i: number, k: number) => Math.sin(seed * 13.37 + i * 1.7 + k * 0.91);
  const landmarks = Array.from({ length: 33 }, (_, i) => ({
    x: 0.5 + 0.45 * r(i, 1),
    y: 0.5 + 0.45 * r(i, 2),
    z: 0.6 * r(i, 3),
    visibility: 0.5 + 0.5 * r(i, 4),
  }));
  const f: LandmarkFrame = { t, landmarks };
  if (world) {
    f.world = Array.from({ length: 33 }, (_, i) => ({
      x: 0.8 * r(i, 5),
      y: 0.9 * r(i, 6),
      z: 0.4 * r(i, 7),
    }));
  }
  return f;
}

function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing value');
  return v;
}

/** Coordinates within 1e-4; time stamps are kept to 0.01 ms. */
function expectClose(a: DevLogFrame, b: DevLogFrame, tol = 1e-4) {
  expect(Math.abs(a.t - b.t)).toBeLessThanOrEqual(0.005 + 1e-9);
  if (b.landmarks === null) {
    expect(a.landmarks).toBeNull();
    return;
  }
  expect(a.landmarks).not.toBeNull();
  expect(a.landmarks).toHaveLength(b.landmarks.length);
  b.landmarks.forEach((p, i) => {
    const q = must(must(a.landmarks)[i]);
    expect(Math.abs(q.x - p.x)).toBeLessThanOrEqual(tol);
    expect(Math.abs(q.y - p.y)).toBeLessThanOrEqual(tol);
    expect(Math.abs(q.z - p.z)).toBeLessThanOrEqual(tol);
    expect(Math.abs(q.visibility - p.visibility)).toBeLessThanOrEqual(tol);
  });
  const bw = 'world' in b ? b.world : undefined;
  const aw = 'world' in a ? a.world : undefined;
  if (!bw) {
    expect(aw).toBeUndefined();
    return;
  }
  expect(aw).toHaveLength(bw.length);
  bw.forEach((p, i) => {
    const q = must(must(aw)[i]);
    expect(Math.abs(q.x - p.x)).toBeLessThanOrEqual(tol);
    expect(Math.abs(q.y - p.y)).toBeLessThanOrEqual(tol);
    expect(Math.abs(q.z - p.z)).toBeLessThanOrEqual(tol);
  });
}

describe('devlog frame codec', () => {
  it('round-trips landmark frames within 1e-4 (normalized, visibility and world)', () => {
    const frames = [frame(1000.123, 1), frame(1033.456, 2), frame(1066.789, 3)];
    const out = decodeFrames(encodeFrames(frames));
    expect(out).toHaveLength(3);
    out.forEach((f, i) => expectClose(f, must(frames[i])));
  });

  it('keeps frames with no person as time stamps', () => {
    const frames: DevLogFrame[] = [
      frame(0, 1),
      { t: 33.3, landmarks: null },
      { t: 66.7, landmarks: null },
      frame(100, 2),
    ];
    const out = decodeFrames(encodeFrames(frames));
    expect(out.map((f) => f.t)).toEqual([0, 33.3, 66.7, 100]);
    expect(out[1]).toEqual({ t: 33.3, landmarks: null });
    expectClose(must(out[3]), must(frames[3]));
  });

  it('decodes a frame with no landmark points (landmarks: []) as a no-person time stamp', () => {
    const empty: LandmarkFrame = { t: 7, landmarks: [], world: [{ x: 0.1, y: 0.2, z: 0.3 }] };
    expect(decodeFrames(encodeFrames([empty]))).toEqual([{ t: 7, landmarks: null }]);
  });

  it('keeps frames without world landmarks world-less', () => {
    const frames = [frame(5, 1, false), frame(10, 2, true)];
    const out = decodeFrames(encodeFrames(frames));
    expect('world' in must(out[0])).toBe(false);
    expectClose(must(out[0]), must(frames[0]));
    expectClose(must(out[1]), must(frames[1]));
  });

  it('decodes to 4 decimals (no float noise in the exported JSON)', () => {
    const out = decodeFrames(encodeFrames([frame(12.34567, 4)]));
    const f = must(out[0]);
    for (const p of must(f.landmarks)) {
      for (const v of [p.x, p.y, p.z, p.visibility]) {
        expect(Number(v.toFixed(4))).toBe(v);
      }
    }
    expect(f.t).toBe(12.35);
  });

  it('stores a full 33-point frame in at most 0.47 kB', () => {
    const frames = Array.from({ length: 300 }, (_, i) => frame(i * 33.33, i));
    const bytes = encodeFrames(frames).byteLength;
    expect(bytes / 300).toBeLessThanOrEqual(470);
    expect(BYTES_PER_FULL_FRAME).toBeLessThanOrEqual(470);
    // ≈ 14 kB/s at 30 fps
    expect((BYTES_PER_FULL_FRAME * 30) / 1000).toBeLessThan(14.2);
  });

  it('clamps values outside the int16 range instead of wrapping', () => {
    const f = frame(0, 1);
    must(f.landmarks[0]).x = 5;
    must(f.landmarks[1]).y = -5;
    must(f.landmarks[2]).z = Number.NaN;
    const out = must(decodeFrames(encodeFrames([f]))[0]);
    expect(must(must(out.landmarks)[0]).x).toBeCloseTo(3.2767, 4);
    expect(must(must(out.landmarks)[1]).y).toBeCloseTo(-3.2767, 4);
    expect(must(must(out.landmarks)[2]).z).toBe(0);
  });

  it('decodes concatenated chunks as one stream (incremental flushes)', () => {
    const enc = new FrameEncoder();
    enc.push(frame(0, 1));
    enc.push({ t: 33, landmarks: null });
    expect(enc.size).toBe(2);
    const a = enc.take();
    expect(enc.size).toBe(0);
    expect(enc.take()).toBeNull();
    enc.push(frame(66, 2));
    const b = must(enc.take());
    const joined = new Uint8Array(must(a).byteLength + b.byteLength);
    joined.set(must(a), 0);
    joined.set(b, must(a).byteLength);
    const out = decodeFrames(joined);
    expect(out.map((f) => f.t)).toEqual([0, 33, 66]);
    expect(must(out[1]).landmarks).toBeNull();
  });

  it('handles large stream clocks and times going backwards', () => {
    const frames = [frame(9_000_000.5, 1), frame(8_999_990.25, 2), frame(9_003_600_000, 3)];
    const out = decodeFrames(encodeFrames(frames));
    expect(out.map((f) => f.t)).toEqual([9_000_000.5, 8_999_990.25, 9_003_600_000]);
  });

  it('rejects data that is not a frame stream', () => {
    expect(() => decodeFrames(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/devlog/i);
    expect(decodeFrames(new Uint8Array(0))).toEqual([]);
  });
});
