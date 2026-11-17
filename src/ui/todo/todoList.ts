// M12 slice 1c task 9: the To-do list screen (SPEC M12 "To-do guides" goal 2).
// One ≥ 56px row per topic: title, which checkpoint, and its state as words ("3 of 5", "Done",
// "Skipped"; never colour alone). Rows are grouped: To do (data order), then Done (done or
// skipped), then — on the web only — "In the iPhone app" for native-only topics, which are left
// out of the count. Copy report sits at the bottom.
//
// Props in, callbacks out: topics are data (src/data/todos), each topic's status comes from core
// `topicStatus(...)`. No DB access here; app.ts gathers facts and opens topics / the report.
//
// e2e hooks: `main[data-screen="todos"]`, `[data-todo-summary]`, `li[data-todo-topic=<id>]` with
// `data-state` = open / done / skipped / native, `[data-todo-group]` = open / done / native,
// `[data-copy-report]`.
import type { TodoTopic } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import './todos.css';

/** Same shape as core `topicStatus(topic, answers, facts)`. */
export type TodoTopicStatus = {
  done: boolean;
  skipped: boolean;
  stepsDone: number;
  steps: number;
  nextStepId?: string | null | undefined;
};

export type TodoListProps = {
  topics: readonly TodoTopic[];
  /** topic id → status. A topic without a status shows as "0 of n". */
  status: Readonly<Record<string, TodoTopicStatus>>;
  platform: 'web' | 'native';
  /** Core `todoSummary(...)`: done / total on this platform. */
  summary: { done: number; total: number };
};

export type TodoListActions = {
  onBack: () => void;
  onOpenTopic: (topicId: string) => void;
  onCopyReport: () => void;
};

export type TodoRowState = 'open' | 'done' | 'skipped' | 'native';

/** Native-only topics can't be done in the web app: labelled, not counted. */
export function rowState(
  topic: TodoTopic,
  status: TodoTopicStatus | undefined,
  platform: 'web' | 'native',
): TodoRowState {
  if (topic.platform === 'native' && platform === 'web') return 'native';
  if (status?.skipped) return 'skipped';
  if (status?.done) return 'done';
  return 'open';
}

/** The state words on the right of a row. */
export function rowStateText(
  state: TodoRowState,
  topic: TodoTopic,
  status: TodoTopicStatus | undefined,
): string {
  if (state === 'done') return 'Done';
  if (state === 'skipped') return 'Skipped';
  if (state === 'native') return 'In the iPhone app';
  return `${status?.stepsDone ?? 0} of ${status?.steps ?? topic.steps.length}`;
}

/** "6 of 12 done". */
export function summaryText(s: { done: number; total: number }): string {
  return `${s.done} of ${s.total} done`;
}

function topicRow(
  topic: TodoTopic,
  status: TodoTopicStatus | undefined,
  state: TodoRowState,
  actions: TodoListActions,
): HTMLElement {
  const stateText = rowStateText(state, topic, status);
  const mark =
    state === 'done'
      ? icon('check', 'sm')
      : state === 'skipped'
        ? icon('skip', 'sm')
        : state === 'native'
          ? icon('lock', 'sm')
          : null;
  return h(
    'li',
    { class: `todo-row todo-${state}`, 'data-todo-topic': topic.id, 'data-state': state },
    h(
      'button',
      {
        type: 'button',
        class: 'todo-row-btn',
        'aria-label': `${topic.title}${topic.checkpoint ? `, ${topic.checkpoint}` : ''}: ${stateText}`,
        onclick: () => actions.onOpenTopic(topic.id),
      },
      h(
        'span',
        { class: 'todo-row-txt' },
        h('strong', { class: 'todo-row-title' }, topic.title),
        topic.checkpoint ? h('span', { class: 'todo-row-cp' }, topic.checkpoint) : null,
      ),
      h('span', { class: 'todo-row-state' }, mark, h('span', {}, stateText)),
    ),
  );
}

function group(key: string, title: string, rows: HTMLElement[], note?: string): HTMLElement | null {
  if (!rows.length) return null;
  return h(
    'section',
    { class: 'todo-group', 'data-todo-group': key, 'aria-labelledby': `todo-g-${key}` },
    h('h2', { class: 'set-head', id: `todo-g-${key}` }, title),
    note ? h('p', { class: 'muted set-note' }, note) : null,
    h('ul', { class: 'todo-rows' }, ...rows),
  );
}

export function todoListScreen(props: TodoListProps, actions: TodoListActions): HTMLElement {
  const buckets: Record<'open' | 'done' | 'native', HTMLElement[]> = {
    open: [],
    done: [],
    native: [],
  };
  for (const t of props.topics) {
    const st = props.status[t.id];
    const state = rowState(t, st, props.platform);
    const row = topicRow(t, st, state, actions);
    if (state === 'native') buckets.native.push(row);
    else if (state === 'open') buckets.open.push(row);
    else buckets.done.push(row);
  }
  return h(
    'main',
    { class: `screen todos ${moodClass('pro')}`, 'data-screen': 'todos' },
    h(
      'header',
      { class: 'top-bar' },
      h(
        'button',
        { class: 'ghost-btn', type: 'button', onclick: () => actions.onBack() },
        '‹ Back',
      ),
    ),
    h('h1', { class: 'page-title' }, 'To-dos'),
    h('p', { class: 'todo-summary', 'data-todo-summary': true }, summaryText(props.summary)),
    group('open', 'To do', buckets.open),
    group('done', 'Done', buckets.done),
    group(
      'native',
      'In the iPhone app',
      buckets.native,
      'These need the iPhone app, so they are not counted here.',
    ),
    h(
      'section',
      { class: 'todo-report-box', 'aria-labelledby': 'todo-report-title' },
      h('h2', { class: 'set-head', id: 'todo-report-title' }, 'Report'),
      h(
        'p',
        { class: 'muted set-note' },
        'One text with your answers since your last copy. You see it before it is copied.',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'todo-copy-btn',
          'data-copy-report': true,
          onclick: () => actions.onCopyReport(),
        },
        icon('list', 'md'),
        h('span', {}, 'Copy report'),
      ),
    ),
  );
}
