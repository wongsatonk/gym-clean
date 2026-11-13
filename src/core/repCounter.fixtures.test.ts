// Fixture suite (M4 task 7): every fixtures/landmarks/<folder>/<label>__reps-N__partials-M.json
// must count exactly N reps and M partials with the folder's rule. Real clips (Checkpoint B)
// and synthetic ones live side by side; this suite decides the thresholds.
import { describe, expect, it } from 'vitest';
import { ruleForFolder } from './exercises';
import { createRepCounter } from './repCounter';
import type { LandmarkFrame } from './types';

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
  frames: LandmarkFrame[];
};

const fixtures: Fixture[] = Object.entries(FIXTURES)
  .map(([path, frames]) => {
    const rel = path.replace(/^.*fixtures\/landmarks\//, '');
    const parts = rel.split('/');
    const file = parts[parts.length - 1] ?? rel;
    const folder = parts[0] ?? '';
    const m = NAME.exec(file);
    return {
      path: rel,
      folder: parts.length > 1 ? folder : '',
      file,
      reps: m?.groups?.reps !== undefined ? Number(m.groups.reps) : null,
      partials: m?.groups?.partials !== undefined ? Number(m.groups.partials) : null,
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
      const counter = createRepCounter(rule);
      for (const frame of f.frames) counter.push(frame);
      expect({ reps: counter.reps, partials: counter.partials }).toEqual({
        reps: f.reps,
        partials: f.partials,
      });
    });
  }
});
