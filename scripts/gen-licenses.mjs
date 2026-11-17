// node scripts/gen-licenses.mjs [--root DIR] [--check]
//
// Builds the open-source credits list for Settings → About → Licenses (M13 task 6) at dev time;
// the app bundles the result and never fetches anything.
//
//   - every runtime dependency in package.json "dependencies" (not devDependencies): name, installed
//     version, licence (package.json "license" / old "licenses"), and the text of its licence file
//     (LICENSE / LICENCE / COPYING, + NOTICE) from node_modules;
//   - then the hand list in src/data/licenses.extra.json (vendored data, the pose model, fonts, and
//     code compiled into an npm dependency, e.g. zxing-cpp inside zxing-wasm, as source 'npm').
//     An extra may give `text`, `textFile` (a path from the repo root) or both (text first).
//   - `npmTexts` in the same file: { "<runtime dep>": { text?, textFile? } } fills the text of a
//     package that ships no licence file (e.g. @mediapipe/tasks-vision, Apache-2.0 without a
//     LICENSE in its npm tarball). A package's own licence file always wins.
//
// Writes src/data/licenses.generated.json (not licenses.json: Vite would resolve './licenses' to
// the JSON before licenses.ts). --check writes nothing and exits 1 when the committed file differs
// from a fresh generation. No network; same node_modules → byte-identical output.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OUT = 'src/data/licenses.generated.json';
export const EXTRA = 'src/data/licenses.extra.json';
const EXTRA_SOURCES = new Set(['npm', 'data', 'model', 'font']);
const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
const NOTICE_FILE = /^notice(\.(md|txt))?$/i;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** Trimmed, LF line endings, no trailing spaces. */
const clean = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .trim();

/** The declared licence as an SPDX-ish string, or undefined when none is usable. */
export function licenseOf(pkg) {
  const one = (l) => (typeof l === 'string' ? l : l && typeof l.type === 'string' ? l.type : '');
  let id = one(pkg.license).trim();
  if (!id && Array.isArray(pkg.licenses)) {
    const ids = pkg.licenses.map(one).filter(Boolean);
    id = ids.length > 1 ? `(${ids.join(' OR ')})` : (ids[0] ?? '');
  }
  if (!id || id === 'UNLICENSED') return undefined;
  return id;
}

/** One runtime dependency, read from node_modules under `root`. */
export function packageEntry(root, name) {
  const dir = join(root, 'node_modules', name);
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) throw new Error(`${name}: not installed (run npm ci first)`);
  const pkg = readJson(pkgPath);
  const license = licenseOf(pkg);
  if (!license) throw new Error(`${name}: no licence in its package.json`);
  const files = readdirSync(dir).sort();
  const licenceFile = files.find((f) => LICENCE_FILE.test(f));
  const noticeFile = files.find((f) => NOTICE_FILE.test(f));
  const parts = [licenceFile, noticeFile]
    .filter(Boolean)
    .map((f) => clean(readFileSync(join(dir, f), 'utf8')))
    .filter(Boolean);
  const entry = { name, version: String(pkg.version), license, source: 'npm' };
  if (parts.length) entry.text = parts.join('\n\n');
  return entry;
}

/** `text` then the `textFile` contents, cleaned; [] when neither is given. Throws via `fail`. */
function textParts(root, raw, fail) {
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  const parts = [];
  if (str(raw.text)) parts.push(clean(raw.text));
  if (raw.textFile !== undefined) {
    const path = join(root, raw.textFile);
    if (!str(raw.textFile) || !existsSync(path)) fail(`textFile not found: ${raw.textFile}`);
    parts.push(clean(readFileSync(path, 'utf8')));
  }
  return parts;
}

function extraEntry(root, raw, i) {
  const where = `${EXTRA} entry ${i + 1}`;
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  if (!raw || typeof raw !== 'object') throw new Error(`${where}: not an object (extra)`);
  if (!str(raw.name)) throw new Error(`${where}: extra needs a name`);
  if (!str(raw.license)) throw new Error(`${where} (${raw.name}): extra needs a licence`);
  if (!EXTRA_SOURCES.has(raw.source))
    throw new Error(`${where} (${raw.name}): extra source must be npm, data, model or font`);
  const parts = textParts(root, raw, (msg) => {
    throw new Error(`${where} (${raw.name}): extra ${msg}`);
  });
  const entry = { name: raw.name.trim() };
  if (str(raw.version)) entry.version = raw.version.trim();
  entry.license = raw.license.trim();
  entry.source = raw.source;
  if (parts.length) entry.text = parts.join('\n\n');
  return entry;
}

/** Runtime dependencies (sorted by name), then the extras in their hand order. */
export function generateLicenses(root) {
  const pkg = readJson(join(root, 'package.json'));
  const deps = Object.keys(pkg.dependencies ?? {}).sort();
  const extraPath = join(root, EXTRA);
  const extraFile = existsSync(extraPath) ? readJson(extraPath) : {};
  const extras = extraFile.entries ?? [];
  if (!Array.isArray(extras)) throw new Error(`${EXTRA}: entries must be a list (extra)`);
  const npmTexts = extraFile.npmTexts ?? {};
  if (!npmTexts || typeof npmTexts !== 'object' || Array.isArray(npmTexts))
    throw new Error(`${EXTRA}: npmTexts must be an object`);
  for (const [name, raw] of Object.entries(npmTexts)) {
    const fail = (msg) => {
      throw new Error(`${EXTRA} npmTexts ${name}: ${msg}`);
    };
    if (!deps.includes(name)) fail('not a runtime dependency');
    if (!raw || typeof raw !== 'object') fail('not an object');
    if (textParts(root, raw, fail).length === 0) fail('needs text or textFile');
  }
  const npm = deps.map((name) => {
    const entry = packageEntry(root, name);
    const fallback = npmTexts[name];
    if (entry.text === undefined && fallback)
      entry.text = textParts(root, fallback, () => {}).join('\n\n');
    return entry;
  });
  return [...npm, ...extras.map((e, i) => extraEntry(root, e, i))];
}

export function formatLicenses(entries) {
  const file = {
    format: 'gym-clean-licenses',
    version: 1,
    note: 'Generated by scripts/gen-licenses.mjs from package.json + node_modules and licenses.extra.json. Do not edit by hand.',
    entries,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function main(argv) {
  let root = fileURLToPath(new URL('..', import.meta.url));
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i] ?? '.');
    else if (argv[i] === '--check') check = true;
    else throw new Error(`unknown option ${argv[i]}`);
  }
  const text = formatLicenses(generateLicenses(root));
  const out = join(root, OUT);
  if (check) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if (current !== text) {
      console.error(`${OUT} is out of date: run node scripts/gen-licenses.mjs`);
      return 1;
    }
    console.log(`${OUT} is up to date`);
    return 0;
  }
  writeFileSync(out, text);
  const entries = JSON.parse(text).entries.length;
  console.log(`wrote ${OUT}: ${entries} entries`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
