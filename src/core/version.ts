// M12 slice 1c: the app's version (= the What's New tour key) and the author credit.
// The release is package.json "version" and the build is the short git sha, both injected
// at build time by vite.config.ts (also for Vitest).

export const APP_RELEASE: string = __APP_RELEASE__;
export const APP_BUILD: string = __APP_BUILD__;

export const CREDIT = '© 2026 Wongsaton Kampusan';

/** "Version 1.12.0 (build abc1234)"; the build part is left out when unknown. */
export function versionLabel(release: string = APP_RELEASE, build: string = APP_BUILD): string {
  const b = build.trim();
  return b === '' || b === 'unknown' ? `Version ${release}` : `Version ${release} (build ${b})`;
}
