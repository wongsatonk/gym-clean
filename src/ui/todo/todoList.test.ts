import { describe, expect, it } from 'vitest';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import { FIX_STATUS, FIX_TOPICS } from './todoFixture';
import {
  rowState,
  rowStateText,
  summaryText,
  todoListScreen,
  type TodoListProps,
} from './todoList';

useFakeDom();

function render(over: Partial<TodoListProps> = {}) {
  const calls = { back: 0, open: [] as string[], copy: 0 };
  const el = asFake(
    todoListScreen(
      {
        topics: FIX_TOPICS,
        status: FIX_STATUS,
        platform: 'web',
        summary: { done: 2, total: 3 },
        ...over,
      },
      {
        onBack: () => calls.back++,
        onOpenTopic: (id) => calls.open.push(id),
        onCopyReport: () => calls.copy++,
      },
    ),
  );
  return { el, calls };
}

const row = (el: FakeEl, id: string) => {
  const r = el.find((e) => e.getAttribute('data-todo-topic') === id)[0];
  if (!r) throw new Error(`no row ${id}`);
  return r;
};
const groupOf = (el: FakeEl, key: string) =>
  el.find((e) => e.getAttribute('data-todo-group') === key)[0];

describe('todoListScreen', () => {
  it('shows the summary and one row per topic with title, checkpoint and state words', () => {
    const { el } = render();
    expect(el.getAttribute('data-screen')).toBe('todos');
    expect(el.find((e) => e.hasAttribute('data-todo-summary'))[0]?.textContent).toBe('2 of 3 done');
    const open = row(el, 'coach-week');
    expect(open.getAttribute('data-state')).toBe('open');
    expect(open.textContent).toContain('Coach tab + Calendar');
    expect(open.textContent).toContain('Checkpoint I');
    expect(open.oneByClass('todo-row-state').textContent).toBe('2 of 5');
    expect(row(el, 'food').oneByClass('todo-row-state').textContent).toBe('Done');
    expect(row(el, 'kit').oneByClass('todo-row-state').textContent).toBe('Skipped');
  });

  it('groups: open first, then done/skipped; native-only topics labelled "In the iPhone app" on the web', () => {
    const { el } = render();
    const groups = el
      .find((e) => e.hasAttribute('data-todo-group'))
      .map((g) => g.getAttribute('data-todo-group'));
    expect(groups).toEqual(['open', 'done', 'native']);
    const native = row(el, 'phone-week');
    expect(native.getAttribute('data-state')).toBe('native');
    expect(native.oneByClass('todo-row-state').textContent).toBe('In the iPhone app');
    expect(groupOf(el, 'native')?.textContent).toContain('not counted');
  });

  it('in the iPhone app native-only topics are ordinary rows', () => {
    const { el } = render({ platform: 'native' });
    expect(groupOf(el, 'native')).toBeUndefined();
    expect(row(el, 'phone-week').getAttribute('data-state')).toBe('open');
  });

  it('rows are ≥ 56px buttons (class todo-row-btn) that open the topic; Back and Copy report call out', () => {
    const { el, calls } = render();
    const btn = row(el, 'food').byTag('button')[0];
    expect(btn?.classes).toContain('todo-row-btn');
    expect(btn?.getAttribute('aria-label')).toBe('Food photos, Checkpoint D: Done');
    btn?.click();
    expect(calls.open).toEqual(['food']);
    const copy = el.find((e) => e.hasAttribute('data-copy-report'))[0];
    // M13d task 40d: Copy report is a round icon button on a pill row.
    expect(copy?.hasAttribute('data-icon-btn')).toBe(true);
    copy?.click();
    expect(calls.copy).toBe(1);
    // The top-bar Back (task 40a restyles it; `data-back` stays).
    el.find((e) => e.hasAttribute('data-back'))[0]?.click();
    expect(calls.back).toBe(1);
  });

  it('Copy report is the last thing on the screen', () => {
    const { el } = render();
    const last = el.children[el.children.length - 1];
    expect(last?.find((e) => e.hasAttribute('data-copy-report'))).toHaveLength(1);
  });

  it('helpers', () => {
    const [coach] = FIX_TOPICS;
    if (!coach) throw new Error('fixture');
    expect(rowState(coach, undefined, 'web')).toBe('open');
    expect(rowStateText('open', coach, undefined)).toBe('0 of 5');
    expect(summaryText({ done: 6, total: 12 })).toBe('6 of 12 done');
  });
});
