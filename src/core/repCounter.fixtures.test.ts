// Fixture suite (M4 task 7): every fixtures/landmarks/<folder>/<label>__reps-N__partials-M.json
// must count exactly N reps and M partials with the folder's rule. Real clips (Checkpoint B)
// and synthetic ones live side by side; this suite decides the thresholds.
// A label ending in `-left` / `-right` (one-arm clips, M13b) is counted with the counter's side
// fixed to that arm, as the session runs it; other clips use the rule's own side mode.
import { describe, expect, it } from 'vitest';
import { ruleForFolder } from './exercises';
import { createRepCounter } from './repCounter';
import type { LandmarkFrame, WorkSide } from './types';

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
    it(f.path, () => {
      expect(f.reps, `${f.file}: name must end in __reps-N__partials-M.json`).not.toBeNull();
      const rule = ruleForFolder(f.folder);
      expect(rule, `no exercise rule for fixture folder "${f.folder}"`).toBeDefined();
      if (!rule) return;
      const counter = createRepCounter(rule, f.side ? { side: f.side } : {});
      for (const frame of f.frames) counter.push(frame);
      expect({ reps: counter.reps, partials: counter.partials }).toEqual({
        reps: f.reps,
        partials: f.partials,
      });
      if (f.side) expect(counter.side).toBe(f.side);
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
