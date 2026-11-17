import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_BUILD,
  APP_RELEASE,
  CREDIT,
  shortRelease,
  userVersionLabel,
  versionLabel,
} from './version';

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
  it('shortRelease: MAJOR.MINOR, plus .PATCH when it is not 0 (M13)', () => {
    expect(shortRelease('1.15.0')).toBe('1.15');
    expect(shortRelease('1.15.3')).toBe('1.15.3');
    expect(shortRelease('2.0.0')).toBe('2.0');
    expect(shortRelease(' 1.15.0 ')).toBe('1.15');
    expect(shortRelease('1.15')).toBe('1.15');
  });
  it('userVersionLabel: "Version 1.15", never a build (M13)', () => {
    expect(userVersionLabel('1.15.0')).toBe('Version 1.15');
    expect(userVersionLabel('1.15.1')).toBe('Version 1.15.1');
  });
  it('credits the author', () => {
    expect(CREDIT).toBe('© 2026 Wongsaton Kampusan');
  });
});
