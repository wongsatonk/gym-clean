import { describe, expect, it } from 'vitest';
import type { Decision } from '../../food-vision/decide';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { all, byAttr, expectCleanCopy, key } from './fuelTestKit';
import { copyHits } from './fuelTestUtil';
import type { LogItem } from './logSheet';
import {
  pctText,
  photoSheet,
  type PhotoChoice,
  type PhotoDecision,
  type PhotoSheetProps,
  type PhotoSheetState,
} from './photoSheet';

useFakeDom();

// Made-up numbers only.
const PORTIONS = [
  { label: 'Small', factor: 0.75 },
  { label: 'Regular', factor: 1 },
  { label: 'Large', factor: 1.4 },
];
const dish = (id: string, label: string, kcal: number, proteinG: number, nameTh?: string) =>
  ({
    key: `thai:${id}`,
    label,
    nameTh,
    macros: { kcal, proteinG, carbsG: 60, fatG: 20 },
    per: 'serving',
    estimate: true,
    portions: PORTIONS,
    ref: { foodId: id },
  }) satisfies LogItem;

const KRA_PORK = dish('thai:kra-pork', 'Pad kra pao, pork', 800, 40, 'กะเพราหมู');
const KRA_CHICKEN = dish('thai:kra-chicken', 'Pad kra pao, chicken', 700, 45, 'กะเพราไก่');
const PAD_THAI = dish('thai:pad-thai', 'Pad thai', 600, 25, 'ผัดไทย');
const KHAO_PAD = dish('thai:khao-pad', 'Fried rice', 650, 20, 'ข้าวผัด');
const DISHES = [KRA_PORK, KRA_CHICKEN, PAD_THAI, KHAO_PAD];

const CONFIDENT: PhotoDecision = {
  kind: 'confident',
  options: [
    { label: 'pad_kra_pao', dishIds: ['thai:kra-pork', 'thai:kra-chicken'], score: 0.82 },
    { label: 'pad_thai', dishIds: ['thai:pad-thai'], score: 0.1 },
    { label: 'khao_pad', dishIds: ['thai:khao-pad'], score: 0.05 },
  ],
  preselect: 'thai:kra-pork',
  offerClaude: false,
};
const UNSURE: PhotoDecision = {
  kind: 'unsure',
  options: [
    { label: 'pad_thai', dishIds: ['thai:pad-thai'], score: 0.45 },
    { label: 'khao_pad', dishIds: ['thai:khao-pad'], score: 0.3 },
    { label: 'pad_kra_pao', dishIds: ['thai:kra-pork', 'thai:kra-chicken'], score: 0.2 },
  ],
  offerClaude: false,
};
const NO_MATCH: PhotoDecision = { kind: 'noMatch', options: [], offerClaude: false };

const result = (decision: PhotoDecision): PhotoSheetState => ({ status: 'result', decision });

function open(state: PhotoSheetState, over: Partial<PhotoSheetProps> = {}) {
  const calls = { log: [] as PhotoChoice[], search: 0, cancel: 0 };
  const sheet = photoSheet(
    { mode: 'quick', slot: 'lunch', dishes: DISHES, state, ...over },
    {
      onLog: (c) => calls.log.push(c),
      onSearch: () => calls.search++,
      onCancel: () => calls.cancel++,
    },
  );
  return { sheet, el: asFake(sheet), calls };
}

const stateOf = (el: FakeEl) => byAttr(el, 'data-photo-state').getAttribute('data-photo-state');
const pressed = (el: FakeEl, attr: string) =>
  all(el, attr)
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute(attr));

/** Every string, text and attribute, has no Claude / Ask control in this milestone. */
function expectNoClaude(el: FakeEl): void {
  const strings = [
    el.textContent,
    ...el.find(() => true).flatMap((e) => [...e.attrs.entries()].map(([k, v]) => `${k}=${v}`)),
  ].join('\n');
  expect(strings).not.toMatch(/claude/i);
  expect(strings).not.toMatch(/\bask\b/i);
}

function expectClean(el: FakeEl): void {
  expectCleanCopy(el);
  expect(copyHits(el)).toEqual([]);
  expectNoClaude(el);
}

describe('PhotoDecision', () => {
  it('accepts food-vision decide() output as is (compile-time check)', () => {
    const fromDecide: Decision = { kind: 'unsure', options: [], offerClaude: false };
    const asProp: PhotoDecision = fromDecide;
    expect(asProp.kind).toBe('unsure');
  });
});

describe('pctText', () => {
  it('is a whole percent, clamped', () => {
    expect(pctText(0.82)).toBe('82%');
    expect(pctText(0.6)).toBe('60%');
    expect(pctText(0.004)).toBe('0%');
    expect(pctText(1.2)).toBe('100%');
    expect(pctText(Number.NaN)).toBe('0%');
  });
});

describe('photoSheet', () => {
  it('is a modal dialog that starts on "Looking…"', () => {
    const { el } = open({ status: 'looking' });
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.hasAttribute('data-photo-sheet')).toBe(true);
    expect(stateOf(el)).toBe('looking');
    expect(el.textContent).toContain('Looking…');
    expect(all(el, 'data-photo-log')).toHaveLength(0);
    expectClean(el);
  });

  it('confident: top guess preselected with its variants, Regular, % shown', () => {
    const { el, sheet } = open(result(CONFIDENT));
    expect(stateOf(el)).toBe('confident');
    expect(all(el, 'data-photo-option').map((o) => o.getAttribute('data-photo-option'))).toEqual([
      'pad_kra_pao',
      'pad_thai',
      'khao_pad',
    ]);
    expect(pressed(el, 'data-photo-option')).toEqual(['pad_kra_pao']);
    expect(all(el, 'data-photo-pct').map((p) => p.textContent)).toEqual(['82%', '10%', '5%']);
    // English + Thai name on the row.
    const row = byAttr(el, 'data-photo-option', 'pad_kra_pao');
    expect(row.textContent).toContain('Pad kra pao, pork');
    expect(row.textContent).toContain('กะเพราหมู');
    // Variant chips (one class, two dishes); the default dish is picked.
    expect(all(el, 'data-photo-variant').map((v) => v.getAttribute('data-photo-variant'))).toEqual([
      'thai:kra-pork',
      'thai:kra-chicken',
    ]);
    expect(pressed(el, 'data-photo-variant')).toEqual(['thai:kra-pork']);
    expect(pressed(el, 'data-portion')).toEqual(['Regular']);
    expect(sheet.selected()).toBe('thai:kra-pork');
    const prev = byAttr(el, 'data-preview');
    expect(prev.textContent).toContain('800 kcal · 40 g protein');
    expect(all(prev, 'data-estimate')).toHaveLength(1);
    expect(byAttr(el, 'data-photo-log').hasAttribute('disabled')).toBe(false);
    expectClean(el);
  });

  it('confident at Regular logs in 1 tap (Log)', () => {
    const { el, calls } = open(result(CONFIDENT));
    byAttr(el, 'data-photo-log').click();
    expect(calls.log).toHaveLength(1);
    const c = calls.log[0];
    expect(c).toMatchObject({
      dishId: 'thai:kra-pork',
      portion: { label: 'Regular', factor: 1 },
      slot: 'lunch',
      confidence: 0.82,
      label: 'pad_kra_pao',
      macros: { kcal: 800, proteinG: 40 },
    });
    expect(c?.item).toBe(KRA_PORK);
  });

  it('confident at Large logs in 2 taps (Large, Log)', () => {
    const { el, calls } = open(result(CONFIDENT));
    byAttr(el, 'data-portion', 'Large').click();
    expect(byAttr(el, 'data-preview').textContent).toContain('1,120 kcal · 56 g protein');
    byAttr(el, 'data-photo-log').click();
    expect(calls.log[0]).toMatchObject({
      portion: { label: 'Large', factor: 1.4 },
      macros: { kcal: 1120, proteinG: 56 },
    });
  });

  it('a variant chip changes the dish; the portion and meal stay', () => {
    const { el, calls } = open(result(CONFIDENT));
    byAttr(el, 'data-portion', 'Small').click();
    byAttr(el, 'data-slot-chip', 'dinner').click();
    byAttr(el, 'data-photo-variant', 'thai:kra-chicken').click();
    expect(pressed(el, 'data-photo-variant')).toEqual(['thai:kra-chicken']);
    expect(pressed(el, 'data-portion')).toEqual(['Small']);
    byAttr(el, 'data-photo-log').click();
    expect(calls.log[0]).toMatchObject({
      dishId: 'thai:kra-chicken',
      portion: { label: 'Small' },
      slot: 'dinner',
      confidence: 0.82,
      macros: { kcal: 525 },
    });
  });

  it('a preselect given as the class label picks that guess', () => {
    const { sheet } = open(result({ ...CONFIDENT, preselect: 'pad_thai' }));
    expect(sheet.selected()).toBe('thai:pad-thai');
  });

  it('unsure: top 3, nothing preselected, Log waits for a pick', () => {
    const { el, calls, sheet } = open(result(UNSURE));
    expect(stateOf(el)).toBe('unsure');
    expect(el.textContent).toContain('Not sure. Pick one or search.');
    expect(all(el, 'data-photo-option')).toHaveLength(3);
    expect(pressed(el, 'data-photo-option')).toEqual([]);
    expect(sheet.selected()).toBeNull();
    expect(all(el, 'data-portion')).toHaveLength(0);
    expect(byAttr(el, 'data-photo-log').hasAttribute('disabled')).toBe(true);
    byAttr(el, 'data-photo-log').click();
    expect(calls.log).toEqual([]);
    expectClean(el);

    byAttr(el, 'data-photo-option', 'khao_pad').click();
    expect(pressed(el, 'data-photo-option')).toEqual(['khao_pad']);
    expect(all(el, 'data-photo-variant')).toHaveLength(0); // one dish: no variant chips
    byAttr(el, 'data-photo-log').click();
    expect(calls.log[0]).toMatchObject({ dishId: 'thai:khao-pad', confidence: 0.3 });
    expectClean(el);
  });

  it('even a preselect is ignored when unsure', () => {
    const { sheet } = open(result({ ...UNSURE, preselect: 'thai:pad-thai' }));
    expect(sheet.selected()).toBeNull();
  });

  it('"None of these: search" opens the search', () => {
    const { el, calls } = open(result(UNSURE));
    const btn = byAttr(el, 'data-photo-search');
    expect(btn.textContent).toBe('None of these: search');
    btn.click();
    expect(calls.search).toBe(1);
    expect(calls.log).toEqual([]);
  });

  it('noMatch: no guesses, a search button', () => {
    const { el, calls } = open(result(NO_MATCH));
    expect(stateOf(el)).toBe('noMatch');
    expect(all(el, 'data-photo-option')).toHaveLength(0);
    expect(all(el, 'data-photo-log')).toHaveLength(0);
    byAttr(el, 'data-photo-search').click();
    expect(calls.search).toBe(1);
    expectClean(el);
  });

  it('guesses whose dishes are unknown are dropped (all unknown → noMatch)', () => {
    const { el } = open(
      result({
        kind: 'unsure',
        options: [
          { label: 'mystery', dishIds: ['thai:nope'], score: 0.5 },
          { label: 'pad_thai', dishIds: ['thai:pad-thai'], score: 0.3 },
        ],
      }),
    );
    expect(all(el, 'data-photo-option').map((o) => o.getAttribute('data-photo-option'))).toEqual([
      'pad_thai',
    ]);
    const none = open(
      result({ kind: 'confident', options: [{ label: 'x', dishIds: ['thai:nope'], score: 0.9 }] }),
    );
    expect(stateOf(none.el)).toBe('noMatch');
  });

  it('error: one line and Log by hand', () => {
    const { el, calls } = open({ status: 'error' });
    expect(stateOf(el)).toBe('error');
    expect(el.textContent).toContain('Couldn’t read the photo. Log it by hand.');
    byAttr(el, 'data-photo-search').click();
    expect(calls.search).toBe(1);
    expectClean(el);
  });

  it('setState moves Looking… → result → error', () => {
    const { el, sheet } = open({ status: 'looking' });
    sheet.setState(result(CONFIDENT));
    expect(stateOf(el)).toBe('confident');
    expect(sheet.selected()).toBe('thai:kra-pork');
    sheet.setState({ status: 'error' });
    expect(stateOf(el)).toBe('error');
    expect(sheet.selected()).toBeNull();
  });

  it('shows the photo preview it is given (not stored)', () => {
    const canvas = document.createElement('canvas');
    const { el } = open(result(CONFIDENT), { photo: canvas });
    expect(el.byClass('photo-thumb')[0]?.children[0]).toBe(asFake(canvas));
  });

  it('Full mode previews carbs and fat', () => {
    const { el } = open(result(CONFIDENT), { mode: 'full' });
    expect(byAttr(el, 'data-preview').textContent).toContain('60 g carbs · 20 g fat');
  });

  it('Cancel and Escape cancel', () => {
    const { el, calls } = open(result(CONFIDENT));
    const close = byAttr(el, 'data-close');
    expect(close.textContent).toBe('Cancel');
    close.click();
    key(el, 'Escape');
    expect(calls.cancel).toBe(2);
    expect(calls.log).toEqual([]);
  });

  it('never offers Claude, even when the decision says so', () => {
    const { el } = open(result({ ...UNSURE, offerClaude: true }));
    expectNoClaude(el);
  });
});
