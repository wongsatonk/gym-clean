import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LicenseEntry } from '../core/types';
import { loadLicenses, orderLicenses, parseLicenseFile } from './licenses';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
};

const e = (name: string, source: LicenseEntry['source'], license = 'MIT'): LicenseEntry => ({
  name,
  license,
  source,
});

describe('parseLicenseFile', () => {
  it('keeps well-formed entries with their optional version and text', () => {
    const raw = {
      format: 'gym-clean-licenses',
      version: 1,
      entries: [
        { name: 'demo-lib', version: '1.0.0', license: 'MIT', source: 'npm', text: 'MIT License' },
        { name: 'Demo data', license: 'Unlicense', source: 'data' },
      ],
    };
    expect(parseLicenseFile(raw)).toEqual(raw.entries);
  });

  it('rejects another format and broken entries', () => {
    expect(() => parseLicenseFile({ format: 'other', version: 1, entries: [] })).toThrow();
    expect(() => parseLicenseFile(null)).toThrow();
    const bad = (entry: unknown) =>
      expect(() =>
        parseLicenseFile({ format: 'gym-clean-licenses', version: 1, entries: [entry] }),
      ).toThrow();
    bad({ name: '', license: 'MIT', source: 'npm' });
    bad({ name: 'x', license: '', source: 'npm' });
    bad({ name: 'x', license: 'MIT', source: 'web' });
    bad({ name: 'x', license: 'MIT', source: 'npm', text: 3 });
  });
});

describe('orderLicenses', () => {
  it('puts data first, then the model, fonts and libraries, each by name', () => {
    const out = orderLicenses([
      e('zeta', 'npm'),
      e('Alpha', 'npm'),
      e('Font B', 'font'),
      e('Pose model', 'model'),
      e('beta data', 'data'),
      e('Alpha data', 'data'),
    ]);
    expect(out.map((x) => x.name)).toEqual([
      'Alpha data',
      'beta data',
      'Pose model',
      'Font B',
      'Alpha',
      'zeta',
    ]);
  });
});

describe('the bundled list (src/data/licenses.generated.json)', () => {
  it('has every runtime dependency with its licence', async () => {
    const list = await loadLicenses();
    for (const dep of Object.keys(pkg.dependencies)) {
      const entry = list.find((x) => x.source === 'npm' && x.name === dep);
      expect(entry, dep).toBeDefined();
      expect(entry?.license, dep).toMatch(/\S/);
      expect(entry?.version, dep).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('lists the vendored data, the pose model and the fonts', async () => {
    const list = await loadLicenses();
    const find = (re: RegExp) => list.find((x) => re.test(x.name));
    expect(find(/free-exercise-db/)).toMatchObject({ license: 'Unlicense', source: 'data' });
    expect(find(/USDA FoodData Central/)).toMatchObject({ license: 'CC0-1.0', source: 'data' });
    expect(find(/MediaPipe Pose Landmarker/)).toMatchObject({
      license: 'Apache-2.0',
      source: 'model',
    });
    expect(find(/^Barlow typeface/)).toMatchObject({ license: 'OFL-1.1', source: 'font' });
    expect(find(/^Barlow Condensed typeface/)).toMatchObject({
      license: 'OFL-1.1',
      source: 'font',
    });
    expect(list[0]?.source).toBe('data');
  });

  it('carries the full text for every Apache-2.0, MIT and Unlicense entry', async () => {
    const list = await loadLicenses();
    const needsText = list.filter((x) => /\b(Apache-2\.0|MIT|Unlicense)\b/.test(x.license));
    expect(needsText.length).toBeGreaterThan(5);
    const missing = needsText.filter((x) => !x.text?.trim()).map((x) => x.name);
    expect(missing).toEqual([]);
    for (const x of needsText.filter((y) => /Apache-2\.0/.test(y.license))) {
      expect(x.text, x.name).toMatch(/Apache License[\s\S]*Version 2\.0/);
      expect(x.text, x.name).toMatch(
        /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/,
      );
    }
  });

  it('has no personal data and no duplicate names', async () => {
    const list = await loadLicenses();
    expect(new Set(list.map((x) => x.name)).size).toBe(list.length);
    expect(JSON.stringify(list)).not.toMatch(/wongsaton|kampusan/i);
  });
});
