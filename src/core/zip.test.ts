import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, readZip, zipStore } from './zip';

const enc = new TextEncoder();
const u8 = (s: string): Uint8Array => enc.encode(s);
// 2026-01-02 03:04:06 UTC (even seconds: DOS time has 2 s resolution).
const T = Date.UTC(2026, 0, 2, 3, 4, 6);

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function hasTool(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Writes `bytes` to a temp file, runs `fn(path)`, then removes the folder. */
function withTempZip<R>(bytes: Uint8Array, fn: (path: string) => R): R {
  const dir = mkdtempSync(join(tmpdir(), 'gym-clean-zip-'));
  try {
    const path = join(dir, 'test.zip');
    writeFileSync(path, bytes);
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HAS_UNZIP = hasTool('unzip', ['-v']);
const HAS_PYTHON = hasTool('python3', ['--version']);

describe('crc32', () => {
  it.each([
    ['', 0x00000000],
    ['a', 0xe8b7be43],
    ['abc', 0x352441c2],
    ['123456789', 0xcbf43926],
    ['The quick brown fox jumps over the lazy dog', 0x414fa339],
  ])('crc32(%j) = %s', (s, want) => {
    expect(crc32(u8(s))).toBe(want);
  });

  it('is unsigned for bytes with the top bit set', () => {
    const v = crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    expect(v).toBe(0xffffffff);
    expect(v).toBeGreaterThan(0);
  });

  it('works on a subarray view', () => {
    const big = u8('xx123456789yy');
    expect(crc32(big.subarray(2, 11))).toBe(0xcbf43926);
  });
});

describe('zipStore', () => {
  const two = (): Uint8Array =>
    zipStore([
      { name: 'a/hello.txt', data: u8('hello world\n'), mtime: T },
      { name: 'b.bin', data: new Uint8Array([0, 1, 2, 255, 254]), mtime: T },
    ]);

  it('writes local headers, a central directory and the end record', () => {
    const z = two();
    const d = view(z);
    expect(d.getUint32(0, true)).toBe(0x04034b50);
    // End of central directory is the last 22 bytes (no comment).
    const eocd = z.length - 22;
    expect(d.getUint32(eocd, true)).toBe(0x06054b50);
    expect(d.getUint16(eocd + 8, true)).toBe(2);
    expect(d.getUint16(eocd + 10, true)).toBe(2);
    const cdSize = d.getUint32(eocd + 12, true);
    const cdOffset = d.getUint32(eocd + 16, true);
    expect(cdOffset + cdSize).toBe(eocd);
    expect(d.getUint32(cdOffset, true)).toBe(0x02014b50);
  });

  it('stores without compression (method 0) and with the CRC and sizes in the local header', () => {
    const z = two();
    const d = view(z);
    expect(d.getUint16(8, true)).toBe(0); // method
    expect(d.getUint32(14, true)).toBe(crc32(u8('hello world\n')));
    expect(d.getUint32(18, true)).toBe(12); // compressed size
    expect(d.getUint32(22, true)).toBe(12); // uncompressed size
  });

  it('round-trips through readZip with names, data, CRC and time', () => {
    const files = readZip(two());
    expect(files.map((f) => f.name)).toEqual(['a/hello.txt', 'b.bin']);
    expect(new TextDecoder().decode(files[0]?.data)).toBe('hello world\n');
    expect(Array.from(files[1]?.data ?? [])).toEqual([0, 1, 2, 255, 254]);
    expect(files[0]?.mtime).toBe(T);
  });

  it('sets the UTF-8 flag and encodes non-ASCII names as UTF-8', () => {
    const name = 'ผัดไทย/กุ้ง é.txt';
    const z = zipStore([{ name, data: u8('x'), mtime: T }]);
    const d = view(z);
    expect(d.getUint16(6, true) & 0x0800).toBe(0x0800);
    const nameLen = d.getUint16(26, true);
    expect(nameLen).toBe(u8(name).length);
    expect(readZip(z)[0]?.name).toBe(name);
  });

  it('is deterministic for fixed inputs', () => {
    expect(Array.from(two())).toEqual(Array.from(two()));
  });

  it('rounds odd seconds down and clamps dates before 1980', () => {
    const odd = zipStore([{ name: 'x', data: u8(''), mtime: T + 1000 }]);
    expect(readZip(odd)[0]?.mtime).toBe(T);
    const old = zipStore([{ name: 'x', data: u8(''), mtime: 0 }]);
    expect(readZip(old)[0]?.mtime).toBe(Date.UTC(1980, 0, 1));
  });

  it('writes a valid empty archive for no entries', () => {
    const z = zipStore([]);
    expect(z.length).toBe(22);
    expect(readZip(z)).toEqual([]);
  });

  it('rejects empty, absolute, backslash, dot-dot and duplicate names', () => {
    const e = (name: string) => ({ name, data: u8('x'), mtime: T });
    expect(() => zipStore([e('')])).toThrow();
    expect(() => zipStore([e('/abs.txt')])).toThrow();
    expect(() => zipStore([e('a\\b.txt')])).toThrow();
    expect(() => zipStore([e('a/../b.txt')])).toThrow();
    expect(() => zipStore([e('same'), e('same')])).toThrow();
  });

  it('readZip rejects a damaged archive (bad CRC)', () => {
    const z = two();
    // Flip one data byte of the first file (local header 30 + name 11 bytes).
    z[30 + 11] = (z[30 + 11] ?? 0) ^ 0xff;
    expect(() => readZip(z)).toThrow(/crc/i);
    expect(() => readZip(new Uint8Array(10))).toThrow();
  });

  it.skipIf(!HAS_UNZIP)('passes `unzip -t` and lists the UTF-8 names', () => {
    const z = zipStore([
      { name: 'dir/hello.txt', data: u8('hello world\n'), mtime: T },
      { name: 'dir/ผัดไทย.txt', data: u8('pad thai'), mtime: T },
    ]);
    withTempZip(z, (path) => {
      const test = execFileSync('unzip', ['-t', path], { encoding: 'utf8' });
      expect(test).toMatch(/No errors detected/);
      const content = execFileSync('unzip', ['-p', path, 'dir/hello.txt'], { encoding: 'utf8' });
      expect(content).toBe('hello world\n');
    });
  });

  it.skipIf(!HAS_PYTHON)('reads with Python zipfile (what ml/ uses)', () => {
    const z = zipStore([
      { name: 'dir/hello.txt', data: u8('hello world\n'), mtime: T },
      { name: 'dir/ผัดไทย.txt', data: u8('pad thai'), mtime: T },
    ]);
    const script = [
      'import sys, zipfile, json',
      'z = zipfile.ZipFile(sys.argv[1])',
      'assert z.testzip() is None',
      'print(json.dumps([[i.filename, i.compress_type, list(i.date_time), z.read(i).decode()] for i in z.infolist()]))',
    ].join('\n');
    withTempZip(z, (path) => {
      const out = execFileSync('python3', ['-I', '-c', script, path], { encoding: 'utf8' });
      expect(JSON.parse(out)).toEqual([
        ['dir/hello.txt', 0, [2026, 1, 2, 3, 4, 6], 'hello world\n'],
        ['dir/ผัดไทย.txt', 0, [2026, 1, 2, 3, 4, 6], 'pad thai'],
      ]);
    });
  });
});
