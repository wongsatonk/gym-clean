/**
 * M13 owner mode (SPEC M13 goal 3, Decision "M13 Published look", option A). Pure.
 *
 * - The state is the settings row 'ownerMode' (`OwnerMode`), decided once on the first launch
 *   that has no row: an install that already has sessions or to-do answers (from before 1.15.0)
 *   starts on (`by: 'existing'`), anything else off (`by: 'fresh'`). A stored row is never
 *   re-decided; a restored backup's row simply is the stored row. The 7-tap switch writes
 *   `by: 'user'` (src/data/ownerMode.ts `setOwnerMode`).
 * - Off hides every `OwnerSurface`; on shows everything exactly as before M13.
 * - Off: the developer log records nothing; the saved switch is kept and applies again when on.
 */
import type { OwnerMode, OwnerSurface } from './types';
import { APP_BUILD, APP_RELEASE, userVersionLabel, versionLabel } from './version';

// Keyed by the union so a new surface fails the typecheck here until it is listed.
const SURFACES: Record<OwnerSurface, true> = {
  todos: true,
  resign: true,
  devlog: true,
  buildHash: true,
  tourTodos: true,
  evalScreen: true,
  copyReport: true,
};

/** Every owner-only surface. */
export const OWNER_SURFACES: readonly OwnerSurface[] = Object.keys(SURFACES) as OwnerSurface[];

const BY: readonly OwnerMode['by'][] = ['fresh', 'existing', 'user'];

/** A stored 'ownerMode' value, or undefined when it isn't a well-formed row. */
export function parseOwnerMode(v: unknown): OwnerMode | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.on !== 'boolean') return undefined;
  if (typeof r.setAt !== 'number' || !Number.isFinite(r.setAt)) return undefined;
  if (!BY.includes(r.by as OwnerMode['by'])) return undefined;
  return { on: r.on, setAt: r.setAt, by: r.by as OwnerMode['by'] };
}

export type OwnerModeInput = {
  /** The stored settings value (anything; a malformed one reads as no row). */
  row: unknown;
  /** Sessions on this phone. */
  sessions: number;
  /** Stored to-do answers on this phone. */
  todoAnswers: number;
  now: number;
};

/**
 * The owner mode to use. `decided: true` = there was no (valid) row and the caller stores `mode`
 * once; `decided: false` = the stored row, returned untouched.
 */
export function decideOwnerMode(input: OwnerModeInput): { mode: OwnerMode; decided: boolean } {
  const stored = parseOwnerMode(input.row);
  if (stored) return { mode: input.row as OwnerMode, decided: false };
  const existing = input.sessions > 0 || input.todoAnswers > 0;
  return {
    mode: { on: existing, setAt: input.now, by: existing ? 'existing' : 'fresh' },
    decided: true,
  };
}

const isOn = (owner: boolean | OwnerMode | undefined): boolean =>
  typeof owner === 'boolean' ? owner : owner?.on === true;

/** Whether an owner-only surface shows. Off (or no row yet) hides all of them. */
export function isVisible(surface: OwnerSurface, owner: boolean | OwnerMode | undefined): boolean {
  return Object.hasOwn(SURFACES, surface) && isOn(owner);
}

/**
 * The version line in About and on the tour's first page: owner on → the unchanged
 * `versionLabel()` ("Version 1.15.0 (build abc1234)"); off → "Version 1.15" (no build hash).
 */
export function versionLine(
  owner: boolean | OwnerMode | undefined,
  release: string = APP_RELEASE,
  build: string = APP_BUILD,
): string {
  return isVisible('buildHash', owner) ? versionLabel(release, build) : userVersionLabel(release);
}

/** Whether the developer log records: never while owner mode is off; else the saved switch. */
export function devLogRecording(
  owner: boolean | OwnerMode | undefined,
  savedSwitch: boolean,
): boolean {
  return isVisible('devlog', owner) && savedSwitch;
}
