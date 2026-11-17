/**
 * M12 1b "Share my gym" (Decision "Second user"): a small JSON file with the gym's equipment
 * ids and nothing else, so someone training in the same gym can import it instead of ticking
 * the kit. No `kept` list, no name, no dates, no plan, no body or Health values: the file is
 * built from the known equipment ids only, so nothing else on the profile can leak into it.
 *
 * Reading is strict about the shape and lenient about ids: ids this app version doesn't know
 * are reported (`unknown`) and left out. A parsed file is only a preview; nothing is saved
 * until the screen calls `saveGymProfile` with `equipment`.
 */
import { APP_NAME } from '../core/brand';
import type { GymFile, GymProfile } from '../core/types';
import { equipmentItems } from './catalog';

export const GYM_FILE_FORMAT = 'gym-clean-gym';
export const GYM_FILE_VERSION = 1;
/** Suggested name for the share sheet / download. */
export const GYM_FILE_NAME = 'gym-clean-gym.json';
export const GYM_FILE_MIME = 'application/json';
/** A real file is well under 2 kB; anything this long isn't one. */
export const GYM_FILE_MAX_CHARS = 20_000;

/** Unknown ids come from a file: shown as short plain text, and only the first few. */
const UNKNOWN_MAX = 20;
const UNKNOWN_MAX_CHARS = 40;

/** Known ids of `ids`, once each, in equipment.json order (not the order they were ticked in). */
function knownInOrder(ids: readonly string[]): string[] {
  const have = new Set(ids);
  return equipmentItems()
    .map((i) => i.id)
    .filter((id) => have.has(id));
}

/** The file content for a gym: equipment ids only. */
export function gymFileOf(profile: Pick<GymProfile, 'equipment'>): GymFile {
  return {
    format: GYM_FILE_FORMAT,
    version: GYM_FILE_VERSION,
    equipment: knownInOrder(profile.equipment),
  };
}

/** The file text to share or download (`GYM_FILE_NAME`, `GYM_FILE_MIME`). */
export function exportGymFile(profile: Pick<GymProfile, 'equipment'>): string {
  return `${JSON.stringify(gymFileOf(profile), null, 2)}\n`;
}

export type GymFileReason = 'notJson' | 'notGymFile' | 'version' | 'empty' | 'tooBig';

/** One plain line per reason, for the import screen. */
export const GYM_FILE_REASON_TEXT: Readonly<Record<GymFileReason, string>> = {
  notJson: `This file can't be read. Pick a gym file shared from ${APP_NAME}.`,
  notGymFile: `This isn't a gym file. Pick a gym file shared from ${APP_NAME}.`,
  version: 'This gym file is from a newer app version. Update the app, then try again.',
  empty: 'This gym file has no equipment this app knows.',
  tooBig: `This file is too big to be a gym file. Pick a gym file shared from ${APP_NAME}.`,
};

export type GymFileResult =
  | {
      ok: true;
      /** Known equipment ids, once each, in equipment.json order: pass to `saveGymProfile`. */
      equipment: string[];
      /** Ids in the file this app doesn't know (left out), cleaned for display. */
      unknown: string[];
    }
  | { ok: false; reason: GymFileReason };

const fail = (reason: GymFileReason): GymFileResult => ({ ok: false, reason });

/** Letters, digits, space, dash, underscore and dot only; cut to a short label. */
const displayId = (id: string): string =>
  id
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, UNKNOWN_MAX_CHARS);

/** Validates a shared gym file. Never throws; every other field in the file is ignored. */
export function parseGymFile(text: string): GymFileResult {
  if (typeof text !== 'string') return fail('notJson');
  if (text.length > GYM_FILE_MAX_CHARS) return fail('tooBig');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('notJson');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('notGymFile');
  const file = raw as Record<string, unknown>;
  if (!Object.hasOwn(file, 'format') || file.format !== GYM_FILE_FORMAT) return fail('notGymFile');
  if (file.version !== GYM_FILE_VERSION) return fail('version');
  const list = Object.hasOwn(file, 'equipment') ? file.equipment : undefined;
  if (!Array.isArray(list) || !list.every((x): x is string => typeof x === 'string')) {
    return fail('notGymFile');
  }
  const equipment = knownInOrder(list);
  if (equipment.length === 0) return fail('empty');
  const known = new Set(equipment);
  const unknown = [...new Set(list.filter((id) => !known.has(id)).map(displayId))]
    .filter((id) => id !== '')
    .slice(0, UNKNOWN_MAX);
  return { ok: true, equipment, unknown };
}
