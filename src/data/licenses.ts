/**
 * M13 task 6: open-source credits for Settings → About → Licenses. The list is generated at dev
 * time by `scripts/gen-licenses.mjs` (npm runtime dependencies + the hand list in
 * licenses.extra.json) into licenses.generated.json and bundled; nothing is fetched. The JSON (~60 kB, full
 * licence texts) is loaded on demand, so it stays out of the main bundle.
 */
import type { LicenseEntry } from '../core/types';

export const LICENSE_FORMAT = 'gym-clean-licenses';

/** Display order: vendored data first, then the model, fonts, then libraries. */
const SOURCE_ORDER: readonly LicenseEntry['source'][] = ['data', 'model', 'font', 'npm'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Checks the generated file's shape; throws on anything unexpected. */
export function parseLicenseFile(raw: unknown): LicenseEntry[] {
  if (!isObj(raw) || raw.format !== LICENSE_FORMAT || !Array.isArray(raw.entries)) {
    throw new Error('Not a licenses file.');
  }
  return raw.entries.map((e: unknown, i): LicenseEntry => {
    const bad = (why: string): never => {
      throw new Error(`Licenses entry ${i + 1}: ${why}.`);
    };
    if (!isObj(e)) return bad('not an object');
    if (!nonEmpty(e.name)) return bad('no name');
    if (!nonEmpty(e.license)) return bad('no licence');
    const source = e.source as LicenseEntry['source'];
    if (!SOURCE_ORDER.includes(source)) return bad('unknown source');
    if (e.version !== undefined && !nonEmpty(e.version)) return bad('bad version');
    if (e.text !== undefined && typeof e.text !== 'string') return bad('bad text');
    const out: LicenseEntry = { name: e.name, license: e.license, source };
    if (e.version !== undefined) out.version = e.version;
    if (e.text !== undefined) out.text = e.text;
    return out;
  });
}

/** Data, model, fonts, libraries; by name (case-insensitive) inside each group. */
export function orderLicenses(entries: readonly LicenseEntry[]): LicenseEntry[] {
  return [...entries].sort(
    (a, b) =>
      SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  );
}

/** The bundled list, ordered for the Licenses screen. */
export async function loadLicenses(): Promise<LicenseEntry[]> {
  const mod = await import('./licenses.generated.json');
  return orderLicenses(parseLicenseFile(mod.default));
}
