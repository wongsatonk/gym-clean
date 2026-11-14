import { describe, expect, it } from 'vitest';
import { program } from '../data/catalog';
import { BADGE_ICON, badgeList } from './badges';
import { ICON_NAMES, iconMarkup } from './icons';
import { DEMO_IDS } from './demo3d/ids';
import { howToContent } from './howToSheet';

describe('badgeList', () => {
  it('shows "3D demo" for an exercise with a demo and "Camera" when pose-tracked', () => {
    expect(badgeList({ exerciseId: 'Pushups', tracking: 'pose' })).toEqual([
      { kind: '3d', label: '3D demo' },
      { kind: 'camera', label: 'Camera' },
    ]);
  });

  it('shows "Info" without a demo, and no "Camera" for manual tracking', () => {
    // Every program exercise has a demo since M4d batch 2; an id without one still says "Info".
    expect(badgeList({ exerciseId: 'not-a-real-id', tracking: 'manual' })).toEqual([
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

describe('badgeList: M4f Learning badge', () => {
  const labels = (input: Parameters<typeof badgeList>[0]): string[] =>
    badgeList(input).map((b) => b.label);

  it('adds "Learning" after "Camera" for a pose exercise whose rule is learning', () => {
    expect(
      labels({ exerciseId: 'Hammer_Curls', tracking: 'pose', ruleStatus: 'learning' }),
    ).toEqual(['3D demo', 'Camera', 'Learning']);
  });

  it('shows no "Learning" for a tuned rule or no rule', () => {
    expect(
      labels({ exerciseId: 'Dumbbell_Bicep_Curl', tracking: 'pose', ruleStatus: 'tuned' }),
    ).toEqual(['3D demo', 'Camera']);
    expect(labels({ exerciseId: 'Pushups', tracking: 'pose', ruleStatus: null })).toEqual([
      '3D demo',
      'Camera',
    ]);
  });

  it('shows no "Learning" when the exercise is not camera-tracked', () => {
    expect(
      labels({ exerciseId: 'Hammer_Curls', tracking: 'manual', ruleStatus: 'learning' }),
    ).toEqual(['3D demo']);
  });

  it('gives the Learning pill its own decorative icon from the shared set', () => {
    expect(BADGE_ICON.learning).not.toBe(BADGE_ICON.camera);
    expect(ICON_NAMES).toContain(BADGE_ICON.learning);
    expect(iconMarkup(BADGE_ICON.learning, 'sm')).toContain('aria-hidden="true"');
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
    expect(howToContent('Leg_Press').hasDemo).toBe(true);
    const none = howToContent('not-a-real-id');
    expect(none).toMatchObject({ hasDemo: false, tempo: '', lines: [], focus: '', cue: '' });
  });
});
