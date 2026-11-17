import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// M12 slice 1b task 3: the iOS app version follows package.json. If this fails, run
// `node scripts/sync-ios-version.mjs` (it is part of `npm run ios:sync`).

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const values = (text: string, key: string): string[] =>
  [...text.matchAll(new RegExp(`\\b${key} = ([^;]+);`, 'g'))].map((m) => (m[1] ?? '').trim());

describe('iOS version', () => {
  const pkg = JSON.parse(read('../../package.json')) as { version: string };
  const pbxproj = read('../../ios/App/App.xcodeproj/project.pbxproj');
  const plist = read('../../ios/App/App/Info.plist');

  it('MARKETING_VERSION equals package.json version in every configuration', () => {
    const marketing = values(pbxproj, 'MARKETING_VERSION');
    expect(marketing.length).toBeGreaterThanOrEqual(2); // Debug + Release
    expect(new Set(marketing)).toEqual(new Set([pkg.version]));
  });

  it('the build number is one whole number, the same in every configuration', () => {
    const builds = values(pbxproj, 'CURRENT_PROJECT_VERSION');
    expect(builds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(builds).size).toBe(1);
    expect(builds[0]).toMatch(/^[1-9]\d*$/);
  });

  it('Info.plist takes both from the build settings', () => {
    const after = (key: string): string | undefined =>
      new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
    expect(after('CFBundleShortVersionString')).toBe('$(MARKETING_VERSION)');
    expect(after('CFBundleVersion')).toBe('$(CURRENT_PROJECT_VERSION)');
  });
});
