// M13d task 40h: the demo player's control bar (render tests on the fake DOM).
import { describe, expect, it } from 'vitest';

import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import { demoControls, playControl, type DemoView } from './controls';

useFakeDom();

const iconsOf = (el: FakeEl) =>
  el.find((e) => e.hasAttribute('data-icon')).map((i) => i.getAttribute('data-icon'));

function build() {
  const views: DemoView[] = [];
  let toggles = 0;
  const c = demoControls({ onView: (v) => views.push(v), onTogglePlay: () => toggles++ });
  return { c, views, toggles: () => toggles };
}

describe('playControl (pure)', () => {
  it('paused shows Play with the play icon, playing shows Pause with the pause icon', () => {
    expect(playControl(false)).toEqual({ icon: 'play', label: 'Play' });
    expect(playControl(true)).toEqual({ icon: 'pause', label: 'Pause' });
  });
});

describe('demoControls render', () => {
  it('is a labelled group of Front, Side and Play, in that order', () => {
    const { c } = build();
    const bar = asFake(c.bar);
    expect(bar.classes).toContain('demo3d-controls');
    expect(bar.getAttribute('role')).toBe('group');
    expect(bar.getAttribute('aria-label')).toBe('Demo controls');
    expect(bar.children.map((b) => b.textContent)).toEqual(['Front', 'Side', 'Play']);
    expect(bar.children.every((b) => b.tag === 'button' && b.getAttribute('type') === 'button')).toBe(
      true,
    );
  });

  it('Play is the round icon button: play icon, the word "Play" as its name, ≥ 56px secondary', () => {
    const { c } = build();
    const play = asFake(c.play);
    expect(play.hasAttribute('data-icon-btn')).toBe(true);
    expect(play.classes).toEqual(expect.arrayContaining(['icon-btn', 'demo3d-play']));
    expect(play.getAttribute('data-variant')).toBe('secondary');
    expect(play.getAttribute('data-label-at')).toBe('below');
    expect(play.getAttribute('aria-label')).toBeNull();
    expect(play.textContent).toBe('Play');
    expect(iconsOf(play)).toEqual(['play']);
  });

  it('Front / Side stay a segmented choice (pills with aria-pressed, ≥ 56px, body size)', () => {
    const { c } = build();
    for (const b of [asFake(c.front), asFake(c.side)]) {
      expect(b.hasAttribute('data-icon-btn')).toBe(false);
      expect(b.classes).toContain('demo3d-btn');
      expect(b.getAttribute('aria-pressed')).toBe('false');
      const style = b.getAttribute('style') ?? '';
      expect(style).toContain('min-height:56px');
      expect(style).toContain('min-width:56px');
      expect(style).toContain('font-size:var(--fs-body)');
    }
  });

  it('showPlaying swaps icon and word together, and back', () => {
    const { c } = build();
    const play = asFake(c.play);
    c.showPlaying(true);
    expect(play.textContent).toBe('Pause');
    expect(iconsOf(play)).toEqual(['pause']);
    c.showPlaying(true);
    expect(iconsOf(play)).toEqual(['pause']);
    c.showPlaying(false);
    expect(play.textContent).toBe('Play');
    expect(iconsOf(play)).toEqual(['play']);
    // The circle stays decorative; the word stays the name.
    expect(play.oneByClass('icon-btn-circle').getAttribute('aria-hidden')).toBe('true');
    expect(play.oneByClass('icon-btn-label').textContent).toBe('Play');
  });

  it('showView marks one view pressed, or neither', () => {
    const { c } = build();
    c.showView('side');
    expect(c.front.getAttribute('aria-pressed')).toBe('false');
    expect(c.side.getAttribute('aria-pressed')).toBe('true');
    c.showView('front');
    expect(c.front.getAttribute('aria-pressed')).toBe('true');
    expect(c.side.getAttribute('aria-pressed')).toBe('false');
    c.showView(null);
    expect(c.front.getAttribute('aria-pressed')).toBe('false');
    expect(c.side.getAttribute('aria-pressed')).toBe('false');
  });

  it('taps call the handlers', () => {
    const { c, views, toggles } = build();
    asFake(c.front).click();
    asFake(c.side).click();
    asFake(c.play).click();
    asFake(c.play).click();
    expect(views).toEqual(['front', 'side']);
    expect(toggles()).toBe(2);
  });
});
