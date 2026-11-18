// Replays the real lateral-raise clips (Push A, 2026-11-13) through the REAL rep counter and the
// hands-free state machine, frame by frame, the way the camera view feeds them. Then the M5c
// follow-up acceptance replay: a synthetic head-on push-up rest-pause set (6 reps, a 16 s sit,
// 5 reps) built like the real one.
import { describe, expect, it } from 'vitest';
import {
  AUTO_SET_DEFAULTS,
  createAutoSet,
  personInFrame,
  type AutoSet,
  type AutoSetAction,
} from './autoSet';
import { ruleFor } from './exercises';
import { createRepCounter, type RepCounter } from './repCounter';
import { curve, sample, withHip, type Keys } from './testkit/frames';
import type { LandmarkFrame, RepEvent } from './types';

const CLIPS = import.meta.glob<LandmarkFrame[]>(
  '../../fixtures/landmarks/lateral-raise/real-2026-11-13-s1-*.json',
  { eager: true, import: 'default' },
);

const clips = Object.entries(CLIPS)
  .map(([path, frames]) => ({ name: path.replace(/^.*\//, ''), frames }))
  .sort((a, b) => a.name.localeCompare(b.name));

type Logged = { t: number; action: AutoSetAction };
type Run = { log: Logged[]; events: RepEvent[]; counter: RepCounter; auto: AutoSet };

function counter(): RepCounter {
  const rule = ruleFor('Side_Lateral_Raise');
  if (!rule) throw new Error('no Side_Lateral_Raise rule');
  return createRepCounter(rule);
}

function replay(
  frames: readonly LandmarkFrame[],
  session: 'exercise' | 'rest',
  run: Run = { log: [], events: [], counter: counter(), auto: createAutoSet(AUTO_SET_DEFAULTS) },
): Run {
  const first = frames[0];
  if (first && run.log.length === 0 && run.events.length === 0)
    run.auto.setSession({ phase: session, paused: false, restElapsedMs: 60000 }, first.t);
  for (const f of frames) {
    const events = run.counter.push(f);
    run.events.push(...events);
    const actions = run.auto.push({
      t: f.t,
      tracking: run.counter.tracking,
      present: personInFrame(f),
      phase: run.counter.phase,
      angle: run.counter.angle,
      events,
    });
    for (const action of actions) run.log.push({ t: f.t, action });
  }
  return run;
}

/** `ms` more frames at 30 fps after the clip: the last frame held, or an empty scene. */
function tail(frames: readonly LandmarkFrame[], ms: number, kind: 'hold' | 'empty') {
  const last = frames[frames.length - 1];
  if (!last) throw new Error('empty clip');
  const out: LandmarkFrame[] = [];
  for (let dt = 1000 / 30; dt <= ms; dt += 1000 / 30) {
    const landmarks =
      kind === 'hold' ? last.landmarks : last.landmarks.map((l) => ({ ...l, visibility: 0 }));
    out.push({ t: last.t + dt, landmarks });
  }
  return out;
}

/**
 * Empty scene appended at the clip's end (4.3–6.0 s after rep 20): which action comes first, and
 * when (s after rep 20). Clips 0 and 3: a still stop (their still timer runs out before 3 s
 * away); clips 1 and 2: away, 3 s after the last person frame, which is a break (hold) since the
 * M5c follow-up, not a stop.
 */
const OUT_OF_FRAME: Record<string, { reason: 'still' | 'away'; afterRep20Sec: number }> = {
  'real-2026-11-13-s1-0': { reason: 'still', afterRep20Sec: 6.0 },
  'real-2026-11-13-s1-1': { reason: 'away', afterRep20Sec: 7.43 },
  'real-2026-11-13-s1-2': { reason: 'away', afterRep20Sec: 8.27 },
  'real-2026-11-13-s1-3': { reason: 'still', afterRep20Sec: 8.87 },
};

const reps = (run: Run) => run.events.filter((e) => e.type === 'rep');

describe('autoSet on the real lateral-raise clips (real counter)', () => {
  it('finds the four clips', () => {
    expect(clips.map((c) => c.name)).toHaveLength(4);
  });

  for (const clip of clips) {
    describe(clip.name, () => {
      it('as a running set: 20 reps, no stop before the last rep; the clip ends before 6 s still', () => {
        const run = replay(clip.frames, 'exercise');
        const all = reps(run);
        expect(all).toHaveLength(20);
        expect(run.auto.counts.reps).toBe(20);
        const lastRep = all[all.length - 1];
        if (!lastRep) throw new Error('no reps');
        expect(run.log.filter((l) => l.t <= lastRep.t)).toEqual([]);
        // Every clip ends ≤ 6 s after rep 20 (the recording was stopped): no action yet.
        expect(run.log).toEqual([]);
        expect(run.auto.state).toBe('set');
      });

      it('held still past the clip end: still stop with 20 reps, ended at rep 20', () => {
        const run = replay(clip.frames, 'exercise');
        const lastRep = reps(run)[19];
        if (!lastRep) throw new Error('no rep 20');
        replay(tail(clip.frames, 12000, 'hold'), 'exercise', run);
        expect(run.log.map((l) => l.action.type)).toEqual(['stopPending', 'commit']);
        const [stop, commit] = run.log;
        expect(stop?.action).toMatchObject({ reason: 'still', reps: 20, endedAt: lastRep.t });
        expect(stop?.t).toBeGreaterThanOrEqual(lastRep.t + 6000);
        expect(stop?.t).toBeLessThan(lastRep.t + 12000);
        expect(commit?.action).toMatchObject({ endedAt: lastRep.t, reps: 20 });
        expect(commit?.t).toBeGreaterThanOrEqual((stop?.t ?? 0) + 5000);
      });

      it('walking out of frame after the clip: the expected stop / hold and time', () => {
        const expected = OUT_OF_FRAME[clip.name.replace(/__.*$/, '')];
        if (!expected) throw new Error(`no expectation for ${clip.name}`);
        const run = replay(clip.frames, 'exercise');
        const lastRep = reps(run)[19];
        if (!lastRep) throw new Error('no rep 20');
        const end = clip.frames[clip.frames.length - 1]?.t ?? 0;
        replay(tail(clip.frames, 3500, 'empty'), 'exercise', run);
        const type = expected.reason === 'away' ? 'hold' : 'stopPending';
        expect(run.log.map((l) => l.action.type)).toEqual([type]);
        const stop = run.log[0];
        expect(stop?.action).toMatchObject({
          reason: expected.reason,
          reps: 20,
          endedAt: lastRep.t,
        });
        const after = ((stop?.t ?? 0) - lastRep.t) / 1000;
        expect(after).toBeGreaterThanOrEqual(expected.afterRep20Sec - 0.25);
        expect(after).toBeLessThanOrEqual(expected.afterRep20Sec + 0.25);
        // Away = 3 s after the last frame with a person (the clip's end).
        if (expected.reason === 'away') expect(stop?.t).toBeGreaterThanOrEqual(end + 3000 - 40);
        else expect(stop?.t).toBeLessThan(end + 3000);
      });

      it('in rest before the first rep: no false start', () => {
        const full = replay(clip.frames, 'exercise');
        const first = reps(full)[0];
        if (!first) throw new Error('no reps');
        const before = clip.frames.filter(
          (f) => f.t < first.t - first.eccentricMs - first.concentricMs - 300,
        );
        expect(before.length).toBeGreaterThan(30);
        const run = replay(before, 'rest');
        expect(run.log).toEqual([]);
      });

      it('in rest over the whole clip: starts on rep 2, backdated before rep 1', () => {
        const run = replay(clip.frames, 'rest');
        const [r1, r2] = reps(run);
        if (!r1 || !r2) throw new Error('no reps');
        const start = run.log[0];
        expect(start?.t).toBe(r2.t);
        expect(start?.action).toMatchObject({ type: 'start', reps: 2 });
        if (start?.action.type !== 'start') return;
        expect(start.action.at).toBeLessThan(r1.t - 500);
        expect(start.action.at).toBeGreaterThan(r1.t - 5000);
        expect(run.auto.counts.reps).toBe(20);
        expect(run.log.map((l) => l.action.type)).toEqual(['start']);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// M5c follow-up acceptance: push-up rest-pause, head-on (front variant), through the real counter.
// Timeline from the M5c tasks 5–6 Decision (the real set): 6 push-ups, a 16 s sit-down (the body
// line fails, the person stays in frame), 5 push-ups, then still in the plank.
// ---------------------------------------------------------------------------------------------

describe('push-up rest-pause (synthetic front variant, real counter + autoSet)', () => {
  const PUSHUP = ruleFor('Pushups');
  if (!PUSHUP) throw new Error('no Pushups rule');
  const pushup = PUSHUP;

  const TOP = 165;
  /** What a head-on camera measures at the bottom of a full push-up. */
  const BOTTOM = 110;
  const PLANK_HIP = 175;
  const SIT_HIP = 45;

  /** n push-ups from the top: 700 ms down, 200 ms at the bottom, 700 ms up, then `restMs`. */
  function pushups(n: number, restMs = 500): [number, number][] {
    const segs: [number, number][] = [];
    for (let i = 0; i < n; i++)
      segs.push([700, BOTTOM], [200, BOTTOM], [700, TOP], [i < n - 1 ? 500 : restMs, TOP]);
    return segs;
  }

  /** Elbow bends while sitting (arms on the knees, getting up): reps/partials if they counted. */
  const SIT_SEGS: [number, number][] = [
    [3000, TOP],
    [700, 120],
    [700, TOP],
    [4000, TOP],
    [700, 105],
    [300, 105],
    [700, TOP],
    [5900, TOP],
  ];
  /** Time at the top after rep 6 that the counter reads as a 5.7 s pause (rep 6 → leaving top). */
  const PAUSE_TOP_MS = 4670;

  type Timeline = { frames: LandmarkFrame[]; sitAt: number; backAt: number };

  /**
   * 6 push-ups, then `between`: a sit of SIT_MS and 1.5 s back in the plank before the next
   * push-up, or `topMs` at the top in the plank. Then 5 push-ups and `tailMs` still in the plank.
   */
  function timeline(between: { sit: true } | { topMs: number }, tailMs = 14000): Timeline {
    const first: [number, number][] = [[600, TOP], ...pushups(6, 500)];
    const sitAt = first.reduce((a, [d]) => a + d, 0);
    const sit = 'sit' in between;
    const mid: [number, number][] = sit ? SIT_SEGS : [[between.topMs, TOP]];
    const backAt = sitAt + mid.reduce((a, [d]) => a + d, 0);
    const settle: [number, number][] = sit ? [[1500, TOP]] : [];
    const keys: Keys = curve(TOP, [...first, ...mid, ...settle, ...pushups(5, tailMs)]);
    const frames = sample(pushup, keys).map((f) =>
      withHip(f, sit && f.t >= sitAt && f.t < backAt ? SIT_HIP : PLANK_HIP),
    );
    return { frames, sitAt, backAt };
  }

  type PushRun = {
    log: Logged[];
    events: RepEvent[];
    counter: RepCounter;
    auto: AutoSet;
    untracked: { t: number; reason: string | null }[];
    phases: { t: number; phase: string }[];
  };

  /** Feed the frames like the camera view; tap Continue at the first frame ≥ `tapAt` if held. */
  function run(frames: readonly LandmarkFrame[], tapAt?: number): PushRun {
    const counter = createRepCounter(pushup);
    const auto = createAutoSet(AUTO_SET_DEFAULTS);
    const r: PushRun = { log: [], events: [], counter, auto, untracked: [], phases: [] };
    const first = frames[0];
    if (first) auto.setSession({ phase: 'exercise', paused: false, restElapsedMs: 0 }, first.t);
    let tapped = false;
    for (const f of frames) {
      const events = counter.push(f);
      r.events.push(...events);
      r.untracked.push({ t: f.t, reason: counter.untracked });
      r.phases.push({ t: f.t, phase: counter.phase });
      const actions = auto.push({
        t: f.t,
        tracking: counter.tracking,
        present: personInFrame(f),
        untracked: counter.untracked,
        phase: counter.phase,
        angle: counter.angle,
        events,
      });
      for (const action of actions) r.log.push({ t: f.t, action });
      if (tapAt !== undefined && !tapped && f.t >= tapAt && auto.state === 'held') {
        tapped = true;
        for (const action of auto.continueSet(f.t)) r.log.push({ t: f.t, action });
      }
    }
    return r;
  }

  const types = (r: PushRun) => r.log.map((l) => l.action.type);

  it('the counter sees 6 + 5 push-ups, the sit is body-line gated (person in frame), no phantoms', () => {
    const { frames, sitAt, backAt } = timeline({ sit: true });
    const r = run(frames);
    const all = reps(r);
    expect(all).toHaveLength(11);
    expect(r.events.filter((e) => e.type === 'partial')).toEqual([]);
    expect(all.filter((e) => e.t > sitAt && e.t < backAt)).toEqual([]);
    expect(frames.every((f) => personInFrame(f))).toBe(true);
    // Every sit frame after the first 300 ms reads bodyLine.
    const sitReasons = new Set(
      r.untracked.filter((u) => u.t >= sitAt + 300 && u.t < backAt).map((u) => u.reason),
    );
    expect([...sitReasons]).toEqual(['bodyLine']);
  });

  it('with a Continue tap after the sit: exactly one commit of 11 reps, no start', () => {
    const { frames, sitAt, backAt } = timeline({ sit: true });
    const r = run(frames, backAt + 500);
    const all = reps(r);
    const rep6 = all[5];
    const rep11 = all[10];
    if (!rep6 || !rep11) throw new Error('missing reps');
    expect(types(r)).toEqual(['hold', 'holdEnded', 'stopPending', 'commit']);
    const [hold, , stop, commit] = r.log;
    // The sit is a body-line break 5 s in (never a still stop first).
    expect(hold?.action).toEqual({
      type: 'hold',
      reason: 'bodyLine',
      reps: 6,
      partials: 0,
      endedAt: rep6.t,
    });
    expect(hold?.t).toBeGreaterThanOrEqual(sitAt + 5000);
    expect(hold?.t).toBeLessThan(sitAt + 5600);
    expect(stop?.action).toMatchObject({ reason: 'still', reps: 11, endedAt: rep11.t });
    expect(stop?.t).toBeGreaterThan(rep11.t);
    expect(commit?.action).toEqual({ type: 'commit', endedAt: rep11.t, reps: 11, partials: 0 });
    expect(r.log.filter((l) => l.action.type === 'commit')).toHaveLength(1);
    expect(r.log.filter((l) => l.action.type === 'start')).toEqual([]);
  });

  it('without a tap: a hold, the 5 later push-ups are not counted, no second set, no start', () => {
    const { frames, sitAt } = timeline({ sit: true });
    const r = run(frames);
    const rep6 = reps(r)[5];
    if (!rep6) throw new Error('missing rep 6');
    expect(types(r)).toEqual(['hold']);
    expect(r.log[0]?.action).toMatchObject({ reason: 'bodyLine', reps: 6, endedAt: rep6.t });
    expect(r.log[0]?.t).toBeLessThan(sitAt + 5600);
    expect(r.auto.state).toBe('held');
    expect(r.auto.counts).toEqual({ reps: 6, partials: 0 });
    // Start next set saves the first 6, backdated to rep 6.
    const last = frames[frames.length - 1];
    expect(r.auto.nextSet(last?.t ?? 0)).toEqual([
      { type: 'commit', endedAt: rep6.t, reps: 6, partials: 0 },
    ]);
  });

  it('a 5.7 s in-plank pause (the real longest) is neither a hold nor a stop: one set of 11', () => {
    const { frames } = timeline({ topMs: PAUSE_TOP_MS });
    const r = run(frames);
    const all = reps(r);
    expect(all).toHaveLength(11);
    const rep6 = all[5];
    const rep11 = all[10];
    if (!rep6 || !rep11) throw new Error('missing reps');
    // The pause as the still timer sees it: rep 6's event → the counter leaving 'top' for rep 7.
    const leave = r.phases.find((p) => p.t > rep6.t && p.phase !== 'top');
    const pause = (leave?.t ?? Infinity) - rep6.t;
    expect(pause).toBeGreaterThanOrEqual(5650);
    expect(pause).toBeLessThanOrEqual(5750);
    expect(r.log.filter((l) => l.t <= rep11.t)).toEqual([]);
    expect(types(r)).toEqual(['stopPending', 'commit']);
    expect(r.log[1]?.action).toEqual({ type: 'commit', endedAt: rep11.t, reps: 11, partials: 0 });
    // Control: 0.6 s longer (6.3 s) crosses the 6 s still time; rep 7 then cancels in the window.
    const longer = run(timeline({ topMs: PAUSE_TOP_MS + 600 }).frames);
    expect(types(longer).slice(0, 2)).toEqual(['stopPending', 'stopCancelled']);
    expect(longer.log[0]?.action).toMatchObject({ reason: 'still', reps: 6 });
  });
});
