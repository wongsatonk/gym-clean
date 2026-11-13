import { describe, expect, it } from 'vitest';
import exercises from '../data/exercises.json';
import { MUSCLES, bodyMapSvg, musclesInView, pickView } from './bodyMap';

const pathsFor = (svg: string) =>
  [...svg.matchAll(/<path[^>]*data-muscle="([^"]+)"[^>]*>/g)].map((m) => ({
    muscle: m[1] ?? '',
    tag: m[0],
  }));

describe('body map coverage', () => {
  it('covers all 17 free-exercise-db muscle groups across the two views', () => {
    expect(MUSCLES).toHaveLength(17);
    const covered = new Set([...musclesInView('front'), ...musclesInView('back')]);
    for (const m of MUSCLES) expect(covered.has(m), m).toBe(true);
  });

  it('has an SVG path for every muscle named in the vendored exercise data', () => {
    const svgMuscles = new Set(
      (['front', 'back'] as const).flatMap((view) =>
        pathsFor(bodyMapSvg({ view, primary: [], secondary: [] })).map((p) => p.muscle),
      ),
    );
    for (const e of exercises) {
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
        expect(svgMuscles.has(m), `${e.id}: ${m}`).toBe(true);
      }
    }
  });

  it('renders each muscle exactly once per view, with unique ids and valid path data', () => {
    for (const view of ['front', 'back'] as const) {
      const svg = bodyMapSvg({ view, primary: [], secondary: [] });
      const paths = pathsFor(svg);
      expect(paths.map((p) => p.muscle).sort()).toEqual([...musclesInView(view)].sort());
      const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('pickView', () => {
  it('shows the side where the primary muscles are', () => {
    expect(pickView(['chest'])).toBe('front');
    expect(pickView(['quadriceps'])).toBe('front');
    expect(pickView(['biceps'])).toBe('front');
    expect(pickView(['shoulders'])).toBe('front');
    expect(pickView(['lats'])).toBe('back');
    expect(pickView(['middle back'])).toBe('back');
    expect(pickView(['hamstrings'])).toBe('back');
    expect(pickView(['triceps'])).toBe('back');
    expect(pickView(['calves'])).toBe('back');
    expect(pickView([])).toBe('front');
  });
});

describe('highlighting', () => {
  it('marks primary strongly and secondary lightly, others neutral', () => {
    const svg = bodyMapSvg({
      view: 'front',
      primary: ['chest'],
      secondary: ['shoulders', 'triceps'],
    });
    const byMuscle = Object.fromEntries(pathsFor(svg).map((p) => [p.muscle, p.tag]));
    expect(byMuscle['chest']).toContain('class="muscle primary"');
    expect(byMuscle['shoulders']).toContain('class="muscle secondary"');
    expect(byMuscle['biceps']).toContain('class="muscle"');
    expect(byMuscle['triceps']).toBeUndefined(); // back-only muscle
  });

  it('is labelled for screen readers', () => {
    const svg = bodyMapSvg({ view: 'back', primary: ['lats'], secondary: ['biceps'] });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Back view. Primary: lats. Secondary: biceps."');
  });
});
