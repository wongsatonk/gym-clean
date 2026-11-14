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

describe('colours (M4e A7)', () => {
  it('leaves colour to the token CSS: classes only, no inline colour', () => {
    for (const size of ['regular', 'mini'] as const) {
      const svg = bodyMapSvg({ view: 'front', primary: ['chest'], secondary: ['shoulders'], size });
      expect(svg).not.toMatch(/style=|fill=|stroke=/);
      expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i);
      expect(svg).toContain('class="body" vector-effect="non-scaling-stroke"');
    }
  });
});

describe('mini size (Today day strip)', () => {
  const mini = bodyMapSvg({
    view: 'back',
    primary: ['lats'],
    secondary: ['biceps', 'middle back'],
    size: 'mini',
  });

  it('draws only the worked muscles on the silhouette', () => {
    expect(
      pathsFor(mini)
        .map((p) => p.muscle)
        .sort(),
    ).toEqual(['lats', 'middle back']);
    expect(mini).toContain('class="body-map body-map--mini"');
    expect(mini).toContain('data-size="mini"');
    expect(mini).toContain('class="body"');
  });

  it('has no ids, so many minis can share a page, and is hidden from screen readers', () => {
    expect(mini).not.toMatch(/\sid="/);
    expect(mini).toContain('aria-hidden="true"');
    expect(mini).not.toContain('role="img"');
  });

  it('keeps the regular size as the default', () => {
    const svg = bodyMapSvg({ view: 'back', primary: ['lats'], secondary: [] });
    expect(svg).toContain('data-size="regular"');
    expect(svg).not.toContain('body-map--mini');
  });
});
