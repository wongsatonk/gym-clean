// npm run devlog -- <export.json[.gz]> [--out fixtures/landmarks] [--label <label>] [--dry-run] [--force]
//
// Turns a developer-log export (M4c, src/data/devlog.ts `exportBlob` / `exportAll`) into
// landmark fixtures for the rep-counter suite:
//   <out>/<folder>/<label>-<HHMM>-s<session#>-<setIndex>__reps-<logged.reps>__partials-<logged.partials>.json
// (<HHMM> = the session's local start time, so two exports of the same day never collide; the
// default label is devlog-<session start date>) one per set that has camera frames, an `endedAt` and `logged` counts. Each file is a
// LandmarkFrame[] ({ t, landmarks, world? }) with no-person frames dropped and t rebased to 0.
//
// Privacy: only pose numbers are written. userAgent, settings, events, speech text and any other
// free text in the export never reach a fixture. The export file itself must stay out of git.
//
// Prints a table with counted vs logged reps/partials per set (the miscount evidence).
// Existing fixtures are kept unless --force. --dry-run writes nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

/**
 * Fixture folders of the exercise rules (src/core/exercises/*.ts `folder`). Kept as a list here
 * because this script runs in plain node; scripts/devlog.test.mjs checks it against the rules.
 */
export const KNOWN_FOLDERS = [
  'curl',
  'push-up',
  'shoulder-press',
  'row',
  'goblet-squat',
  'lateral-raise',
];

const LABEL_RE = /^[a-z0-9][a-z0-9.-]*$/;

const p2 = (n) => String(n).padStart(2, '0');
const dateOf = (ms) => new Date(Number.isFinite(ms) ? ms : Date.now());

/** Default label: `devlog-YYYY-MM-DD` (local date of the given time, normally the session start). */
export function defaultLabel(ms) {
  const d = dateOf(ms);
  return `devlog-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Local `HHMM` of a time stamp (session start), `0000` if missing. */
export function hhmm(ms) {
  if (!Number.isFinite(ms)) return '0000';
  const d = dateOf(ms);
  return `${p2(d.getHours())}${p2(d.getMinutes())}`;
}

/** Parses an export from file bytes (gzip detected by magic bytes, not by name). */
export function parseExport(bytes) {
  const buf = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const data = JSON.parse(Buffer.from(buf).toString('utf8'));
  if (data?.format !== 'gym-clean-devlog') throw new Error('not a gym-clean developer log export');
  if (data.version !== 1) throw new Error(`unsupported devlog export version ${data.version}`);
  if (!Array.isArray(data.sessions)) throw new Error('export has no sessions array');
  return data;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isCount = (c) =>
  c != null &&
  Number.isInteger(c.reps) &&
  c.reps >= 0 &&
  Number.isInteger(c.partials) &&
  c.partials >= 0;

/** Copies only the numeric pose fields of one frame (nothing else from the export survives). */
function cleanFrame(f, t0) {
  const out = {
    t: Math.round((f.t - t0) * 100) / 100,
    landmarks: f.landmarks.map((p) => ({
      x: num(p.x),
      y: num(p.y),
      z: num(p.z),
      visibility: num(p.visibility),
    })),
  };
  if (Array.isArray(f.world) && f.world.length > 0) {
    out.world = f.world.map((p) => ({ x: num(p.x), y: num(p.y), z: num(p.z) }));
  }
  return out;
}

/** Frames per second over the whole set, no-person frames included (they are camera frames too). */
function fpsOf(frames) {
  if (frames.length < 2) return null;
  const span = frames[frames.length - 1].t - frames[0].t;
  return span > 0 ? ((frames.length - 1) * 1000) / span : null;
}

/**
 * Plans the conversion without touching the disk.
 * Returns { label, items: [{ session, exerciseId, setIndex, folder, counted, logged, frames,
 * personFrames, fps, rel, fixture } | { …, skip: reason }] } where `rel` is `<folder>/<file>`.
 */
export function planConversion(exp, opts = {}) {
  const label = opts.label;
  if (label !== undefined && (!LABEL_RE.test(label) || label.includes('__'))) {
    throw new Error(`label "${label}" must be lowercase letters, digits, "." and "-" only`);
  }
  const items = [];
  exp.sessions.forEach((session, si) => {
    const start = session?.startedAt ?? exp.exportedAt;
    const prefix = `${label ?? defaultLabel(start)}-${hhmm(start)}-s${si + 1}`;
    const sets = Array.isArray(session?.sets) ? session.sets : [];
    for (const set of sets) {
      const base = {
        session: si + 1,
        exerciseId: String(set?.exerciseId ?? '?'),
        setIndex: set?.setIndex,
        folder: set?.camera?.folder ?? null,
        counted: isCount(set?.counted) ? set.counted : null,
        logged: isCount(set?.logged) ? set.logged : null,
        frames: Array.isArray(set?.camera?.frames) ? set.camera.frames.length : 0,
        personFrames: 0,
        fps: null,
      };
      const all = Array.isArray(set?.camera?.frames)
        ? set.camera.frames.filter((f) => f && Number.isFinite(f.t))
        : [];
      const person = all.filter((f) => Array.isArray(f.landmarks) && f.landmarks.length > 0);
      base.personFrames = person.length;
      base.fps = fpsOf(all);
      let skip = null;
      if (!set?.camera) skip = 'no camera';
      else if (!Number.isInteger(set.setIndex) || set.setIndex < 0) skip = 'bad setIndex';
      else if (set.endedAt == null) skip = 'set never ended';
      else if (!base.logged) skip = 'no logged counts';
      else if (person.length === 0) skip = 'no pose frames';
      else if (!KNOWN_FOLDERS.includes(base.folder)) skip = `unknown folder "${base.folder}"`;
      if (skip) {
        items.push({ ...base, skip });
        continue;
      }
      const t0 = person[0].t;
      const file = `${prefix}-${set.setIndex}__reps-${base.logged.reps}__partials-${base.logged.partials}.json`;
      items.push({
        ...base,
        rel: `${base.folder}/${file}`,
        fixture: person.map((f) => cleanFrame(f, t0)),
      });
    }
  });
  return { label, items };
}

/** Writes the planned fixtures under `outDir`; returns each item with `status`. */
export function writeFixtures(plan, outDir, { dryRun = false, force = false } = {}) {
  return plan.items.map((it) => {
    if (it.skip) return { ...it, status: `skipped: ${it.skip}` };
    const path = join(outDir, it.rel);
    const exists = existsSync(path);
    if (exists && !force) return { ...it, path, status: 'exists (use --force)' };
    if (dryRun) return { ...it, path, status: exists ? 'would overwrite' : 'would write' };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(it.fixture) + '\n');
    return { ...it, path, status: exists ? 'overwritten' : 'written' };
  });
}

const showPath = (p, cwd) => {
  const rel = relative(cwd, p);
  return rel.startsWith('..') ? p : rel;
};

const fmtCount = (c) => (c ? `${c.reps}/${c.partials}` : '-');

/** Summary table (plain text, fixed width). */
export function formatTable(results, cwd = process.cwd()) {
  const head = [
    'exercise',
    'sess',
    'set',
    'counted',
    'logged',
    'miss',
    'frames',
    'pose',
    'fps',
    'result',
  ];
  const rows = results.map((r) => {
    const miss =
      r.counted && r.logged
        ? r.counted.reps === r.logged.reps && r.counted.partials === r.logged.partials
          ? 'ok'
          : 'MISCOUNT'
        : '-';
    return [
      r.exerciseId,
      String(r.session),
      String(r.setIndex ?? '?'),
      fmtCount(r.counted),
      fmtCount(r.logged),
      miss,
      String(r.frames),
      String(r.personFrames),
      r.fps == null ? '-' : r.fps.toFixed(1),
      r.path ? `${r.status}: ${showPath(r.path, cwd)}` : r.status,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) =>
    cells
      .map((c, i) => c.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

function parseArgs(argv) {
  const opts = {
    out: 'fixtures/landmarks',
    label: undefined,
    dryRun: false,
    force: false,
    input: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--out' || a === '--label') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = v;
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (opts.input) throw new Error('only one export file at a time');
    else opts.input = a;
  }
  if (!opts.input) throw new Error('missing export file');
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`devlog: ${err.message}`);
    console.error(
      'usage: npm run devlog -- <export.json[.gz]> [--out fixtures/landmarks] [--label <label>] [--dry-run] [--force]',
    );
    process.exit(2);
  }
  const exp = parseExport(readFileSync(resolve(opts.input)));
  const plan = planConversion(exp, { label: opts.label });
  const results = writeFixtures(plan, resolve(opts.out), opts);
  console.log(formatTable(results));
  const written = results.filter((r) => ['written', 'overwritten'].includes(r.status)).length;
  const planned = results.filter((r) => r.status.startsWith('would')).length;
  const skipped = results.filter((r) => r.skip).length;
  const kept = results.filter((r) => r.status.startsWith('exists')).length;
  console.log(
    `\n${exp.sessions.length} session(s), ${results.length} set(s): ` +
      (opts.dryRun ? `${planned} would be written` : `${written} written`) +
      `, ${kept} kept (exists), ${skipped} skipped. Label "${plan.label ?? 'devlog-<session date>'}".` +
      (opts.dryRun ? ' Dry run: nothing written.' : ''),
  );
  if (written > 0) {
    console.log("Review before committing — real-gym fixtures need Wongsaton's OK.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`devlog: ${err.message}`);
    process.exit(1);
  });
}
