/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkHealthCopy, FEEL_AREAS } from '../../core/health/copy';
import { todaysFeelOffers } from '../../core/health/readiness';
import type { BodyArea, DayFeel } from '../../core/types';
import {
  ENERGY_WORD,
  FEEL_COPY,
  feelFixedCopy,
  feelSummary,
  feelToday,
  hasAnswer,
  type FeelTodayProps,
} from './feelToday';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

// Made-up answers (public repo).
const DATE = '2026-11-17';
const byAttr = (el: FakeEl, name: string) => el.find((e) => e.hasAttribute(name));
const one = (el: FakeEl, name: string, value?: string): FakeEl => {
  const hit = el.find(
    (e) => e.hasAttribute(name) && (value === undefined || e.getAttribute(name) === value),
  )[0];
  if (!hit) throw new Error(`no [${name}${value ? `=${value}` : ''}]`);
  return hit;
};

function render(over: Partial<FeelTodayProps> = {}) {
  const saved: DayFeel[] = [];
  const easy: BodyArea[] = [];
  const el = asFake(
    feelToday(
      { date: DATE, ...over },
      { onSaveFeel: (f) => saved.push(f), onEasyOn: (a) => easy.push(a) },
    ),
  );
  return { el, saved, easy };
}

describe('feel today: pure helpers', () => {
  it('hasAnswer: energy or a sore area counts, an empty row does not', () => {
    expect(hasAnswer(null)).toBe(false);
    expect(hasAnswer({ date: DATE })).toBe(false);
    expect(hasAnswer({ date: DATE, sore: [] })).toBe(false);
    expect(hasAnswer({ date: DATE, energy: 3 })).toBe(true);
    expect(hasAnswer({ date: DATE, sore: ['back'] })).toBe(true);
  });

  it('feelSummary names energy in words and the sore areas in FEEL_AREAS order', () => {
    expect(feelSummary({ date: DATE, energy: 4 })).toBe('Energy 4 of 5 (Good)');
    expect(feelSummary({ date: DATE, sore: ['legs', 'shoulders'] })).toBe(
      'Sore: shoulders and legs',
    );
    expect(feelSummary({ date: DATE, energy: 2, sore: ['back'] })).toBe(
      'Energy 2 of 5 (Low) · Sore: back',
    );
  });

  it('every fixed word and summary passes the coaching-copy check (no medical wording)', () => {
    const texts = [
      ...feelFixedCopy(),
      feelSummary({ date: DATE, energy: 1, sore: [...FEEL_AREAS] }),
      ...todaysFeelOffers([{ date: DATE, sore: [...FEEL_AREAS] }], DATE).map((o) => o.text),
    ];
    for (const t of texts) expect(checkHealthCopy(t).hits, t).toEqual([]);
  });
});

describe('feel today: collapsed row', () => {
  it('not answered: one "How do you feel today?" button, collapsed', () => {
    const { el } = render();
    expect(el.getAttribute('data-state')).toBe('ask');
    const open = one(el, 'data-feel-open');
    expect(open.tag).toBe('button');
    expect(open.textContent).toBe(FEEL_COPY.ask);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(byAttr(el, 'data-feel-energy')).toEqual([]);
  });

  it('opens on tap: energy 1–5 with words, six sore chips, Save / Not now', () => {
    const { el } = render();
    one(el, 'data-feel-open').click();
    expect(el.getAttribute('data-state')).toBe('open');
    const energy = byAttr(el, 'data-feel-energy');
    expect(energy.map((e) => e.getAttribute('data-feel-energy'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(energy.map((e) => e.getAttribute('role'))).toEqual(Array(5).fill('radio'));
    expect(energy[0]?.getAttribute('aria-label')).toBe('Energy 1 of 5, Empty');
    expect(energy[4]?.textContent).toBe(`5${ENERGY_WORD[5]}`);
    const sore = byAttr(el, 'data-feel-sore');
    expect(sore.map((e) => e.getAttribute('data-feel-sore'))).toEqual([...FEEL_AREAS]);
    expect(sore.map((e) => e.getAttribute('role'))).toEqual(Array(6).fill('checkbox'));
    expect(one(el, 'data-feel-save').textContent).toBe('Save');
    expect(one(el, 'data-feel-cancel').textContent).toBe('Not now');
    // Nothing is picked until he taps.
    expect([...energy, ...sore].every((e) => e.getAttribute('aria-checked') === 'false')).toBe(
      true,
    );
    // Focus moves into the panel (keyboard / VoiceOver).
    expect((globalThis as { document: { activeElement: unknown } }).document.activeElement).toBe(
      energy[0],
    );
  });
});

describe('feel today: answering', () => {
  it('picks are shown by a check mark + aria-checked, not colour alone', () => {
    const { el } = render({ open: true });
    const e4 = one(el, 'data-feel-energy', '4');
    e4.click();
    expect(e4.getAttribute('aria-checked')).toBe('true');
    expect(e4.classes).toContain('on');
    expect(e4.oneByClass('feel-mark').children.length).toBe(1); // the check icon
    const back = one(el, 'data-feel-sore', 'back');
    back.click();
    expect(back.getAttribute('aria-checked')).toBe('true');
    expect(back.oneByClass('feel-mark').children.length).toBe(1);
    back.click();
    expect(back.getAttribute('aria-checked')).toBe('false');
    expect(back.oneByClass('feel-mark').children.length).toBe(0);
  });

  it('energy is a single choice; tapping the picked level clears it', () => {
    const { el } = render({ open: true });
    one(el, 'data-feel-energy', '2').click();
    one(el, 'data-feel-energy', '3').click();
    const checked = () =>
      byAttr(el, 'data-feel-energy')
        .filter((e) => e.getAttribute('aria-checked') === 'true')
        .map((e) => e.getAttribute('data-feel-energy'));
    expect(checked()).toEqual(['3']);
    one(el, 'data-feel-energy', '3').click();
    expect(checked()).toEqual([]);
  });

  it("Save passes today's answer out (sore in FEEL_AREAS order) and shows it", () => {
    const { el, saved } = render();
    one(el, 'data-feel-open').click();
    one(el, 'data-feel-energy', '2').click();
    one(el, 'data-feel-sore', 'legs').click();
    one(el, 'data-feel-sore', 'shoulders').click();
    one(el, 'data-feel-save').click();
    expect(saved).toEqual([{ date: DATE, energy: 2, sore: ['shoulders', 'legs'] }]);
    expect(el.getAttribute('data-state')).toBe('done');
    expect(one(el, 'data-feel-summary').textContent).toBe(
      'Energy 2 of 5 (Low) · Sore: shoulders and legs',
    );
  });

  it('Save with nothing picked passes a bare row (the store deletes it) and asks again', () => {
    const { el, saved } = render({ feel: { date: DATE, energy: 3 }, open: true });
    one(el, 'data-feel-energy', '3').click(); // clear
    one(el, 'data-feel-save').click();
    expect(saved).toEqual([{ date: DATE }]);
    expect(el.getAttribute('data-state')).toBe('ask');
  });

  it('Not now closes without saving', () => {
    const { el, saved } = render();
    one(el, 'data-feel-open').click();
    one(el, 'data-feel-energy', '5').click();
    one(el, 'data-feel-cancel').click();
    expect(saved).toEqual([]);
    expect(el.getAttribute('data-state')).toBe('ask');
  });

  it('arrow keys move between options; on energy they pick (like radios)', () => {
    const { el } = render({ open: true });
    const group = el.find((e) => e.getAttribute('role') === 'radiogroup')[0] as FakeEl;
    one(el, 'data-feel-energy', '1').focus();
    group.dispatch('keydown', { key: 'ArrowRight' });
    expect(one(el, 'data-feel-energy', '2').getAttribute('aria-checked')).toBe('true');
    group.dispatch('keydown', { key: 'ArrowLeft' });
    expect(one(el, 'data-feel-energy', '1').getAttribute('aria-checked')).toBe('true');
    const chips = el.find((e) => e.getAttribute('role') === 'group')[0] as FakeEl;
    one(el, 'data-feel-sore', 'arms').focus();
    chips.dispatch('keydown', { key: 'ArrowRight' });
    const doc = (globalThis as { document: { activeElement: unknown } }).document;
    expect(doc.activeElement).toBe(one(el, 'data-feel-sore', 'shoulders'));
    expect(one(el, 'data-feel-sore', 'shoulders').getAttribute('aria-checked')).toBe('false');
  });
});

describe('feel today: answered (once per day)', () => {
  const FEEL: DayFeel = { date: DATE, energy: 4, sore: ['shoulders'] };

  it('shows the answer with Change instead of asking again', () => {
    const { el } = render({ feel: FEEL });
    expect(el.getAttribute('data-state')).toBe('done');
    expect(byAttr(el, 'data-feel-open')).toEqual([]);
    expect(one(el, 'data-feel-summary').textContent).toBe('Energy 4 of 5 (Good) · Sore: shoulders');
    one(el, 'data-feel-change').click();
    expect(one(el, 'data-feel-energy', '4').getAttribute('aria-checked')).toBe('true');
    expect(one(el, 'data-feel-sore', 'shoulders').getAttribute('aria-checked')).toBe('true');
  });

  it('"Go easy on shoulders today?" offers pass the area out; none without offers', () => {
    const offers = todaysFeelOffers([FEEL], DATE);
    const { el, easy } = render({ feel: FEEL, offers });
    const btn = one(el, 'data-easy-on', 'shoulders');
    expect(btn.textContent).toBe('Go easy on shoulders today?');
    btn.click();
    expect(easy).toEqual(['shoulders']);
    expect(byAttr(render({ feel: FEEL }).el, 'data-easy-on')).toEqual([]);
    // Without the callback, no offer buttons.
    const bare = asFake(feelToday({ date: DATE, feel: FEEL, offers }, { onSaveFeel: () => {} }));
    expect(byAttr(bare, 'data-easy-on')).toEqual([]);
  });
});

describe('feel today: motion', () => {
  type Anim = { el: FakeEl; frames: Keyframe[] };
  let anims: Anim[] = [];
  let reduce = false;
  const g = globalThis as { matchMedia?: unknown };
  let savedMM: unknown;
  const proto = FakeEl.prototype as unknown as { animate?: unknown };
  beforeEach(() => {
    anims = [];
    reduce = false;
    savedMM = g.matchMedia;
    g.matchMedia = (q: string) => ({ matches: q.includes('reduced-motion') && reduce, media: q });
    proto.animate = function (this: FakeEl, frames: Keyframe[]) {
      anims.push({ el: this, frames });
      return { cancel: () => {} };
    };
  });
  afterEach(() => {
    g.matchMedia = savedMM;
    delete proto.animate;
  });

  it('the panel rises in when opened by a tap, not when rendered open', () => {
    const { el } = render();
    one(el, 'data-feel-open').click();
    expect(anims.map((a) => a.el)).toEqual(el.byClass('feel-panel'));
    expect(anims[0]?.frames[0]?.transform).toBe('translateY(8px)');
    anims = [];
    render({ open: true });
    expect(anims).toEqual([]);
  });

  it('reduced motion: nothing animates', () => {
    reduce = true;
    const { el } = render();
    one(el, 'data-feel-open').click();
    expect(anims).toEqual([]);
  });
});

describe('feel today: CSS', () => {
  it('body text ≥ 20px, targets ≥ 56px, tokens only', () => {
    const css = readFileSync(new URL('./feelToday.css', import.meta.url), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`\\n${sel} \\{([^}]*)\\}`))?.[1] ?? '';
    for (const sel of [
      '\\.feel-ask',
      '\\.feel-opt',
      '\\.feel-btn',
      '\\.feel-offer',
      '\\.feel-change',
    ]) {
      expect(rule(sel), sel).toContain('min-height: var(--tap-min)');
      expect(rule(sel), sel).toContain('font-size: var(--fs-body)');
    }
    expect(rule('\\.feel-done-text')).toContain('font-size: var(--fs-body)');
    expect(rule('\\.feel-hint')).toContain('font-size: var(--fs-body)');
    // No text below body size, including the word under each energy number.
    expect(css).not.toMatch(/--fs-label/);
    expect(rule('\\.feel-word')).toContain('font-size: var(--fs-body)');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*\d/);
  });
});
