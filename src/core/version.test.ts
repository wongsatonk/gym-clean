import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_BUILD, APP_RELEASE, CREDIT, versionLabel } from './version';

describe('version', () => {
  it('formats the label', () => {
    expect(versionLabel('1.12.0', 'abc1234')).toBe('Version 1.12.0 (build abc1234)');
  });
  it('drops an unknown build', () => {
    expect(versionLabel('1.12.0', 'unknown')).toBe('Version 1.12.0');
    expect(versionLabel('1.12.0', '')).toBe('Version 1.12.0');
  });
  it('the release is package.json version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(APP_RELEASE).toBe(pkg.version);
    expect(APP_RELEASE).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof APP_BUILD).toBe('string');
  });
  it('credits the author', () => {
    expect(CREDIT).toBe('© 2026 Wongsaton Kampusan');
  });
});
