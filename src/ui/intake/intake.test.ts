import { describe, expect, it } from 'vitest';
import type { Intake } from '../../core/types';
import { checkCopy } from '../../core/trainer/replies';
import { INTAKE_OPTIONS } from '../../core/trainerKit/intake';
import { LEARN_CARDS } from '../../data/learnCards';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import {
  AREA_LABEL,
  CORE_LABEL,
  EASY_ON_TITLE,
  EXPERIENCE_LABEL,
  FUEL_TITLE,
  GOAL_LABEL,
  INTAKE_COPY,
  PLAN_TITLE_REBUILD,
  PLAN_TITLE_STARTER,
  areaList,
  intakeScreen,
  leadLine,
  intakeSummary,
  questionCountText,
  type IntakeActions,
  type IntakeChange,
  type IntakeChangeId,
  type IntakeProps,
} from './intake';

useFakeDom();

const FULL: Intake = {
  goalKind: 'fat',
  goalText: 'Feel good in summer clothes',
  days: 4,
  sessionMin: 45,
  experience: 'some',
  easyOn: ['shoulders'],
  at: 1,
};

const CHANGES: IntakeChange[] = [
  {
    id: 'plan',
    title: PLAN_TITLE_STARTER,
    lines: ['Upper / lower, 4 days a week', 'About 45 min'],
  },
  { id: 'easyOn', title: EASY_ON_TITLE, lines: ['Shoulders'] },
  {
    id: 'fuel',
    title: FUEL_TITLE,
    before: '2,100 kcal · 110 g protein',
    after: '1,700 kcal · 130 g protein',
  },
];

function render(over: Partial<IntakeProps> = {}, act: Partial<IntakeActions> = {}) {
  const calls = {
    save: [] as Intake[],
    apply: [] as [IntakeChangeId, Intake][],
    done: [] as Intake[],
    skip: 0,
    close: 0,
    changes: [] as Intake[],
  };
  const el = asFake(
    intakeScreen(
      {
        changes: (i) => {
          calls.changes.push(i);
          return CHANGES;
        },
        now: () => 777,
        ...over,
      },
      {
        onSave: (i) => calls.save.push(i),
        onApply: (id, i) => {
          calls.apply.push([id, i]);
        },
        onDone: (i) => calls.done.push(i),
        onSkip: () => calls.skip++,
        ...act,
      },
    ),
  );
  return { el, calls };
}

const by = (el: FakeEl, attr: string, value?: string) =>
  el.find((e) => (value === undefined ? e.hasAttribute(attr) : e.getAttribute(attr) === value));
const one = (el: FakeEl, attr: string, value?: string) => {
  const hit = by(el, attr, value)[0];
  if (!hit) throw new Error(`no [${attr}${value === undefined ? '' : `=${value}`}]`);
  return hit;
};
const opt = (el: FakeEl, id: string) => one(el, 'data-option', id);
const next = (el: FakeEl) => one(el, 'data-intake-next');
const step = (el: FakeEl) => el.getAttribute('data-step');
const title = (el: FakeEl) => el.byTag('h1')[0]?.textContent;

/** Answers every question with FULL and lands on the summary. */
function answerAll(el: FakeEl) {
  opt(el, 'fat').click();
  const input = one(el, 'data-goal-text') as FakeEl & { value: string };
  input.value = FULL.goalText ?? '';
  input.dispatch('input', {});
  next(el).click();
  opt(el, '4').click();
  next(el).click();
  opt(el, '45').click();
  next(el).click();
  opt(el, 'some').click();
  next(el).click();
  opt(el, 'shoulders').click();
  next(el).click();
  // The abs question: No is already chosen.
  next(el).click();
}

/** What the answers above emit (the abs answer is always passed, No by default). */
const WANT: Intake = { ...FULL, wantsCore: false, at: 777 };

describe('intake: questions', () => {
  it('opens on the goal question: four goals, none chosen, Next off, no Back', () => {
    const { el } = render();
    expect(el.getAttribute('data-screen')).toBe('intake');
    expect(el.classes).toEqual(expect.arrayContaining(['screen', 'intake', 'mood-pro']));
    expect(step(el)).toBe('goal');
    expect(title(el)).toBe(INTAKE_COPY.goal.title);
    expect(one(el, 'data-intake-count').textContent).toBe('Question 1 of 6');
    const opts = by(el, 'data-option');
    expect(opts.map((o) => o.textContent)).toEqual([
      'Build muscle',
      'Lose fat',
      'Get stronger',
      'General fitness',
    ]);
    // No goal is assumed.
    expect(opts.every((o) => o.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(opts.every((o) => o.getAttribute('role') === 'radio')).toBe(true);
    expect(el.byClass('intake-opts')[0]?.getAttribute('role')).toBe('radiogroup');
    expect(next(el).hasAttribute('disabled')).toBe(true);
    expect(by(el, 'data-intake-back')).toHaveLength(0);
    expect(by(el, 'data-intake-close')).toHaveLength(0);
    expect(by(el, 'data-intake-skip')).toHaveLength(1);
    // Own words: optional, labelled, capped.
    const input = one(el, 'data-goal-text');
    expect(input.getAttribute('maxlength')).toBe('80');
    const label = el.byTag('label')[0];
    expect(label?.getAttribute('for')).toBe(input.getAttribute('id'));
    expect(label?.textContent).toBe(INTAKE_COPY.goalText);
  });

  it('a pick ticks the option (mark + aria-checked) and turns Next on; Next does nothing before', () => {
    const { el } = render();
    next(el).click();
    expect(step(el)).toBe('goal');
    opt(el, 'strength').click();
    expect(opt(el, 'strength').getAttribute('aria-checked')).toBe('true');
    expect(opt(el, 'strength').classes).toContain('on');
    expect(opt(el, 'strength').byTag('svg')).toHaveLength(1);
    expect(opt(el, 'muscle').getAttribute('aria-checked')).toBe('false');
    expect(next(el).hasAttribute('disabled')).toBe(false);
    opt(el, 'muscle').click();
    expect(opt(el, 'strength').getAttribute('aria-checked')).toBe('false');
    expect(opt(el, 'strength').byTag('svg')).toHaveLength(0);
  });

  it('walks days → length → experience → easy-on, one question per screen', () => {
    const { el } = render();
    opt(el, 'muscle').click();
    next(el).click();

    expect(step(el)).toBe('days');
    expect(title(el)).toBe(INTAKE_COPY.days.title);
    expect(one(el, 'data-intake-count').textContent).toBe('Question 2 of 6');
    expect(by(el, 'data-option').map((o) => o.getAttribute('data-option'))).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(opt(el, '3').getAttribute('aria-label')).toBe('3 days a week');
    expect(next(el).hasAttribute('disabled')).toBe(true);
    expect(by(el, 'data-intake-back')).toHaveLength(1);
    opt(el, '3').click();
    next(el).click();

    expect(step(el)).toBe('length');
    expect(by(el, 'data-option').map((o) => o.textContent)).toEqual([
      '30 min',
      '45 min',
      '60 min',
      '75 min',
    ]);
    opt(el, '60').click();
    next(el).click();

    expect(step(el)).toBe('experience');
    expect(by(el, 'data-option').map((o) => o.textContent)).toEqual(
      Object.values(EXPERIENCE_LABEL),
    );
    opt(el, 'new').click();
    next(el).click();

    expect(step(el)).toBe('easyOn');
    expect(one(el, 'data-intake-count').textContent).toBe('Question 5 of 6');
    const areas = by(el, 'data-option');
    expect(areas.map((o) => o.textContent)).toEqual(Object.values(AREA_LABEL));
    expect(areas.every((o) => o.getAttribute('role') === 'checkbox')).toBe(true);
    // Optional: Next is on with nothing ticked.
    expect(next(el).hasAttribute('disabled')).toBe(false);
    opt(el, 'back').click();
    opt(el, 'legs').click();
    opt(el, 'back').click();
    expect(opt(el, 'back').getAttribute('aria-checked')).toBe('false');
    expect(opt(el, 'legs').getAttribute('aria-checked')).toBe('true');
    // Not the last question any more: plain Next.
    expect(next(el).textContent).toBe('Next');
  });

  it('then "Add abs to your plan?": No chosen by default (check + words), Yes passes wantsCore', () => {
    const { el, calls } = render({ initial: FULL, startStep: 'easyOn' });
    next(el).click();
    expect(step(el)).toBe('wantsCore');
    expect(title(el)).toBe('Add abs to your plan?');
    expect(el.textContent).toContain(INTAKE_OPTIONS.wantsCore.hint);
    expect(one(el, 'data-intake-count').textContent).toBe('Question 6 of 6');
    const opts = by(el, 'data-option');
    expect(opts.map((o) => o.getAttribute('data-option'))).toEqual(['no', 'yes']);
    expect(opts.map((o) => o.textContent)).toEqual(['No', 'Yes, add abs']);
    expect(opts.every((o) => o.getAttribute('role') === 'radio')).toBe(true);
    expect(el.byClass('intake-opts')[0]?.getAttribute('role')).toBe('radiogroup');
    expect(opt(el, 'no').getAttribute('aria-checked')).toBe('true');
    expect(opt(el, 'no').byTag('svg')).toHaveLength(1);
    expect(opt(el, 'yes').getAttribute('aria-checked')).toBe('false');
    // The last question: Next leads to the summary, on without a tap.
    expect(next(el).hasAttribute('disabled')).toBe(false);
    expect(next(el).textContent).toBe('See what changes');
    expect(by(el, 'data-intake-skip')).toHaveLength(1);

    opt(el, 'yes').click();
    expect(opt(el, 'yes').getAttribute('aria-checked')).toBe('true');
    expect(opt(el, 'yes').byTag('svg')).toHaveLength(1);
    expect(opt(el, 'no').getAttribute('aria-checked')).toBe('false');
    next(el).click();
    expect(step(el)).toBe('summary');
    expect(calls.save).toEqual([{ ...FULL, wantsCore: true, at: 777 }]);
    expect(one(el, 'data-intake-answers').textContent).toBe(
      'Lose fat · 4 days a week · 45 min · Easy on: Shoulders · With abs',
    );
    // Back returns to the abs question with Yes kept.
    one(el, 'data-intake-back').click();
    expect(step(el)).toBe('wantsCore');
    expect(opt(el, 'yes').getAttribute('aria-checked')).toBe('true');
  });

  it('the abs question starts from a stored Yes, and a stored No stays No', () => {
    const { el } = render({ initial: { ...FULL, wantsCore: true }, startStep: 'wantsCore' });
    expect(opt(el, 'yes').getAttribute('aria-checked')).toBe('true');
    expect(opt(el, 'no').getAttribute('aria-checked')).toBe('false');
    const { el: el2, calls } = render({ initial: { ...FULL, wantsCore: false } });
    expect(step(el2)).toBe('goal');
    for (let i = 0; i < 6; i++) next(el2).click();
    expect(step(el2)).toBe('summary');
    expect(calls.save[0]?.wantsCore).toBe(false);
  });

  it('Why? on the abs question opens the core-training card when the caller passes onLearn', () => {
    const { el } = render({ initial: FULL, startStep: 'wantsCore' });
    expect(by(el, 'data-learn-open')).toHaveLength(0); // no handler, no link
    const opened: [string, FakeEl][] = [];
    const { el: el2 } = render(
      { initial: FULL, startStep: 'wantsCore' },
      { onLearn: (id, opener) => opened.push([id, asFake(opener)]) },
    );
    const why = one(el2, 'data-learn-open', 'coreTraining');
    expect(why.tag).toBe('button');
    expect(why.textContent).toBe('Why?');
    why.click();
    expect(opened.map(([id]) => id)).toEqual(['coreTraining']);
    expect(opened[0]?.[1]).toBe(why);
    // M13d follow-up (q): the card opens without its focus-block `why` here.
    expect(why.hasAttribute('data-learn-hide-why')).toBe(true);
    // Only on the abs question.
    const { el: el3 } = render(
      { initial: FULL, startStep: 'easyOn' },
      { onLearn: () => undefined },
    );
    expect(by(el3, 'data-learn-open')).toHaveLength(0);
  });

  it('Back keeps the answers; the question heading takes focus on each step', () => {
    const { el } = render();
    opt(el, 'general').click();
    next(el).click();
    expect((globalThis.document as unknown as { activeElement: FakeEl }).activeElement.tag).toBe(
      'h1',
    );
    opt(el, '5').click();
    one(el, 'data-intake-back').click();
    expect(step(el)).toBe('goal');
    expect(opt(el, 'general').getAttribute('aria-checked')).toBe('true');
    next(el).click();
    expect(opt(el, '5').getAttribute('aria-checked')).toBe('true');
  });

  it('keyboard: arrows move and choose in a radio group, only move in the checkbox group', () => {
    const { el } = render();
    const group = el.byClass('intake-opts')[0];
    opt(el, 'muscle').focus();
    let prevented = 0;
    group?.dispatch('keydown', { key: 'ArrowDown', preventDefault: () => prevented++ });
    expect(opt(el, 'fat').getAttribute('aria-checked')).toBe('true');
    group?.dispatch('keydown', { key: 'ArrowUp', preventDefault: () => prevented++ });
    group?.dispatch('keydown', { key: 'ArrowLeft', preventDefault: () => prevented++ });
    expect(opt(el, 'general').getAttribute('aria-checked')).toBe('true'); // wraps
    group?.dispatch('keydown', { key: 'a', preventDefault: () => prevented++ });
    expect(prevented).toBe(3);

    // Enter in the own-words box goes on.
    const input = one(el, 'data-goal-text') as FakeEl & { value: string };
    input.value = 'Carry the shopping up the stairs';
    input.dispatch('keydown', { key: 'Enter' });
    expect(step(el)).toBe('days');

    const { el: el2 } = render({ initial: FULL, startStep: 'easyOn' });
    const areas = el2.byClass('intake-opts')[0];
    opt(el2, 'arms').focus();
    areas?.dispatch('keydown', { key: 'ArrowDown' });
    expect(opt(el2, 'shoulders').getAttribute('aria-checked')).toBe('true'); // from FULL
    expect(opt(el2, 'arms').getAttribute('aria-checked')).toBe('false');
    expect(
      (globalThis.document as unknown as { activeElement: FakeEl }).activeElement.getAttribute(
        'data-option',
      ),
    ).toBe('shoulders');
  });

  it('Skip for now is on every question, one tap, and stores nothing', () => {
    const { el, calls } = render();
    opt(el, 'muscle').click();
    next(el).click();
    one(el, 'data-intake-skip').click();
    expect(calls.skip).toBe(1);
    expect(calls.save).toEqual([]);
    expect(calls.apply).toEqual([]);
    expect(calls.done).toEqual([]);
  });

  it('re-run from Settings: starts from the stored answers, with Back to Settings', () => {
    const { el, calls } = render({ initial: FULL }, { onClose: () => calls.close++ });
    expect(opt(el, 'fat').getAttribute('aria-checked')).toBe('true');
    expect((one(el, 'data-goal-text') as FakeEl & { value: string }).value).toBe(FULL.goalText);
    expect(next(el).hasAttribute('disabled')).toBe(false);
    one(el, 'data-intake-close').click();
    one(el, 'data-intake-back').click(); // Back on question 1 closes too
    expect(calls.close).toBe(2);
  });

  it('M13d task 24: the edge swipe takes the question Back, never the close', () => {
    const swipe = (el: FakeEl) => el.find((e) => e.hasAttribute('data-swipe-back'));
    const { el, calls } = render({ initial: FULL }, { onClose: () => calls.close++ });
    expect(swipe(el)).toHaveLength(1);
    expect(swipe(el)[0]?.hasAttribute('data-intake-back')).toBe(true);
    expect(one(el, 'data-intake-close').hasAttribute('data-swipe-back')).toBe(false);
    next(el).click(); // question 2: still the one question Back
    expect(swipe(el)).toHaveLength(1);
    expect(swipe(el)[0]?.hasAttribute('data-intake-back')).toBe(true);
  });

  it('ignores stored answers that are out of range', () => {
    const { el } = render({
      initial: { days: 9, sessionMin: 50 as Intake['sessionMin'], goalKind: 'fat' },
      startStep: 'summary',
    });
    // Falls back to the first unanswered question, never a summary with gaps.
    expect(step(el)).toBe('days');
    expect(by(el, 'data-option').every((o) => o.getAttribute('aria-checked') === 'false')).toBe(
      true,
    );
  });
});

describe('intake: what will change', () => {
  it('the last screen saves the answers and lists each change with its own Apply', () => {
    const { el, calls } = render();
    answerAll(el);
    expect(step(el)).toBe('summary');
    expect(title(el)).toBe(INTAKE_COPY.summary.title);
    expect(el.textContent).toContain(INTAKE_COPY.summary.why);
    const want = WANT;
    expect(calls.save).toEqual([want]);
    expect(calls.changes).toEqual([want]);
    expect(one(el, 'data-intake-answers').textContent).toBe(
      'Lose fat · 4 days a week · 45 min · Easy on: Shoulders',
    );
    expect(by(el, 'data-change').map((c) => c.getAttribute('data-change'))).toEqual([
      'plan',
      'easyOn',
      'fuel',
    ]);
    expect(one(el, 'data-change', 'plan').byTag('h2')[0]?.textContent).toBe(PLAN_TITLE_STARTER);
    // M13d task 19: the first line shows; the rest sits behind More (closed).
    const plan = one(el, 'data-change', 'plan');
    expect(one(plan, 'data-change-lead', 'plan').textContent).toBe(CHANGES[0]?.lines?.[0]);
    expect(plan.byTag('li').map((l) => l.textContent)).toEqual(CHANGES[0]?.lines?.slice(1));
    const more = one(plan, 'data-more', 'change-plan');
    const moreBtn = one(more, 'data-more-btn');
    expect(moreBtn.tag).toBe('button');
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
    expect(one(more, 'data-more-panel').hasAttribute('hidden')).toBe(true);
    moreBtn.click();
    expect(moreBtn.getAttribute('aria-expanded')).toBe('true');
    expect(one(more, 'data-more-panel').hasAttribute('hidden')).toBe(false);
    // A one-line row has no More.
    const easy = one(el, 'data-change', 'easyOn');
    expect(one(easy, 'data-change-lead', 'easyOn').textContent).toBe('Shoulders');
    expect(by(easy, 'data-more')).toHaveLength(0);
    // Fuel: before → after in words.
    const fuel = one(el, 'data-change', 'fuel');
    expect(one(fuel, 'data-diff', 'before').textContent).toBe('Now2,100 kcal · 110 g protein');
    expect(one(fuel, 'data-diff', 'after').textContent).toBe('After1,700 kcal · 130 g protein');
    // Nothing applied yet; no Skip / Next here, Done instead.
    expect(calls.apply).toEqual([]);
    expect(by(el, 'data-apply').map((b) => b.textContent)).toEqual(['Apply', 'Apply', 'Apply']);
    expect(by(el, 'data-intake-skip')).toHaveLength(0);
    expect(by(el, 'data-intake-next')).toHaveLength(0);
    one(el, 'data-intake-done').click();
    expect(calls.done).toEqual([want]);
  });

  it('Apply calls back once, then shows Applied with a check and cannot be tapped again', () => {
    const { el, calls } = render();
    answerAll(el);
    const btn = one(el, 'data-apply', 'easyOn');
    expect(btn.getAttribute('aria-label')).toBe('Apply: Go easy on');
    btn.click();
    btn.click();
    expect(calls.apply.map(([id]) => id)).toEqual(['easyOn']);
    expect(calls.apply[0]?.[1]).toEqual(WANT);
    expect(btn.textContent).toBe('Applied');
    expect(btn.byTag('svg')).toHaveLength(1);
    expect(btn.getAttribute('data-applied')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Applied: Go easy on');
    // The others are untouched.
    expect(one(el, 'data-apply', 'plan').textContent).toBe('Apply');
  });

  it('an Apply that fails (false / rejected) says so and can be tried again', async () => {
    const results: (boolean | Promise<boolean>)[] = [false, Promise.reject(new Error('x')), true];
    const { el } = render({}, { onApply: () => results.shift() });
    answerAll(el);
    const btn = one(el, 'data-apply', 'plan');
    const err = one(el, 'data-change-error', 'plan');
    expect(err.getAttribute('role')).toBe('alert');
    btn.click();
    expect(err.textContent).toBe(INTAKE_COPY.applyFailed);
    expect(btn.hasAttribute('disabled')).toBe(false);
    btn.click();
    expect(btn.hasAttribute('disabled')).toBe(true); // busy
    await Promise.resolve();
    await Promise.resolve();
    expect(err.textContent).toBe(INTAKE_COPY.applyFailed);
    expect(btn.textContent).toBe('Apply');
    btn.click();
    expect(btn.textContent).toBe('Applied');
    expect(err.textContent).toBe('');
  });

  it('an awaited Apply ticks when it resolves', async () => {
    const { el } = render({}, { onApply: () => Promise.resolve() });
    answerAll(el);
    const btn = one(el, 'data-apply', 'fuel');
    btn.click();
    expect(btn.textContent).toBe('Apply');
    await Promise.resolve();
    expect(btn.textContent).toBe('Applied');
  });

  it('applied rows stay ticked after Back and Next with the same answers, not after a change', () => {
    const { el, calls } = render();
    answerAll(el);
    one(el, 'data-apply', 'plan').click();
    one(el, 'data-intake-back').click();
    expect(step(el)).toBe('wantsCore');
    next(el).click();
    expect(one(el, 'data-apply', 'plan').textContent).toBe('Applied');
    expect(calls.save).toHaveLength(2);
    one(el, 'data-intake-back').click();
    one(el, 'data-intake-back').click();
    expect(step(el)).toBe('easyOn');
    opt(el, 'legs').click();
    next(el).click();
    next(el).click();
    expect(one(el, 'data-apply', 'plan').textContent).toBe('Apply');
    expect(calls.save[2]?.easyOn).toEqual(['shoulders', 'legs']);
    // Changing only the abs answer resets the ticks too.
    one(el, 'data-apply', 'plan').click();
    one(el, 'data-intake-back').click();
    opt(el, 'yes').click();
    next(el).click();
    expect(one(el, 'data-apply', 'plan').textContent).toBe('Apply');
  });

  it('shows rows the caller marks as applied, and the rebuild title for an existing plan', () => {
    const { el } = render({
      initial: FULL,
      startStep: 'summary',
      changes: () => [
        { id: 'plan', title: PLAN_TITLE_REBUILD },
        { id: 'easyOn', title: EASY_ON_TITLE, lines: ['Shoulders'], applied: true },
      ],
    });
    expect(step(el)).toBe('summary');
    expect(one(el, 'data-change', 'plan').byTag('h2')[0]?.textContent).toBe(
      'Build a new plan from my answers',
    );
    expect(one(el, 'data-apply', 'easyOn').textContent).toBe('Applied');
    expect(one(el, 'data-apply', 'easyOn').hasAttribute('disabled')).toBe(true);
  });

  it('no changes → one plain line; async changes show "Working it out…" first', async () => {
    const { el } = render({ initial: FULL, startStep: 'summary', changes: () => [] });
    expect(one(el, 'data-intake-none').textContent).toBe(INTAKE_COPY.noChanges);

    const { el: el2 } = render({
      initial: FULL,
      startStep: 'summary',
      changes: () => Promise.resolve(CHANGES),
    });
    expect(one(el2, 'data-intake-changes').textContent).toBe(INTAKE_COPY.working);
    await Promise.resolve();
    expect(by(el2, 'data-change')).toHaveLength(3);
  });

  it('leaves own words out when blank, and trims them', () => {
    const { el, calls } = render({ initial: { ...FULL, goalText: '   ' }, startStep: 'summary' });
    expect(step(el)).toBe('summary');
    expect('goalText' in (calls.save[0] ?? {})).toBe(false);
  });
});

describe('intake: copy', () => {
  it('helpers', () => {
    expect(questionCountText(1)).toBe('Question 2 of 6');
    expect(intakeSummary(FULL)).toBe('Lose fat · 4 days a week · 45 min');
    expect(areaList(['legs', 'arms'])).toBe('Arms, Legs');
    expect(areaList([])).toBe('');
  });

  it('every string passes the coaching-words check and assumes no one', () => {
    const strings = [
      ...Object.values(INTAKE_COPY).flatMap((v) =>
        typeof v === 'string' ? [v] : [v.title, v.why],
      ),
      ...Object.values(GOAL_LABEL),
      ...Object.values(EXPERIENCE_LABEL),
      ...Object.values(AREA_LABEL),
      ...Object.values(CORE_LABEL),
      INTAKE_COPY.withCore,
      PLAN_TITLE_STARTER,
      PLAN_TITLE_REBUILD,
      EASY_ON_TITLE,
      FUEL_TITLE,
    ];
    for (const s of strings) {
      expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
      expect(s).not.toMatch(/\b(he|his|him|she|her|man|men|guys?|bro|wife|husband)\b/i);
      expect(s).not.toMatch(/wongsaton/i);
    }
  });
});

describe('intake: M13d task 19 copy cuts', () => {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

  it('every why line is one short sentence (≤ 10 words) or none', () => {
    for (const step of ['goal', 'days', 'length', 'experience', 'easyOn', 'wantsCore'] as const) {
      const why = INTAKE_COPY[step].why;
      expect(words(why), why).toBeLessThanOrEqual(10);
      expect(why.replace(/\.$/, ''), why).not.toMatch(/[.;!?]/);
    }
  });

  it('leadLine cuts the row title from the start of its first line, nothing else', () => {
    expect(leadLine('Starter plan', 'Starter plan: 3 days a week')).toBe('3 days a week');
    expect(leadLine('Starter plan', 'starter plan · Full body')).toBe('Full body');
    expect(leadLine('Starter plan', 'Starter plans for later')).toBe('Starter plans for later');
    expect(leadLine('Starter plan', 'Starter plan')).toBe('Starter plan');
    expect(leadLine('Fuel targets', 'Set up Fuel for this goal')).toBe('Set up Fuel for this goal');
  });
});

describe('intake: abs question data', () => {
  it('uses the core question, labels and learn card', () => {
    expect(INTAKE_COPY.wantsCore.title).toBe(INTAKE_OPTIONS.wantsCore.question);
    expect(INTAKE_COPY.wantsCore.why).toBe(INTAKE_OPTIONS.wantsCore.hint);
    expect(CORE_LABEL).toEqual({ no: 'No', yes: 'Yes, add abs' });
    expect(LEARN_CARDS.some((c) => c.id === INTAKE_OPTIONS.wantsCore.learnId)).toBe(true);
  });
});
