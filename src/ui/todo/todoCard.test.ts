import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom } from '../screens/testDom';
import { resignText, todoCard, todoCountText } from './todoCard';

useFakeDom();

describe('todoCard', () => {
  it('"To-dos: 6 of 12 done" + next topic, one button that opens the list', () => {
    let opened = 0;
    const el = asFake(
      todoCard(
        { done: 6, total: 12, visible: true, nextTitle: 'Coach tab + Calendar' },
        { onOpen: () => opened++ },
      ),
    );
    expect(el.tag).toBe('button');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.find((e) => e.hasAttribute('data-todo-count'))[0]?.textContent).toBe(
      'To-dos: 6 of 12 done',
    );
    expect(el.find((e) => e.hasAttribute('data-todo-next'))[0]?.textContent).toBe(
      'Next: Coach tab + Calendar',
    );
    expect(el.find((e) => e.hasAttribute('data-todo-resign'))).toHaveLength(0);
    el.click();
    expect(opened).toBe(1);
  });

  it('is absent when every topic is done (visible false) or with no props', () => {
    expect(todoCard({ done: 12, total: 12, visible: false }, { onOpen: () => {} })).toBeNull();
    expect(todoCard(null, { onOpen: () => {} })).toBeNull();
  });

  it('shows the re-sign line only at ≤ 2 days left, with a warn edge', () => {
    const at = (d: number | null) =>
      asFake(
        todoCard({ done: 1, total: 3, visible: true, resignDaysLeft: d }, { onOpen: () => {} }),
      );
    expect(at(3).find((e) => e.hasAttribute('data-todo-resign'))).toHaveLength(0);
    expect(at(null).classes).not.toContain('todo-card-warn');
    const two = at(2);
    expect(two.find((e) => e.hasAttribute('data-todo-resign'))[0]?.textContent).toBe(
      'Re-sign in 2 days',
    );
    expect(two.classes).toContain('todo-card-warn');
  });

  it('wording', () => {
    expect(todoCountText(0, 4)).toBe('To-dos: 0 of 4 done');
    expect(resignText(1)).toBe('Re-sign in 1 day');
    expect(resignText(0)).toBe('Re-sign today');
    expect(resignText(-1)).toBe('Re-sign today');
    expect(resignText(undefined)).toBeNull();
    for (const s of [todoCountText(6, 12), resignText(2) ?? '']) expect(checkCopy(s).ok).toBe(true);
  });
});
