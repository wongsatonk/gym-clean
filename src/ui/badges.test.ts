// M13c goal 4: badges are buttons with a callback (outside a workout), static spans without.
import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import { exerciseName } from '../data/catalog';
import { badgeButtonLabel, badgesFor, type BadgeKind } from './badges';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

const LEARNING_ID = 'Hammer_Curls'; // pose rule still learning: 3D demo, Camera, Learning

describe('badgesFor without onBadge (Exercise screen, How-to sheet, camera view)', () => {
  it('renders static spans: no button, no open hook', () => {
    const el = asFake(badgesFor({ exerciseId: LEARNING_ID, tracking: 'pose' }));
    expect(el.tag).toBe('span');
    expect(el.byTag('button')).toHaveLength(0);
    expect(el.find((e) => e.hasAttribute('data-badge-open'))).toHaveLength(0);
    const pills = el.byClass('ex-badge');
    expect(pills.map((p) => p.tag)).toEqual(['span', 'span', 'span']);
    expect(pills.map((p) => p.getAttribute('data-badge'))).toEqual(['3d', 'camera', 'learning']);
    expect(el.classes).not.toContain('ex-badges-tap');
  });
});

describe('badgesFor with onBadge (preview, Library, detail)', () => {
  function render(name?: string) {
    const calls: [BadgeKind, FakeEl][] = [];
    const el = asFake(
      badgesFor({
        exerciseId: LEARNING_ID,
        tracking: 'pose',
        name,
        onBadge: (kind, opener) => calls.push([kind, asFake(opener)]),
      }),
    );
    return { el, calls };
  }

  it('each badge is a button with the same pill inside and an open hook', () => {
    const { el } = render('Hammer Curls');
    const btns = el.byTag('button');
    expect(btns.map((b) => b.getAttribute('data-badge-open'))).toEqual([
      '3d',
      'camera',
      'learning',
    ]);
    for (const b of btns) {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.classes).toContain('ex-badge-btn');
      expect(b.byClass('ex-badge')).toHaveLength(1);
    }
    expect(btns[0]?.textContent).toBe('3D demo');
    expect(el.classes).toContain('ex-badges-tap');
  });

  it('labels: "3D demo for Goblet Squat" style, starting with the visible word', () => {
    const { el } = render('Hammer Curls');
    expect(el.byTag('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '3D demo for Hammer Curls',
      'Camera set-up for Hammer Curls',
      'Learning: what it means for Hammer Curls',
    ]);
    expect(badgeButtonLabel('info', 'Goblet Squat')).toBe('Info for Goblet Squat');
    for (const kind of ['3d', 'info', 'camera', 'learning'] as const) {
      const label = badgeButtonLabel(kind, 'X');
      expect(checkCopy(label).ok, label).toBe(true);
      expect(label).not.toMatch(/\b(he|she|his|her)\b/i);
    }
  });

  it('falls back to the catalog name when none is passed', () => {
    const { el } = render();
    expect(el.byTag('button')[0]?.getAttribute('aria-label')).toBe(
      `3D demo for ${exerciseName(LEARNING_ID)}`,
    );
  });

  it('a tap calls onBadge with the kind and the button itself (focus return)', () => {
    const { el, calls } = render('Hammer Curls');
    const [demo, cam, learn] = el.byTag('button');
    cam?.click();
    learn?.click();
    demo?.click();
    expect(calls.map((c) => c[0])).toEqual(['camera', 'learning', '3d']);
    expect(calls[0]?.[1]).toBe(cam);
  });

  it('a manual exercise without a demo has one Info button', () => {
    const calls: BadgeKind[] = [];
    const el = asFake(
      badgesFor({
        exerciseId: 'not-a-real-id',
        tracking: 'manual',
        onBadge: (k) => calls.push(k),
      }),
    );
    const btns = el.byTag('button');
    expect(btns).toHaveLength(1);
    btns[0]?.click();
    expect(calls).toEqual(['info']);
  });
});
