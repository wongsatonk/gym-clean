import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE } from './brand';
import { checkCopy } from './trainer/replies';

describe('brand constants (M13)', () => {
  it('keeps the name "Gym Clean" (his answer to M13-q1)', () => {
    expect(APP_NAME).toBe('Gym Clean');
  });

  it('has a one-line tagline that passes the copy rules and assumes no one', () => {
    expect(APP_TAGLINE).toBe('Your pocket strength coach.');
    expect(APP_TAGLINE).not.toMatch(/\n/);
    expect(checkCopy(APP_TAGLINE).ok).toBe(true);
    expect(APP_TAGLINE).not.toMatch(/\b(he|his|him|man|men|guys?|bro)\b/i);
  });
});

/*
 * M13 task 7: the shown name comes from `APP_NAME`, never a literal. Comments may mention the app;
 * ids that contain the name ('gym-clean-gym', 'gym-clean-<month>.png') have a hyphen and don't
 * match. Non-TS files that must hold the literal (index.html, ios/App/App/Info.plist) aren't
 * scanned; `capacitor.config.ts` is a config Capacitor reads before the app exists.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const posix = (p: string): string => relative(ROOT, p).split(sep).join('/');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Code without comments (line breaks kept); strings stay whole, so `//` in a string stays. */
function stripComments(code: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i] ?? '';
    const two = code.slice(i, i + 2);
    if (quote !== '') {
      out += c;
      if (c === '\\') out += code[++i] ?? '';
      else if (c === quote) quote = '';
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
    } else if (two === '//') {
      while (i + 1 < code.length && code[i + 1] !== '\n') i++;
    } else if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, ''); // keep line numbers
      i = stop - 1;
    } else out += c;
  }
  return out;
}

const NAME_LITERAL = /gym clean/i;

/** Lines (1-based) of `code` that hold the name outside comments. */
function nameHits(code: string): number[] {
  return stripComments(code)
    .split('\n')
    .flatMap((line, i) => (NAME_LITERAL.test(line) ? [i + 1] : []));
}

/** Files that hold the name for good. */
const ALLOWED = new Set(['src/core/brand.ts', 'capacitor.config.ts']);

/**
 * Still to switch to `APP_NAME` (M13 task 10: ui; task 27: native; task 29: vite.config.ts).
 * Each owner removes its files from here; the list ends empty.
 */
const PENDING_LITERALS: readonly string[] = [
  'src/ui/coach/micButton.ts',
  'src/ui/screens/backupPanel.ts',
  'src/ui/screens/healthSettings.ts',
  'src/ui/screens/reminders.ts',
  'src/ui/screens/settings.ts',
  'src/ui/screens/today.ts',
  'src/ui/shareMonth.ts',
  'src/ui/todo/todoFixture.ts',
  'vite.config.ts',
];

const isShipped = (p: string): boolean =>
  /\.ts$/.test(p) && !/\.test\.ts$|\.d\.ts$|\/testkit\//.test(posix(p));
const SCANNED = [
  ...walk(join(ROOT, 'src')).filter(isShipped),
  join(ROOT, 'vite.config.ts'),
  join(ROOT, 'capacitor.config.ts'),
];

describe('no shown "Gym Clean" literal outside brand.ts (M13 task 7)', () => {
  it('the scanner skips comments and ids, and finds string literals', () => {
    const sample = [
      '// Gym Clean sessions',
      '/** Gym Clean wrote it,',
      ' *  Gym Clean again. */',
      "const id = 'gym-clean-gym';",
      'const url = "https://x.test/a//b";',
      "const shown = 'Pick a file from Gym Clean.';",
      'const t = `${n} in Gym Clean`;',
    ].join('\n');
    expect(nameHits(sample)).toEqual([6, 7]);
  });

  it('src/core and src/data use APP_NAME', () => {
    const hits = SCANNED.map(posix)
      .filter((p) => /^src\/(core|data)\//.test(p) && !ALLOWED.has(p))
      .flatMap((p) => nameHits(readFileSync(join(ROOT, p), 'utf8')).map((l) => `${p}:${l}`));
    expect(hits).toEqual([]);
  });

  it('every other file uses APP_NAME unless allowed or still pending', () => {
    const hits = SCANNED.map(posix)
      .filter((p) => !ALLOWED.has(p) && !PENDING_LITERALS.includes(p))
      .flatMap((p) => nameHits(readFileSync(join(ROOT, p), 'utf8')).map((l) => `${p}:${l}`));
    expect(hits).toEqual([]);
  });

  it('the pending list names only ui, native and config files that exist', () => {
    const scanned = new Set(SCANNED.map(posix));
    for (const p of PENDING_LITERALS) {
      expect(p).toMatch(/^(src\/(ui|native)\/|vite\.config\.ts$)/);
      expect(scanned.has(p)).toBe(true);
    }
  });
});
