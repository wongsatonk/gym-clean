/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import {
  buildCardOutcome,
  buildProposalCard,
  buildRedFlagCard,
  buildThreadProposalCard,
  isPairLine,
  PAIR_REST_SEC,
  pairLineText,
  pairsOf,
  pairText,
  rowLabel,
  type ProposalCardProps,
} from './proposalCard';

useFakeDom();

// The short-on-time proposal as core writes it (made-up day): pairs first, then trims, then drops.
const SHORT: ProposalCardProps = {
  title: 'Short on time: 30 min',
  lines: [
    { before: 'Dumbbell Curl + Triceps Pushdown', after: 'Back to back, 45 s rest' },
    { before: 'Lateral Raise · 3 × 12–15 reps', after: '2 × 12–15 reps' },
    { before: 'Face Pull · 3 × 12–15 reps', after: 'Removed today' },
  ],
  why: 'Your main lifts stay. The smaller moves are paired, trimmed or left out. Just for today.',
};

function render(p: ProposalCardProps = SHORT) {
  const calls = { apply: 0, dismiss: 0 };
  const built = buildProposalCard(p, {
    onApply: () => calls.apply++,
    onDismiss: () => calls.dismiss++,
  });
  return { el: asFake(built.el), built, calls };
}
const pairRows = (el: FakeEl) => el.find((e) => e.hasAttribute('data-pair'));

describe('pair line helpers', () => {
  it('pairText: "Curl + Triceps: back to back, 45 s rest"', () => {
    expect(pairText({ a: 'Curl', b: 'Triceps', restSec: 45 })).toBe(
      'Curl + Triceps: back to back, 45 s rest',
    );
    expect(PAIR_REST_SEC).toBe(45);
    expect(checkCopy(pairText({ a: 'Curl', b: 'Triceps', restSec: 45 })).hits).toEqual([]);
  });

  it('knows a pair line by its words; other rows are not pairs', () => {
    expect(isPairLine({ before: 'Curl + Triceps', after: 'Back to back, 45 s rest' })).toBe(true);
    expect(isPairLine({ before: '', after: 'Curl + Triceps: back to back, 45 s rest' })).toBe(true);
    expect(isPairLine({ before: 'Lateral Raise · 3 × 12', after: '2 × 12' })).toBe(false);
    expect(isPairLine({ before: 'Back Extension · 3 × 12', after: 'Removed today' })).toBe(false);
  });

  it('reads core’s before / after as one sentence', () => {
    expect(pairLineText({ before: 'Curl + Triceps', after: 'Back to back, 45 s rest' })).toBe(
      'Curl + Triceps: back to back, 45 s rest',
    );
    expect(pairLineText({ before: '', after: 'Curl + Triceps: back to back, 45 s rest' })).toBe(
      'Curl + Triceps: back to back, 45 s rest',
    );
    expect(rowLabel({ before: 'Curl + Triceps', after: 'Back to back, 45 s rest' })).toBe(
      'Pair: Curl + Triceps: back to back, 45 s rest',
    );
    // Other rows read as before.
    expect(rowLabel({ before: 'A', after: 'B' })).toBe('A, becomes B');
    expect(rowLabel({ before: '', after: 'B' })).toBe('Add B');
    expect(rowLabel({ before: 'A', after: '' })).toBe('A, removed');
  });

  it('pairsOf: each pair once, in day order, from pairWith on either or both rows', () => {
    const name = (id: string) =>
      ({ curl: 'Curl', tri: 'Triceps', lat: 'Lateral Raise', fp: 'Face Pull' })[id] ?? id;
    const day = [
      { exerciseId: 'bench' },
      { exerciseId: 'curl', pairWith: 'tri' },
      { exerciseId: 'tri', pairWith: 'curl' },
      { exerciseId: 'lat', pairWith: 'fp' },
      { exerciseId: 'fp' },
      { exerciseId: 'solo', pairWith: 'gone' },
      { exerciseId: 'self', pairWith: 'self' },
    ];
    expect(pairsOf(day, name)).toEqual([
      { a: 'Curl', b: 'Triceps', restSec: 45 },
      { a: 'Lateral Raise', b: 'Face Pull', restSec: 45 },
    ]);
    expect(pairsOf(day, name, 30)[0]?.restSec).toBe(30);
    expect(pairsOf([{ exerciseId: 'bench' }], name)).toEqual([]);
  });
});

describe('proposal card: short on time', () => {
  it('a pair line is one sentence under a "Pair" tag, without the arrow', () => {
    const { el } = render();
    const rows = el.byClass('proposal-row');
    expect(rows).toHaveLength(3);
    const pairs = pairRows(el);
    expect(pairs).toHaveLength(1);
    const pair = pairs[0] as FakeEl;
    expect(pair.oneByClass('pair-tag').textContent).toBe('Pair');
    // Icon + word, not colour alone.
    expect(pair.oneByClass('pair-tag').byClass('ic')).toHaveLength(1);
    expect(pair.oneByClass('proposal-after').textContent).toBe(
      'Dumbbell Curl + Triceps Pushdown: back to back, 45 s rest',
    );
    expect(pair.byClass('proposal-arrow')).toHaveLength(0);
    expect(pair.byClass('proposal-before')).toHaveLength(0);
    expect(pair.getAttribute('aria-label')).toBe(
      'Pair: Dumbbell Curl + Triceps Pushdown: back to back, 45 s rest',
    );
  });

  it('trimmed and removed rows keep the before → after look', () => {
    const { el } = render();
    const rows = el.byClass('proposal-row').filter((r) => !r.hasAttribute('data-pair'));
    expect(rows.map((r) => r.oneByClass('proposal-before').textContent)).toEqual([
      'Lateral Raise · 3 × 12–15 reps',
      'Face Pull · 3 × 12–15 reps',
    ]);
    expect(rows.every((r) => r.byClass('proposal-arrow').length === 1)).toBe(true);
  });

  it('the `pairs` prop draws the same pair lines after the rows', () => {
    const { el } = render({
      title: 'Short on time: 20 min',
      lines: [{ before: 'Face Pull · 3 × 12–15 reps', after: 'Removed today' }],
      why: 'Just for today.',
      pairs: [{ a: 'Curl', b: 'Triceps', restSec: 45 }],
    });
    expect(el.byClass('proposal-row')).toHaveLength(2);
    const pair = pairRows(el)[0] as FakeEl;
    expect(pair.oneByClass('proposal-after').textContent).toBe(
      'Curl + Triceps: back to back, 45 s rest',
    );
    expect(pair.getAttribute('aria-label')).toBe('Pair: Curl + Triceps: back to back, 45 s rest');
  });

  it('a proposal without pairs is unchanged; Apply / Not now still call back', () => {
    const { el, built, calls } = render({
      title: 'Lighter today',
      lines: [{ before: 'Bench · 4 × 8', after: '3 × 8' }],
      why: 'Because you asked.',
    });
    expect(pairRows(el)).toHaveLength(0);
    expect(el.byClass('pair-tag')).toHaveLength(0);
    expect(built.controls).toHaveLength(2);
    (built.controls[0] as unknown as FakeEl).click();
    (built.controls[1] as unknown as FakeEl).click();
    expect(calls).toEqual({ apply: 1, dismiss: 1 });
  });

  it('in the chat thread: pending shows the pair line; an answered card is title + status', () => {
    const a = { onApply: () => {}, onDismiss: () => {} };
    const pending = asFake(buildThreadProposalCard(SHORT, 'pending', a).el);
    expect(pairRows(pending)).toHaveLength(1);
    const applied = asFake(buildThreadProposalCard(SHORT, 'applied', a).el);
    expect(pairRows(applied)).toHaveLength(0);
    expect(applied.textContent).toContain('Short on time: 30 min');
  });

  it('copy passes the coach copy check', () => {
    expect(checkCopy(render().el.textContent).hits).toEqual([]);
  });
});

describe('round icon buttons (M13d task 40f)', () => {
  const ib = (b: FakeEl | undefined) => ({
    round: b?.hasAttribute('data-icon-btn'),
    variant: b?.getAttribute('data-variant'),
    labelAt: b?.getAttribute('data-label-at'),
    wide: b?.hasAttribute('data-wide-hit'),
    word: b?.oneByClass('icon-btn-label').textContent,
    icon: b?.oneByClass('icon-btn-circle').byTag('svg')[0]?.getAttribute('data-icon'),
    hidden: b?.oneByClass('icon-btn-circle').getAttribute('aria-hidden'),
  });

  it('Apply is the main circle + word in a wide pill; Not now a secondary circle, word under', () => {
    const { built } = render();
    const [apply, dismiss] = built.controls.map(asFake);
    expect(ib(apply)).toEqual({
      round: true,
      variant: 'main',
      labelAt: 'beside',
      wide: true,
      word: 'Apply',
      icon: 'check',
      hidden: 'true',
    });
    // The coach sheet focuses the newest Apply by this class (app.ts).
    expect(apply?.classes).toContain('proposal-apply');
    expect(ib(dismiss)).toEqual({
      round: true,
      variant: 'secondary',
      labelAt: 'below',
      wide: false,
      word: 'Not now',
      icon: 'close',
      hidden: 'true',
    });
    // No accessible-name override: the word is the name.
    expect(apply?.getAttribute('aria-label')).toBeNull();
    expect(dismiss?.getAttribute('aria-label')).toBeNull();
  });

  it('red flag: End workout (danger) and Not today stay full-width bars, words beside', () => {
    const calls: string[] = [];
    const { controls } = buildRedFlagCard('Stop.', {
      onEndWorkout: () => calls.push('end'),
      onNotToday: () => calls.push('not'),
    });
    const [end, not] = controls.map(asFake);
    expect(ib(end)).toMatchObject({
      round: true,
      variant: 'danger',
      wide: true,
      word: 'End workout',
      icon: 'flag',
    });
    expect(ib(not)).toMatchObject({
      round: true,
      variant: 'secondary',
      wide: true,
      word: 'Not today',
      icon: 'calendar',
    });
    expect(end?.classes).toContain('cb-tall');
    expect(not?.classes).toContain('cb-tall');
    end?.click();
    not?.click();
    expect(calls).toEqual(['end', 'not']);
  });

  it('Undo and Ask again: secondary circles with the word beside, hooks kept', () => {
    const calls: string[] = [];
    const undo = asFake(
      buildCardOutcome('applied', { onUndo: () => calls.push('undo') }).controls[0] as HTMLElement,
    );
    const ask = asFake(
      buildCardOutcome('expired', { onAskAgain: () => calls.push('ask') })
        .controls[0] as HTMLElement,
    );
    expect(ib(undo)).toMatchObject({
      round: true,
      variant: 'secondary',
      labelAt: 'beside',
      word: 'Undo',
      icon: 'undo',
    });
    expect(undo.hasAttribute('data-card-undo')).toBe(true);
    expect(ib(ask)).toMatchObject({
      round: true,
      variant: 'secondary',
      labelAt: 'beside',
      word: 'Ask again',
      icon: 'chat',
    });
    expect(ask.hasAttribute('data-card-ask')).toBe(true);
    undo.click();
    ask.click();
    expect(calls).toEqual(['undo', 'ask']);
  });
});

describe('pair styles (styles.css block)', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  const start = css.indexOf('M12 slice 1b task 29 (ui-engineer): short-on-time pair lines — START');
  const end = css.indexOf('M12 slice 1b task 29 (ui-engineer): short-on-time pair lines — END');
  const block = css.slice(start, end);

  it('is one marked block: tokens only, text at body size, no action colour', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('.pair-tag');
    expect(block).toContain('.pair-note');
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(block).not.toMatch(/font-size:\s*\d/);
    expect(block).not.toContain('--fs-label');
    expect(block).not.toContain('--cta');
  });
});
