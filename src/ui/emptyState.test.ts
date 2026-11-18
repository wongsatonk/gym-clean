import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import { emptyState } from './emptyState';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

const render = (...args: Parameters<typeof emptyState>) => asFake(emptyState(...args));
const svgs = (el: FakeEl) => el.byTag('svg');

describe('emptyState (M13 task 22)', () => {
  it('one decorative icon, one line, one button action', () => {
    const calls: string[] = [];
    const el = render({
      kind: 'fuel-day',
      icon: 'plate',
      line: 'Nothing logged yet today.',
      action: { label: 'Log food', icon: 'plus', onClick: () => calls.push('log') },
    });
    expect(el.getAttribute('data-empty-state')).toBe('fuel-day');
    expect(el.classes).toContain('empty-state');
    // The art: one icon, decorative, in its own badge.
    const art = el.oneByClass('empty-state-art');
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(art.byTag('svg').map((s) => s.getAttribute('data-icon'))).toEqual(['plate']);
    // One line.
    expect(el.byTag('p').map((p) => p.textContent)).toEqual(['Nothing logged yet today.']);
    expect(el.oneByClass('empty-state-line').textContent).toBe('Nothing logged yet today.');
    // One action: a real button with its words as the name.
    const buttons = el.byTag('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('type')).toBe('button');
    expect(buttons[0]?.textContent).toBe('Log food');
    expect(buttons[0]?.classes).toEqual(expect.arrayContaining(['empty-state-btn', 'ghost-btn']));
    expect(buttons[0]?.classes).not.toContain('primary-btn');
    buttons[0]?.click();
    expect(calls).toEqual(['log']);
    expect(svgs(el)).toHaveLength(2); // the art + the button's icon
  });

  it('primary action is the filled CTA; hooks and extra classes land on the root and button', () => {
    const el = render({
      kind: 'x',
      icon: 'spark',
      line: 'Line.',
      class: 'chat-empty',
      lineClass: 'chat-empty-line',
      hooks: { role: 'status', 'data-history-empty': 'none' },
      action: {
        label: 'Set up targets',
        primary: true,
        onClick: () => undefined,
        hooks: { 'data-setup': true },
      },
    });
    expect(el.classes).toEqual(expect.arrayContaining(['empty-state', 'chat-empty']));
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('data-history-empty')).toBe('none');
    expect(el.oneByClass('chat-empty-line').classes).toContain('empty-state-line');
    const btn = el.byTag('button')[0];
    expect(btn?.classes).toEqual(expect.arrayContaining(['primary-btn', 'cta-btn']));
    expect(btn?.hasAttribute('data-setup')).toBe(true);
  });

  it('an element action (a group of starters) is used as is; no action is allowed', () => {
    const group = document.createElement('div');
    group.setAttribute('data-group', '');
    const el = render({ kind: 'coach', icon: 'chat', line: 'Ask me.', action: group });
    expect(el.children.at(-1)).toBe(group);
    const bare = render({ kind: 'none', icon: 'dumbbell', line: 'Nothing here.' });
    expect(bare.byTag('button')).toHaveLength(0);
    expect(bare.children).toHaveLength(2);
  });

  it('the copy used by the app passes checkCopy', () => {
    for (const line of [
      'Nothing logged yet today.',
      'No workouts yet. Finish one and your sets show up here.',
    ])
      expect(checkCopy(line).hits).toEqual([]);
  });
});
