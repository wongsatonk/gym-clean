/**
 * A tiny store-only (no compression) ZIP writer and reader, plus CRC-32. Pure: no DOM, no clock.
 *
 * Used for the M7b food-photo export (JPEGs don't compress, so "store" loses nothing). Names are
 * UTF-8 (general-purpose flag bit 11). Times are encoded from the UTC fields of `mtime` so the
 * output doesn't depend on the device time zone. No ZIP64: each file and the whole archive must
 * stay under 4 GiB, and at most 65 535 entries.
 */

export type ZipEntry = {
  /** Forward-slash path inside the archive, e.g. `folder/file.jpg`. */
  name: string;
  data: Uint8Array;
  /** Modification time, epoch ms (stored at 2 s resolution, UTC fields, clamped to 1980–2107). */
  mtime: number;
};

export type ZipFile = { name: string; data: Uint8Array; mtime: number; crc: number };

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const VERSION = 20; // 2.0: enough for stored files + directories
const MAX_U32 = 0xffffffff;

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  table = t;
  return t;
}

/** CRC-32 (IEEE 802.3, as used by ZIP and PNG). Returns an unsigned 32-bit number. */
export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = (t[(c ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms: number): { time: number; date: number } {
  const min = Date.UTC(1980, 0, 1);
  const max = Date.UTC(2107, 11, 31, 23, 59, 58);
  const d = new Date(Math.min(Math.max(Number.isFinite(ms) ? ms : min, min), max));
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

function fromDos(time: number, date: number): number {
  return Date.UTC(
    ((date >> 9) & 0x7f) + 1980,
    ((date >> 5) & 0x0f) - 1,
    date & 0x1f,
    (time >> 11) & 0x1f,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2,
  );
}

function checkName(name: string): void {
  if (name === '') throw new Error('zip: empty entry name');
  if (name.startsWith('/') || name.includes('\\')) throw new Error(`zip: bad entry name ${name}`);
  if (name.split('/').some((p) => p === '..')) throw new Error(`zip: bad entry name ${name}`);
}

/** Builds a store-only ZIP archive. The output depends only on `entries` (deterministic). */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error('zip: too many entries');
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const prepared = entries.map((e) => {
    checkName(e.name);
    if (seen.has(e.name)) throw new Error(`zip: duplicate entry ${e.name}`);
    seen.add(e.name);
    if (e.data.length > MAX_U32) throw new Error(`zip: entry too large ${e.name}`);
    const name = enc.encode(e.name);
    if (name.length > 0xffff) throw new Error('zip: entry name too long');
    return { name, data: e.data, crc: crc32(e.data), ...dosDateTime(e.mtime) };
  });

  const localSize = prepared.reduce((s, p) => s + 30 + p.name.length + p.data.length, 0);
  const centralSize = prepared.reduce((s, p) => s + 46 + p.name.length, 0);
  if (localSize + centralSize + 22 > MAX_U32) throw new Error('zip: archive too large');

  const out = new Uint8Array(localSize + centralSize + 22);
  const dv = new DataView(out.buffer);
  const offsets: number[] = [];
  let o = 0;
  for (const p of prepared) {
    offsets.push(o);
    dv.setUint32(o, SIG_LOCAL, true);
    dv.setUint16(o + 4, VERSION, true);
    dv.setUint16(o + 6, FLAG_UTF8, true);
    dv.setUint16(o + 8, 0, true); // method: stored
    dv.setUint16(o + 10, p.time, true);
    dv.setUint16(o + 12, p.date, true);
    dv.setUint32(o + 14, p.crc, true);
    dv.setUint32(o + 18, p.data.length, true);
    dv.setUint32(o + 22, p.data.length, true);
    dv.setUint16(o + 26, p.name.length, true);
    dv.setUint16(o + 28, 0, true); // extra length
    out.set(p.name, o + 30);
    out.set(p.data, o + 30 + p.name.length);
    o += 30 + p.name.length + p.data.length;
  }
  const cdStart = o;
  prepared.forEach((p, i) => {
    dv.setUint32(o, SIG_CENTRAL, true);
    dv.setUint16(o + 4, VERSION, true); // made by (MS-DOS / FAT attributes)
    dv.setUint16(o + 6, VERSION, true); // needed to extract
    dv.setUint16(o + 8, FLAG_UTF8, true);
    dv.setUint16(o + 10, 0, true);
    dv.setUint16(o + 12, p.time, true);
    dv.setUint16(o + 14, p.date, true);
    dv.setUint32(o + 16, p.crc, true);
    dv.setUint32(o + 20, p.data.length, true);
    dv.setUint32(o + 24, p.data.length, true);
    dv.setUint16(o + 28, p.name.length, true);
    // extra, comment, disk start, internal attrs, external attrs: all 0
    dv.setUint32(o + 42, offsets[i] ?? 0, true);
    out.set(p.name, o + 46);
    o += 46 + p.name.length;
  });
  dv.setUint32(o, SIG_END, true);
  dv.setUint16(o + 8, prepared.length, true);
  dv.setUint16(o + 10, prepared.length, true);
  dv.setUint32(o + 12, o - cdStart, true);
  dv.setUint32(o + 16, cdStart, true);
  return out;
}

/**
 * Reads a store-only ZIP (as written by `zipStore`) through its central directory and checks
 * every CRC. Throws on anything it can't read (compressed entries, ZIP64, damage).
 */
export function readZip(bytes: Uint8Array): ZipFile[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder('utf-8', { fatal: true });
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
    if (dv.getUint32(i, true) === SIG_END) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: no end of central directory');
  const count = dv.getUint16(eocd + 10, true);
  let o = dv.getUint32(eocd + 16, true);
  const files: ZipFile[] = [];
  for (let n = 0; n < count; n++) {
    if (o + 46 > bytes.length || dv.getUint32(o, true) !== SIG_CENTRAL) {
      throw new Error('zip: bad central directory');
    }
    const method = dv.getUint16(o + 10, true);
    if (method !== 0) throw new Error('zip: only stored entries are supported');
    const time = dv.getUint16(o + 12, true);
    const date = dv.getUint16(o + 14, true);
    const crc = dv.getUint32(o + 16, true);
    const size = dv.getUint32(o + 20, true);
    const nameLen = dv.getUint16(o + 28, true);
    const extraLen = dv.getUint16(o + 30, true);
    const commentLen = dv.getUint16(o + 32, true);
    const local = dv.getUint32(o + 42, true);
    const name = dec.decode(bytes.subarray(o + 46, o + 46 + nameLen));
    if (local + 30 > bytes.length || dv.getUint32(local, true) !== SIG_LOCAL) {
      throw new Error(`zip: bad local header for ${name}`);
    }
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    if (start + size > bytes.length) throw new Error(`zip: truncated ${name}`);
    const data = bytes.slice(start, start + size);
    if (crc32(data) !== crc) throw new Error(`zip: CRC mismatch for ${name}`);
    files.push({ name, data, mtime: fromDos(time, date), crc });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
