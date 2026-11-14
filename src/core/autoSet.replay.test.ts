// Replays the real lateral-raise clips (Push A, 2026-11-13) through the REAL rep counter and the
// hands-free state machine, frame by frame, the way the camera view feeds them.
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

      it('walking out of frame after the clip: away stop', () => {
        const run = replay(clip.frames, 'exercise');
        const end = clip.frames[clip.frames.length - 1]?.t ?? 0;
        replay(tail(clip.frames, 3500, 'empty'), 'exercise', run);
        const stop = run.log[0];
        expect(stop?.action).toMatchObject({ type: 'stopPending', reps: 20 });
        // Away (3 s after the last person frame) unless the still stop came first.
        if (stop?.action.type === 'stopPending' && stop.action.reason === 'away')
          expect(stop.t).toBeGreaterThanOrEqual(end + 3000 - 40);
        else expect(stop?.action).toMatchObject({ reason: 'still' });
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
