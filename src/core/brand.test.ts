import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE } from './brand';
import { checkCopy } from './trainer/replies';

describe('brand constants (M13)', () => {
  it('keeps the name "Gym Clean" (his answer to M13-q1)', () => {
    expect(APP_NAME).toBe('Gym Clean');
  });

  it('has a one-line tagline that passes the copy rules and assumes no one', () => {
    expect(APP_TAGLINE).toBe('Your pocket strength coach.');
    expect(APP_TAGLINE).not.toMatch(/\n/);
    expect(checkCopy(APP_TAGLINE).ok).toBe(true);
    expect(APP_TAGLINE).not.toMatch(/\b(he|his|him|man|men|guys?|bro)\b/i);
  });
});
