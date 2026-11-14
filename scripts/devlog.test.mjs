// node --test scripts/devlog.test.mjs
// Builds a developer-log export in memory from the curl/synthetic-01 fixture through the real
// frame codec (src/core/devlogCodec.ts, loaded via node's type stripping), runs the CLI on it and
// checks the fixtures it writes, the skips, --dry-run and --force.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import { decodeFrames, encodeFrames } from '../src/core/devlogCodec.ts';
import { LANDMARK } from '../src/core/poseTopology.ts';
import { KNOWN_FOLDERS, USED_INDICES, parseExport, planConversion } from './devlog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/devlog.mjs');
const SOURCE = join(ROOT, 'fixtures/landmarks/curl/synthetic-01__reps-3__partials-1.json');
const SECRET_UA = 'SECRET-USER-AGENT';
const SECRET_SETTING = 'SECRET-SETTING';
const SECRET_SPEECH = 'SECRET-SPEECH';

// 18:05 local time on 2026-11-13, whatever the machine's time zone.
const SESSION_START = new Date(2026, 10, 13, 18, 5).getTime();

const original = JSON.parse(readFileSync(SOURCE, 'utf8'));

/** Original frames on a performance.now()-like clock, with no-person frames mixed in. */
function loggedFrames() {
  const T0 = 123456.78;
  const out = [
    { t: T0 - 66, landmarks: null },
    { t: T0 - 33, landmarks: null },
  ];
  original.forEach((f, i) => {
    out.push({ ...f, t: f.t + T0 });
    if (i === 20) out.push({ t: f.t + T0 + 1, landmarks: null });
  });
  return decodeFrames(encodeFrames(out)); // what the export actually carries
}

function camera(folder, frames) {
  return {
    folder,
    delegate: 'GPU',
    side: 'right',
    fps: [],
    repEvents: [],
    speech: [{ t: 1, text: SECRET_SPEECH, kind: 'hint' }],
    angles: [],
    frames,
  };
}

function set(setIndex, extra) {
  return {
    sessionId: 'sess-1',
    exerciseId: 'Dumbbell_Bicep_Curl',
    setIndex,
    targetReps: [8, 12],
    weightKg: 10,
    startedAt: 1,
    endedAt: 2,
    counted: { reps: 2, partials: 1 },
    logged: { reps: 3, partials: 1 },
    ...extra,
  };
}

function buildExport() {
  const frames = loggedFrames();
  return {
    format: 'gym-clean-devlog',
    version: 1,
    exportedAt: Date.UTC(2026, 10, 13, 12),
    sessions: [
      {
        id: 'sess-1',
        startedAt: SESSION_START,
        endedAt: 3,
        appVersion: 'abc123',
        userAgent: SECRET_UA,
        settings: { note: SECRET_SETTING },
        dayId: 'push-a',
        events: [{ t: 1, type: 'note', data: SECRET_SETTING }],
        sets: [
          set(0, { camera: camera('curl', frames) }), // converted
          set(1, { camera: camera('curl', frames), endedAt: undefined }), // never ended
          set(2, { camera: camera('curl', frames), logged: undefined }), // no logged counts
          set(3, {}), // manual set, no camera
          set(4, { camera: camera('bench', frames) }), // unknown folder
          set(5, { camera: camera('curl', [{ t: 5, landmarks: null }]) }), // nobody in view
        ],
      },
    ],
  };
}

const run = (...args) => execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

// The tests below run in order and share one temp dir and export: later ones rely on the
// fixture written by earlier ones (e.g. --force overwrites the file the write test created).
describe('scripts/devlog.mjs', () => {
  let dir;
  let gz;
  let out;
  const target = () => join(out, 'curl/test-1805-s1-0__reps-3__partials-1.json');

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'devlog-test-'));
    out = join(dir, 'landmarks');
    gz = join(dir, 'export.json.gz');
    writeFileSync(gz, gzipSync(JSON.stringify(buildExport())));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('KNOWN_FOLDERS matches the folders of the exercise rules', () => {
    const exDir = join(ROOT, 'src/core/exercises');
    const folders = readdirSync(exDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .flatMap((f) => [...readFileSync(join(exDir, f), 'utf8').matchAll(/folder: '([^']+)'/g)])
      .map((m) => m[1]);
    assert.deepEqual([...folders].sort(), [...KNOWN_FOLDERS].sort());
  });

  it('--dry-run writes nothing but plans the one convertible set', () => {
    const stdout = run(gz, '--out', out, '--label', 'test', '--dry-run');
    assert.equal(existsSync(out), false);
    assert.match(stdout, /would write: .*curl\/test-1805-s1-0__reps-3__partials-1\.json/);
    assert.match(stdout, /1 would be written, 0 kept \(exists\), 5 skipped/);
  });

  it('writes the fixture: same frames within 1e-4, no-person frames dropped, t from 0', () => {
    const stdout = run(gz, '--out', out, '--label', 'test');
    const written = JSON.parse(readFileSync(target(), 'utf8'));
    assert.equal(written.length, original.length);
    assert.equal(written[0].t, 0);
    let maxErr = 0;
    written.forEach((f, i) => {
      const o = original[i];
      assert.deepEqual(Object.keys(f).sort(), Object.keys(o).sort());
      assert.ok(Math.abs(f.t - o.t) <= 0.02, `t ${f.t} vs ${o.t}`); // codec stores t in 0.01 ms
      f.landmarks.forEach((p, j) => {
        for (const k of ['x', 'y', 'z', 'visibility']) {
          maxErr = Math.max(maxErr, Math.abs(p[k] - o.landmarks[j][k]));
        }
      });
      f.world?.forEach((p, j) => {
        for (const k of ['x', 'y', 'z']) maxErr = Math.max(maxErr, Math.abs(p[k] - o.world[j][k]));
      });
    });
    assert.ok(maxErr <= 1e-4 + 1e-9, `max error ${maxErr}`);
    // Only one file, in the known folder.
    assert.deepEqual(readdirSync(out), ['curl']);
    assert.deepEqual(readdirSync(join(out, 'curl')), ['test-1805-s1-0__reps-3__partials-1.json']);
    // Miscount evidence and skips in the summary.
    assert.match(stdout, /Review before committing/);
    assert.match(stdout, /Dumbbell_Bicep_Curl\s+1\s+0\s+2\/1\s+3\/1\s+MISCOUNT/);
    for (const why of [
      'set never ended',
      'no logged counts',
      'no camera',
      'unknown folder "bench"',
      'no pose frames',
    ]) {
      assert.ok(stdout.includes(`skipped: ${why}`), why);
    }
  });

  it('never copies free text into a fixture', () => {
    const text = readFileSync(target(), 'utf8');
    for (const s of [
      SECRET_UA,
      SECRET_SETTING,
      SECRET_SPEECH,
      'GPU',
      'right',
      'push-a',
      'abc123',
    ]) {
      assert.equal(text.includes(s), false, s);
    }
  });

  it('keeps an existing fixture unless --force', () => {
    writeFileSync(target(), '[]\n');
    const stdout = run(gz, '--out', out, '--label', 'test');
    assert.match(stdout, /exists \(use --force\)/);
    assert.equal(readFileSync(target(), 'utf8'), '[]\n');
    run(gz, '--out', out, '--label', 'test', '--force');
    assert.equal(JSON.parse(readFileSync(target(), 'utf8')).length, original.length);
  });

  it('reads plain .json exports and uses a dated default label', () => {
    const plain = join(dir, 'export.json');
    writeFileSync(plain, JSON.stringify(buildExport()));
    const plan = planConversion(parseExport(readFileSync(plain)));
    const ok = plan.items.filter((i) => !i.skip);
    assert.equal(ok.length, 1);
    assert.equal(ok[0].rel, 'curl/devlog-2026-11-13-1805-s1-0__reps-3__partials-1.json');
  });

  it('two same-day sessions (e.g. two "Export last" files) never share a name', () => {
    const a = buildExport();
    const b = buildExport();
    b.sessions[0].startedAt = new Date(2026, 10, 13, 19, 40).getTime();
    const names = [a, b].map((e) => planConversion(e).items.find((i) => !i.skip).rel);
    assert.deepEqual(names, [
      'curl/devlog-2026-11-13-1805-s1-0__reps-3__partials-1.json',
      'curl/devlog-2026-11-13-1940-s1-0__reps-3__partials-1.json',
    ]);
  });

  it('USED_INDICES covers every landmark src/core reads', () => {
    const core = join(ROOT, 'src/core');
    const files = readdirSync(core, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => !['poseTopology.ts', 'devlogCodec.ts'].includes(f));
    const missing = [];
    for (const f of files) {
      const src = readFileSync(join(core, f), 'utf8');
      for (const [name, index] of Object.entries(LANDMARK)) {
        if (new RegExp(`\\b${name}\\b`).test(src) && !USED_INDICES.includes(index)) {
          missing.push(`${relative(core, join(core, f))}: ${name} (${index})`);
        }
      }
    }
    assert.deepEqual(missing, []);
  });

  it('--compact keeps all 33 indices, rounds the used ones and zeroes the rest', () => {
    const full = planConversion(buildExport()).items.find((i) => !i.skip).fixture;
    const compact = planConversion(buildExport(), { compact: true }).items.find(
      (i) => !i.skip,
    ).fixture;
    assert.equal(compact.length, full.length);
    const decimals = (v) => (String(v).split('.')[1] ?? '').length;
    compact.forEach((f, n) => {
      const o = full[n];
      assert.equal(f.t, o.t);
      assert.equal(f.landmarks.length, 33);
      assert.equal(f.world.length, 33);
      f.landmarks.forEach((p, i) => {
        if (USED_INDICES.includes(i)) {
          for (const k of ['x', 'y', 'z']) {
            assert.ok(Math.abs(p[k] - o.landmarks[i][k]) <= 5e-4 + 1e-9);
            assert.ok(decimals(p[k]) <= 3);
          }
          assert.ok(Math.abs(p.visibility - o.landmarks[i].visibility) <= 5e-3 + 1e-9);
          assert.ok(decimals(p.visibility) <= 2);
          for (const k of ['x', 'y', 'z']) {
            assert.ok(Math.abs(f.world[i][k] - o.world[i][k]) <= 5e-4 + 1e-9);
          }
        } else {
          assert.deepEqual(p, { x: 0, y: 0, z: 0, visibility: 0 });
          assert.deepEqual(f.world[i], { x: 0, y: 0, z: 0 });
        }
      });
    });
    const ratio = JSON.stringify(compact).length / JSON.stringify(full).length;
    assert.ok(ratio < 0.8, `compact/full size ratio ${ratio.toFixed(2)}`);
  });

  it('rejects other files and bad labels', () => {
    assert.throws(() => parseExport(Buffer.from('{"format":"x"}')), /not a gym-clean/);
    assert.throws(() => planConversion(buildExport(), { label: 'a__b' }), /label/);
    assert.throws(() => planConversion(buildExport(), { label: '../x' }), /label/);
  });
});

// M5c hands-free: one camera frame clock spans two auto-started sets, each with a 1.5 s pre-roll
// before its backdated start, and the session logs autoSet events.
describe('scripts/devlog.mjs, hands-free sets (M5c)', () => {
  const WALL_T0 = Date.UTC(2026, 10, 13, 11, 0); // wall time of frame clock 0
  const CLOCK = [50_000, 200_000]; // where each set's frames sit on the shared frame clock
  const PRE_MS = 1500;
  const NOTE = 'SECRET-FREE-TEXT';

  function handsFreeExport() {
    const sets = CLOCK.map((c, setIndex) => {
      const raw = [{ t: c - 100, landmarks: null }, ...original.map((f) => ({ ...f, t: f.t + c }))];
      const startedAt = WALL_T0 + c + PRE_MS; // backdated start, after the pre-roll frames
      const lastT = original.at(-1).t + c;
      return set(setIndex, {
        startedAt,
        endedAt: WALL_T0 + lastT - 500,
        counted: { reps: 3, partials: 1 },
        logged: { reps: 3, partials: 1 },
        camera: { ...camera('curl', decodeFrames(encodeFrames(raw))), wallT0: WALL_T0 },
      });
    });
    const ev = (t, data) => ({ t, type: 'autoSet', data: { ...data, note: NOTE } });
    const [a, b] = sets;
    return {
      format: 'gym-clean-devlog',
      version: 1,
      exportedAt: WALL_T0 + 400_000,
      sessions: [
        {
          id: 'hf',
          startedAt: SESSION_START,
          appVersion: 'abc123',
          userAgent: SECRET_UA,
          settings: { handsFree: true },
          dayId: 'push-a',
          events: [
            { t: a.startedAt - 30_000, type: 'note', data: NOTE },
            ev(a.startedAt - 800, { action: 'start', reps: 2, partials: 0 }), // clamped start
            ev(a.endedAt - 4000, { action: 'stopPending', reason: 'still' }),
            ev(a.endedAt - 2000, { action: 'stopCancelled', reason: 'undo' }),
            ev(a.endedAt + 6000, { action: 'stopPending', reason: 'still' }),
            ev(a.endedAt + 11_000, { action: 'commit' }),
            ev(b.startedAt + 3000, { action: 'start', reps: 2, partials: 0 }),
            ev(b.endedAt + 3000, { action: 'stopPending', reason: 'away' }),
            ev(b.endedAt + 4000, { action: 'stopCancelled', reason: 'rep' }),
            ev(b.endedAt + 9000, { action: 'stopPending', reason: SECRET_SPEECH }),
            ev(b.endedAt + 14_000, { action: 'commit' }),
            ev(b.endedAt + 200_000, { action: 'close', reason: 'noRep' }),
          ],
          sets,
        },
      ],
    };
  }

  it('writes one fixture per set, pre-roll kept, each rebased to 0, same frames as the source', () => {
    const plan = planConversion(handsFreeExport(), { label: 'hf' });
    const ok = plan.items.filter((i) => !i.skip);
    assert.deepEqual(
      ok.map((i) => i.rel),
      ['curl/hf-1805-s1-0__reps-3__partials-1.json', 'curl/hf-1805-s1-1__reps-3__partials-1.json'],
    );
    for (const it of ok) {
      assert.equal(it.prerollMs, PRE_MS);
      assert.equal(it.fixture.length, original.length);
      it.fixture.forEach((f, n) => {
        const o = original[n];
        assert.ok(Math.abs(f.t - o.t) <= 0.02, `t ${f.t} vs ${o.t}`);
        f.landmarks.forEach((p, j) => {
          for (const k of ['x', 'y', 'z', 'visibility']) {
            assert.ok(Math.abs(p[k] - o.landmarks[j][k]) <= 1e-4 + 1e-9);
          }
        });
      });
    }
  });

  it('reports auto start/stop reasons, undo/rep cancels and the pre-roll; no free text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devlog-hf-'));
    try {
      const file = join(dir, 'hf.json.gz');
      writeFileSync(file, gzipSync(JSON.stringify(handsFreeExport())));
      const stdout = run(file, '--out', join(dir, 'out'), '--label', 'hf', '--compact');
      const rows = stdout.split('\n').filter((l) => l.startsWith('Dumbbell_Bicep_Curl'));
      assert.equal(rows.length, 2);
      assert.match(rows[0], /1\.5s\s+start:auto stop:still undo:1\s+written/);
      // A non-word reason is never printed (shown as "?"), the close lands on the last set.
      assert.match(rows[1], /1\.5s\s+start:auto stop:\? rep:1 close:noRep\s+written/);
      for (const s of [NOTE, SECRET_SPEECH, SECRET_UA]) assert.equal(stdout.includes(s), false, s);
      for (const n of [0, 1]) {
        const text = readFileSync(
          join(dir, `out/curl/hf-1805-s1-${n}__reps-3__partials-1.json`),
          'utf8',
        );
        for (const s of [NOTE, SECRET_SPEECH, SECRET_UA, 'autoSet', 'still']) {
          assert.equal(text.includes(s), false, s);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a set without autoSet events in its session shows "-" (hands-free off)', () => {
    const plan = planConversion(buildExport());
    assert.ok(plan.items.every((i) => i.auto === '-'));
  });
});
