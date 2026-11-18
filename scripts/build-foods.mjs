// node scripts/build-foods.mjs [--download] [--src data-src/usda] [--out src/data/nutrition/usda-foods.json]
//                              [--budget-bytes 2000000] [--dishes-src src/data/nutrition/thaiDishes.src.json]
//                              [--dishes-only]
//
// Builds the offline food database for M7 Fuel from the USDA FoodData Central *bulk downloads*
// (public domain / CC0 1.0). No API key, no account, no REST API.
//
//   --download      fetch the pinned bulk files below into --src first (once; checked by sha256)
//   --src DIR       folder with the FDC bulk JSON exports, zipped (*.zip) or unzipped (*.json)
//   --out FILE      output JSON (committed; the app loads it with Vite `?url` on the first search)
//   --budget-bytes  fail (and write nothing) when the gzip size is above this; default 2 MB
//   --dishes-src    Thai dish reference recipes (ingredient grams mapped to USDA ids in the food DB)
//   --dishes-only   skip the USDA downloads: rebuild the Thai dishes from the existing --out food DB
//
// Thai dishes: every recipe in --dishes-src becomes a 'thai-estimate' Food per typical plate, written
// to thaiDishes.json next to --out. Values are computed from the food DB rows (the same numbers the
// app shows), so every dish is traceable to USDA; nothing is copied from apps or third-party tables.
//
// Selection: every Foundation, SR Legacy and FNDDS (survey) food that has kcal and protein,
// minus baby food, infant formula, human milk and the SR "American Indian/Alaska Native" group.
// When a Foundation food and an SR Legacy food share an NDB number, the newer Foundation row wins.
// Rows are per 100 g: kcal (integer), protein/carbs/fat in g (1 decimal; unknown stays absent,
// never 0), and up to 3 household portions in grams. Output is sorted by name, then id, and has
// no timestamps, so the same inputs always give byte-identical output.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, gzipSync, inflateRawSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_SRC = join(ROOT, 'data-src/usda');
export const DEFAULT_OUT = join(ROOT, 'src/data/nutrition/usda-foods.json');
export const DEFAULT_BUDGET_BYTES = 2_000_000;
export const DEFAULT_DISHES_SRC = join(ROOT, 'src/data/nutrition/thaiDishes.src.json');
export const DISHES_FILE = 'thaiDishes.json';

/** Pinned public bulk downloads (https://fdc.nal.usda.gov/download-datasets). */
export const SOURCES = [
  {
    file: 'FoodData_Central_foundation_food_json_2026-10-29.zip',
    sha256: 'dd414cc9f1a132626bad354ef6655972c78b44aff14f16114dc899708663c579',
  },
  {
    file: 'FoodData_Central_sr_legacy_food_json_2018-04.zip',
    sha256: '0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef',
  },
  {
    file: 'FoodData_Central_survey_food_json_2024-10-31.zip',
    sha256: 'dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb',
  },
];
const DOWNLOAD_BASE = 'https://fdc.nal.usda.gov/fdc-datasets/';

/** Top-level key of each FDC bulk JSON export → our dataset tag. */
const DATASET_KEYS = { FoundationFoods: 'foundation', SRLegacyFoods: 'sr', SurveyFoods: 'fndds' };
const DATASET_NAMES = { foundation: 'Foundation', sr: 'SR Legacy', fndds: 'FNDDS (survey)' };
/** Foundation first so it wins NDB-number duplicates with SR Legacy. */
const DATASET_ORDER = ['foundation', 'sr', 'fndds'];

const N = {
  energyKcal: 1008,
  energyKj: 1062,
  atwaterGeneral: 2047,
  atwaterSpecific: 2048,
  protein: 1003,
  fat: 1004,
  fatNlea: 1085,
  carbsDiff: 1005,
  carbsSum: 1050,
};
const KJ_PER_KCAL = 4.184;

/** Categories that aren't useful for an adult's training log. */
const EXCLUDED_CATEGORY = /^(baby|formula|human milk|american indian)/i;
/** Portions that are just a weight (the app already logs grams) or a regulatory reference. */
const WEIGHT_UNIT = /^(oz|ounces?|lbs?|pounds?|g|grams?|kg|racc)$/i;
const MAX_PORTIONS = 3;

const round1 = (x) => Math.round(x * 10) / 10;
const tidy = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function amountOf(nutrients, id) {
  const n = nutrients.find((x) => x.nutrient?.id === id);
  const a = n?.amount;
  return typeof a === 'number' && Number.isFinite(a) && a >= 0 ? a : undefined;
}

/** kcal per 100 g: Energy (kcal), else Atwater specific, else Atwater general, else kJ / 4.184. */
export function energyKcal(nutrients) {
  for (const id of [N.energyKcal, N.atwaterSpecific, N.atwaterGeneral]) {
    const a = amountOf(nutrients, id);
    if (a !== undefined) return a;
  }
  const kj = amountOf(nutrients, N.energyKj);
  return kj === undefined ? undefined : kj / KJ_PER_KCAL;
}

/** Up to 3 household measures ({ label, g }) in the FDC sequence order. */
export function householdPortions(food) {
  const sorted = [...(food.foodPortions ?? [])].sort(
    (a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0) || (a.id ?? 0) - (b.id ?? 0),
  );
  const out = [];
  for (const p of sorted) {
    if (out.length === MAX_PORTIONS) break;
    if (!(typeof p.gramWeight === 'number' && p.gramWeight > 0)) continue;
    let label;
    if (p.portionDescription !== undefined) {
      // FNDDS: "1 cup", "1 slice, any size"; "Quantity not specified" is a default, not a measure.
      label = tidy(p.portionDescription);
      if (/quantity not specified/i.test(label)) continue;
    } else {
      const unit = tidy(p.measureUnit?.name);
      const modifier = tidy(p.modifier);
      const known = unit && unit !== 'undetermined';
      const head = (known ? unit : modifier).split(/[,(]/)[0].trim();
      if (WEIGHT_UNIT.test(head)) continue;
      const amount = p.amount ?? p.value ?? 1;
      label = [String(amount), known ? unit : '', modifier].filter(Boolean).join(' ');
    }
    if (!label || out.some((o) => o.label === label)) continue;
    out.push({ label, g: round1(p.gramWeight) });
  }
  return out;
}

function categoryOf(food) {
  return (
    food.foodCategory?.description ?? food.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? ''
  );
}

/** One FDC food → a compact row, or null when it has no kcal or no protein. */
export function mapFood(food, ds) {
  const nutrients = food.foodNutrients ?? [];
  const kcal = energyKcal(nutrients);
  const protein = amountOf(nutrients, N.protein);
  if (kcal === undefined || protein === undefined) return null;
  const carbs = amountOf(nutrients, N.carbsDiff) ?? amountOf(nutrients, N.carbsSum);
  const fat = amountOf(nutrients, N.fat) ?? amountOf(nutrients, N.fatNlea);
  const row = {
    id: `usda:${food.fdcId}`,
    name: tidy(food.description),
    ds,
    kcal: Math.round(kcal),
    proteinG: round1(protein),
  };
  if (carbs !== undefined) row.carbsG = round1(carbs);
  if (fat !== undefined) row.fatG = round1(fat);
  const portions = householdPortions(food);
  if (portions.length) row.portions = portions;
  return row;
}

/** All datasets ([{ ds, foods }]) → the selected, de-duplicated, sorted rows. */
export function selectFoods(datasets) {
  const ordered = [...datasets].sort(
    (a, b) => DATASET_ORDER.indexOf(a.ds) - DATASET_ORDER.indexOf(b.ds),
  );
  const rows = new Map();
  const foundationNdb = new Set();
  for (const { ds, foods } of ordered) {
    for (const food of foods) {
      if (EXCLUDED_CATEGORY.test(categoryOf(food))) continue;
      if (ds === 'sr' && foundationNdb.has(food.ndbNumber)) continue;
      const row = mapFood(food, ds);
      if (!row || !row.name || rows.has(row.id)) continue;
      rows.set(row.id, row);
      if (ds === 'foundation' && food.ndbNumber != null) foundationNdb.add(food.ndbNumber);
    }
  }
  const key = (r) => r.name.toLowerCase();
  const num = (r) => Number(r.id.slice('usda:'.length));
  return [...rows.values()].sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : num(a) - num(b),
  );
}

/** Output file text: one food per line so git diffs stay readable. */
export function serialize(foods, sources) {
  const head = {
    format: 'gym-clean-usda-foods',
    version: 1,
    license: 'USDA FoodData Central, public domain (CC0 1.0)',
    note: 'Values per 100 g. kcal integer, macros in g (1 decimal); a missing macro is unknown, not 0. Built by scripts/build-foods.mjs.',
    sources,
    count: foods.length,
  };
  const headText = JSON.stringify(head).slice(0, -1);
  return `${headText},"foods":[\n${foods.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}

// ---------- Thai dishes (reference recipes → per-plate estimates) ----------

const DISH_SRC_FORMAT = 'gym-clean-thai-dish-recipes';
/** Small / Regular / Large × a typical plate (PROGRESS M7-q9). */
export const DISH_PORTIONS = [
  { label: 'Small', factor: 0.75 },
  { label: 'Regular', factor: 1 },
  { label: 'Large', factor: 1.4 },
];
const DISH_ID = /^thai:[a-z0-9]+(-[a-z0-9]+)*$/;
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

/** Sum of ingredient grams × per-100 g row values; kcal to an integer, macros to 1 decimal. */
export function dishMacros(ingredients, rowsById) {
  let grams = 0;
  const sum = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const ing of ingredients) {
    const row = rowsById.get(ing.food);
    if (!row) throw new Error(`ingredient ${ing.food} (${ing.as}) is not in the food DB`);
    if (!(typeof ing.g === 'number' && Number.isFinite(ing.g) && ing.g > 0)) {
      throw new Error(`ingredient ${ing.food} (${ing.as}) needs positive grams`);
    }
    for (const k of ['carbsG', 'fatG']) {
      if (row[k] === undefined)
        throw new Error(
          `ingredient ${ing.food} (${row.name}) has no ${k === 'carbsG' ? 'carbs' : 'fat'} value; pick a complete row`,
        );
    }
    grams += ing.g;
    for (const k of Object.keys(sum)) sum[k] += (ing.g * row[k]) / 100;
  }
  return {
    grams: round1(grams),
    kcal: Math.round(sum.kcal),
    proteinG: round1(sum.proteinG),
    carbsG: round1(sum.carbsG),
    fatG: round1(sum.fatG),
  };
}

function dishNote(dish, grams, rowsById) {
  const parts = dish.ingredients.map((ing) => {
    const ds = DATASET_NAMES[rowsById.get(ing.food).ds];
    return `${ing.g} g ${ing.as} [${ing.food}, ${ds}]`;
  });
  const extra = nonEmpty(dish.note) ? ` ${tidy(dish.note)}` : '';
  return (
    `Estimate per ${dish.serving} (about ${grams} g), computed from a reference recipe with USDA FoodData Central values: ` +
    `${parts.join('; ')}.${extra} Real plates vary.`
  );
}

/** Reference-recipe source ({ format, dishes }) + food DB rows by id → Food[] (source order). */
export function buildThaiDishes(src, rowsById) {
  if (src?.format !== DISH_SRC_FORMAT || !Array.isArray(src.dishes)) {
    throw new Error(`Thai dish source must have format "${DISH_SRC_FORMAT}" and a dishes array`);
  }
  const seen = new Set();
  return src.dishes.map((dish, i) => {
    const where = `dish ${i + 1} (${dish.id ?? 'no id'})`;
    if (!DISH_ID.test(dish.id ?? '')) throw new Error(`${where}: id must look like thai:some-name`);
    if (seen.has(dish.id)) throw new Error(`${where}: duplicate id`);
    seen.add(dish.id);
    if (!nonEmpty(dish.name)) throw new Error(`${where}: needs an English name`);
    if (!nonEmpty(dish.nameTh)) throw new Error(`${where}: needs nameTh`);
    if (!nonEmpty(dish.serving)) throw new Error(`${where}: needs a serving label`);
    if (!Array.isArray(dish.ingredients) || dish.ingredients.length === 0) {
      throw new Error(`${where}: needs ingredients`);
    }
    let m;
    try {
      m = dishMacros(dish.ingredients, rowsById);
    } catch (err) {
      throw new Error(`${where}: ${err.message}`, { cause: err });
    }
    return {
      id: dish.id,
      name: tidy(dish.name),
      nameTh: tidy(dish.nameTh),
      source: 'thai-estimate',
      basis: { servingLabel: tidy(dish.serving), servingG: m.grams },
      kcal: m.kcal,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
      portions: DISH_PORTIONS.map((p) => ({ ...p })),
      estimate: true,
      note: dishNote(dish, m.grams, rowsById),
    };
  });
}

/** thaiDishes.json text: a header and one dish per line. */
export function serializeDishes(dishes) {
  const head = {
    format: 'gym-clean-thai-dishes',
    version: 1,
    license:
      'Values computed from USDA FoodData Central (public domain, CC0 1.0); recipes are our own.',
    note: 'Estimates per typical plate, built by scripts/build-foods.mjs from thaiDishes.src.json. kcal integer, macros in g (1 decimal). Portions: Small 0.75, Regular 1, Large 1.4.',
    count: dishes.length,
  };
  const headText = JSON.stringify(head).slice(0, -1);
  return `${headText},"foods":[\n${dishes.map((d) => JSON.stringify(d)).join(',\n')}\n]}\n`;
}

/** Raw and gzip sizes; throws when gzip is above the budget. */
export function checkBudget(text, budgetBytes) {
  const raw = Buffer.byteLength(text);
  const gzip = gzipSync(text).length;
  if (gzip > budgetBytes) {
    throw new Error(`food DB is ${gzip} bytes gzip, over the ${budgetBytes} byte gzip budget`);
  }
  return { raw, gzip };
}

/** Minimal zip reader (stored + deflate, no zip64): [{ name, data }]. */
export function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff || count === 0xffff) throw new Error('zip64 archives are not supported');
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (compSize === 0xffffffff || local === 0xffffffff)
      throw new Error('zip64 archives are not supported');
    if (name.endsWith('/')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) data = inflateRawSync(body);
    else throw new Error(`zip entry ${name}: unsupported compression method ${method}`);
    if (crc32(data) !== crc) throw new Error(`zip entry ${name}: CRC mismatch`);
    entries.push({ name, data });
  }
  return entries;
}

function parseDataset(text, file) {
  const json = JSON.parse(text.replace(/^\uFEFF/, ''));
  for (const [key, ds] of Object.entries(DATASET_KEYS)) {
    if (Array.isArray(json[key])) return { ds, foods: json[key], file };
  }
  return null;
}

/** Every FDC bulk export in a folder (sorted by file name) → [{ ds, foods, file }]. */
export function loadDatasets(srcDir) {
  if (!existsSync(srcDir)) return [];
  const out = [];
  for (const file of readdirSync(srcDir).sort()) {
    const path = join(srcDir, file);
    if (file.endsWith('.json')) {
      const d = parseDataset(readFileSync(path, 'utf8'), file);
      if (d) out.push(d);
    } else if (file.endsWith('.zip')) {
      for (const entry of readZipEntries(readFileSync(path))) {
        if (!entry.name.endsWith('.json')) continue;
        const d = parseDataset(entry.data.toString('utf8'), file);
        if (d) out.push(d);
      }
    }
  }
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Fetch the pinned bulk files that are missing or don't match their checksum. */
export async function download(srcDir) {
  mkdirSync(srcDir, { recursive: true });
  for (const { file, sha256: want } of SOURCES) {
    const path = join(srcDir, file);
    if (existsSync(path) && sha256(readFileSync(path)) === want) {
      console.log(`have ${file}`);
      continue;
    }
    console.log(`downloading ${file}...`);
    const res = await fetch(DOWNLOAD_BASE + file);
    if (!res.ok) throw new Error(`download ${file}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== want) throw new Error(`download ${file}: sha256 ${got}, expected ${want}`);
    writeFileSync(`${path}.part`, buf);
    renameSync(`${path}.part`, path);
  }
}

function parseArgs(argv) {
  const opts = {
    download: false,
    src: DEFAULT_SRC,
    out: DEFAULT_OUT,
    budget: DEFAULT_BUDGET_BYTES,
    dishesSrc: DEFAULT_DISHES_SRC,
    dishesOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--download') opts.download = true;
    else if (a === '--src') opts.src = resolve(argv[++i]);
    else if (a === '--out') opts.out = resolve(argv[++i]);
    else if (a === '--budget-bytes') opts.budget = Number(argv[++i]);
    else if (a === '--dishes-src') opts.dishesSrc = resolve(argv[++i]);
    else if (a === '--dishes-only') opts.dishesOnly = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!(opts.budget > 0)) throw new Error('--budget-bytes must be a positive number');
  return opts;
}

function buildDishesText(opts, foods) {
  const src = JSON.parse(readFileSync(opts.dishesSrc, 'utf8'));
  const dishes = buildThaiDishes(src, new Map(foods.map((f) => [f.id, f])));
  return { dishes, text: serializeDishes(dishes) };
}

function writeDishes(opts, { dishes, text }) {
  const path = join(dirname(opts.out), DISHES_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(
    `${dishes.length} Thai dishes, ${Buffer.byteLength(text)} bytes raw, ${gzipSync(text).length} bytes gzip → ${path}`,
  );
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.dishesOnly) {
    const foods = JSON.parse(readFileSync(opts.out, 'utf8')).foods;
    writeDishes(opts, buildDishesText(opts, foods));
    return;
  }
  if (opts.download) await download(opts.src);
  const datasets = loadDatasets(opts.src);
  if (datasets.length === 0) {
    throw new Error(`no USDA FoodData Central exports in ${opts.src}; run with --download first`);
  }
  const foods = selectFoods(datasets);
  const sources = datasets.map((d) => ({ dataset: DATASET_NAMES[d.ds], file: d.file }));
  const text = serialize(foods, sources);
  const { raw, gzip } = checkBudget(text, opts.budget);
  const dishes = buildDishesText(opts, foods); // validate before writing anything
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, text);
  const counts = DATASET_ORDER.map(
    (ds) => `${DATASET_NAMES[ds]} ${foods.filter((f) => f.ds === ds).length}`,
  );
  console.log(`${foods.length} foods (${counts.join(', ')})`);
  console.log(`${raw} bytes raw, ${gzip} bytes gzip (budget ${opts.budget}) → ${opts.out}`);
  writeDishes(opts, dishes);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`build-foods: ${err.message}`);
    process.exit(1);
  });
}
