// Fixture suite (M4 task 7): every fixtures/landmarks/<folder>/<label>__reps-N__partials-M.json
// must count exactly N reps and M partials with the folder's rule. Real clips (Checkpoint B)
// and synthetic ones live side by side; this suite decides the thresholds.
// A label ending in `-left` / `-right` (one-arm clips, M13b) is counted with the counter's side
// fixed to that arm, as the session runs it; other clips use the rule's own side mode.
//
// Upper-bound clips (UPPER_BOUND below): screen recordings whose landmarks can't decide an exact
// count. Their name's N is the most reps they may count, not a target: they check that nothing is
// counted beyond the real reps and nothing at all while he isn't rowing.
import { describe, expect, it } from 'vitest';
import { ruleForFolder } from './exercises';
import { createRepCounter } from './repCounter';
import { withHip } from './testkit/frames';
import type { LandmarkFrame, RepEvent, WorkSide } from './types';

const FIXTURES = import.meta.glob<LandmarkFrame[]>('../../fixtures/landmarks/**/*.json', {
  eager: true,
  import: 'default',
});

const NAME = /^(?<label>.+)__reps-(?<reps>\d+)__partials-(?<partials>\d+)\.json$/;

type Fixture = {
  path: string;
  folder: string;
  file: string;
  reps: number | null;
  partials: number | null;
  /** The arm a one-arm clip is labelled with (`…-left__…`), null when unlabelled. */
  side: WorkSide | null;
  frames: LandmarkFrame[];
};

const SIDE_LABEL = /-(?<side>left|right)$/;

/**
 * Upper-bound clips (PROGRESS Decision "M13b real row fixtures", revised in task 8). His 2026-11-17
 * row set as Safari screen recordings: the set-up card (clip 01) and the rep card (02–05) cover
 * him, and he counts his own reps because the app's numbers were wrong, so N (read from the app's
 * own target bar and the frames) is only an upper bound. Clip 01's elbow trace shows 7 clear
 * pulls and 2 doubtful ones (one as he first appears, one with the pose lost at the top), so
 * it isn't a hard 9 either. `quietMs` = spans where he isn't rowing (clip time, ms): placing the
 * phone, stepping in, set-up wiggles, clip 04's crouch with the dumbbell on the floor and standing
 * up after it. `partials` pins the partial count where the decision says none are real.
 */
const UPPER_BOUND: Record<string, { quietMs: [number, number][]; partials?: number }> = {
  'row/real-01-left__reps-9__partials-0.json': {
    quietMs: [
      [0, 1500],
      [24_200, Infinity],
    ],
  },
  'row/real-02-left__reps-15__partials-0.json': { quietMs: [[0, 4500]], partials: 0 },
  'row/real-03-right__reps-12__partials-0.json': { quietMs: [[0, 3500]], partials: 0 },
  'row/real-04-left__reps-5__partials-0.json': {
    quietMs: [
      [0, 7000],
      [20_500, Infinity],
    ],
    partials: 0,
  },
  'row/real-05-right__reps-9__partials-0.json': { quietMs: [[0, 10_500]], partials: 0 },
};

const fixtures: Fixture[] = Object.entries(FIXTURES)
  .map(([path, frames]) => {
    const rel = path.replace(/^.*fixtures\/landmarks\//, '');
    const parts = rel.split('/');
    const file = parts[parts.length - 1] ?? rel;
    const folder = parts[0] ?? '';
    const m = NAME.exec(file);
    const sideLabel = SIDE_LABEL.exec(m?.groups?.label ?? '')?.groups?.side;
    const side: WorkSide | null = sideLabel === 'left' || sideLabel === 'right' ? sideLabel : null;
    return {
      path: rel,
      folder: parts.length > 1 ? folder : '',
      file,
      reps: m?.groups?.reps !== undefined ? Number(m.groups.reps) : null,
      partials: m?.groups?.partials !== undefined ? Number(m.groups.partials) : null,
      side,
      frames,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

describe('rep counter on recorded landmark fixtures', () => {
  it('finds the fixture folder', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    // The M3 clip doubles as the e2e fake camera: it must always be in the suite.
    expect(fixtures.map((f) => f.path)).toContain('curl/synthetic-01__reps-3__partials-1.json');
  });

  for (const f of fixtures) {
    const bound = UPPER_BOUND[f.path];
    it(bound ? `${f.path} (upper bound: no false reps)` : f.path, () => {
      expect(f.reps, `${f.file}: name must end in __reps-N__partials-M.json`).not.toBeNull();
      const rule = ruleForFolder(f.folder);
      expect(rule, `no exercise rule for fixture folder "${f.folder}"`).toBeDefined();
      if (!rule || f.reps === null) return;
      const counter = createRepCounter(rule, f.side ? { side: f.side } : {});
      const events: RepEvent[] = [];
      for (const frame of f.frames) events.push(...counter.push(frame));
      if (f.side) expect(counter.side).toBe(f.side);
      if (!bound) {
        expect({ reps: counter.reps, partials: counter.partials }).toEqual({
          reps: f.reps,
          partials: f.partials,
        });
        return;
      }
      // Nothing beyond the real reps: every rep or partial must be one of the N real reps.
      expect(counter.reps + counter.partials).toBeLessThanOrEqual(f.reps);
      if (bound.partials !== undefined) expect(counter.partials).toBe(bound.partials);
      // Nothing while he isn't rowing (setting up, crouching, standing in front of the phone).
      const loud = events.filter((e) => bound.quietMs.some(([a, b]) => e.t >= a && e.t < b));
      expect(loud.map((e) => `${e.type} at ${String(e.t)} ms`)).toEqual([]);
    });
  }

  it('every upper-bound clip exists', () => {
    for (const path of Object.keys(UPPER_BOUND))
      expect(fixtures.map((f) => f.path)).toContain(path);
  });
});

describe('standing in front of the phone counts nothing (M13b, hinge gate)', () => {
  // The same arm cycles as the synthetic clips, with the hips re-posed straight (he stands facing
  // the phone, sets up, walks past it): rules with a hinge gate count nothing.
  const gated = fixtures.filter((f) => {
    const rule = ruleForFolder(f.folder);
    return rule?.maxHipAngleDeg !== undefined && f.file.startsWith('synthetic-');
  });

  it('covers the row and concentration-curl clips', () => {
    expect(new Set(gated.map((f) => f.folder))).toEqual(new Set(['row', 'concentration-curl']));
  });

  for (const f of gated) {
    it(`${f.path} re-posed standing counts nothing`, () => {
      const rule = ruleForFolder(f.folder);
      if (!rule) throw new Error(f.folder);
      const counter = createRepCounter(rule, f.side ? { side: f.side } : {});
      const events = f.frames.flatMap((frame) => counter.push(withHip(frame, 170)));
      expect(events).toEqual([]);
    });
  }
});

describe('one-arm synthetic clips with the side fixed (M13b)', () => {
  // synthetic-01 is the right arm (unlabelled, older than the side labels); synthetic-03-left
  // is the same set mirrored onto the left arm (task 7).
  //
  // Fixed to the wrong arm, a clip never counts a rep. It can count `far` partials: in the left
  // concentration curl the far (right) arm passes the visibility gate on 132 frames and its
  // foreshortened elbow swings 154° → 107°, 3 times. Decision (M13b task 6): the fixed side does
  // NOT ignore those with an "other arm is clearer" gate, because on his real row clips the
  // working arm is the less visible one on many tracked frames (real-02 148/596, real-03 104/484,
  // real-04 96/460) and such a gate would drop the working arm mid-rep. The wrong-arm case is a
  // set started on the other arm than the spoken one; the partials it gives are pinned here.
  const CLIPS: [folder: string, file: string, arm: WorkSide, wrongArmPartials: number][] = [
    ['row', 'synthetic-01__reps-4__partials-0.json', 'right', 0],
    ['row', 'synthetic-03-left__reps-4__partials-0.json', 'left', 0],
    ['concentration-curl', 'synthetic-01__reps-4__partials-0.json', 'right', 0],
    ['concentration-curl', 'synthetic-03-left__reps-4__partials-0.json', 'left', 3],
  ];
  const other = (s: WorkSide): WorkSide => (s === 'left' ? 'right' : 'left');

  function count(folder: string, file: string, side: WorkSide) {
    const f = fixtures.find((x) => x.path === `${folder}/${file}`);
    const rule = ruleForFolder(folder);
    if (!f || !rule) throw new Error(`missing ${folder}/${file}`);
    const counter = createRepCounter(rule, { side });
    for (const frame of f.frames) counter.push(frame);
    return { reps: counter.reps, partials: counter.partials, side: counter.side };
  }

  for (const [folder, file, arm, wrongArmPartials] of CLIPS) {
    it(`${folder}/${file}: 4 on the ${arm} arm, no rep on the other`, () => {
      expect(count(folder, file, arm)).toEqual({ reps: 4, partials: 0, side: arm });
      expect(count(folder, file, other(arm))).toEqual({
        reps: 0,
        partials: wrongArmPartials,
        side: other(arm),
      });
    });
  }
});

describe('real one-arm clips keep their arm and count (M13b, the set-3 reset)', () => {
  // Set 3 in his recording jumped Left → Right and went back to 0: `sideMode: 'best'` re-picked the
  // arm after each loss (restartTracking unlocked it). With the side fixed by the session, a real
  // clip full of losses never changes arm and never loses a count.
  for (const f of fixtures.filter((x) => x.side && x.file.startsWith('real-'))) {
    it(`${f.path}: side stays ${String(f.side)}, counts never go down`, () => {
      const rule = ruleForFolder(f.folder);
      if (!rule || !f.side) throw new Error(f.path);
      const counter = createRepCounter(rule, { side: f.side });
      let last = 0;
      for (const frame of f.frames) {
        counter.push(frame);
        expect(counter.side).toBe(f.side);
        const n = counter.reps + counter.partials;
        expect(n).toBeGreaterThanOrEqual(last);
        last = n;
      }
    });
  }
});
