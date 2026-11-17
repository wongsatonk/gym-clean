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
    const hits = SOURCES.filter((p) => BODY_LITERAL.test(stripComments(readFileSync(p, 'utf8'))));
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
