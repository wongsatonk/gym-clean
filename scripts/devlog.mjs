// npm run devlog -- <export.json[.gz]> [--out fixtures/landmarks] [--label <label>] [--dry-run] [--force] [--compact]
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
// Prints a table with counted vs logged reps/partials per set (the miscount evidence), the
// pre-roll before the set's start and, for hands-free sets (M5c), the auto start/stop reasons.
// M5: a "focus" column with the set's focusScore, then a "Focus cues:" section with each
// focusCue event (rep, id, value / baseline, threshold). Only enum ids and numbers are printed.
//
// M5c: the camera can stay open across several sets, so one frame clock spans them; each set is
// rebased on its own first person frame. An auto-started set's frames begin before its
// (backdated) start: that pre-roll is kept in the fixture (the counter must see the starting reps)
// and shown in the "pre" column. Its length needs `camera.wallT0` (wall time of frame clock 0).
// M5c B8: a set put on hold (a break inside the set) and continued is one devlog set, so one
// fixture with all its reps. The auto column adds "hold:<reason> <sec> → continue|next|save".
// Existing fixtures are kept unless --force. --dry-run writes nothing.
// --compact makes fixtures small enough to commit (~5x smaller): coordinates at 3 decimals,
// visibility at 2, and landmarks src/core never reads (see USED_INDICES) zeroed in place.
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

/**
 * Landmark indices src/core reads (BlazePose topology): shoulders 11/12, elbows 13/14,
 * wrists 15/16, hips 23/24, knees 25/26, ankles 27/28. Sources: exercises/triplets.ts (ELBOW,
 * KNEE, SHOULDER) and the press extendedGate (wrist/shoulder), angles.ts (torso lean and
 * shoulder-line yaw: shoulders + hips; hipAngleDeg: shoulders, hips, knees), aspect.ts
 * (shoulders, elbows, wrists, hips). repCounter only goes through those. If src/core starts
 * reading another landmark, add it here and re-run with --compact.
 */
export const USED_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const USED = new Set(USED_INDICES);

const round = (v, d) => {
  const n = num(v);
  const k = 10 ** d;
  return Math.round(n * k) / k || 0; // `|| 0` turns -0 into 0
};

/**
 * Copies only the numeric pose fields of one frame (nothing else from the export survives).
 * `compact`: x/y/z at 3 decimals, visibility at 2, and every landmark src/core never reads
 * replaced by a zero placeholder (visibility 0), keeping all indices in place.
 */
function cleanFrame(f, t0, compact = false) {
  const keep = (i) => !compact || USED.has(i);
  const c = (v, d) => (compact ? round(v, d) : num(v));
  const out = {
    t: Math.round((f.t - t0) * 100) / 100,
    landmarks: f.landmarks.map((p, i) =>
      keep(i)
        ? { x: c(p.x, 3), y: c(p.y, 3), z: c(p.z, 3), visibility: c(p.visibility, 2) }
        : { x: 0, y: 0, z: 0, visibility: 0 },
    ),
  };
  if (Array.isArray(f.world) && f.world.length > 0) {
    out.world = f.world.map((p, i) =>
      keep(i) ? { x: c(p.x, 3), y: c(p.y, 3), z: c(p.z, 3) } : { x: 0, y: 0, z: 0 },
    );
  }
  return out;
}

/** Frames per second over the whole set, no-person frames included (they are camera frames too). */
function fpsOf(frames) {
  if (frames.length < 2) return null;
  const span = frames[frames.length - 1].t - frames[0].t;
  return span > 0 ? ((frames.length - 1) * 1000) / span : null;
}

const AUTO_ACTIONS = new Set([
  'start',
  'stopPending',
  'stopCancelled',
  'commit',
  'close',
  'hold',
  'holdEnded',
]);
const WORD = /^[A-Za-z]{1,24}$/; // reasons are enum words; anything else is never printed
/** An auto event logged just before its set's backdated/clamped start still belongs to it. */
const AUTO_EVENT_SLACK_MS = 2000;
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * `autoSet` session events as { t, action, reason, how, ft, endedAtFt } (enum words and numbers
 * only, nothing else kept). `ft` / `endedAtFt` are the camera frame clock (cameraView logAuto).
 */
function autoEventsOf(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  return events
    .filter((e) => e?.type === 'autoSet' && Number.isFinite(e.t) && e.data)
    .map((e) => ({
      t: e.t,
      action: e.data.action,
      reason: WORD.test(e.data.reason ?? '') ? e.data.reason : null,
      how: WORD.test(e.data.how ?? '') ? e.data.how : null,
      ft: numOrNull(e.data.ft),
      endedAtFt: numOrNull(e.data.endedAtFt),
    }))
    .filter((e) => AUTO_ACTIONS.has(e.action))
    .sort((a, b) => a.t - b.t);
}

/**
 * M5c B8: how a `hold` ended and how long the break was. The first `holdEnded` / `commit` /
 * `close` after it in the session ends it: holdEnded → its `how` (Continue set), a commit →
 * "next" when another set of the session starts at the commit (Start next set: START_SET right
 * after it), else "save" (Save set, Set done, Close, idle limits). The break clock runs from
 * the end of the last rep (`endedAtFt`) on the frame clock, else from the hold, else wall time.
 * Returns "hold:<reason> <sec>s → continue|next|save|?".
 */
function holdSummary(hold, autoEvents, setStarts) {
  const end = autoEvents.find(
    (e) => e.t >= hold.t && e !== hold && ['holdEnded', 'commit', 'close'].includes(e.action),
  );
  let how = '?';
  if (end?.action === 'holdEnded') how = end.how ?? 'continue';
  else if (end) {
    const next = setStarts.some((st) => st > hold.t && Math.abs(st - end.t) <= AUTO_EVENT_SLACK_MS);
    how = end.action === 'commit' && next ? 'next' : 'save';
  }
  let ms = null;
  if (end && end.ft != null && (hold.endedAtFt ?? hold.ft) != null) {
    ms = end.ft - (hold.endedAtFt ?? hold.ft);
  } else if (end) ms = end.t - hold.t;
  const sec = ms == null || ms < 0 ? '?' : `${(ms / 1000).toFixed(1)}s`;
  return `hold:${hold.reason ?? '?'} ${sec} → ${how}`;
}

/**
 * One-line summary of a set's auto actions, e.g. "start:auto stop:still undo:1", or with a
 * break "start:tap stop:hold hold:away 12.0s → next". Events go to the set with the latest
 * start ≤ t + slack, except a commit, which goes to the set with the latest end ≤ t + slack
 * (after Start next set the commit lands at the next set's start, but it saves the held one).
 * '-' when the session logged no autoSet events (hands-free off).
 */
function autoSummary(autoEvents, setStarts, setEnds, set) {
  if (autoEvents.length === 0 || !Number.isFinite(set?.startedAt)) return '-';
  const mine = autoEvents.filter((e) =>
    e.action === 'commit' && setEnds.length > 0
      ? ownerAt(setEnds, e.t) === set.endedAt
      : ownerAt(setStarts, e.t) === set.startedAt,
  );
  const started = mine.some((e) => e.action === 'start');
  const commitAt = mine.findIndex((e) => e.action === 'commit');
  const beforeCommit = mine.slice(0, commitAt < 0 ? mine.length : commitAt);
  const lastStop = beforeCommit
    .filter((e) => e.action === 'stopPending' || e.action === 'hold')
    .at(-1);
  const stop =
    commitAt >= 0
      ? lastStop
        ? lastStop.action === 'hold'
          ? 'hold'
          : (lastStop.reason ?? '?')
        : 'auto'
      : set.endedAt != null
        ? 'tap'
        : '-';
  const cancels = (why) =>
    mine.filter((e) => e.action === 'stopCancelled' && e.reason === why).length;
  const parts = [`start:${started ? 'auto' : 'tap'}`, `stop:${stop}`];
  if (cancels('undo')) parts.push(`undo:${cancels('undo')}`);
  if (cancels('rep')) parts.push(`rep:${cancels('rep')}`);
  for (const h of mine.filter((e) => e.action === 'hold')) {
    parts.push(holdSummary(h, autoEvents, setStarts));
  }
  const close = mine.find((e) => e.action === 'close');
  if (close) parts.push(`close:${close.reason ?? '?'}`);
  return parts.join(' ');
}

/** A finite number or null (focus event fields; anything else is never printed). */
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const CUE_ID = /^[A-Za-z]{1,32}$/; // FocusCueId enum words; free text never passes

/**
 * M5 `focusCue` / `focusScore` session events, numbers and enum ids only. A cue goes to the set
 * with the latest start ≤ t + slack (it fires while the set runs); a score goes to the set with
 * the latest end ≤ t + slack (app.ts logs it when the camera set is saved, after `endedAt`).
 * The cue's own data.t (camera frame clock) is not needed: the event t is wall time.
 */
function focusEventsOf(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const ok = (type) =>
    events
      .filter(
        (e) => e?.type === type && Number.isFinite(e.t) && e.data && typeof e.data === 'object',
      )
      .sort((a, b) => a.t - b.t);
  return {
    cues: ok('focusCue').map((e) => ({
      t: e.t,
      id: typeof e.data.id === 'string' && CUE_ID.test(e.data.id) ? e.data.id : null,
      reps: finite(e.data.reps),
      value: finite(e.data.value),
      baseline: finite(e.data.baseline),
      threshold: finite(e.data.threshold),
    })),
    scores: ok('focusScore').map((e) => ({
      t: e.t,
      score: finite(e.data.score),
      cues: finite(e.data.cues),
      partials: finite(e.data.partials),
    })),
  };
}

/** The latest of `times` ≤ t + slack, or null. */
function ownerAt(times, t) {
  let owner = null;
  for (const x of times) if (x <= t + AUTO_EVENT_SLACK_MS) owner = x;
  return owner;
}

/** { cues: [{ id, reps, value, baseline, threshold }], score: { score, cues, partials } | null } */
function focusOf(focusEvents, setStarts, setEnds, set) {
  const strip = (e) => {
    const out = { ...e };
    delete out.t; // wall time, only used to find the owning set
    return out;
  };
  const cues = Number.isFinite(set?.startedAt)
    ? focusEvents.cues.filter((c) => ownerAt(setStarts, c.t) === set.startedAt).map(strip)
    : [];
  const scores = Number.isFinite(set?.endedAt)
    ? focusEvents.scores.filter((s) => ownerAt(setEnds, s.t) === set.endedAt)
    : [];
  return { cues, score: scores.length ? strip(scores.at(-1)) : null };
}

/**
 * Plans the conversion without touching the disk.
 * Returns { label, items: [{ session, exerciseId, setIndex, folder, counted, logged, frames,
 * personFrames, fps, prerollMs, auto, focus, rel, fixture } | { …, skip: reason }] } where `rel`
 * is `<folder>/<file>`. `focus` (M5) is report-only and never reaches a fixture.
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
    const autoEvents = autoEventsOf(session);
    const focusEvents = focusEventsOf(session);
    const setStarts = sets
      .map((x) => x?.startedAt)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const setEnds = sets
      .map((x) => x?.endedAt)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
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
        prerollMs: null,
        auto: autoSummary(autoEvents, setStarts, setEnds, set),
        focus: focusOf(focusEvents, setStarts, setEnds, set),
      };
      // Frame-clock times (one clock may span several sets): sort, never assume t starts near 0.
      const all = Array.isArray(set?.camera?.frames)
        ? set.camera.frames.filter((f) => f && Number.isFinite(f.t)).sort((a, b) => a.t - b.t)
        : [];
      const person = all.filter((f) => Array.isArray(f.landmarks) && f.landmarks.length > 0);
      base.personFrames = person.length;
      base.fps = fpsOf(all);
      const wallT0 = set?.camera?.wallT0;
      if (person.length > 0 && Number.isFinite(wallT0) && Number.isFinite(set.startedAt)) {
        base.prerollMs = Math.max(0, set.startedAt - wallT0 - person[0].t);
      }
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
        fixture: person.map((f) => cleanFrame(f, t0, opts.compact === true)),
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
/** Up to 2 decimals, '-' for null. */
const fmtNum = (v) => (v == null ? '-' : String(Math.round(v * 100) / 100));
const plural = (n, word) => `${fmtNum(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * M5: per set with focus events, its score and one line per `focusCue` (rep, id,
 * value / baseline, threshold). Empty string when no set has any.
 */
export function formatFocus(results) {
  const lines = [];
  for (const r of results) {
    const f = r.focus;
    if (!f || (f.cues.length === 0 && !f.score)) continue;
    const s = f.score;
    const score = s
      ? `score ${fmtNum(s.score)} (${plural(s.cues, 'cue')}, ${plural(s.partials, 'partial')})`
      : 'no score';
    lines.push(`${r.exerciseId} s${r.session} set ${r.setIndex ?? '?'}: ${score}`);
    for (const c of f.cues) {
      const parts = [
        `rep ${fmtNum(c.reps)}`,
        c.id ?? '?',
        `${fmtNum(c.value)} / ${fmtNum(c.baseline)}`,
      ];
      if (c.threshold != null) parts.push(`threshold ${fmtNum(c.threshold)}`);
      lines.push(`  ${parts.join('  ')}`);
    }
  }
  return lines.length ? ['Focus cues:', ...lines].join('\n') : '';
}

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
    'focus',
    'pre',
    'auto',
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
      r.focus?.score?.score == null ? '-' : fmtNum(r.focus.score.score),
      r.prerollMs == null ? '-' : `${(r.prerollMs / 1000).toFixed(1)}s`,
      r.auto ?? '-',
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
    compact: false,
    input: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--compact') opts.compact = true;
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
      'usage: npm run devlog -- <export.json[.gz]> [--out fixtures/landmarks] [--label <label>] [--dry-run] [--force] [--compact]',
    );
    process.exit(2);
  }
  const exp = parseExport(readFileSync(resolve(opts.input)));
  const plan = planConversion(exp, { label: opts.label, compact: opts.compact });
  const results = writeFixtures(plan, resolve(opts.out), opts);
  console.log(formatTable(results));
  const focus = formatFocus(results);
  if (focus) console.log(`\n${focus}`);
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
