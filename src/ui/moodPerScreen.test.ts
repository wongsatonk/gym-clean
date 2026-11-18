/// <reference types="node" />
// M13 task 18 ("one look", SPEC M13 Goal 5): the pure-black track mood with 8px cards is for
// in-workout screens only; Calendar and its day view use the standard surface and 20px cards.
// Reads each screen's source for the mood class its root asks for.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const moods = (path: string) => [...src(path).matchAll(/moodClass\('(\w+)'\)/g)].map((m) => m[1]);

describe('mood class per screen (M13 one look)', () => {
  it.each([
    ['Calendar', './screens/calendar.ts', 'pro'],
    ['Calendar day', './screens/calendarDay.ts', 'pro'],
    ['Exercise history', './screens/history.ts', 'pro'],
    ['Rest', './screens/rest.ts', 'track'],
  ])('%s uses the %s mood', (_name, path, mood) => {
    expect(moods(path)).toEqual([mood]);
  });

  it('the track mood is documented as in-workout only', () => {
    const css = src('../styles.css');
    const at = css.indexOf('.mood-track {');
    expect(css.slice(Math.max(0, at - 300), at)).toMatch(/Exercise, Rest and the camera/);
  });
});
