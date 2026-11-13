export const APP_NAME = 'Gym Clean';

/** Pure helper used by the M0 smoke test; replaced by real core logic from M1 on. */
export function appTitle(version?: string): string {
  return version ? `${APP_NAME} v${version}` : APP_NAME;
}
