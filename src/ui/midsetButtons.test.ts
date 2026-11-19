// M13d task 40g: the mid-set round-button pill (midsetButtons.ts) and its CSS (midset.css):
// render checks on the fake DOM, CSS checks read from disk.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { midPill, setPillWord } from './midsetButtons';
import { asFake, useFakeDom } from './screens/testDom';

useFakeDom();

const css = readFileSync(join(__dirname, 'midset.css'), 'utf8');
const flat = css.replace(/\s+/g, ' ');

/** The declarations of the first rule whose selector is exactly `sel` (whitespace-normalised). */
function rule(sel: string): string {
  const at = flat.indexOf(`${sel} {`);
  if (at < 0) throw new Error(`no rule ${sel}`);
  return flat.slice(at, flat.indexOf('}', at));
}

describe('midPill', () => {
  it('is an iconButton with its word beside the circle, the word as the name', () => {
    let taps = 0;
    const b = asFake(midPill({ icon: 'check', label: 'Set done', onClick: () => taps++ }));
    expect(b.tag).toBe('button');
    expect(b.hasAttribute('data-icon-btn')).toBe(true);
    expect(b.getAttribute('data-label-at')).toBe('beside');
    expect(b.getAttribute('data-variant')).toBe('secondary');
    expect(b.classes).toEqual(expect.arrayContaining(['icon-btn', 'mid-pill']));
    expect(b.hasAttribute('data-wide-hit')).toBe(false);
    expect(b.textContent).toBe('Set done');
    expect(b.getAttribute('aria-label')).toBeNull();
    b.click();
    expect(taps).toBe(1);
  });

  it('`wide` makes the whole row the tap area; class, hooks, variant and aria-label pass through', () => {
    const b = asFake(
      midPill({
        icon: 'timer',
        label: '+30 s',
        ariaLabel: '+30 s, add 30 seconds of rest',
        variant: 'main',
        wide: true,
        class: 'extra',
        hooks: { 'data-rest-extend': true },
        onClick: () => {},
      }),
    );
    expect(b.hasAttribute('data-wide-hit')).toBe(true);
    expect(b.getAttribute('data-variant')).toBe('main');
    expect(b.classes).toEqual(expect.arrayContaining(['mid-pill', 'extra']));
    expect(b.hasAttribute('data-rest-extend')).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('+30 s, add 30 seconds of rest');
  });

  it('setPillWord changes only the word; the icon stays', () => {
    const b = asFake(midPill({ icon: 'flag', label: 'End workout', onClick: () => {} }));
    setPillWord(b as unknown as HTMLElement, 'Tap again to end');
    expect(b.textContent).toBe('Tap again to end');
    expect(b.byTag('svg')[0]?.getAttribute('data-icon')).toBe('flag');
  });
});

describe('midset.css', () => {
  it('main pills are at least --tap-hero tall; 72px rows keep --tap-cta', () => {
    expect(rule(".icon-btn.mid-pill[data-variant='main']")).toContain(
      'min-height: var(--tap-hero)',
    );
    expect(rule('.icon-btn.mid-pill.mid-row')).toContain('min-height: var(--tap-cta)');
  });

  it('a hidden pill is not shown (Next arm / Set done swap): iconButton.css hides every hidden icon button, after its own display rules', () => {
    const ib = readFileSync(join(__dirname, 'iconButton.css'), 'utf8').replace(/\s+/g, ' ');
    const at = ib.indexOf('.icon-btn[hidden] {');
    expect(at).toBeGreaterThan(-1);
    expect(ib.slice(at, ib.indexOf('}', at))).toContain('display: none');
    expect(ib.indexOf('.icon-btn[data-wide-hit] {')).toBeLessThan(at);
    // midset.css doesn't put a display back on a pill.
    expect(flat).not.toMatch(/\.mid-pill[^{]*\{[^}]*display:\s*(flex|inline-flex|grid)/);
  });

  it('the exercise steppers draw a 72px circle inside a ≥ 72px tap area', () => {
    expect(rule('.ex-stepper .step-btn.mid-step')).toContain('min-height: var(--tap-cta)');
    const circle = rule('.mid-step-circle');
    expect(circle).toContain('width: var(--tap-cta)');
    expect(circle).toContain('height: var(--tap-cta)');
    expect(circle).toContain('border-radius: 50%');
  });

  it('Rest, Summary and the Pause sheet get no press motion (colour change only)', () => {
    const scope = ":is([data-screen='rest'], [data-screen='summary'], .pause-sheet)";
    expect(rule(`${scope} .icon-btn .icon-btn-circle`)).toContain('transition: none');
    expect(rule(`${scope} .icon-btn:active:not(:disabled) .icon-btn-circle`)).toContain(
      'transform: none',
    );
    expect(rule(`${scope} .icon-btn .icon-btn-circle::after`)).toContain('display: none');
  });

  it('only transform/opacity-free rules: no animation or keyframes here', () => {
    expect(css).not.toMatch(/@keyframes|animation:/);
  });
});
