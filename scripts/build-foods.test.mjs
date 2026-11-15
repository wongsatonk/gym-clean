// node --test scripts/build-foods.test.mjs
// Runs the USDA food-DB builder on scripts/fixtures/usda-mini (made-up rows in the three FDC
// bulk-JSON shapes: Foundation, SR Legacy, FNDDS) — never on the real download.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { crc32, deflateRawSync, gzipSync } from 'node:zlib';
import {
  checkBudget,
  energyKcal,
  householdPortions,
  mapFood,
  readZipEntries,
  selectFoods,
  serialize,
} from './build-foods.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/build-foods.mjs');
const MINI = join(ROOT, 'scripts/fixtures/usda-mini');
const tmp = mkdtempSync(join(tmpdir(), 'build-foods-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const load = (name) => JSON.parse(readFileSync(join(MINI, name), 'utf8'));
const foundation = load('foundation.json').FoundationFoods;
const sr = load('sr_legacy.json').SRLegacyFoods;
const survey = load('survey.json').SurveyFoods;
const nutrient = (id, unitName, amount) => ({ nutrient: { id, unitName }, amount });

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('energyKcal', () => {
  it('prefers Energy (kcal), then Atwater specific, then Atwater general', () => {
    assert.equal(energyKcal([nutrient(2047, 'kcal', 50), nutrient(1008, 'kcal', 48), nutrient(2048, 'kcal', 52)]), 48);
    assert.equal(energyKcal([nutrient(2047, 'kcal', 50), nutrient(2048, 'kcal', 52)]), 52);
    assert.equal(energyKcal([nutrient(2047, 'kcal', 50)]), 50);
  });
  it('converts kJ to kcal when no kcal value exists', () => {
    assert.ok(Math.abs(energyKcal([nutrient(1062, 'kJ', 418.4)]) - 100) < 1e-9);
  });
  it('returns undefined without any energy value (null amounts count as missing)', () => {
    assert.equal(energyKcal([nutrient(1003, 'g', 2)]), undefined);
    assert.equal(energyKcal([nutrient(1008, 'kcal', null)]), undefined);
  });
});

describe('householdPortions', () => {
  it('keeps up to 3 household measures in sequence order, skipping weights, RACC and empty rows', () => {
    assert.deepEqual(householdPortions(sr.find((f) => f.fdcId === 170002)), [
      { label: '1 cup, chopped or diced', g: 140 },
      { label: '0.5 breast, bone removed', g: 172 },
      { label: '1 piece', g: 40 },
    ]);
    assert.deepEqual(householdPortions(foundation[0]), [{ label: '1 cup sliced', g: 125 }]);
    assert.deepEqual(householdPortions(survey[0]), [{ label: '1 cup', g: 245 }]);
    assert.deepEqual(householdPortions({ foodPortions: [] }), []);
  });
});

describe('mapFood', () => {
  it('maps an FDC food to a compact per-100 g row with rounded values', () => {
    assert.deepEqual(mapFood(foundation[1], 'foundation'), {
      id: 'usda:900002',
      name: 'Testgrain, dry',
      ds: 'foundation',
      kcal: 359, // 1500 kJ / 4.184
      proteinG: 12.3,
      carbsG: 70.1, // by summation when "by difference" is missing
      fatG: 2.3, // NLEA total fat when total lipid is missing
    });
  });
  it('leaves unknown carbs/fat out instead of writing 0, and tidies whitespace', () => {
    assert.deepEqual(mapFood(sr.find((f) => f.fdcId === 170006), 'sr'), {
      id: 'usda:170006',
      name: 'apple test, dried',
      ds: 'sr',
      kcal: 243,
      proteinG: 0.9,
    });
  });
  it('keeps a real 0 g', () => {
    assert.equal(mapFood(sr.find((f) => f.fdcId === 170002), 'sr').carbsG, 0);
  });
  it('drops rows without kcal or protein', () => {
    assert.equal(mapFood(foundation[2], 'foundation'), null); // no energy
    assert.equal(mapFood(sr.find((f) => f.fdcId === 170005), 'sr'), null); // no protein
  });
});

const EXPECTED = [
  { id: 'usda:170006', name: 'apple test, dried', ds: 'sr', kcal: 243, proteinG: 0.9 },
  {
    id: 'usda:170002',
    name: 'Testchicken, breast, cooked',
    ds: 'sr',
    kcal: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    portions: [
      { label: '1 cup, chopped or diced', g: 140 },
      { label: '0.5 breast, bone removed', g: 172 },
      { label: '1 piece', g: 40 },
    ],
  },
  {
    id: 'usda:2700001',
    name: 'Testcurry with rice',
    ds: 'fndds',
    kcal: 150,
    proteinG: 7.6,
    carbsG: 19,
    fatG: 5,
    portions: [{ label: '1 cup', g: 245 }],
  },
  {
    id: 'usda:900001',
    name: 'Testfruit, raw',
    ds: 'foundation',
    kcal: 52,
    proteinG: 0.3,
    carbsG: 13.8,
    fatG: 0.2,
    portions: [{ label: '1 cup sliced', g: 125 }],
  },
  { id: 'usda:900002', name: 'Testgrain, dry', ds: 'foundation', kcal: 359, proteinG: 12.3, carbsG: 70.1, fatG: 2.3 },
];

describe('selectFoods', () => {
  const datasets = [
    { ds: 'sr', foods: sr },
    { ds: 'fndds', foods: survey },
    { ds: 'foundation', foods: foundation },
  ];
  it('drops baby food, formula and Alaska Native rows, prefers Foundation over the same SR food, sorts by name', () => {
    assert.deepEqual(selectFoods(datasets), EXPECTED);
  });
  it('is independent of input order', () => {
    const shuffled = [
      { ds: 'foundation', foods: [...foundation].reverse() },
      { ds: 'fndds', foods: [...survey].reverse() },
      { ds: 'sr', foods: [...sr].reverse() },
    ];
    assert.deepEqual(selectFoods(shuffled), EXPECTED);
  });
  it('keeps the SR row when the Foundation twin was dropped', () => {
    const noEnergy = { ...foundation[0], foodNutrients: [nutrient(1003, 'g', 1)] };
    const rows = selectFoods([
      { ds: 'foundation', foods: [noEnergy] },
      { ds: 'sr', foods: sr },
    ]);
    assert.ok(rows.some((r) => r.id === 'usda:170001'));
  });
});

describe('checkBudget', () => {
  it('reports raw and gzip sizes', () => {
    const text = serialize(EXPECTED, []);
    const sizes = checkBudget(text, 2 * 1024 * 1024);
    assert.equal(sizes.raw, Buffer.byteLength(text));
    assert.equal(sizes.gzip, gzipSync(text).length);
  });
  it('throws above the gzip budget', () => {
    assert.throws(() => checkBudget(serialize(EXPECTED, []), 100), /gzip budget/);
  });
});

describe('readZipEntries', () => {
  it('reads stored and deflated entries from a zip archive', () => {
    const zip = makeZip([
      { name: 'a.json', data: Buffer.from('{"a":1}'), deflate: true },
      { name: 'b.txt', data: Buffer.from('plain'), deflate: false },
    ]);
    const entries = readZipEntries(zip);
    assert.deepEqual(
      entries.map((e) => [e.name, e.data.toString()]),
      [
        ['a.json', '{"a":1}'],
        ['b.txt', 'plain'],
      ],
    );
  });
});

describe('CLI', () => {
  it('builds the subset from a source folder, deterministically, with sources listed', () => {
    const out1 = join(tmp, 'one.json');
    const out2 = join(tmp, 'two.json');
    const r1 = run(['--src', MINI, '--out', out1]);
    assert.equal(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /5 foods/);
    assert.match(r1.stdout, /gzip/);
    assert.equal(run(['--src', MINI, '--out', out2]).status, 0);
    const text = readFileSync(out1, 'utf8');
    assert.equal(text, readFileSync(out2, 'utf8'));
    const json = JSON.parse(text);
    assert.equal(json.format, 'gym-clean-usda-foods');
    assert.equal(json.version, 1);
    assert.match(json.license, /CC0/);
    assert.deepEqual(
      json.sources.map((s) => s.file),
      ['foundation.json', 'sr_legacy.json', 'survey.json'],
    );
    assert.equal(json.count, 5);
    assert.deepEqual(json.foods, EXPECTED);
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(text), 'no build timestamp in the output');
  });

  it('reads the zipped bulk downloads too', () => {
    const src = join(tmp, 'zipped');
    rmSync(src, { recursive: true, force: true });
    spawnSync('mkdir', ['-p', src]);
    for (const f of ['foundation.json', 'sr_legacy.json', 'survey.json']) {
      writeFileSync(
        join(src, f.replace('.json', '.zip')),
        makeZip([{ name: f, data: readFileSync(join(MINI, f)), deflate: true }]),
      );
    }
    const out = join(tmp, 'zipped.json');
    const r = run(['--src', src, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).foods, EXPECTED);
  });

  it('fails above the gzip budget and writes nothing', () => {
    const out = join(tmp, 'too-big.json');
    const r = run(['--src', MINI, '--out', out, '--budget-bytes', '200']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /gzip budget/);
    assert.equal(existsSync(out), false);
  });

  it('fails clearly when the source folder has no USDA files', () => {
    const empty = mkdtempSync(join(tmp, 'empty-'));
    const r = run(['--src', empty, '--out', join(tmp, 'none.json')]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--download/);
  });
});

/** Minimal zip writer for the test (local headers + central directory, no zip64). */
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const body = deflate ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
