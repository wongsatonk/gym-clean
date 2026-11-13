import { describe, expect, it } from 'vitest';
import { program } from '../data/catalog';
import { badgeList } from './badges';
import { DEMO_IDS } from './demo3d/moves';
import { howToContent } from './howToSheet';

describe('badgeList', () => {
  it('shows "3D demo" for an exercise with a demo and "Camera" when pose-tracked', () => {
    expect(badgeList({ exerciseId: 'Pushups', tracking: 'pose' })).toEqual([
      { kind: '3d', label: '3D demo' },
      { kind: 'camera', label: 'Camera' },
    ]);
  });

  it('shows "Info" without a demo, and no "Camera" for manual tracking', () => {
    expect(badgeList({ exerciseId: 'Hammer_Curls', tracking: 'manual' })).toEqual([
      { kind: 'info', label: 'Info' },
    ]);
  });

  it('follows the demo data, not a hard-coded list', () => {
    for (const id of DEMO_IDS) {
      expect(badgeList({ exerciseId: id, tracking: 'manual' })[0]?.kind, id).toBe('3d');
    }
    expect(badgeList({ exerciseId: 'not-a-real-id', tracking: 'manual' })[0]?.kind).toBe('info');
  });
});

describe('howToContent', () => {
  it('has a title, tempo, 2-3 lines, focus and cue for every program exercise', () => {
    const ids = new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    for (const id of ids) {
      const c = howToContent(id);
      expect(c.title, id).not.toBe('');
      expect(c.tempo, id).not.toBe('');
      expect(c.lines.length, id).toBeGreaterThanOrEqual(2);
      expect(c.lines.length, id).toBeLessThanOrEqual(3);
      expect(c.focus, id).not.toBe('');
      expect(c.cue, id).not.toBe('');
      expect(c.primary.length, id).toBeGreaterThan(0);
    }
  });

  it('marks demo exercises and gives an empty, safe result for an unknown id', () => {
    expect(howToContent('Pushups').hasDemo).toBe(true);
    expect(howToContent('Hammer_Curls').hasDemo).toBe(false);
    const none = howToContent('not-a-real-id');
    expect(none).toMatchObject({ hasDemo: false, tempo: '', lines: [], focus: '', cue: '' });
  });
});
