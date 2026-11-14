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

// M5 task 10: the report lists each set's `focusCue` events (id, rep, value / baseline) and its
// `focusScore`. Shapes from the M5 plan (tasks 11/13): cameraView logs
// logEvent('focusCue', { id, t, reps, value, baseline, threshold }) while the set runs, app.ts logs
// logEvent('focusScore', { score, cues, partials }) when the camera set is saved (after endedAt).
// Event `t` is wall time (recorder default); data.t is the camera frame clock and is not used.
describe('scripts/devlog.mjs, focus cues and score (M5)', () => {
  const WALL_T0 = Date.UTC(2026, 10, 13, 11, 0);
  const CLOCK = [50_000, 200_000];
  const FREE = 'Slow the lowering.';

  function focusExport() {
    const sets = CLOCK.map((c, setIndex) => {
      const lastT = original.at(-1).t + c;
      return set(setIndex, {
        startedAt: WALL_T0 + c,
        endedAt: WALL_T0 + lastT,
        counted: { reps: 3, partials: 1 },
        logged: { reps: 3, partials: 1 },
        camera: {
          ...camera(
            'curl',
            decodeFrames(encodeFrames(original.map((f) => ({ ...f, t: f.t + c })))),
          ),
          wallT0: WALL_T0,
        },
      });
    });
    const [a, b] = sets;
    const cue = (t, data) => ({ t, type: 'focusCue', data });
    return {
      format: 'gym-clean-devlog',
      version: 1,
      exportedAt: WALL_T0 + 400_000,
      sessions: [
        {
          id: 'm5',
          startedAt: SESSION_START,
          appVersion: 'abc123',
          userAgent: SECRET_UA,
          settings: {},
          dayId: 'pull-a',
          events: [
            cue(a.startedAt + 1000, {
              id: 'rushedLowering',
              t: 51_000,
              reps: 2,
              value: 0.6234,
              baseline: 2.01,
              threshold: 0.6,
            }),
            cue(a.startedAt + 2000, {
              id: 'stalled',
              t: 52_000,
              reps: 3,
              value: 5000,
              baseline: null,
              threshold: 5000,
            }),
            // Free text where an id belongs, and a text field: never printed.
            cue(a.startedAt + 2500, { id: FREE, reps: 3, value: 1, baseline: 1, text: FREE }),
            {
              t: a.endedAt + 11_000,
              type: 'focusScore',
              data: { score: 85, cues: 2, partials: 1 },
            },
            cue(b.startedAt + 1500, {
              id: 'shrinkingRange',
              t: 201_500,
              reps: 2,
              value: 'x',
              baseline: 90,
              threshold: 0.8,
            }),
            // Logged twice (e.g. a re-save): the last one wins.
            { t: b.endedAt + 5000, type: 'focusScore', data: { score: 90, cues: 1, partials: 0 } },
            { t: b.endedAt + 9000, type: 'focusScore', data: { score: 95, cues: 1, partials: 0 } },
          ],
          sets,
        },
      ],
    };
  }

  it('assigns cues by set start and the score by set end', () => {
    const plan = planConversion(focusExport(), { label: 'm5' });
    const [a, b] = plan.items;
    assert.deepEqual(
      a.focus.cues.map((c) => [c.id, c.reps]),
      [
        ['rushedLowering', 2],
        ['stalled', 3],
        [null, 3],
      ],
    );
    assert.deepEqual(a.focus.score, { score: 85, cues: 2, partials: 1 });
    assert.deepEqual(
      b.focus.cues.map((c) => [c.id, c.value, c.baseline]),
      [['shrinkingRange', null, 90]],
    );
    assert.deepEqual(b.focus.score, { score: 95, cues: 1, partials: 0 });
    // Never in a fixture.
    for (const it of plan.items) {
      const text = JSON.stringify(it.fixture);
      for (const s of ['rushedLowering', 'focus', FREE]) assert.equal(text.includes(s), false, s);
    }
  });

  it('prints the score column and one line per cue; ids and numbers only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devlog-m5-'));
    try {
      const file = join(dir, 'm5.json.gz');
      writeFileSync(file, gzipSync(JSON.stringify(focusExport())));
      const stdout = run(file, '--out', join(dir, 'out'), '--label', 'm5', '--dry-run');
      const rows = stdout.split('\n').filter((l) => /^Dumbbell_Bicep_Curl\s.*would write/.test(l));
      assert.equal(rows.length, 2);
      assert.match(rows[0], /\s85\s+0\.0s\s+-\s+would write/);
      assert.match(rows[1], /\s95\s+0\.0s\s+-\s+would write/);
      assert.match(stdout, /Focus cues:/);
      assert.match(stdout, /Dumbbell_Bicep_Curl s1 set 0: score 85 \(2 cues, 1 partial\)/);
      assert.match(stdout, /rep 2\s+rushedLowering\s+0\.62 \/ 2\.01\s+threshold 0\.6/);
      assert.match(stdout, /rep 3\s+stalled\s+5000 \/ -\s+threshold 5000/);
      assert.match(stdout, /rep 3\s+\?\s+1 \/ 1/);
      assert.match(stdout, /Dumbbell_Bicep_Curl s1 set 1: score 95 \(1 cue, 0 partials\)/);
      assert.match(stdout, /rep 2\s+shrinkingRange\s+- \/ 90\s+threshold 0\.8/);
      for (const s of [FREE, SECRET_UA, 'lowering.']) assert.equal(stdout.includes(s), false, s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('no focus events: score column "-" and no focus section', () => {
    const plan = planConversion(buildExport());
    assert.ok(plan.items.every((i) => i.focus.cues.length === 0 && i.focus.score === null));
    const dir = mkdtempSync(join(tmpdir(), 'devlog-m5none-'));
    try {
      const file = join(dir, 'x.json');
      writeFileSync(file, JSON.stringify(buildExport()));
      const stdout = run(file, '--out', join(dir, 'out'), '--dry-run');
      assert.equal(stdout.includes('Focus cues:'), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// M5c follow-up B8: a set with a hold ("tap to continue"). Event shapes from the plan (B1/B5),
// logged by cameraView's logAuto like the other autoSet actions — event `t` is wall time, `ft`
// the camera frame clock:
//   { action: 'hold', reason: 'posture' | 'bodyLine' | 'away', reps, partials, ft, endedAtFt }
//     (endedAtFt = end of the last rep; the break clock runs from there)
//   { action: 'holdEnded', how: 'continue', ft }              Continue set
//   { action: 'commit', reps, partials, ft, endedAtFt }       Start next set / Save set / confirm /
//                                                               idle (backdated endedAt)
// "next" vs "save": after Start next set the app dispatches START_SET right after the commit, so
// another set of the session starts at the commit's time; Save set (last set) starts none.
// A set held then continued is ONE devlog set and must convert to ONE fixture with all its reps.
describe('scripts/devlog.mjs, a set with a hold (M5c B8)', () => {
  const WALL_T0 = Date.UTC(2026, 10, 13, 11, 0);
  const SPAN = original.at(-1).t; // one copy of the curl clip: 3 reps, 1 partial
  const BREAK_MS = 16_000;

  /** Frames of `copies` back-to-back clips at frame-clock `c`, a break between each pair. */
  function heldFrames(c, { copies = 2, seated = true } = {}) {
    const out = [{ t: c - 100, landmarks: null }];
    for (let k = 0; k < copies; k++) {
      const off = c + k * (SPAN + BREAK_MS);
      out.push(...original.map((f) => ({ ...f, t: f.t + off })));
      if (k < copies - 1) {
        // The break: the person sits still in frame (posture/bodyLine) or leaves (away).
        for (let t = 33; t < BREAK_MS; t += 33) {
          out.push(
            seated
              ? { ...original.at(-1), t: off + SPAN + t }
              : { t: off + SPAN + t, landmarks: null },
          );
        }
      }
    }
    return decodeFrames(encodeFrames(out));
  }

  const ev = (t, data) => ({ t, type: 'autoSet', data: { ...data, note: SECRET_SPEECH } });

  function holdExport() {
    // Session 1: 3 reps, a 16 s seated break (bodyLine hold at 5 s), Continue, 3 more reps, still stop.
    const c1 = 50_000;
    const held = set(0, {
      startedAt: WALL_T0 + c1,
      endedAt: WALL_T0 + c1 + 2 * SPAN + BREAK_MS,
      counted: { reps: 6, partials: 2 },
      logged: { reps: 6, partials: 2 },
      camera: { ...camera('curl', heldFrames(c1)), wallT0: WALL_T0 },
    });
    const lastRep1 = c1 + SPAN; // frame clock of the end of rep 3
    const s1Events = [
      ev(WALL_T0 + lastRep1 + 5000, {
        action: 'hold',
        reason: 'bodyLine',
        reps: 3,
        partials: 1,
        ft: lastRep1 + 5000,
        endedAtFt: lastRep1,
      }),
      ev(WALL_T0 + lastRep1 + BREAK_MS, {
        action: 'holdEnded',
        how: 'continue',
        ft: lastRep1 + BREAK_MS,
      }),
      ev(held.endedAt + 6000, { action: 'stopPending', reason: 'still', reps: 6, partials: 2 }),
      ev(held.endedAt + 11_000, { action: 'commit', reps: 6, partials: 2 }),
    ];

    // Session 2: set 0 held (away) → Start next set; set 1 held (non-word reason) → Save set.
    const c2 = [100_000, 300_000];
    const sets2 = c2.map((c, i) =>
      set(i, {
        startedAt: WALL_T0 + c,
        endedAt: WALL_T0 + c + SPAN, // backdated to the end of the last rep
        counted: { reps: 3, partials: 1 },
        logged: { reps: 3, partials: 1 },
        camera: { ...camera('curl', heldFrames(c, { copies: 1 })), wallT0: WALL_T0 },
      }),
    );
    const b = sets2[1];
    const aLast = c2[0] + SPAN;
    const s2Events = [
      ev(WALL_T0 + aLast + 3000, {
        action: 'hold',
        reason: 'away',
        reps: 3,
        partials: 1,
        ft: aLast + 3000,
        endedAtFt: aLast,
      }),
      // Start next set tapped 12 s after the last rep: commit, then START_SET at once.
      ev(WALL_T0 + aLast + 12_000, {
        action: 'commit',
        reps: 3,
        partials: 1,
        ft: aLast + 12_000,
        endedAtFt: aLast,
      }),
      // No ft on these two: the clock falls back to wall time.
      ev(b.endedAt + 5000, { action: 'hold', reason: SECRET_SPEECH, reps: 3, partials: 1 }),
      ev(b.endedAt + 25_000, { action: 'commit', reps: 3, partials: 1 }),
      ev(b.endedAt + 200_000, { action: 'close', reason: 'noRep' }),
    ];
    b.startedAt = WALL_T0 + aLast + 12_000 + 300; // START_SET right after the commit

    const session = (id, events, sets) => ({
      id,
      startedAt: SESSION_START,
      appVersion: 'abc123',
      userAgent: SECRET_UA,
      settings: { handsFree: true },
      dayId: 'pull-a',
      events,
      sets,
    });
    return {
      format: 'gym-clean-devlog',
      version: 1,
      exportedAt: WALL_T0 + 900_000,
      sessions: [session('s1', s1Events, [held]), session('s2', s2Events, sets2)],
    };
  }

  /** The real rep counter (src/core, extensionless imports) loaded in plain node. */
  async function realCounter() {
    const { registerHooks } = await import('node:module');
    registerHooks({
      resolve(spec, ctx, next) {
        try {
          return next(spec, ctx);
        } catch (err) {
          if (!spec.startsWith('.')) throw err;
          try {
            return next(`${spec}.ts`, ctx);
          } catch {
            return next(`${spec}/index.ts`, ctx);
          }
        }
      },
    });
    const { createRepCounter } = await import('../src/core/repCounter.ts');
    const { ruleForFolder } = await import('../src/core/exercises/index.ts');
    return (folder, frames) => {
      const counter = createRepCounter(ruleForFolder(folder));
      for (const f of frames) counter.push(f);
      return { reps: counter.reps, partials: counter.partials };
    };
  }

  it('a held-then-continued set converts to ONE fixture with both halves, counted 6/2', async () => {
    const plan = planConversion(holdExport(), { label: 'hold' });
    const s1 = plan.items.filter((i) => i.session === 1);
    assert.equal(s1.length, 1);
    const [it] = s1;
    assert.equal(it.skip, undefined);
    assert.equal(it.rel, 'curl/hold-1805-s1-0__reps-6__partials-2.json');
    // Both clips plus the seated break frames (the person stays in frame), rebased to 0.
    assert.equal(it.fixture[0].t, 0);
    assert.ok(it.fixture.length > 2 * original.length, `${it.fixture.length} frames`);
    assert.ok(it.fixture.at(-1).t >= 2 * SPAN + BREAK_MS - 1);
    // The suite's rule: the fixture's name says 6/2 and the real counter agrees.
    const count = await realCounter();
    assert.deepEqual(count('curl', it.fixture), { reps: 6, partials: 2 });
    // An away break drops the no-person frames but the time gap stays: still 3/1 per half.
    const away = heldFrames(0, { seated: false }).filter((f) => f.landmarks?.length);
    assert.deepEqual(count('curl', away), { reps: 6, partials: 2 });
  });

  it('reports hold:<reason> <sec> → continue | next | save; enum words and numbers only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devlog-hold-'));
    try {
      const file = join(dir, 'hold.json.gz');
      writeFileSync(file, gzipSync(JSON.stringify(holdExport())));
      const stdout = run(file, '--out', join(dir, 'out'), '--label', 'hold', '--dry-run');
      const rows = stdout.split('\n').filter((l) => l.startsWith('Dumbbell_Bicep_Curl'));
      assert.equal(rows.length, 3);
      // Continue: the break clock runs from the last rep (frame clock), then the still stop.
      assert.match(rows[0], /start:tap stop:still hold:bodyLine 16\.0s → continue\s+would write/);
      assert.match(rows[0], /hold-1805-s1-0__reps-6__partials-2\.json/);
      // Start next set: the commit belongs to the held set (not the set it started), stop:hold.
      assert.match(rows[1], /start:tap stop:hold hold:away 12\.0s → next\s+would write/);
      // Save set (no set starts after it); a non-word reason prints "?"; wall-clock fallback.
      assert.match(rows[2], /start:tap stop:hold hold:\? 20\.0s → save close:noRep\s+would write/);
      assert.match(stdout, /3 would be written/);
      for (const s of [SECRET_SPEECH, SECRET_UA]) assert.equal(stdout.includes(s), false, s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a hold with no resolution yet shows → ?', () => {
    const exp = holdExport();
    exp.sessions[0].events = exp.sessions[0].events.slice(0, 1); // hold only
    const it = planConversion(exp).items.find((i) => i.session === 1);
    assert.match(it.auto, /hold:bodyLine \S+ → \?/);
  });
});
