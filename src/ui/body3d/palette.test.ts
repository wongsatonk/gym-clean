import { describe, expect, it } from 'vitest';
import {
  FIGURE_TOKEN_FALLBACK,
  contrast,
  cssVar,
  figurePalette,
  mix,
  parseHex,
  stageBackground,
} from './palette';

const none = () => '';

describe('figure palette', () => {
  it('falls back to the README token values when the tokens are not set', () => {
    const p = figurePalette(none);
    expect(p.muscle).toBe(0x35c8ff);
    expect(p.body).toBe(0x3a424d);
    expect(p.edge).toBe(0x8d98a6);
    expect(p.stage1).toBe(0x2a313b);
    expect(p.stage2).toBe(0x16191e);
  });

  it('reads the tokens when they are set, and ignores values it cannot parse', () => {
    const tokens: Record<string, string> = {
      '--muscle': ' #00ff00 ',
      '--body': 'oops',
      '--edge': '#abc',
    };
    const p = figurePalette((n) => tokens[n] ?? '');
    expect(p.muscle).toBe(0x00ff00);
    expect(p.body).toBe(0x3a424d);
    expect(p.edge).toBe(0xaabbcc);
  });

  it('derives every other colour from the tokens', () => {
    const tokens: Record<string, string> = { '--muscle': '#ff0000', '--muscle-2': '#800000' };
    const a = figurePalette(none);
    const b = figurePalette((n) => tokens[n] ?? '');
    expect(a.secondary).toBe(0x2899c8);
    expect(b.secondary).toBe(0x800000);
    expect(b.muscleGlow).not.toBe(a.muscleGlow);
    expect(b.iron).toBe(b.edge);
    expect(b.rimLight).toBe(b.edge);
  });

  it('keeps the contrasts the mix checked (figure ≥ 3:1)', () => {
    const p = figurePalette(none);
    expect(contrast(p.muscle, p.body)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.edge, p.stage2)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.edge, p.stage1)).toBeGreaterThanOrEqual(3);
    // Secondary sits between body and primary, so the two levels stay apart; it is also a
    // non-text graphic on the body, so it keeps 3:1 there (WCAG 1.4.11).
    expect(contrast(p.secondary, p.body)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.muscle, p.secondary)).toBeGreaterThan(1.4);
  });
});

describe('colour helpers', () => {
  it('parses #rgb and #rrggbb only', () => {
    expect(parseHex('#35C8FF')).toBe(0x35c8ff);
    expect(parseHex('#fff')).toBe(0xffffff);
    expect(parseHex('rgb(1 2 3)')).toBeNull();
    expect(parseHex('')).toBeNull();
  });

  it('mixes per channel and clamps t', () => {
    expect(mix(0x000000, 0xfefefe, 0.5)).toBe(0x7f7f7f);
    expect(mix(0x102030, 0x405060, 2)).toBe(0x405060);
    expect(mix(0x102030, 0x405060, -1)).toBe(0x102030);
  });

  it('writes CSS with the fallback inside var()', () => {
    expect(cssVar('--muscle')).toBe(`var(--muscle, ${FIGURE_TOKEN_FALLBACK['--muscle']})`);
    expect(stageBackground()).toContain('var(--stage-1,');
    expect(stageBackground()).toContain('var(--stage-2,');
  });
});
