import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import type { BarcodeDecoder } from './barcodeDecoder';
import {
  CAMERA_TEXT,
  barcodeScanSheet,
  libraryDecoder,
  makeFrameDecoder,
  nativeDecoder,
  statusText,
  type FrameDecoder,
  type ScanEnv,
  type ScanStatus,
} from './barcodeScan';
import { all, byAttr, expectCleanCopy, key } from './fuelTestKit';

useFakeDom();

// Made-up codes with valid GS1 check digits.
const EAN13 = '5901234123457';
const EAN8 = '96385074';
const BAD = '5901234123458';

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

type FakeStream = MediaStream & { stopped: () => number };
function fakeStream(): FakeStream {
  let stopped = 0;
  const track = { stop: () => void stopped++ };
  return { getTracks: () => [track], stopped: () => stopped } as unknown as FakeStream;
}

function harness(o: { camera?: boolean; decoder?: FrameDecoder | null; gumFails?: boolean } = {}) {
  const timers = new Map<number, () => void>();
  let next = 1;
  let hidden: (() => void) | null = null;
  const streams: FakeStream[] = [];
  const env: ScanEnv = {
    getUserMedia:
      o.camera === false
        ? null
        : (c) => {
            expect(c).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false });
            if (o.gumFails) return Promise.reject(new Error('denied'));
            const s = fakeStream();
            streams.push(s);
            return Promise.resolve(s);
          },
    makeDecoder: () => Promise.resolve(o.decoder === undefined ? null : o.decoder),
    setTimer: (fn) => {
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id) => void timers.delete(id),
    onHidden: (cb) => {
      hidden = cb;
      return () => {
        hidden = null;
      };
    },
  };
  const codes: string[] = [];
  const added: string[] = [];
  let closed = 0;
  const el = barcodeScanSheet(
    {
      onCode: (c) => codes.push(c),
      onAddFood: (c) => added.push(c),
      onClose: () => closed++,
    },
    env,
  );
  const fake = asFake(el);
  /** Runs the pending frame timer(s). */
  const tick = async () => {
    const fns = [...timers.values()];
    timers.clear();
    for (const fn of fns) fn();
    await flush();
  };
  return {
    el,
    fake,
    env,
    codes,
    added,
    closed: () => closed,
    streams,
    timers,
    tick,
    hide: () => hidden?.(),
    hasHiddenListener: () => hidden !== null,
  };
}

const camAttr = (f: FakeEl) => byAttr(f, 'data-scan-camera').getAttribute('data-scan-camera');
const typeDigits = (f: FakeEl, v: string) => {
  (byAttr(f, 'id', 'scan-digits') as unknown as { value: string }).value = v;
};

describe('statusText / camera copy', () => {
  it('is short, plain and passes the copy check', () => {
    const all: ScanStatus[] = [
      { kind: 'looking', code: EAN13 },
      { kind: 'missing', code: EAN13, reason: 'notFound' },
      { kind: 'missing', code: EAN13, reason: 'incomplete' },
      { kind: 'off' },
      { kind: 'error', reason: 'offline' },
      { kind: 'error', reason: 'timeout' },
      { kind: 'error', reason: 'http' },
      { kind: 'invalid' },
    ];
    for (const s of all) {
      const t = statusText(s);
      expect(t.length).toBeGreaterThan(0);
      expect(checkCopy(t).hits).toEqual([]);
    }
    for (const t of Object.values(CAMERA_TEXT)) expect(checkCopy(t).hits).toEqual([]);
    expect(statusText({ kind: 'idle' })).toBe('');
  });
});

describe('frame readers', () => {
  it('BarcodeDetector where it exists, asked for retail formats only, valid codes only', async () => {
    let asked: string[] = [];
    class Det {
      static getSupportedFormats = () => Promise.resolve(['qr_code', 'ean_13', 'upc_a']);
      constructor(o: { formats: string[] }) {
        asked = o.formats;
      }
      detect = () => Promise.resolve([{ rawValue: BAD }, { rawValue: EAN13 }]);
    }
    const d = await nativeDecoder(Det);
    expect(asked).toEqual(['ean_13', 'upc_a']);
    expect(await d?.decode({} as HTMLVideoElement)).toBe(EAN13);
  });

  it('falls back to the on-device library, then to typing', async () => {
    const lib: BarcodeDecoder = { decode: () => Promise.resolve(EAN8) };
    let loads = 0;
    // No BarcodeDetector: the library.
    const d = await makeFrameDecoder({}, () => {
      loads++;
      return Promise.resolve(lib);
    });
    expect(loads).toBe(1);
    expect(d).not.toBeNull();
    // A detector without any retail format: the library too.
    class QrOnly {
      static getSupportedFormats = () => Promise.resolve(['qr_code']);
      detect = () => Promise.resolve([]);
    }
    expect(
      await makeFrameDecoder({ BarcodeDetector: QrOnly }, () => Promise.resolve(lib)),
    ).not.toBeNull();
    // The library can't load (offline before the first scan): typing only.
    expect(await makeFrameDecoder({}, () => Promise.reject(new Error('offline')))).toBeNull();
  });

  it('the library reads grabbed frames; no frame yet → nothing', async () => {
    const lib: BarcodeDecoder = { decode: () => Promise.resolve(EAN13) };
    const frame = {} as ImageData;
    expect(await libraryDecoder(lib, () => null).decode({} as HTMLVideoElement)).toBeNull();
    expect(await libraryDecoder(lib, () => frame).decode({} as HTMLVideoElement)).toBe(EAN13);
    const bad: BarcodeDecoder = { decode: () => Promise.resolve(BAD) };
    expect(await libraryDecoder(bad, () => frame).decode({} as HTMLVideoElement)).toBeNull();
  });
});

describe('barcodeScanSheet', () => {
  it('rear camera → frames until a valid code → stops the camera and hands over the code', async () => {
    const seen = [null, null, EAN13];
    const decoder: FrameDecoder = { decode: () => Promise.resolve(seen.shift() ?? null) };
    const h = harness({ decoder });
    expect(camAttr(h.fake)).toBe('starting');
    await flush();
    expect(camAttr(h.fake)).toBe('on');
    expect(byAttr(h.fake, 'data-scan-video')).toBeTruthy();
    await h.tick();
    await h.tick();
    expect(h.codes).toEqual([]);
    await h.tick();
    expect(h.codes).toEqual([EAN13]);
    expect(h.streams[0]?.stopped()).toBe(1);
    expect(camAttr(h.fake)).toBe('stopped');
    expect(h.timers.size).toBe(0); // no more frames read
    // Scan again starts a fresh stream.
    expect(byAttr(h.fake, 'data-scan-again').hasAttribute('hidden')).toBe(false);
    byAttr(h.fake, 'data-scan-again').click();
    await flush();
    expect(h.streams).toHaveLength(2);
    expect(camAttr(h.fake)).toBe('on');
    expectCleanCopy(h.fake);
  });

  it('closing (dispose) stops the stream; a camera that opens after close is stopped at once', async () => {
    const decoder: FrameDecoder = { decode: () => Promise.resolve(null) };
    const h = harness({ decoder });
    await flush();
    h.el.dispose();
    expect(h.streams[0]?.stopped()).toBe(1);
    expect(h.timers.size).toBe(0);
    expect(h.hasHiddenListener()).toBe(false);

    const late = harness({ decoder });
    late.el.dispose(); // before getUserMedia resolved
    await flush();
    expect(late.streams[0]?.stopped()).toBe(1);
  });

  it('the page going hidden stops the camera', async () => {
    const h = harness({ decoder: { decode: () => Promise.resolve(null) } });
    await flush();
    h.hide();
    expect(h.streams[0]?.stopped()).toBe(1);
    expect(camAttr(h.fake)).toBe('stopped');
  });

  it('no camera, a blocked camera, or no reader → typing only', async () => {
    const none = harness({ camera: false });
    await flush();
    expect(camAttr(none.fake)).toBe('none');
    expect(byAttr(none.fake, 'data-scan-again').hasAttribute('hidden')).toBe(true);

    const blocked = harness({ gumFails: true, decoder: { decode: () => Promise.resolve(null) } });
    await flush();
    expect(camAttr(blocked.fake)).toBe('none');

    const noReader = harness({ decoder: null });
    await flush();
    expect(camAttr(noReader.fake)).toBe('nodecoder');
    expect(noReader.streams[0]?.stopped()).toBe(1);
  });

  it('typed digits: checked first, spaces allowed, Enter works too', async () => {
    const h = harness({ camera: false });
    await flush();
    typeDigits(h.fake, '12345');
    byAttr(h.fake, 'data-scan-lookup').click();
    expect(h.codes).toEqual([]);
    expect(byAttr(h.fake, 'id', 'scan-digits-err').textContent).toMatch(/8, 12 or 13 digits/);
    typeDigits(h.fake, '5 901234 123457');
    byAttr(h.fake, 'data-scan-lookup').click();
    expect(h.codes).toEqual([EAN13]);
    expect(byAttr(h.fake, 'id', 'scan-digits-err').textContent).toBe('');
    typeDigits(h.fake, EAN8);
    key(byAttr(h.fake, 'id', 'scan-digits'), 'Enter');
    expect(h.codes).toEqual([EAN13, EAN8]);
  });

  it('results: looking, missing → Add it to My foods, plain messages otherwise', async () => {
    const h = harness({ camera: false });
    await flush();
    h.el.setStatus({ kind: 'looking', code: EAN13 });
    expect(byAttr(h.fake, 'data-scan-result').getAttribute('data-scan-result')).toBe('looking');
    expect(all(h.fake, 'data-scan-add')).toHaveLength(0);
    h.el.setStatus({ kind: 'missing', code: EAN13, reason: 'notFound' });
    const add = byAttr(h.fake, 'data-scan-add');
    expect(add.textContent).toContain('Add it to My foods');
    add.click();
    expect(h.added).toEqual([EAN13]);
    h.el.setStatus({ kind: 'error', reason: 'offline' });
    expect(all(h.fake, 'data-scan-add')).toHaveLength(0);
    expect(byAttr(h.fake, 'data-scan-result').textContent).toMatch(/No connection/);
    expectCleanCopy(h.fake);
  });

  it('Close calls onClose; the privacy line is shown', async () => {
    const h = harness({ camera: false });
    await flush();
    byAttr(h.fake, 'data-close').click();
    expect(h.closed()).toBe(1);
    expect(h.fake.textContent).toContain('Nothing is recorded.');
  });
});
