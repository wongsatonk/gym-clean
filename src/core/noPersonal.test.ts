/**
 * M12 1b task 14, "nothing hard-coded to him" (Decision "Second user"). The app is shared with
 * a second person on her own phone and the repo is public, so data and copy must not carry the
 * author's name (the About credit aside), fixed body numbers or a fixed personal goal, and the
 * defaults must work for anyone: Calm voice, Health / WHOOP off until switched on.
 *
 * The scanners are checked against made-up samples first, so a clean result means something.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COACH_VOICE_DEFAULT } from '../data/db';
import { defaultGymProfile } from '../data/catalog';
import { exportGymFile } from '../data/gymFile';
import { HEALTH_SETTINGS_DEFAULT, parseHealthSettings } from '../data/health/store';
import { readinessCard } from './health/readiness';
import { NUTRITION_DEFAULTS } from './nutrition/targets';
import { CREDIT } from './version';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const posix = (p: string): string => relative(SRC, p).split(sep).join('/');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const ALL = [...walk(join(SRC, 'core')), ...walk(join(SRC, 'data'))];
const isTestOnly = (p: string): boolean =>
  /\.test\.ts$|\/testkit\/|\/fixtures\/|\/evals\//.test(posix(p));
/** App sources (what ships): non-test TypeScript in core and data. */
const SOURCES = ALL.filter((p) => p.endsWith('.ts') && !isTestOnly(p));
/** Every JSON data file that ships (src/data/** and the core phrase lists). */
const DATA_JSON = ALL.filter((p) => p.endsWith('.json') && !isTestOnly(p));

/**
 * Code without comments (a note about who asked for something is not app copy). Strings are
 * kept whole, so a `//` inside a string or a URL is not taken for a comment.
 */
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
      i = end === -1 ? code.length : end + 1;
    } else out += c;
  }
  return out;
}

const NAME = /wongsaton|kampusan/i;

/** The made-up demo profile for the store screenshots (M13 task 34). */
const DEMO_PROFILE = 'data/demo/demoBackup.ts';

/** Literal body stats or a fixed goal text assigned in code. */
const BODY_LITERAL =
  /\b(heightCm|birthYear|bodyFatPct|leanMassKg|bodyWeightKg|bodyKg|weighInKg|goalText|goalWeightKg|targetWeightKg)\s*:\s*['"`\d-]|\bsex\s*:\s*'(male|female)'\s*[,}\n]/;

/** JSON keys that would hold a person's body stats or goal. */
const PERSONAL_KEYS = new Set(
  [
    'heightCm',
    'height',
    'birthYear',
    'birthday',
    'age',
    'sex',
    'gender',
    'weightKg',
    'bodyWeightKg',
    'bodyKg',
    'bodyFatPct',
    'leanMassKg',
    'goal',
    'goalText',
    'goalKind',
    'goalWeightKg',
    'targetWeightKg',
    'owner',
    'user',
    'userName',
    'email',
  ].map((k) => k.toLowerCase()),
);

/** Keys that hold maintainer notes, not copy the app shows or speaks. */
const NOTE_KEYS = new Set(['note', 'notes', 'sourceNote', '_comment']);

type Found = { path: string; value: string };

/** Every key and every shown string in a JSON value. */
function scanJson(v: unknown, path = '$', keys: Found[] = [], strings: Found[] = []) {
  if (typeof v === 'string') strings.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((x, i) => scanJson(x, `${path}[${i}]`, keys, strings));
  else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      keys.push({ path: `${path}.${k}`, value: k });
      if (!NOTE_KEYS.has(k)) scanJson(x, `${path}.${k}`, keys, strings);
    }
  }
  return { keys, strings };
}

const personalKeys = (v: unknown): string[] =>
  scanJson(v)
    .keys.filter((k) => PERSONAL_KEYS.has(k.value.toLowerCase()))
    .map((k) => k.path);

/** Copy written about one person ("his plan", "he lifts") instead of to "you". */
const THIRD_PERSON = /\b(he|him|his|she|her|hers)\b/i;
const thirdPerson = (v: unknown): string[] =>
  scanJson(v)
    .strings.filter((s) => THIRD_PERSON.test(s.value))
    .map((s) => `${s.path}: ${s.value.slice(0, 60)}`);

describe('the scanners catch planted samples (made up)', () => {
  it('name', () => {
    expect(NAME.test('Plan for Wongsaton')).toBe(true);
    expect(NAME.test('© 2026 W. KAMPUSAN')).toBe(true);
    expect(NAME.test('Plan for you')).toBe(false);
  });

  it('comments are stripped, strings and URLs are kept', () => {
    const code = [
      '/** Asked for by Somchai. */',
      "const a = 'kept // not a comment';",
      "const url = 'https://example.com/x'; // Somchai's note",
      'const b = 1; // trailing',
    ].join('\n');
    const out = stripComments(code);
    expect(out).not.toMatch(/Somchai|trailing/);
    expect(out).toContain("'kept // not a comment'");
    expect(out).toContain('https://example.com/x');
  });

  it('literal body stats and goal text in code', () => {
    for (const bad of [
      'const me = { heightCm: 181, birthYear: 1990 };',
      "const s = { sex: 'male', activity: 'moderate' };",
      "const g = { goalText: 'Bigger arms by June' };",
      'const w = { bodyWeightKg: 74.5 };',
      'bodyFatPct: 18,',
    ]) {
      expect(BODY_LITERAL.test(bad), bad).toBe(true);
    }
    for (const fine of [
      'heightCm: number;',
      "sex: 'male' | 'female';",
      'heightCm: settings.heightCm,',
      'startWeightKg: 15,',
      'bmrMifflin({ sex: s.sex, kg: weight.kg, heightCm: s.heightCm })',
    ]) {
      expect(BODY_LITERAL.test(fine), fine).toBe(false);
    }
  });

  it('personal keys and third-person copy in JSON, notes aside', () => {
    const sample = {
      note: 'His gym, read from his photos.',
      days: [{ name: 'Push A', startWeightKg: 15 }],
      profile: { heightCm: 181, Sex: 'male', goal: 'Bigger arms' },
      cue: 'Keep his elbows in.',
    };
    expect(personalKeys(sample)).toEqual(['$.profile.heightCm', '$.profile.Sex', '$.profile.goal']);
    expect(thirdPerson(sample)).toEqual(['$.cue: Keep his elbows in.']);
    expect(personalKeys({ days: [{ startWeightKg: 15 }] })).toEqual([]);
    expect(thirdPerson({ cue: 'Keep your elbows in. This helps.' })).toEqual([]);
  });
});

describe('no personal data in what ships (src/core, src/data)', () => {
  it('finds the files to scan', () => {
    expect(SOURCES.length).toBeGreaterThan(50);
    expect(SOURCES.map(posix)).toContain(DEMO_PROFILE);
    const names = DATA_JSON.map(posix);
    for (const f of [
      'data/program.json',
      'data/exercises.json',
      'data/equipment.json',
      'data/cues.json',
      'data/howto.json',
      'data/nutrition/seedFoods.json',
      'core/trainer/phrases.json',
    ]) {
      expect(names, f).toContain(f);
    }
  });

  it("the author's name is only in the About credit", () => {
    expect(CREDIT).toMatch(NAME);
    const hits: string[] = [];
    for (const p of SOURCES) {
      let code = stripComments(readFileSync(p, 'utf8'));
      if (posix(p) === 'core/version.ts') code = code.replace(`'${CREDIT}'`, "''");
      if (NAME.test(code)) hits.push(posix(p));
    }
    for (const p of DATA_JSON) {
      if (NAME.test(readFileSync(p, 'utf8'))) hits.push(posix(p));
    }
    expect(hits).toEqual([]);
  });

  it('no fixed body numbers or goal text in code', () => {
    // The M13 store-screenshot demo (task 34) is a fictional profile on purpose: its made-up body
    // numbers are the point of the file. It is never imported by the app (its own test checks);
    // the name and gendered-wording scans still cover it.
    const hits = SOURCES.filter(
      (p) => posix(p) !== DEMO_PROFILE && BODY_LITERAL.test(stripComments(readFileSync(p, 'utf8'))),
    );
    expect(hits.map(posix)).toEqual([]);
  });

  it('no body stats, goals or owner fields in the JSON data', () => {
    for (const p of DATA_JSON) {
      const json: unknown = JSON.parse(readFileSync(p, 'utf8'));
      expect(personalKeys(json), posix(p)).toEqual([]);
    }
  });

  it('JSON copy talks to "you", never about one person', () => {
    for (const p of DATA_JSON) {
      // Food names (USDA descriptions, dish lists) are not coaching copy.
      if (posix(p).startsWith('data/nutrition/')) continue;
      const json: unknown = JSON.parse(readFileSync(p, 'utf8'));
      expect(thirdPerson(json), posix(p)).toEqual([]);
    }
  });

  it('nutrition defaults carry no body stats (they come from setup)', () => {
    const keys = Object.keys(NUTRITION_DEFAULTS).map((k) => k.toLowerCase());
    for (const k of ['heightcm', 'birthyear', 'sex', 'activity', 'weightkg', 'goalkind']) {
      expect(keys, k).not.toContain(k);
    }
  });

  it('the shared gym file of the default gym has equipment ids only', () => {
    const file = JSON.parse(exportGymFile(defaultGymProfile())) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['equipment', 'format', 'version']);
    expect(defaultGymProfile().kept).toEqual([]);
    expect(JSON.stringify(file)).not.toMatch(NAME);
  });
});

/*
 * M13 task 8, "works for anyone" (SPEC M13 goal 2): nothing in shown copy or data assumes a man.
 * Every string literal in what ships (comments aside) and every shown JSON string (maintainer
 * notes and food names aside) is checked for gendered wording; each hit is listed as file:line.
 * src/core + src/data must be clean; the src/ui list is printed for main (tasks 13 and 21).
 */

/** Gendered words, plus wording that offers male voices only. Ids like 'male' alone are fine. */
const GENDERED =
  /\b(he|him|his|himself|she|her|hers|herself|man|men|guy|guys|bro|bros|dude|dudes|lads?|boys?|girls?|gentlemen|ladies)\b|\bmale\s+(voices?|coach|names?)\b|\bmen'?s\b/i;

type Literal = { line: number; text: string };

/** String literals in TypeScript with their starting line; comments are skipped. */
function stringLiterals(code: string): Literal[] {
  const out: Literal[] = [];
  let line = 1;
  for (let i = 0; i < code.length; i++) {
    const c = code[i] ?? '';
    const two = code.slice(i, i + 2);
    if (c === '\n') line++;
    else if (two === '//') {
      while (i + 1 < code.length && code[i + 1] !== '\n') i++;
    } else if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      line += code.slice(i, stop).split('\n').length - 1;
      i = stop - 1;
    } else if (c === "'" || c === '"' || c === '`') {
      const start = line;
      let text = '';
      i++;
      while (i < code.length && code[i] !== c) {
        if (code[i] === '\\') {
          text += code.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (code[i] === '\n') line++;
        text += code[i];
        i++;
      }
      out.push({ line: start, text });
    }
  }
  return out;
}

/** `file:line: text` for every gendered string literal in a TypeScript source. */
function genderedInCode(file: string, code: string): string[] {
  return stringLiterals(code)
    .filter((l) => GENDERED.test(l.text))
    .map((l) => `${file}:${l.line}: ${l.text.slice(0, 80)}`);
}

/** `file $.path: text` for every gendered shown string in a JSON value (notes aside). */
function genderedInJson(file: string, v: unknown): string[] {
  return scanJson(v)
    .strings.filter((s) => GENDERED.test(s.value))
    .map((s) => `${file} ${s.path}: ${s.value.slice(0, 80)}`);
}

function genderedHits(files: readonly string[]): string[] {
  const hits: string[] = [];
  for (const p of files) {
    const file = posix(p);
    if (p.endsWith('.ts')) hits.push(...genderedInCode(file, readFileSync(p, 'utf8')));
    // Food names (USDA descriptions such as "HUNGRY MAN", dishes such as "Khao man gai") are
    // names, not copy.
    else if (p.endsWith('.json') && !file.startsWith('data/nutrition/')) {
      hits.push(...genderedInJson(file, JSON.parse(readFileSync(p, 'utf8')) as unknown));
    }
  }
  return hits;
}

describe('the gendered-wording scanner catches planted samples (made up)', () => {
  it('words and male-only voice wording, not ids or look-alike words', () => {
    for (const bad of [
      'Nice work, bro.',
      'Push it, guys!',
      'He lifts on Mondays.',
      'Keep his elbows in.',
      'Be a man about it.',
      'No male voice on this phone.',
      'Pick a male coach.',
      "Men's sizes only.",
      'Ask her about it.',
    ]) {
      expect(GENDERED.test(bad), bad).toBe(true);
    }
    for (const fine of [
      'male',
      'female',
      'Male',
      'Romanian deadlift',
      'Shoulder press: the hero of the day',
      'Then lower the bar',
      'Manage your rest',
      'the theme',
      'Superman hold',
      'Any English voice',
    ]) {
      expect(GENDERED.test(fine), fine).toBe(false);
    }
  });

  it('string literals keep their line; comments are not copy', () => {
    const code = [
      '/** He asked for this. */',
      "const a = 'Keep going';",
      '// his note',
      'const b = `two',
      'lines, bro`;',
      "const c = 'it\\'s his set';",
    ].join('\n');
    expect(genderedInCode('x.ts', code)).toEqual([
      'x.ts:4: two\nlines, bro',
      "x.ts:6: it\\'s his set",
    ]);
  });

  it('JSON: shown strings are checked, notes are not', () => {
    const sample = { note: 'His gym.', cues: [{ text: 'Brace like a man.' }, { text: 'Brace.' }] };
    expect(genderedInJson('s.json', sample)).toEqual(['s.json $.cues[0].text: Brace like a man.']);
  });
});

describe('no gendered wording in shown copy and data', () => {
  it('src/core and src/data are clean (each hit as file:line)', () => {
    expect(genderedHits([...SOURCES, ...DATA_JSON])).toEqual([]);
  });

  it('lists the src/ui hits for main (tasks 13 and 21 empty it)', () => {
    const ui = walk(join(SRC, 'ui')).filter((p) => p.endsWith('.ts') && !isTestOnly(p));
    expect(ui.length).toBeGreaterThan(20);
    const hits = genderedHits(ui);
    // Not a gate yet: printed so main can hand the list on.
    console.info(`M13 task 8, gendered wording in src/ui (${hits.length}):\n${hits.join('\n')}`);
  });
});

describe('defaults work for anyone', () => {
  it('the voice starts as Calm', () => {
    expect(COACH_VOICE_DEFAULT.persona).toBe('calm');
  });

  it('Health is off until switched on, and WHOOP is never the default route', () => {
    expect(Object.values(HEALTH_SETTINGS_DEFAULT.enabled).every((on) => on === false)).toBe(true);
    expect(HEALTH_SETTINGS_DEFAULT.route).toBe('apple');
    const fresh = parseHealthSettings(undefined);
    expect(Object.values(fresh.enabled).some(Boolean)).toBe(false);
    expect(fresh.route).toBe('apple');
  });

  it('with no Health data at all the app still decides: no card, no error', () => {
    const input = { date: '2026-06-30', now: Date.parse('2026-06-30T08:00:00Z'), days: [] };
    expect(readinessCard({ ...input, trainingDay: true })).toBeNull();
    // …and what she says about today is enough on its own (no Health, no WHOOP).
    const card = readinessCard({
      ...input,
      trainingDay: true,
      feels: [{ date: '2026-06-30', energy: 2, sore: ['legs'] }],
    });
    expect(card?.signals).toEqual(['feltLow', 'sore']);
  });
});
