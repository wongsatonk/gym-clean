// Developer-log frame codec (M4c, SPEC §4): LandmarkFrame stream <-> compact int16 bytes.
// Pure: no DOM, no storage. Numbers only, never images.
//
// Byte layout (little endian). A stream is one or more self-contained chunks back to back,
// so chunks written by separate flushes can simply be concatenated.
//   chunk header (18 B): magic "GCLF" | u8 version (1) | u8 reserved | f64 t0 (0.01 ms units)
//                        | u32 frame count
//   frame (6 B + points): u8 nLandmarks | u8 nWorld | i32 dt (0.01 ms units, from t0)
//                        | nLandmarks × (x, y, z, visibility) i16 | nWorld × (x, y, z) i16
// Coordinates are stored in 1e-4 units (±3.2767, clamped; non-finite → 0). A frame with no
// person has nLandmarks = nWorld = 0 and decodes to `{ t, landmarks: null }`. So does a frame
// with an empty `landmarks: []` (its `world`, if any, is dropped): 0 points means no person.

import type { LandmarkFrame } from './types';

/**
 * A frame in the developer log: a pose, or just a time stamp when no person was found.
 * Note: a LandmarkFrame with `landmarks: []` round-trips as `{ t, landmarks: null }`.
 */
export type DevLogFrame = LandmarkFrame | { t: number; landmarks: null };

const MAGIC = [0x47, 0x43, 0x4c, 0x46]; // "GCLF"
const VERSION = 1;
const HEADER_BYTES = 18;
const FRAME_HEADER_BYTES = 6;
const SCALE = 1e4; // coordinates: 1e-4 units
const T_SCALE = 100; // time: 0.01 ms units
const I16_MAX = 32767;
const I32_MAX = 2147483647;

/** Bytes for one frame with 33 landmarks and 33 world points (excluding the chunk header). */
export const BYTES_PER_FULL_FRAME = FRAME_HEADER_BYTES + 33 * 4 * 2 + 33 * 3 * 2;

function q(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const n = Math.round(v * SCALE);
  return n > I16_MAX ? I16_MAX : n < -I16_MAX ? -I16_MAX : n;
}

type Chunk = { t0c: number; frames: Uint8Array[] };

/** Incremental encoder: push frames as they arrive, `take()` the bytes at each flush. */
export class FrameEncoder {
  private chunks: Chunk[] = [];
  private count = 0;

  /** Frames pushed since the last `take()`. */
  get size(): number {
    return this.count;
  }

  push(frame: DevLogFrame): void {
    const tc = Math.round(frame.t * T_SCALE);
    let chunk = this.chunks.at(-1);
    if (!chunk || Math.abs(tc - chunk.t0c) > I32_MAX) {
      chunk = { t0c: tc, frames: [] };
      this.chunks.push(chunk);
    }
    const lm = frame.landmarks ?? [];
    const world = lm.length > 0 && 'world' in frame && frame.world ? frame.world : [];
    const nLm = Math.min(lm.length, 255);
    const nW = Math.min(world.length, 255);
    const buf = new Uint8Array(FRAME_HEADER_BYTES + nLm * 8 + nW * 6);
    const dv = new DataView(buf.buffer);
    dv.setUint8(0, nLm);
    dv.setUint8(1, nW);
    dv.setInt32(2, tc - chunk.t0c, true);
    let o = FRAME_HEADER_BYTES;
    for (const p of lm.slice(0, nLm)) {
      dv.setInt16(o, q(p.x), true);
      dv.setInt16(o + 2, q(p.y), true);
      dv.setInt16(o + 4, q(p.z), true);
      dv.setInt16(o + 6, q(p.visibility), true);
      o += 8;
    }
    for (const p of world.slice(0, nW)) {
      dv.setInt16(o, q(p.x), true);
      dv.setInt16(o + 2, q(p.y), true);
      dv.setInt16(o + 4, q(p.z), true);
      o += 6;
    }
    chunk.frames.push(buf);
    this.count++;
  }

  /** The bytes of every frame pushed since the last call (null if none), and reset. */
  take(): Uint8Array | null {
    if (this.count === 0) return null;
    let total = 0;
    for (const c of this.chunks) {
      total += HEADER_BYTES;
      for (const f of c.frames) total += f.byteLength;
    }
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    let o = 0;
    for (const c of this.chunks) {
      out.set(MAGIC, o);
      dv.setUint8(o + 4, VERSION);
      dv.setUint8(o + 5, 0);
      dv.setFloat64(o + 6, c.t0c, true);
      dv.setUint32(o + 14, c.frames.length, true);
      o += HEADER_BYTES;
      for (const f of c.frames) {
        out.set(f, o);
        o += f.byteLength;
      }
    }
    this.chunks = [];
    this.count = 0;
    return out;
  }
}

/** Encode a whole frame list at once. */
export function encodeFrames(frames: readonly DevLogFrame[]): Uint8Array {
  const enc = new FrameEncoder();
  for (const f of frames) enc.push(f);
  return enc.take() ?? new Uint8Array(0);
}

const r = (n: number) => n / SCALE;

/** Decode a stream of one or more concatenated chunks. Values come back at 4 decimals. */
export function decodeFrames(bytes: Uint8Array | ArrayBuffer): DevLogFrame[] {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out: DevLogFrame[] = [];
  const bad = (why: string) => new Error(`Not a devlog frame stream: ${why}`);
  let o = 0;
  while (o < u8.byteLength) {
    if (o + HEADER_BYTES > u8.byteLength) throw bad('truncated header');
    for (let i = 0; i < 4; i++) if (u8[o + i] !== MAGIC[i]) throw bad('bad magic');
    if (dv.getUint8(o + 4) !== VERSION) throw bad(`unknown version ${dv.getUint8(o + 4)}`);
    const t0c = dv.getFloat64(o + 6, true);
    const n = dv.getUint32(o + 14, true);
    o += HEADER_BYTES;
    for (let k = 0; k < n; k++) {
      if (o + FRAME_HEADER_BYTES > u8.byteLength) throw bad('truncated frame');
      const nLm = dv.getUint8(o);
      const nW = dv.getUint8(o + 1);
      const t = (t0c + dv.getInt32(o + 2, true)) / T_SCALE;
      o += FRAME_HEADER_BYTES;
      if (o + nLm * 8 + nW * 6 > u8.byteLength) throw bad('truncated points');
      if (nLm === 0 && nW === 0) {
        out.push({ t, landmarks: null });
        continue;
      }
      const landmarks: LandmarkFrame['landmarks'] = [];
      for (let i = 0; i < nLm; i++, o += 8) {
        landmarks.push({
          x: r(dv.getInt16(o, true)),
          y: r(dv.getInt16(o + 2, true)),
          z: r(dv.getInt16(o + 4, true)),
          visibility: r(dv.getInt16(o + 6, true)),
        });
      }
      const f: LandmarkFrame = { t, landmarks };
      if (nW > 0) {
        const world: NonNullable<LandmarkFrame['world']> = [];
        for (let i = 0; i < nW; i++, o += 6) {
          world.push({
            x: r(dv.getInt16(o, true)),
            y: r(dv.getInt16(o + 2, true)),
            z: r(dv.getInt16(o + 4, true)),
          });
        }
        f.world = world;
      }
      out.push(f);
    }
  }
  return out;
}
