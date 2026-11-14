// Design tokens (M4e A2). The values live in src/styles.css (`:root`, `.mood-*`,
// `[data-accent=…]`); this module only names them and reads them for code that can't use
// var(--…) directly: canvas 2D and three.js. No colour literal here, by design
// (src/ui/tokens.test.ts checks it).
import type { Accent } from '../core/types';

/** Every shared token on `:root`. tokens.test.ts asserts each one is defined in styles.css. */
export const TOKEN_NAMES = [
  // colour roles
  '--bg',
  '--surface',
  '--surface-2',
  '--line',
  '--text',
  '--text-2',
  '--info',
  '--cta',
  '--on-cta',
  '--success',
  '--on-success',
  '--muscle',
  '--muscle-2',
  '--body',
  '--edge',
  '--stage-1',
  '--stage-2',
  '--cue',
  '--danger',
  '--on-danger',
  '--warn',
  '--black',
  '--selected',
  '--on-selected',
  '--focus',
  '--scrim',
  '--scrim-soft',
  '--veil',
  '--veil-faint',
  '--glass-line',
  '--glass-track',
  // type
  '--font-display',
  '--font-body',
  '--fs-label',
  '--fs-body',
  '--fs-cue',
  '--fs-title',
  '--fs-num',
  '--fs-hero',
  '--fs-rep',
  '--fs-timer',
  '--fs-lead',
  '--fs-head',
  '--fs-display',
  '--fs-stepper',
  '--fs-num-sm',
  '--fs-count',
  // shape, icons, tap sizes
  '--r-btn',
  '--r-card',
  '--r-pill',
  '--line-w',
  '--ic-sm',
  '--ic-md',
  '--ic-lg',
  '--tap-min',
  '--tap-bar',
  '--tap-cta',
  '--tap-hero',
  '--tab-h',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

/** Tokens a mood class sets on a screen root (Energy only). */
export type MoodToken = '--ember' | '--ember-hi';

export type Mood = 'energy' | 'pro' | 'track';

export const ACCENTS: readonly Accent[] = ['orange', 'volt', 'yellow'];

/** Class to put on a screen root for its mood. */
export function moodClass(mood: Mood): string {
  return `mood-${mood}`;
}

/**
 * The computed value of a token, trimmed. Reads `el` (default: <html>), so a token a mood class
 * overrides comes back with the mood's value when `el` is inside that screen.
 * Returns '' when there is no DOM (tests, workers) or the token is unset; callers keep their own
 * fallback for that case.
 */
export function cssToken(name: TokenName | MoodToken, el?: Element): string {
  try {
    if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return '';
    return getComputedStyle(el ?? document.documentElement)
      .getPropertyValue(name)
      .trim();
  } catch {
    return '';
  }
}

/** Switches the action colour app-wide. Unknown values fall back to orange. */
export function applyAccent(accent: Accent, root: HTMLElement = document.documentElement): void {
  root.dataset['accent'] = ACCENTS.includes(accent) ? accent : 'orange';
}
