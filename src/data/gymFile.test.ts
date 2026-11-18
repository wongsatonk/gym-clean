import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import type { GymProfile } from '../core/types';
import { defaultGymProfile, equipmentItems } from './catalog';
import {
  exportGymFile,
  GYM_FILE_MAX_CHARS,
  GYM_FILE_NAME,
  GYM_FILE_REASON_TEXT,
  gymFileOf,
  parseGymFile,
  type GymFileReason,
} from './gymFile';

// M12 1b task 14: "Share my gym" is a JSON file with equipment ids only. Profiles are made up.
const PROFILE: GymProfile = {
  equipment: ['smith-machine', 'dumbbells', 'adjustable-bench', 'dumbbells'],
  kept: ['Pushups', 'Barbell_Squat'],
  updatedAt: 1_795_000_000_000,
};

const bad = (text: string): GymFileReason | 'ok' => {
  const r = parseGymFile(text);
  return r.ok ? 'ok' : r.reason;
};

describe('exportGymFile', () => {
  it('writes format, version and the equipment ids, in catalog order, once each', () => {
    expect(gymFileOf(PROFILE)).toEqual({
      format: 'gym-clean-gym',
      version: 1,
      equipment: ['dumbbells', 'adjustable-bench', 'smith-machine'],
    });
    expect(JSON.parse(exportGymFile(PROFILE))).toEqual(gymFileOf(PROFILE));
    expect(GYM_FILE_NAME).toBe('gym-clean-gym.json');
  });

  it('has no personal fields: no kept list, no dates, no name, nothing but the three keys', () => {
    const text = exportGymFile(PROFILE);
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual([
      'equipment',
      'format',
      'version',
    ]);
    expect(text).not.toMatch(/kept|updatedAt|Pushups|Barbell_Squat|1795000000000|name|date/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // Extra fields on the object passed in never leak either.
    const loose = { ...PROFILE, owner: 'Somchai', weightKg: 61 } as GymProfile;
    expect(exportGymFile(loose)).toBe(text);
  });

  it('is the same text for the same gym, whatever order it was ticked in', () => {
    const other = { ...PROFILE, equipment: ['adjustable-bench', 'smith-machine', 'dumbbells'] };
    expect(exportGymFile(other)).toBe(exportGymFile(PROFILE));
  });

  it('drops ids the app does not know', () => {
    expect(gymFileOf({ equipment: ['dumbbells', 'hover-board'] }).equipment).toEqual(['dumbbells']);
  });
});

describe('parseGymFile', () => {
  it('round-trips an exported file', () => {
    expect(parseGymFile(exportGymFile(PROFILE))).toEqual({
      ok: true,
      equipment: ['dumbbells', 'adjustable-bench', 'smith-machine'],
      unknown: [],
    });
    const all = defaultGymProfile();
    const back = parseGymFile(exportGymFile(all));
    expect(back.ok && [...back.equipment].sort()).toEqual([...all.equipment].sort());
  });

  it('reports unknown ids and keeps the known ones (deduped, catalog order)', () => {
    const text = JSON.stringify({
      format: 'gym-clean-gym',
      version: 1,
      equipment: ['hover-board', 'smith-machine', 'dumbbells', 'dumbbells', 'rope', 'hover-board'],
    });
    const known = new Set(equipmentItems().map((i) => i.id));
    expect(known.has('hover-board')).toBe(false);
    const r = parseGymFile(text);
    expect(r.ok && r.equipment).toEqual(['dumbbells', 'smith-machine']);
    expect(r.ok && r.unknown).toEqual(['hover-board', 'rope'].filter((id) => !known.has(id)));
  });

  it('unknown ids are shown as plain short text (they come from a file)', () => {
    const long = 'x'.repeat(200);
    const many = Array.from({ length: 60 }, (_, i) => `thing-${i}`);
    const r = parseGymFile(
      JSON.stringify({
        format: 'gym-clean-gym',
        version: 1,
        equipment: ['dumbbells', long, '<b>bar</b>\n', ...many],
      }),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.unknown.length).toBeLessThanOrEqual(20);
    for (const u of r.unknown) {
      expect(u.length).toBeLessThanOrEqual(40);
      expect(u).not.toMatch(/[<>\n]/);
    }
  });

  it('ignores extra fields: nothing but equipment comes back', () => {
    const r = parseGymFile(
      JSON.stringify({
        format: 'gym-clean-gym',
        version: 1,
        equipment: ['dumbbells'],
        kept: ['Pushups'],
        owner: 'Somchai',
      }),
    );
    expect(r).toEqual({ ok: true, equipment: ['dumbbells'], unknown: [] });
  });

  it('rejects junk with a reason', () => {
    expect(bad('')).toBe('notJson');
    expect(bad('not json at all')).toBe('notJson');
    expect(bad('{"format":')).toBe('notJson');
    expect(bad('null')).toBe('notGymFile');
    expect(bad('[]')).toBe('notGymFile');
    expect(bad('"gym-clean-gym"')).toBe('notGymFile');
    expect(bad(JSON.stringify({ equipment: ['dumbbells'] }))).toBe('notGymFile');
    // A backup or another app's file is not a gym file.
    expect(bad(JSON.stringify({ format: 'gym-clean-backup', version: 1, equipment: [] }))).toBe(
      'notGymFile',
    );
    expect(bad(JSON.stringify({ format: 'gym-clean-gym', version: 1 }))).toBe('notGymFile');
    expect(bad(JSON.stringify({ format: 'gym-clean-gym', version: 1, equipment: 'all' }))).toBe(
      'notGymFile',
    );
    expect(
      bad(JSON.stringify({ format: 'gym-clean-gym', version: 1, equipment: ['dumbbells', 7] })),
    ).toBe('notGymFile');
  });

  it('rejects another version, an empty gym and an oversized file', () => {
    const file = (over: object) =>
      JSON.stringify({ format: 'gym-clean-gym', version: 1, equipment: ['dumbbells'], ...over });
    expect(bad(file({ version: 2 }))).toBe('version');
    expect(bad(file({ version: '1' }))).toBe('version');
    expect(bad(file({ version: undefined }))).toBe('version');
    expect(bad(file({ equipment: [] }))).toBe('empty');
    expect(bad(file({ equipment: ['hover-board'] }))).toBe('empty');
    expect(bad(file({ pad: 'x'.repeat(GYM_FILE_MAX_CHARS) }))).toBe('tooBig');
  });

  it('never throws on odd input', () => {
    for (const t of ['{"__proto__":{"equipment":["dumbbells"]}}', '1e999', 'true', '\u0000']) {
      expect(() => parseGymFile(t)).not.toThrow();
      expect(parseGymFile(t).ok).toBe(false);
    }
  });

  it('every reason has a plain line that passes the copy check', () => {
    const reasons: GymFileReason[] = ['notJson', 'notGymFile', 'version', 'empty', 'tooBig'];
    expect(Object.keys(GYM_FILE_REASON_TEXT).sort()).toEqual([...reasons].sort());
    for (const r of reasons) {
      expect(GYM_FILE_REASON_TEXT[r].length).toBeGreaterThan(10);
      expect(checkCopy(GYM_FILE_REASON_TEXT[r]).hits).toEqual([]);
    }
  });
});
