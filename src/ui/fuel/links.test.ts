import { describe, expect, it } from 'vitest';
import { asFake, useFakeDom } from '../screens/testDom';
import { byAttr, copyHits, oneAttr } from './fuelTestUtil';
import { nudgeBanner, proteinLine, proteinPct } from './links';

useFakeDom();

describe('Summary protein line', () => {
  it('proteinPct clamps 0–100', () => {
    expect(proteinPct(75, 150)).toBe(50);
    expect(proteinPct(200, 150)).toBe(100);
    expect(proteinPct(10, 0)).toBe(0);
  });

  it('shows protein vs target, the bar and the hint', () => {
    const el = asFake(
      proteinLine({
        proteinG: 84.6,
        targetG: 130,
        hint: '45 g protein to go today',
        estimate: true,
      }),
    );
    expect(el.oneByClass('fp-value').textContent).toBe('85');
    expect(el.textContent).toContain('/ 130 g');
    expect(el.textContent).toContain('Protein today');
    expect(oneAttr(el, 'data-fuel-hint').textContent).toBe('45 g protein to go today');
    expect(oneAttr(el, 'role', 'progressbar').getAttribute('aria-valuenow')).toBe('65');
    expect(byAttr(el, 'data-estimate')).toHaveLength(1);
    expect(el.classes).not.toContain('fp-done');
    expect(copyHits(el)).toEqual([]);
  });

  it('target hit → done style, no estimate tag when set by hand', () => {
    const el = asFake(
      proteinLine({ proteinG: 140, targetG: 130, hint: 'Protein target hit today' }),
    );
    expect(el.classes).toContain('fp-done');
    expect(byAttr(el, 'data-estimate')).toHaveLength(0);
  });
});

describe('Today nudge banner', () => {
  it('shows the line with Dismiss, and Log food when given', () => {
    let dismissed = 0;
    let opened = 0;
    const el = asFake(
      nudgeBanner(
        '40 g protein to go today.',
        () => dismissed++,
        () => opened++,
      ),
    );
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('40 g protein to go today.');
    oneAttr(el, 'data-nudge-dismiss').click();
    oneAttr(el, 'data-nudge-open').click();
    expect([dismissed, opened]).toEqual([1, 1]);
    expect(copyHits(el)).toEqual([]);
  });

  it('no Log food without onOpen', () => {
    const el = asFake(nudgeBanner('40 g protein to go today.', () => undefined));
    expect(byAttr(el, 'data-nudge-open')).toHaveLength(0);
  });
});
