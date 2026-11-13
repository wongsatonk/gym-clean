import { describe, expect, it } from 'vitest';
import { APP_NAME, appTitle } from './appInfo';

describe('appTitle', () => {
  it('returns the app name with no version', () => {
    expect(appTitle()).toBe(APP_NAME);
    expect(APP_NAME).toBe('FocusRep');
  });

  it('appends a version when given', () => {
    expect(appTitle('1.2.0')).toBe('FocusRep v1.2.0');
  });
});
