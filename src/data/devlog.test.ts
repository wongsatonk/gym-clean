import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LandmarkFrame, RepEvent } from '../core/types';
import curlFrames from '../../fixtures/landmarks/curl/synthetic-01__reps-3__partials-1.json';
import { GymDb } from './db';
import {
  DEVLOG_CAP_BYTES,
  DEVLOG_FLUSH_MS,
  DEVLOG_PLAIN_EXPORT_MAX_BYTES,
  clearDevLog,
  devLogStats,
  enforceDevLogCap,
  exportAll,
  exportBlob,
  exportSession,
  getDevLogEnabled,
  lastDevLogSessionId,
  setDevLogEnabled,
  startDevLogSession,
  type DevLogExport,
  type DevLogRecorder,
} from './devlog';

let db: GymDb;
let n = 0;

beforeEach(async () => {
  db = new GymDb(`devlog-${n++}`);
  await db.open();
});
afterEach(async () => {
  vi.useRealTimers();
  db.close();
  await db.delete();
});

/** Made-up frame (not anyone's real pose). */
function frame(t: number, k = 0, world = true): LandmarkFrame {
  const landmarks = Array.from({ length: 33 }, (_, i) => ({
    x: 0.3 + i * 0.01 + k * 0.001,
    y: 0.6 - i * 0.01,
    z: -0.1 + i * 0.002,
    visibility: 0.9,
  }));
  const f: LandmarkFrame = { t, landmarks };
  if (world) f.world = landmarks.map((p) => ({ x: p.x - 0.5, y: p.y - 0.5, z: p.z }));
  return f;
}

function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing value');
  return v;
}

async function firstSet(from: GymDb, id: string) {
  return must(must((await exportSession(from, id)).sessions[0]).sets[0]);
}

const meta = { dayId: 'push-a', settings: { unit: 'kg', spokenCount: true } };
let clock = 1_000_000;
const now = () => clock;

async function start(opts: Parameters<typeof startDevLogSession>[2] = {}) {
  return startDevLogSession(db, { ...meta, startedAt: clock }, { now, ...opts });
}

const rep = (over: Partial<RepEvent> = {}): RepEvent => ({
  type: 'rep',
  index: 1,
  eccentricMs: 900,
  concentricMs: 700,
  minAngle: 62.1,
  maxAngle: 158.4,
  t: 2000,
  ...over,
});

/** A camera set with frames, angles, events, speech and fps; returns the recorder. */
async function cameraSet(r: DevLogRecorder, frames = 30) {
  r.beginSet({
    exerciseId: 'Pushups',
    setIndex: 0,
    targetReps: [8, 12],
    weightKg: 0,
    startedAt: clock,
  });
  r.camera({ folder: 'push-up', delegate: 'GPU', side: 'right' });
  for (let i = 0; i < frames; i++) {
    const t = i * 33.3;
    if (i === 5) r.frame(null, t);
    else r.frame(frame(t, i), t);
    r.angle(t, i === 5 ? null : 150 - i);
  }
  r.repEvent(rep());
  r.repEvent(rep({ type: 'partial', index: 1, reason: 'far', shortByDeg: 12.5, t: 2500 }));
  r.speech({ t: 2000, text: 'One', kind: 'count' });
  r.speech({ t: 2600, text: 'Go lower.', kind: 'hint', dropped: true });
  r.fps(1000, 29.8);
  clock += 45_000;
  await r.endSet({
    counted: { reps: 1, partials: 1 },
    logged: { reps: 1, partials: 1 },
    weightKg: 0,
    endedAt: clock,
    restTakenSec: 0,
  });
}

describe('developer log setting', () => {
  it('is on by default and remembers off/on', async () => {
    expect(await getDevLogEnabled(db)).toBe(true);
    await setDevLogEnabled(db, false);
    expect(await getDevLogEnabled(db)).toBe(false);
    await setDevLogEnabled(db, true);
    expect(await getDevLogEnabled(db)).toBe(true);
  });

  it('stores nothing while disabled', async () => {
    await setDevLogEnabled(db, false);
    const r = await start();
    expect(r.active).toBe(false);
    r.logEvent('START_SET');
    await cameraSet(r);
    await r.correctSet({ reps: 3, partials: 0 });
    await r.finish();
    expect(await db.devlogSessions.count()).toBe(0);
    expect(await db.devlogSets.count()).toBe(0);
    expect(await db.devlogChunks.count()).toBe(0);
    expect(await devLogStats(db)).toEqual({ bytes: 0, sessions: 0 });
  });
});

describe('developer log recorder', () => {
  it('records session meta with the app version and user agent', async () => {
    const r = await start({ userAgent: 'TestAgent/1.0' });
    expect(r.active).toBe(true);
    const row = await db.devlogSessions.get(r.sessionId);
    expect(row).toMatchObject({
      dayId: 'push-a',
      settings: { unit: 'kg', spokenCount: true },
      userAgent: 'TestAgent/1.0',
      appVersion: __APP_VERSION__,
      startedAt: clock,
    });
    expect(must(row).appVersion.length).toBeGreaterThan(0);
    await r.finish();
  });

  it('exports a camera set in the SPEC §4 shape with frames decoded', async () => {
    const r = await start({ id: 'w1' });
    r.logEvent('START_SET', { exIndex: 0 }, clock);
    await cameraSet(r);
    r.logEvent('SET_DONE', undefined, clock);
    await r.finish(clock + 1);

    const out = await exportSession(db, 'w1');
    expect(out.format).toBe('gym-clean-devlog');
    expect(out.version).toBe(1);
    expect(out.sessions).toHaveLength(1);
    const s = must(out.sessions[0]);
    expect(s).toMatchObject({ id: 'w1', dayId: 'push-a', endedAt: clock + 1 });
    expect(s.events.map((e) => e.type)).toEqual(['START_SET', 'SET_DONE']);
    expect(must(s.events[0]).data).toEqual({ exIndex: 0 });
    expect(s.sets).toHaveLength(1);
    const set = must(s.sets[0]);
    expect(set).toMatchObject({
      sessionId: 'w1',
      exerciseId: 'Pushups',
      setIndex: 0,
      targetReps: [8, 12],
      counted: { reps: 1, partials: 1 },
      logged: { reps: 1, partials: 1 },
      weightKg: 0,
      restTakenSec: 0,
    });
    expect(must(set.endedAt) - set.startedAt).toBe(45_000);
    const cam = must(set.camera);
    expect(cam).toMatchObject({ folder: 'push-up', delegate: 'GPU', side: 'right' });
    expect(cam.fps).toEqual([{ t: 1000, fps: 29.8 }]);
    expect(cam.repEvents).toHaveLength(2);
    expect(cam.repEvents[1]).toMatchObject({ reason: 'far', shortByDeg: 12.5 });
    expect(cam.speech).toEqual([
      { t: 2000, text: 'One', kind: 'count' },
      { t: 2600, text: 'Go lower.', kind: 'hint', dropped: true },
    ]);
    expect(cam.angles).toHaveLength(30);
    expect(cam.angles[5]).toEqual({ t: 166.5, angle: null });
    expect(cam.frames).toHaveLength(30);
    expect(cam.frames[5]).toEqual({ t: 166.5, landmarks: null });
    const f1 = must(cam.frames[1]);
    expect(f1.landmarks).toHaveLength(33);
    expect(must(must(f1.landmarks)[2]).x).toBeCloseTo(0.321, 4);
    expect('world' in f1 && f1.world).toHaveLength(33);
    // Internal bookkeeping stays out of the export.
    expect(Object.keys(set)).not.toContain('key');
    expect(Object.keys(s)).not.toContain('bytes');
  });

  it('exports a manual set without camera data', async () => {
    const r = await start({ id: 'm1' });
    r.beginSet({
      exerciseId: 'Dumbbell_Bench_Press',
      setIndex: 2,
      targetReps: [8, 12],
      weightKg: 20,
    });
    await r.endSet({ logged: { reps: 9, partials: 0 }, weightKg: 22.5, restTakenSec: 95 });
    await r.finish();
    const set = await firstSet(db, 'm1');
    expect(set).toMatchObject({
      logged: { reps: 9, partials: 0 },
      weightKg: 22.5,
      restTakenSec: 95,
    });
    expect(set.camera).toBeUndefined();
    expect(set.counted).toBeUndefined();
  });

  it('buffers in memory and flushes every 10 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const r = await start({ id: 'b1' });
    expect(DEVLOG_FLUSH_MS).toBe(10_000);
    r.beginSet({ exerciseId: 'Pushups', setIndex: 0, targetReps: [8, 12], weightKg: 0 });
    for (let i = 0; i < 90; i++) r.frame(frame(i * 33.3, i), i * 33.3);
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(0);
    vi.advanceTimersByTime(9_999);
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(0);
    vi.advanceTimersByTime(1);
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(1);
    // Nothing new → the next tick writes nothing.
    vi.advanceTimersByTime(10_000);
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(1);
    await r.finish();
  });

  it('keeps a set whose tab was killed mid-set (after a flush)', async () => {
    const r = await start({ id: 'k1' });
    r.beginSet({ exerciseId: 'Pushups', setIndex: 0, targetReps: [8, 12], weightKg: 0 });
    for (let i = 0; i < 10; i++) r.frame(frame(i * 33.3, i), i * 33.3);
    r.repEvent(rep());
    await r.flush();
    r.frame(frame(999), 999); // after the last flush → lost with the tab
    // Tab dies: no endSet, no finish. A fresh page opens the same database.
    const again = new GymDb(db.name);
    await again.open();
    const set = await firstSet(again, 'k1');
    again.close();
    expect(set.endedAt).toBeUndefined();
    expect(set.logged).toBeUndefined();
    expect(must(set.camera).frames).toHaveLength(10);
    expect(must(set.camera).repEvents).toHaveLength(1);
    await r.finish();
  });

  it('flushes at set end without waiting for the timer', async () => {
    const r = await start({ id: 'e1' });
    await cameraSet(r, 10);
    expect(await db.devlogChunks.where('sessionId').equals('e1').count()).toBe(1);
    expect((await db.devlogSets.toArray())[0]).toMatchObject({ endedAt: clock });
    await r.finish();
  });

  it('ignores camera data while no set is open', async () => {
    const r = await start({ id: 'n1' });
    r.frame(frame(0), 0);
    r.angle(0, 120);
    r.fps(0, 30);
    await r.flush();
    expect(await db.devlogChunks.count()).toBe(0);
    await r.finish();
  });

  it('corrects the last ended set (ground truth) and logs the correction', async () => {
    const r = await start({ id: 'c1' });
    await cameraSet(r);
    await r.correctSet({ reps: 3, partials: 0 }, clock + 5);
    await r.finish();
    const s = must((await exportSession(db, 'c1')).sessions[0]);
    expect(s.sets[0]).toMatchObject({
      counted: { reps: 1, partials: 1 },
      logged: { reps: 3, partials: 0 },
    });
    const ev = s.events.find((e) => e.type === 'correction');
    expect(ev).toMatchObject({
      t: clock + 5,
      data: {
        exerciseId: 'Pushups',
        setIndex: 0,
        from: { reps: 1, partials: 1 },
        to: { reps: 3, partials: 0 },
      },
    });
  });

  it('clamps corrections at zero and ignores a correction before any set ended', async () => {
    const r = await start({ id: 'c2' });
    await r.correctSet({ reps: 4, partials: 0 });
    expect(await db.devlogSets.count()).toBe(0);
    await cameraSet(r);
    await r.correctSet({ reps: -2, partials: -1 });
    await r.finish();
    expect((await firstSet(db, 'c2')).logged).toEqual({ reps: 0, partials: 0 });
  });
});

describe('developer log size, rotation, export, clear', () => {
  it('reports stored size and session count', async () => {
    expect(await devLogStats(db)).toEqual({ bytes: 0, sessions: 0 });
    const r = await start();
    await cameraSet(r, 60);
    await r.finish();
    const stats = await devLogStats(db);
    expect(stats.sessions).toBe(1);
    expect(stats.bytes).toBeGreaterThan(59 * 460);
    expect(stats.bytes).toBeLessThan(60 * 470 + 8_000);
  });

  it('has a 150 MB default cap', () => {
    expect(DEVLOG_CAP_BYTES).toBe(150 * 1024 * 1024);
  });

  it('drops the oldest sessions beyond the cap, never the current one', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      clock += 60_000;
      const r = await start({ id: `rot-${i}` });
      await cameraSet(r, 40); // ≈ 19 kB each
      await r.finish();
      ids.push(r.sessionId);
    }
    const before = await devLogStats(db);
    const per = before.bytes / 4;
    // Room for two and a half sessions → the two oldest go.
    await enforceDevLogCap(db, per * 2.5);
    expect((await db.devlogSessions.toArray()).map((s) => s.id).sort()).toEqual(['rot-2', 'rot-3']);
    expect(await db.devlogSets.where('sessionId').anyOf('rot-0', 'rot-1').count()).toBe(0);
    expect(await db.devlogChunks.where('sessionId').anyOf('rot-0', 'rot-1').count()).toBe(0);
    // A cap smaller than one session still keeps the session being recorded.
    await enforceDevLogCap(db, 1, 'rot-2');
    expect((await db.devlogSessions.toArray()).map((s) => s.id)).toEqual(['rot-2']);
  });

  it('rotates automatically while recording', async () => {
    clock += 1;
    const old = await start({ id: 'old' });
    await cameraSet(old, 40);
    await old.finish();
    clock += 60_000;
    const r = await start({ id: 'new', capBytes: 25_000 });
    await cameraSet(r, 40);
    expect(await db.devlogSessions.get('old')).toBeUndefined();
    expect(await db.devlogSessions.get('new')).toBeDefined();
    await r.finish();
  });

  it('exports all sessions oldest first and finds the last session', async () => {
    for (const id of ['a', 'b']) {
      clock += 60_000;
      const r = await start({ id });
      await cameraSet(r, 5);
      await r.finish();
    }
    expect(await lastDevLogSessionId(db)).toBe('b');
    const all = await exportAll(db);
    expect(all.sessions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(typeof all.exportedAt).toBe('number');
  });

  it('builds a gzip JSON file when CompressionStream exists, plain JSON otherwise', async () => {
    const r = await start({ id: 'x1' });
    await cameraSet(r, 20);
    await r.finish();
    const expected = await exportAll(db);

    const gz = await exportBlob(db, { scope: 'all', now: 1_700_000_000_000 });
    expect(gz.gzip).toBe(true);
    expect(gz.filename).toMatch(/^gym-clean-devlog-.*\.json\.gz$/);
    expect(gz.blob.type).toBe('application/gzip');
    const text = await new Response(
      gz.blob.stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
    const parsed = JSON.parse(text) as DevLogExport;
    expect({ ...parsed, exportedAt: 0 }).toEqual({ ...expected, exportedAt: 0 });

    const plain = await exportBlob(db, { scope: 'last', compress: false });
    expect(plain.gzip).toBe(false);
    expect(plain.filename).toMatch(/\.json$/);
    expect(plain.blob.type).toBe('application/json');
    const p = JSON.parse(await plain.blob.text()) as DevLogExport;
    expect(p.sessions.map((s) => s.id)).toEqual(['x1']);
    expect(must(must(must(p.sessions[0]).sets[0]).camera).frames).toHaveLength(20);
  });

  it('clears everything', async () => {
    const r = await start();
    await cameraSet(r, 5);
    await r.finish();
    await clearDevLog(db);
    expect(await devLogStats(db)).toEqual({ bytes: 0, sessions: 0 });
    expect(await db.devlogSets.count()).toBe(0);
    expect(await db.devlogChunks.count()).toBe(0);
    expect(await lastDevLogSessionId(db)).toBeUndefined();
  });

  it('measures a real-length camera set (synthetic curl fixture)', async () => {
    const frames = curlFrames as LandmarkFrame[];
    const r = await start({ id: 'size' });
    r.beginSet({
      exerciseId: 'Dumbbell_Bicep_Curl',
      setIndex: 0,
      targetReps: [8, 12],
      weightKg: 10,
    });
    for (const f of frames) {
      r.frame(f, f.t);
      r.angle(f.t, 120);
    }
    await r.endSet({ logged: { reps: 3, partials: 1 }, weightKg: 10 });
    await r.finish();
    const seconds = (must(frames.at(-1)).t - must(frames[0]).t) / 1000;
    const { bytes } = await devLogStats(db);
    const kBps = bytes / 1000 / seconds;
    const gz = await exportBlob(db, { scope: 'all' });
    // Measured 2026-11-13: 311 frames / 10.5 s → 152.8 kB stored (14.5 kB/s), gz export 201 kB.
    expect(gz.blob.size).toBeGreaterThan(0);
    expect(kBps).toBeLessThan(16 * (frames.length / seconds / 30));
    const back = must((await firstSet(db, 'size')).camera).frames;
    expect(back).toHaveLength(frames.length);
    back.forEach((f, i) => {
      const src = must(frames[i]);
      src.landmarks.forEach((p, j) => {
        expect(Math.abs(must(must(f.landmarks)[j]).x - p.x)).toBeLessThanOrEqual(1e-4);
        expect(Math.abs(must(must(f.landmarks)[j]).visibility - p.visibility)).toBeLessThanOrEqual(
          1e-4,
        );
      });
    });
  });
});

describe('developer log robustness (review fixes)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });

  it('never throws from start: a failing write gives an inactive recorder', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(db.devlogSessions, 'put').mockRejectedValue(quota());
    const r = await start({ id: 'fail' });
    expect(r.active).toBe(false);
    r.frame(frame(0), 0);
    await r.finish();
    expect(warn).toHaveBeenCalled();
  });

  it('never throws from start when reading the setting fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(db.settings, 'get').mockRejectedValue(new Error('UnknownError'));
    expect((await start()).active).toBe(false);
  });

  it('on a quota error, drops older sessions once and retries the write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    clock += 1;
    const old = await start({ id: 'q-old' });
    await cameraSet(old, 5);
    await old.finish();
    clock += 60_000;
    const r = await start({ id: 'q-new' });
    const add = vi.spyOn(db.devlogChunks, 'bulkAdd').mockRejectedValueOnce(quota());
    await cameraSet(r, 5);
    expect(add).toHaveBeenCalledTimes(2);
    expect(await db.devlogSessions.get('q-old')).toBeUndefined();
    expect(r.active).toBe(true);
    expect(await db.devlogChunks.where('sessionId').equals('q-new').count()).toBe(1);
    await r.finish();
  });

  it('stops recording when the quota error survives the cleanup (no warning every 10 s)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const r = await start({ id: 'q-full' });
    const add = vi.spyOn(db.devlogChunks, 'bulkAdd').mockRejectedValue(quota());
    await cameraSet(r, 5);
    expect(r.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const calls = add.mock.calls.length;
    const warns = warn.mock.calls.length;
    r.beginSet({ exerciseId: 'Pushups', setIndex: 1, targetReps: [8, 12], weightKg: 0 });
    r.frame(frame(0), 0);
    vi.advanceTimersByTime(30_000);
    await r.flush();
    await r.settled();
    expect(add.mock.calls.length).toBe(calls);
    expect(warn.mock.calls.length).toBe(warns);
  });

  it('flushes on pagehide and when the page is hidden; finish removes listeners and the timer', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const win = new EventTarget();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', win);
    const r = await start({ id: 'vis' });
    expect(vi.getTimerCount()).toBe(1);
    r.beginSet({ exerciseId: 'Pushups', setIndex: 0, targetReps: [8, 12], weightKg: 0 });

    r.frame(frame(0), 0);
    doc.dispatchEvent(new Event('visibilitychange')); // still visible → no flush
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(0);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(1);

    doc.visibilityState = 'visible'; // pagehide flushes regardless (bfcache, iOS)
    r.frame(frame(33), 33);
    win.dispatchEvent(new Event('pagehide'));
    await r.settled();
    expect(await db.devlogChunks.count()).toBe(2);

    const docOff = vi.spyOn(doc, 'removeEventListener');
    const winOff = vi.spyOn(win, 'removeEventListener');
    await r.finish();
    expect(vi.getTimerCount()).toBe(0);
    expect(docOff).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winOff).toHaveBeenCalledWith('pagehide', expect.any(Function));
  });

  it('dispose() keeps buffered data, stops recording, leaves the end open, and is idempotent', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const r = await start({ id: 'disp' });
    r.beginSet({ exerciseId: 'Pushups', setIndex: 0, targetReps: [8, 12], weightKg: 0 });
    r.frame(frame(0), 0);
    await r.dispose();
    await r.dispose();
    expect(r.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(await db.devlogChunks.count()).toBe(1);
    expect((await db.devlogSessions.get('disp'))?.endedAt).toBeUndefined();
    await r.finish(); // after dispose: no-op
    expect((await db.devlogSessions.get('disp'))?.endedAt).toBeUndefined();
  });

  it('refuses a plain-JSON export above the size limit with a readable error', async () => {
    const r = await start({ id: 'big' });
    await cameraSet(r, 30);
    await r.finish();
    await expect(
      exportBlob(db, { scope: 'all', compress: false, plainMaxBytes: 1_000 }),
    ).rejects.toMatchObject({
      name: 'DevLogExportTooLarge',
      message: expect.stringMatching(/too large/i),
    });
    // gzip streams, so the same log exports fine.
    const gz = await exportBlob(db, { scope: 'all', plainMaxBytes: 1_000 });
    expect(gz.gzip).toBe(true);
    expect(DEVLOG_PLAIN_EXPORT_MAX_BYTES).toBeGreaterThan(0);
  });
});
