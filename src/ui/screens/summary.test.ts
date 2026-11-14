import { describe, expect, it } from 'vitest';
import type { NewBest } from '../../core/stats';
import type { SetLog } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from './testDom';
import {
  barWidths,
  bestTexts,
  setsText,
  summaryScreen,
  volumeMode,
  volumeText,
  vsLastLine,
  vsLastRepsLine,
  type SummaryProps,
} from './summary';

useFakeDom();

const DATE = new Date(2026, 10, 13, 18, 0).getTime(); // Fri 13 Nov 2026
const NAMES: Record<string, string> = { row: 'DB Row', curl: 'Bicep Curl', pu: 'Push-up' };
const name = (id: string) => NAMES[id] ?? id;

let t = 0;
const log = (exerciseId: string, reps: number, weightKg: number, setIndex = 0): SetLog => ({
  sessionId: 's2',
  exerciseId,
  setIndex,
  reps,
  weightKg,
  restTakenSec: 60,
  startedAt: ++t,
  endedAt: ++t,
});

const LOGS = [log('row', 12, 22.5), log('row', 10, 22.5, 1), log('curl', 10, 12)];
// volume = 270 + 225 + 120 = 615

function props(over: Partial<SummaryProps> = {}): SummaryProps {
  return {
    dayName: 'Pull A',
    date: DATE,
    durationSec: 47 * 60,
    unit: 'kg',
    logs: LOGS,
    plannedExercises: 5,
    restOverruns: 1,
    skipped: [],
    vsLastPct: 8,
    last: { volumeKg: 569, reps: 30 },
    bests: [],
    name,
    ...over,
  };
}

function render(over: Partial<SummaryProps> = {}) {
  let done = 0;
  const el = asFake(summaryScreen(props(over), { onDone: () => done++ }));
  return { el, done: () => done };
}

const stat = (el: FakeEl, key: string) =>
  el.find((e) => e.getAttribute('data-stat') === key)[0] ?? null;
const statValue = (el: FakeEl, key: string) => stat(el, key)?.oneByClass('stat-value').textContent;
const attr = (el: FakeEl, a: string) => el.find((e) => e.hasAttribute(a));

describe('summary helpers', () => {
  it('volumeMode', () => {
    expect(volumeMode(615, 8, { volumeKg: 569, reps: 30 })).toBe('compare');
    expect(volumeMode(615, null, null)).toBe('first');
    expect(volumeMode(615, null, { volumeKg: 0, reps: 40 })).toBe('first');
    expect(volumeMode(0, null, { volumeKg: 0, reps: 40 })).toBe('bodyweight');
    expect(volumeMode(0, null, null)).toBe('bodyweight');
  });

  it('volumeText rounds in the display unit with commas', () => {
    expect(volumeText(7420.4, 'kg')).toBe('7,420');
    expect(volumeText(145.15, 'lb')).toBe('320');
  });

  it('barWidths: larger fills, a non-zero value keeps a sliver', () => {
    expect(barWidths(7420, 6870)).toEqual({ today: 100, last: 93 });
    expect(barWidths(50, 1000)).toEqual({ today: 5, last: 100 });
    expect(barWidths(1, 1000)).toEqual({ today: 4, last: 100 });
    expect(barWidths(0, 0)).toEqual({ today: 0, last: 0 });
  });

  it('vs-last lines', () => {
    expect(vsLastLine(8, 'Pull A')).toEqual({ text: '+8% vs last Pull A', tone: 'up' });
    expect(vsLastLine(0, 'Pull A')).toEqual({ text: 'Same as last Pull A', tone: 'flat' });
    expect(vsLastLine(-5, 'Pull A')).toEqual({ text: '−5% vs last Pull A', tone: 'down' });
    expect(vsLastRepsLine(42, 30, 'Push A').text).toBe('+12 reps vs last Push A');
    expect(vsLastRepsLine(29, 30, 'Push A')).toEqual({
      text: '−1 rep vs last Push A',
      tone: 'down',
    });
  });

  it('bestTexts for weighted and bodyweight bests', () => {
    const b: NewBest = {
      exerciseId: 'row',
      kind: 'reps',
      weightKg: 22.5,
      reps: 12,
      old: { weightKg: 22.5, reps: 10 },
    };
    expect(bestTexts(b, 'kg')).toEqual({ now: '12 × 22.5', was: 'was 10 × 22.5 kg' });
    const bw: NewBest = { ...b, weightKg: 0, old: { weightKg: 0, reps: 10 } };
    expect(bestTexts(bw, 'kg')).toEqual({ now: '12 reps', was: 'was 10 reps' });
  });

  it('setsText', () => {
    expect(setsText(LOGS.slice(0, 2), 'kg')).toBe('12×22.5, 10×22.5 kg');
    expect(setsText([], 'kg')).toBe('');
    expect(setsText([log('pu', 15, 0), log('pu', 12, 0, 1)], 'kg')).toBe('15, 12 reps');
  });
});

describe('summaryScreen', () => {
  it('is the Energy summary with the hero and the kept "Workout done" heading', () => {
    const { el } = render();
    expect(el.getAttribute('data-screen')).toBe('summary');
    expect(el.classes).toContain('mood-energy');
    const h1 = el.byTag('h1')[0] as FakeEl;
    expect(h1.textContent).toContain('Workout done');
    expect(h1.oneByClass('sum-day').textContent).toBe('Pull A done');
    expect(el.oneByClass('sum-meta').textContent).toBe('Fri 13 Nov · 47 min');
  });

  it('with a previous session: volume, % pill and both bars', () => {
    const { el } = render();
    const card = el.oneByClass('sum-volume');
    expect(card.getAttribute('data-volume-mode')).toBe('compare');
    expect(statValue(el, 'volume')).toBe('615');
    expect(stat(el, 'volume')?.textContent).toContain('kg');
    const vs = attr(el, 'data-vs-last')[0] as FakeEl;
    expect(vs.textContent).toBe('+8% vs last Pull A');
    expect(vs.getAttribute('data-tone')).toBe('up');
    const bars = el.find((e) => e.hasAttribute('data-bar'));
    expect(bars.map((b) => b.getAttribute('data-bar'))).toEqual(['last', 'today']);
    expect(bars[0]?.oneByClass('sum-bar-value').textContent).toBe('569');
    expect(bars[1]?.oneByClass('sum-bar-value').textContent).toBe('615');
    expect(bars[1]?.oneByClass('sum-bar-fill').getAttribute('style')).toBe('width: 100%');
    // The bar track is decoration; the label and value carry the numbers.
    expect(bars[0]?.oneByClass('sum-bar-track').getAttribute('aria-hidden')).toBe('true');
  });

  it('without a previous session: the volume and a note, no bars', () => {
    const { el } = render({ vsLastPct: null, last: null });
    expect(el.oneByClass('sum-volume').getAttribute('data-volume-mode')).toBe('first');
    expect(statValue(el, 'volume')).toBe('615');
    expect(attr(el, 'data-vs-last')).toHaveLength(0);
    expect(attr(el, 'data-bar')).toHaveLength(0);
    expect(el.oneByClass('sum-volume-note').textContent).toBe(
      'Nothing to compare yet. Next Pull A shows the change.',
    );
  });

  it('a lower volume is shown neutral, not as a failure colour', () => {
    const { el } = render({ vsLastPct: -5, last: { volumeKg: 650, reps: 30 } });
    const vs = attr(el, 'data-vs-last')[0] as FakeEl;
    expect(vs.textContent).toBe('−5% vs last Pull A');
    expect(vs.classes).toContain('sum-vs-down');
  });

  it('bodyweight day: total reps in the card, no volume stat, no reps tile', () => {
    const logs = [log('pu', 15, 0), log('pu', 12, 0, 1)];
    const { el } = render({ dayName: 'Push A', logs, vsLastPct: null, last: null });
    expect(el.oneByClass('sum-volume').getAttribute('data-volume-mode')).toBe('bodyweight');
    expect(stat(el, 'volume')).toBeNull();
    expect(statValue(el, 'reps')).toBe('27');
    expect(el.oneByClass('sum-volume-label').textContent).toBe('Total reps');
    expect(el.oneByClass('sum-tiles').getAttribute('data-count')).toBe('3');
    expect(el.byClass('sum-tile').map((x) => x.getAttribute('data-stat'))).toEqual([
      'sets',
      'exercises',
      'overruns',
    ]);
  });

  it('bodyweight day with a previous one compares reps', () => {
    const logs = [log('pu', 15, 0), log('pu', 12, 0, 1)];
    const { el } = render({
      dayName: 'Push A',
      logs,
      vsLastPct: null,
      last: { volumeKg: 0, reps: 25 },
    });
    expect((attr(el, 'data-vs-last')[0] as FakeEl).textContent).toBe('+2 reps vs last Push A');
    expect(attr(el, 'data-bar')).toHaveLength(2);
  });

  it('tiles: sets, reps, exercises done of planned, long rests', () => {
    const { el } = render();
    expect(statValue(el, 'sets')).toBe('3');
    expect(statValue(el, 'reps')).toBe('32');
    expect(statValue(el, 'exercises')).toBe('2/5');
    expect(statValue(el, 'overruns')).toBe('1');
    expect(stat(el, 'overruns')?.oneByClass('sum-tile-label').textContent).toBe('long rest');
    expect(el.oneByClass('sum-tiles').getAttribute('data-count')).toBe('4');
  });

  it('new bests: a heading and a tile per best with its old value', () => {
    const bests: NewBest[] = [
      {
        exerciseId: 'row',
        kind: 'reps',
        weightKg: 22.5,
        reps: 12,
        old: { weightKg: 22.5, reps: 10 },
      },
      {
        exerciseId: 'curl',
        kind: 'weight',
        weightKg: 12,
        reps: 10,
        old: { weightKg: 10, reps: 10 },
      },
    ];
    const { el } = render({ bests });
    expect(el.oneByClass('sum-bests-title').textContent).toBe('2 new bests');
    const tiles = el.byClass('sum-best');
    expect(tiles.map((x) => x.getAttribute('data-best'))).toEqual(['row', 'curl']);
    expect(tiles[1]?.getAttribute('data-best-kind')).toBe('weight');
    expect(tiles[1]?.oneByClass('sum-best-name').textContent).toBe('Bicep Curl');
    expect(tiles[1]?.oneByClass('sum-best-now').textContent).toBe('10 × 12');
    expect(tiles[1]?.oneByClass('sum-best-was').textContent).toBe('was 10 × 10 kg');
  });

  it('no bests: no bests section', () => {
    expect(render().el.byClass('sum-bests')).toHaveLength(0);
  });

  it('keeps the set list with notes and skipped exercises', () => {
    const { el } = render({ skipped: ['curl', 'pu'], todayNotes: { row: 'seat 4', pu: 'wrist' } });
    expect(el.oneByClass('section-title').textContent).toBe('Sets');
    const items = el.oneByClass('set-list').children;
    expect(items.map((li) => li.byTag('strong')[0]?.textContent)).toEqual([
      'DB Row',
      'Bicep Curl',
      'Push-up',
    ]);
    expect(items[0]?.textContent).toContain('12×22.5, 10×22.5 kg');
    expect(items[0]?.oneByClass('today-note').textContent).toBe('“seat 4”');
    expect(items[1]?.textContent).toContain('10×12 kg · rest skipped');
    expect(items[2]?.classes).toContain('skipped');
    expect(items[2]?.textContent).toContain('skipped');
    expect(items[2]?.oneByClass('today-note').textContent).toBe('“wrist”');
  });

  it('mounts Fix, Focus and Coach in order, Coach last before Done', () => {
    const mk = () => document.createElement('section') as unknown as HTMLElement;
    const fixEl = mk();
    const focusEl = mk();
    const coachEl = mk();
    const { el } = render({ fixEl, focusEl, coachEl });
    const kids = el.children;
    const idx = (x: unknown) => kids.indexOf(asFake(x));
    expect(idx(fixEl)).toBeGreaterThan(kids.indexOf(el.oneByClass('sum-tiles')));
    expect(idx(focusEl)).toBeGreaterThan(idx(fixEl));
    expect(idx(coachEl)).toBeGreaterThan(kids.indexOf(el.oneByClass('set-list')));
    expect(kids.at(-1)?.classes).toContain('sticky-bottom');
  });

  it('leaves out absent Fix / Coach / Focus', () => {
    const { el } = render({ fixEl: null, coachEl: null, focusEl: null });
    expect(el.children.map((c) => c.tag)).toEqual(['header', 'section', 'div', 'h2', 'ul', 'div']);
  });

  it('Done calls onDone', () => {
    const { el, done } = render();
    const btn = el.byTag('button').find((b) => b.textContent === 'Done') as FakeEl;
    btn.click();
    expect(done()).toBe(1);
  });
});
