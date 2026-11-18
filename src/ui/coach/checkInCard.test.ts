import { beforeEach, describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import {
  CHECKIN_ANSWER,
  CHECKIN_COMPACT,
  CHECKIN_INTRO,
  CHECKIN_NEED_ONE,
  CHECKIN_SKIP,
  CHECKIN_SKIPPED,
  buildCheckInCard,
  checkInSummary,
  resetCheckInMemory,
  type CheckInAnswers,
  type CheckInCardProps,
  type CheckInQuestionView,
} from './checkInCard';

useFakeDom();
beforeEach(() => resetCheckInMemory());

// Made-up questions in core's shape (CHECK_IN_QUESTIONS: energy, sleep, soreness; Low / High).
const QS: CheckInQuestionView[] = [
  { id: 'energy', label: 'Energy this week', low: 'Low', high: 'High' },
  { id: 'sleep', label: 'Sleep this week', low: 'Low', high: 'High' },
  { id: 'soreness', label: 'Soreness this week', low: 'Low', high: 'High' },
];

function mount(p: Partial<CheckInCardProps> = {}) {
  const log: string[] = [];
  const built = buildCheckInCard(
    { weekStart: '2026-11-15', status: 'pending', questions: QS, ...p },
    {
      onDone: (a: CheckInAnswers) => log.push(`done:${JSON.stringify(a)}`),
      onSkip: () => log.push('skip'),
    },
  );
  return { el: asFake(built.el), controls: built.controls.map(asFake), log };
}
const pick = (el: FakeEl, v: string) =>
  el.find((e) => e.getAttribute('data-checkin-pick') === v)[0] as FakeEl;
const by = (el: FakeEl, a: string) => el.find((e) => e.hasAttribute(a))[0] as FakeEl;
const ev = (key: string) => ({ key, preventDefault: () => {} });

describe('checkInCard: pending, collapsed (Checkpoint J: the card must not hide the chat)', () => {
  it('collapsed by default: one short line, Answer (expands in place) and Skip; questions hidden', () => {
    const { el } = mount();
    expect(el.getAttribute('data-expanded')).toBe('false');
    expect(by(el, 'data-checkin-compact').textContent).toBe(CHECKIN_COMPACT);
    const answer = by(el, 'data-checkin-answer');
    expect(answer.tag).toBe('button');
    expect(answer.textContent).toBe(CHECKIN_ANSWER);
    expect(answer.getAttribute('aria-expanded')).toBe('false');
    const body = by(el, 'data-checkin-body');
    expect(answer.getAttribute('aria-controls')).toBe(body.getAttribute('id'));
    expect(body.hasAttribute('hidden')).toBe(true);
    // Skip works without opening.
    expect(by(el, 'data-checkin-skip').hasAttribute('hidden')).toBe(false);
    expect(el.find((e) => e.hasAttribute('data-checkin-skip'))).toHaveLength(1);
  });

  it('Skip from the collapsed card', () => {
    const { el, log } = mount();
    by(el, 'data-checkin-skip').click();
    expect(log).toEqual(['skip']);
  });

  it('Answer → the three questions open in place, focus on the first chip; Answer goes away', () => {
    const { el } = mount();
    by(el, 'data-checkin-answer').click();
    expect(el.getAttribute('data-expanded')).toBe('true');
    expect(by(el, 'data-checkin-body').hasAttribute('hidden')).toBe(false);
    expect(by(el, 'data-checkin-answer').getAttribute('aria-expanded')).toBe('true');
    expect(by(el, 'data-checkin-answer').hasAttribute('hidden')).toBe(true);
    const doc = (globalThis as { document: { activeElement: unknown } }).document;
    expect(doc.activeElement).toBe(pick(el, 'energy:1'));
    // The one Skip stays, under Done.
    expect(el.find((e) => e.hasAttribute('data-checkin-skip'))).toHaveLength(1);
    expect(by(el, 'data-checkin-skip').hasAttribute('hidden')).toBe(false);
  });

  it('opened stays open across a re-render of the same week; a new week starts collapsed', () => {
    by(mount().el, 'data-checkin-answer').click();
    expect(mount().el.getAttribute('data-expanded')).toBe('true');
    expect(mount({ weekStart: '2026-11-22' }).el.getAttribute('data-expanded')).toBe('false');
  });

  it('compact copy is short and plain', () => {
    expect(CHECKIN_COMPACT).toBe('Weekly check-in · 3 quick taps');
    expect(checkCopy(CHECKIN_COMPACT).ok).toBe(true);
  });
});

describe('checkInCard: pending', () => {
  it('three radio groups of 1–5 with labelled ends, Done (disabled) and Skip this week', () => {
    const { el } = mount();
    expect(el.getAttribute('data-card-status')).toBe('pending');
    for (const q of QS) {
      const row = el.find((e) => e.getAttribute('data-checkin-q') === q.id)[0] as FakeEl;
      const group = row.find((e) => e.getAttribute('role') === 'radiogroup')[0] as FakeEl;
      const radios = group.children;
      expect(radios.map((r) => r.textContent)).toEqual(['1', '2', '3', '4', '5']);
      expect(radios.every((r) => r.getAttribute('role') === 'radio')).toBe(true);
      expect(radios[0]?.getAttribute('aria-label')).toBe('1, Low');
      expect(radios[4]?.getAttribute('aria-label')).toBe('5, High');
      expect(row.oneByClass('checkin-ends').textContent).toBe('1 Low5 High');
      expect(row.oneByClass('checkin-label').textContent).toBe(q.label);
    }
    expect(by(el, 'data-checkin-done').hasAttribute('disabled')).toBe(true);
    expect(by(el, 'data-checkin-need').hasAttribute('hidden')).toBe(false);
    // Collapsed: "Skip" beside Answer; its name is always "Skip this week".
    expect(by(el, 'data-checkin-skip').textContent).toBe('Skip');
    expect(by(el, 'data-checkin-skip').getAttribute('aria-label')).toBe(CHECKIN_SKIP);
    by(el, 'data-checkin-answer').click();
    expect(by(el, 'data-checkin-skip').textContent).toBe(CHECKIN_SKIP);
  });

  it('a pick: aria-checked + a check mark + a white fill (never colour alone); Done enables', () => {
    const { el } = mount();
    pick(el, 'energy:4').click();
    const chip = pick(el, 'energy:4');
    expect(chip.getAttribute('aria-checked')).toBe('true');
    expect(chip.classes).toContain('on');
    expect(chip.find((e) => e.getAttribute('data-icon') === 'check')).toHaveLength(1);
    expect(pick(el, 'energy:3').getAttribute('aria-checked')).toBe('false');
    expect(by(el, 'data-checkin-done').hasAttribute('disabled')).toBe(false);
    expect(by(el, 'data-checkin-need').hasAttribute('hidden')).toBe(true);
  });

  it('partial answers: Done sends only what was answered', () => {
    const { el, log } = mount();
    pick(el, 'energy:4').click();
    pick(el, 'soreness:2').click();
    by(el, 'data-checkin-done').click();
    expect(log).toEqual(['done:{"energy":4,"soreness":2}']);
  });

  it('Done with nothing picked does nothing', () => {
    const { el, log } = mount();
    by(el, 'data-checkin-done').click();
    expect(log).toEqual([]);
  });

  it('Skip this week', () => {
    const { el, log } = mount();
    by(el, 'data-checkin-skip').click();
    expect(log).toEqual(['skip']);
  });

  it('keyboard: one tab stop per group (roving), arrows move and pick, wrapping', () => {
    const { el, log } = mount();
    const tabStops = (id: string) =>
      [1, 2, 3, 4, 5].filter((n) => pick(el, `${id}:${n}`).getAttribute('tabindex') === '0');
    expect(tabStops('sleep')).toEqual([1]);
    pick(el, 'sleep:1').dispatch('keydown', ev('ArrowRight'));
    expect(pick(el, 'sleep:2').getAttribute('aria-checked')).toBe('true');
    expect(tabStops('sleep')).toEqual([2]);
    const doc = (globalThis as { document: { activeElement: unknown } }).document;
    expect(doc.activeElement).toBe(pick(el, 'sleep:2'));
    pick(el, 'sleep:2').dispatch('keydown', ev('ArrowLeft'));
    pick(el, 'sleep:1').dispatch('keydown', ev('ArrowLeft'));
    expect(pick(el, 'sleep:5').getAttribute('aria-checked')).toBe('true');
    pick(el, 'sleep:5').dispatch('keydown', ev('Tab'));
    expect(pick(el, 'sleep:5').getAttribute('aria-checked')).toBe('true');
    by(el, 'data-checkin-done').click();
    expect(log).toEqual(['done:{"sleep":5}']);
  });

  it('picks survive a re-render of the same week (a new chat message)', () => {
    const a = mount();
    pick(a.el, 'energy:3').click();
    const b = mount();
    expect(pick(b.el, 'energy:3').getAttribute('aria-checked')).toBe('true');
    expect(by(b.el, 'data-checkin-done').hasAttribute('disabled')).toBe(false);
    expect(
      pick(mount({ weekStart: '2026-11-22' }).el, 'energy:3').getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('controls in tab order: Answer, the 15 chips, Done, Skip (hidden ones skipped by the chat)', () => {
    const { controls } = mount();
    expect(controls).toHaveLength(18);
    expect(controls[0]?.hasAttribute('data-checkin-answer')).toBe(true);
    expect(controls[16]?.hasAttribute('data-checkin-done')).toBe(true);
    expect(controls[17]?.hasAttribute('data-checkin-skip')).toBe(true);
  });
});

describe('checkInCard: answered', () => {
  it('done → the summary from the saved check-in, nothing to tap', () => {
    const { el, controls } = mount({
      status: 'done',
      saved: { weekStart: '2026-11-15', energy: 4, sleep: 3, at: 1 },
    });
    expect(controls).toHaveLength(0);
    expect(el.byTag('button')).toHaveLength(0);
    expect(by(el, 'data-checkin-summary').textContent).toBe('Saved: energy 4, sleep 3.');
  });

  it('skipped → the skipped line', () => {
    const { el } = mount({ status: 'skipped' });
    expect(by(el, 'data-checkin-summary').getAttribute('data-checkin-summary')).toBe('skipped');
    expect(by(el, 'data-checkin-summary').textContent).toBe(CHECKIN_SKIPPED);
  });

  it('summary text', () => {
    expect(checkInSummary(QS, undefined)).toBe('Saved.');
    expect(checkInSummary(QS, { soreness: 2, energy: 5 })).toBe('Saved: energy 5, soreness 2.');
  });

  it('copy passes the coaching-language check', () => {
    for (const t of [CHECKIN_INTRO, CHECKIN_NEED_ONE, CHECKIN_SKIP, CHECKIN_SKIPPED]) {
      expect(checkCopy(t).ok).toBe(true);
    }
  });
});
