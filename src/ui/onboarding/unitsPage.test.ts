// M13d task 12: the first-run Units page body (fake DOM) and its place in the welcome screen.
// Copy from src/data/onboarding.ts; the step order from the real onboardingSteps().
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onboardingSteps } from '../../core/onboarding';
import type { UnitPrefs } from '../../core/types';
import { ONBOARDING_BUTTONS, UNITS_PAGE } from '../../data/onboarding';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import { UNITS_LENGTH_GROUP, UNITS_WEIGHT_GROUP, unitsPage } from './unitsPage';
import { onboardingScreen } from './welcome';

useFakeDom();

const group = (el: FakeEl, name: string): FakeEl => {
  const g = el.find(
    (e) => e.getAttribute('role') === 'group' && e.getAttribute('aria-label') === name,
  )[0];
  if (!g) throw new Error(`no group ${name}`);
  return g;
};
const btn = (g: FakeEl, word: string): FakeEl => {
  const b = g.byTag('button').find((x) => x.textContent === word);
  if (!b) throw new Error(`no button ${word}`);
  return b;
};
const pressed = (g: FakeEl) =>
  g
    .byTag('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);

function render(units: UnitPrefs) {
  const changes: UnitPrefs[] = [];
  const el = asFake(unitsPage({ units, titleId: 't' }, { onChange: (u) => changes.push(u) }));
  return { el, changes };
}

/** Words a reader sees on the page body (the switch words included). */
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe('unitsPage', () => {
  it('title (labels the dialog), one line, two named choices with the units as words', () => {
    const { el } = render({ weight: 'kg', length: 'cm' });
    const title = el.find((e) => e.getAttribute('data-ob') === 'title')[0];
    expect(title?.tag).toBe('h2');
    expect(title?.getAttribute('id')).toBe('t');
    expect(title?.textContent).toBe(UNITS_PAGE.title);
    expect(el.find((e) => e.getAttribute('data-ob') === 'body')[0]?.textContent).toBe(
      UNITS_PAGE.body,
    );
    const w = group(el, UNITS_WEIGHT_GROUP);
    const l = group(el, UNITS_LENGTH_GROUP);
    expect(w.byTag('button').map((b) => b.textContent)).toEqual(['kg', 'lb']);
    expect(l.byTag('button').map((b) => b.textContent)).toEqual(['cm', 'ft·in']);
    // Visible words over each switch; hidden from screen readers (the group name says it).
    const labels = el.byClass('ob-units-label');
    expect(labels.map((x) => x.textContent)).toEqual([
      UNITS_PAGE.weight.label,
      UNITS_PAGE.length.label,
    ]);
    for (const x of labels) expect(x.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    [{ weight: 'kg', length: 'cm' }, ['kg'], ['cm']],
    [{ weight: 'lb', length: 'in' }, ['lb'], ['ft·in']],
    [{ weight: 'lb', length: 'cm' }, ['lb'], ['cm']],
  ] as const)('preselects %o', (units, w, l) => {
    const { el } = render(units);
    expect(pressed(group(el, UNITS_WEIGHT_GROUP))).toEqual(w);
    expect(pressed(group(el, UNITS_LENGTH_GROUP))).toEqual(l);
  });

  it('a tap on the other option reports BOTH units once; the active option reports nothing', () => {
    const { el, changes } = render({ weight: 'lb', length: 'in' });
    const w = group(el, UNITS_WEIGHT_GROUP);
    const l = group(el, UNITS_LENGTH_GROUP);
    btn(w, 'lb').click();
    btn(l, 'ft·in').click();
    expect(changes).toEqual([]);
    btn(w, 'kg').click();
    expect(changes).toEqual([{ weight: 'kg', length: 'in' }]);
    btn(l, 'cm').click();
    expect(changes).toEqual([
      { weight: 'kg', length: 'in' },
      { weight: 'kg', length: 'cm' },
    ]);
    expect(pressed(w)).toEqual(['kg']);
    expect(pressed(l)).toEqual(['cm']);
    // Each report is its own copy (the caller may keep it).
    expect(changes[0]).not.toBe(changes[1]);
  });

  it('first-run budget: ≤ 30 words on the page (title, line, labels, units)', () => {
    const { el } = render({ weight: 'kg', length: 'cm' });
    expect(words(el.textContent.replace(/(kg|lb|cm|ft·in)/g, ' $1 '))).toBeLessThanOrEqual(30);
    expect(UNITS_PAGE.body).toMatch(/\byou/i);
  });

  it('CSS: the switches fill the row, options stay ≥ 56px and the words ≥ 20px (tokens only)', () => {
    const css = readFileSync(join(__dirname, 'onboarding.css'), 'utf8');
    const block = (sel: string) => {
      const i = css.indexOf(`${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    expect(block('.ob-units .ob-units-switch')).toMatch(/width: 100%/);
    const opt = block('.ob-units .ob-units-switch .unit-switch-opt');
    expect(opt).toMatch(/min-height: var\(--tap-bar\)/); // 60px
    expect(opt).toMatch(/font-size: var\(--fs-lead\)/); // 26px
    expect(block('.ob-units-label')).toMatch(/font-size: var\(--fs-body\)/); // 20px
    expect(css.slice(css.indexOf('M13d task 12'))).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

describe('onboardingScreen: the units step', () => {
  const STEPS = onboardingSteps({
    platform: 'web',
    fresh: true,
    intakeDone: false,
    has: { health: false, mic: false, notifications: false },
  });
  const index = STEPS.findIndex((s) => s.kind === 'units');

  function screen(units?: UnitPrefs) {
    const got: UnitPrefs[] = [];
    let next = 0;
    const s = onboardingScreen(
      { steps: STEPS, index, units },
      {
        onNext: () => next++,
        onBack: () => {},
        onSkipAll: () => {},
        onDone: () => {},
        onAllow: () => {},
        onNotNow: () => {},
        onUnits: (u) => got.push(u),
      },
    );
    return { el: asFake(s.el), got, next: () => next };
  }

  it('is in the flow right after the welcome pages', () => {
    expect(index).toBeGreaterThan(0);
    expect(STEPS[index - 1]?.kind).toBe('welcome');
  });

  it('renders the Units page, labelled by its title, with the live line naming it', () => {
    const { el } = screen({ weight: 'lb', length: 'in' });
    const page = el.find((e) => e.getAttribute('data-ob') === 'page')[0];
    expect(page?.getAttribute('data-step')).toBe('units');
    const id = el.getAttribute('aria-labelledby');
    expect(el.find((e) => e.getAttribute('id') === id)[0]?.textContent).toBe(UNITS_PAGE.title);
    expect(el.find((e) => e.getAttribute('data-ob') === 'live')[0]?.textContent).toContain(
      `: ${UNITS_PAGE.title}`,
    );
    expect(pressed(group(el, UNITS_WEIGHT_GROUP))).toEqual(['lb']);
    expect(pressed(group(el, UNITS_LENGTH_GROUP))).toEqual(['ft·in']);
  });

  it('no units passed → kg + cm', () => {
    const { el } = screen();
    expect(pressed(group(el, UNITS_WEIGHT_GROUP))).toEqual(['kg']);
    expect(pressed(group(el, UNITS_LENGTH_GROUP))).toEqual(['cm']);
  });

  it('taps go to onUnits; Next is the usual button and calls onNext', () => {
    const { el, got, next } = screen({ weight: 'kg', length: 'cm' });
    btn(group(el, UNITS_LENGTH_GROUP), 'ft·in').click();
    expect(got).toEqual([{ weight: 'kg', length: 'in' }]);
    const primary = el.find((e) => e.getAttribute('data-ob') === 'primary')[0];
    expect(primary?.textContent).toBe(ONBOARDING_BUTTONS.next);
    primary?.click();
    expect(next()).toBe(1);
  });
});
