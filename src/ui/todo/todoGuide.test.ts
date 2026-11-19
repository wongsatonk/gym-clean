import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRoute, TodoAnswer } from '../../core/types';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import { FIX_ANSWERS, FIX_RESULTS, FIX_STATUS, FIX_TOPICS } from './todoFixture';
import {
  NOTE_MAX,
  autoProgressText,
  defaultDecisionPreview,
  latestAsk,
  stepCountText,
  todoGuideScreen,
  type TodoGuideProps,
} from './todoGuide';

useFakeDom();

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('fixture');
  return v;
}
const TOPIC = must(FIX_TOPICS[0]);
const STEP = { asked: 0, sessions: 1, motion: 2, types: 3, cards: 4 } as const;

function render(over: Partial<TodoGuideProps> = {}) {
  const calls = {
    answers: [] as { stepId: string; optionIds: string[]; note: string | undefined }[],
    tryIt: [] as AppRoute[],
    skip: 0,
    back: 0,
    next: 0,
    close: 0,
  };
  const el = asFake(
    todoGuideScreen(
      {
        topic: TOPIC,
        status: must(FIX_STATUS['coach-week']),
        stepIndex: 0,
        answers: FIX_ANSWERS,
        results: FIX_RESULTS,
        platform: 'web',
        ...over,
      },
      {
        onAnswer: (stepId, optionIds, note) => calls.answers.push({ stepId, optionIds, note }),
        onTryIt: (r) => calls.tryIt.push(r),
        onSkipTopic: () => calls.skip++,
        onBack: () => calls.back++,
        onNext: () => calls.next++,
        onClose: () => calls.close++,
      },
    ),
  );
  return { el, calls };
}

const one = (el: FakeEl, attr: string) => {
  const hit = el.find((e) => e.hasAttribute(attr))[0];
  if (!hit) throw new Error(`no [${attr}]`);
  return hit;
};
const opt = (el: FakeEl, id: string) => {
  const hit = el.find((e) => e.getAttribute('data-option') === id)[0];
  if (!hit) throw new Error(`no option ${id}`);
  return hit;
};

describe('todoGuideScreen: header and navigation', () => {
  it('shows the topic, checkpoint and "Step 1 of 5"', () => {
    const { el } = render();
    expect(el.getAttribute('data-screen')).toBe('todo-guide');
    expect(el.getAttribute('data-step')).toBe('asked');
    expect(el.textContent).toContain('Coach tab + Calendar');
    expect(el.textContent).toContain('Checkpoint I');
    expect(one(el, 'data-step-count').textContent).toBe('Step 1 of 5');
    // Segment bar: one per step, current marked by an outline (+ the words above).
    expect(el.byClass('todo-seg')).toHaveLength(5);
    expect(el.byClass('now')).toHaveLength(1);
  });

  it('M13d task 24: the edge swipe takes the step Back, not the top-bar To-dos', () => {
    for (const stepIndex of [0, 2]) {
      const { el } = render({ stepIndex });
      const marked = el.find((e) => e.hasAttribute('data-swipe-back'));
      expect(marked).toHaveLength(1);
      expect(marked[0]?.hasAttribute('data-guide-back')).toBe(true);
    }
  });

  it('Back on step 1 closes; on later steps it goes back; Next / Done on the last step', () => {
    let r = render();
    one(r.el, 'data-guide-back').click();
    expect(r.calls).toMatchObject({ close: 1, back: 0 });
    r = render({ stepIndex: 2 });
    one(r.el, 'data-guide-back').click();
    one(r.el, 'data-guide-next').click();
    expect(r.calls).toMatchObject({ back: 1, next: 1, close: 0 });
    r = render({ stepIndex: 4 });
    expect(one(r.el, 'data-guide-next').textContent).toBe('Done');
    // M13d task 40d: Next / Done is the main round button on a pill; Back a secondary circle.
    expect(one(r.el, 'data-guide-next').getAttribute('data-variant')).toBe('main');
    expect(one(r.el, 'data-guide-next').hasAttribute('data-wide-hit')).toBe(true);
    expect(one(r.el, 'data-guide-back').getAttribute('data-variant')).toBe('secondary');
    one(r.el, 'data-guide-next').click();
    expect(r.calls).toMatchObject({ next: 0, close: 1 });
  });

  it('clamps an out-of-range step index', () => {
    expect(render({ stepIndex: 99 }).el.getAttribute('data-step')).toBe('cards');
  });

  it('native-only topic on the web says it is done in the iPhone app', () => {
    const { el } = render({ topic: must(FIX_TOPICS[2]), status: must(FIX_STATUS['phone-week']) });
    expect(el.textContent).toContain('This one is done in the iPhone app.');
  });
});

describe('todoGuideScreen: auto steps', () => {
  it('ticked: "Done" + the day it was ticked, no Try it', () => {
    const { el } = render({ stepIndex: STEP.asked });
    expect(one(el, 'data-auto-state').getAttribute('data-auto-state')).toBe('done');
    expect(el.textContent).toContain('Ticked Sat 14 Nov');
    expect(el.find((e) => e.hasAttribute('data-try-it'))).toHaveLength(0);
  });

  it('not yet: have / need and the Try it link', () => {
    const { el, calls } = render({ stepIndex: STEP.sessions });
    expect(one(el, 'data-auto-state').getAttribute('data-auto-state')).toBe('todo');
    expect(one(el, 'data-auto-progress').textContent).toBe('So far: 2 of 3');
    expect(el.textContent).toContain('The coach needs a few sessions');
    one(el, 'data-try-it').click();
    expect(calls.tryIt).toEqual(['today']);
  });

  it('a stored tick stays ticked even when the detector no longer says done', () => {
    const { el } = render({
      stepIndex: STEP.asked,
      results: { asked: { done: false, have: 0, need: 1 } },
    });
    expect(one(el, 'data-auto-state').getAttribute('data-auto-state')).toBe('done');
  });

  it('progress text', () => {
    expect(autoProgressText({ done: false, have: 5, need: 3 })).toBe('So far: 3 of 3');
    expect(autoProgressText({ done: false })).toBeNull();
    expect(autoProgressText(undefined)).toBeNull();
  });
});

describe('todoGuideScreen: ask steps', () => {
  it('single choice: radiogroup, the stored answer is checked with a check mark, tap saves at once', () => {
    const { el, calls } = render({ stepIndex: STEP.motion });
    const group = el.find((e) => e.getAttribute('role') === 'radiogroup')[0];
    expect(group?.getAttribute('aria-labelledby')).toBe('todo-step-motion');
    expect(opt(el, 'much').getAttribute('aria-checked')).toBe('true');
    expect(opt(el, 'much').getAttribute('role')).toBe('radio');
    expect(opt(el, 'much').oneByClass('todo-opt-mark').children).toHaveLength(1); // check icon
    expect(opt(el, 'right').oneByClass('todo-opt-mark').children).toHaveLength(0);
    opt(el, 'right').click();
    expect(opt(el, 'right').getAttribute('aria-checked')).toBe('true');
    expect(opt(el, 'much').getAttribute('aria-checked')).toBe('false');
    expect(opt(el, 'right').classes).toContain('on');
    expect(calls.answers).toEqual([
      {
        stepId: 'motion',
        optionIds: ['right'],
        note: 'The calendar slide felt slow on the first open.',
      },
    ]);
  });

  it('multi choice: checkboxes, toggles, "Pick all that fit", no note when note is none', () => {
    const { el, calls } = render({ stepIndex: STEP.types });
    expect(el.find((e) => e.getAttribute('role') === 'group')).toHaveLength(1);
    expect(opt(el, 'weight').getAttribute('role')).toBe('checkbox');
    expect(el.textContent).toContain('Pick all that fit.');
    expect(el.find((e) => e.hasAttribute('data-note'))).toHaveLength(0);
    opt(el, 'sleep').click();
    opt(el, 'weight').click();
    opt(el, 'sleep').click();
    expect(calls.answers.map((a) => a.optionIds)).toEqual([
      ['sleep'],
      ['weight', 'sleep'],
      ['weight'],
    ]);
    expect(calls.answers.every((a) => a.note === undefined)).toBe(true);
  });

  it('note: max 500, live counter, saved on change and flushed by Next', () => {
    const { el, calls } = render({ stepIndex: STEP.motion });
    const note = one(el, 'data-note') as FakeEl & { value: string };
    expect(note.getAttribute('maxlength')).toBe(String(NOTE_MAX));
    expect(note.value).toBe('The calendar slide felt slow on the first open.');
    expect(one(el, 'data-note-count').textContent).toBe('47 / 500');
    note.value = 'Felt fine';
    note.dispatch('input', {});
    expect(one(el, 'data-note-count').textContent).toBe('9 / 500');
    note.dispatch('change', {});
    expect(calls.answers.at(-1)).toEqual({
      stepId: 'motion',
      optionIds: ['much'],
      note: 'Felt fine',
    });
    note.value = 'Felt fine, a bit slow';
    one(el, 'data-guide-next').click();
    expect(calls.answers.at(-1)?.note).toBe('Felt fine, a bit slow');
    expect(calls.next).toBe(1);
  });

  it('note longer than 500 is cut to 500; an unchanged note does not save again', () => {
    const { el, calls } = render({ stepIndex: STEP.motion });
    const note = one(el, 'data-note') as FakeEl & { value: string };
    note.dispatch('change', {});
    expect(calls.answers).toHaveLength(0);
    note.value = 'x'.repeat(600);
    note.dispatch('change', {});
    expect(calls.answers[0]?.note).toHaveLength(NOTE_MAX);
  });

  it('keyboard: arrows move through the radio options and select them', () => {
    const { el, calls } = render({ stepIndex: STEP.motion });
    const group = must(el.find((e) => e.getAttribute('role') === 'radiogroup')[0]);
    (opt(el, 'much') as unknown as { focus: () => void }).focus();
    group.dispatch('keydown', { key: 'ArrowDown' });
    expect(opt(el, 'little').getAttribute('aria-checked')).toBe('true');
    group.dispatch('keydown', { key: 'ArrowDown' }); // wraps
    expect(opt(el, 'right').getAttribute('aria-checked')).toBe('true');
    group.dispatch('keydown', { key: 'Enter' }); // not an arrow: nothing
    expect(calls.answers.map((a) => a.optionIds[0])).toEqual(['little', 'right']);
  });

  it('latestAsk picks the newest answer', () => {
    const older: TodoAnswer = {
      id: 'o',
      topicId: 't',
      stepId: 's',
      kind: 'ask',
      optionIds: ['a'],
      at: 1,
      release: '1.12.0',
    };
    const newer: TodoAnswer = { ...older, id: 'n', optionIds: ['b'], at: 2 };
    expect(latestAsk([newer, older], 's')?.id).toBe('n');
  });
});

describe('todoGuideScreen: decision steps', () => {
  it('shows what the setting will be for the chosen option', () => {
    const { el } = render({ stepIndex: STEP.cards, answers: [] });
    const box = one(el, 'data-decision');
    expect(box.textContent).toBe('Pick an answer. It sets this in the app for you.');
    opt(el, 'no').click();
    expect(box.textContent).toBe('Setting after this: No');
  });

  it('uses the decisionPreview prop when given', () => {
    const { el } = render({
      stepIndex: STEP.cards,
      answers: [],
      decisionPreview: (_s, id) => `Card reasons for the coach: ${id === 'yes' ? 'On' : 'Off'}`,
    });
    opt(el, 'yes').click();
    expect(one(el, 'data-decision').textContent).toBe('Card reasons for the coach: On');
  });

  it('default preview wording passes checkCopy', () => {
    const step = TOPIC.steps[STEP.cards];
    if (step?.kind !== 'ask') throw new Error('fixture');
    expect(checkCopy(defaultDecisionPreview(step, 'yes')).ok).toBe(true);
    expect(stepCountText(1, 5)).toBe('Step 2 of 5');
  });
});

describe('todoGuideScreen: Skip this topic', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('needs two taps; disarms after the confirm window', () => {
    const { el, calls } = render({ confirmMs: 1000 });
    const skip = one(el, 'data-skip-topic');
    skip.click();
    expect(skip.hasAttribute('data-armed')).toBe(true);
    expect(skip.textContent).toBe('Tap again to skip');
    expect(skip.hasAttribute('data-icon-btn')).toBe(true);
    expect(calls.skip).toBe(0);
    vi.advanceTimersByTime(1001);
    expect(skip.hasAttribute('data-armed')).toBe(false);
    skip.click();
    skip.click();
    expect(calls.skip).toBe(1);
  });

  it('a skipped topic says so and has no Skip button', () => {
    const { el } = render({ status: { ...must(FIX_STATUS['coach-week']), skipped: true } });
    expect(el.find((e) => e.hasAttribute('data-topic-skipped'))).toHaveLength(1);
    expect(el.find((e) => e.hasAttribute('data-skip-topic'))).toHaveLength(0);
  });
});
