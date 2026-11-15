/**
 * M7 barcode helpers (pure): GS1 check digits for EAN-13 / EAN-8 / UPC-A, and the mapping of an
 * Open Food Facts product response to a per-100 g My food. The network call itself lives in
 * src/data/nutrition/offClient.ts.
 */
import type { Food } from '../types';

export type BarcodeKind = 'ean13' | 'ean8' | 'upca';

/** Digits only (people type spaces and dashes). */
export function normalizeBarcode(input: string): string {
  return input.replace(/\D+/g, '');
}

/** The code's kind when it is all digits, a supported length and its check digit is right. */
export function barcodeKind(code: string): BarcodeKind | null {
  if (!/^\d+$/.test(code)) return null;
  const kind: BarcodeKind | null =
    code.length === 13 ? 'ean13' : code.length === 8 ? 'ean8' : code.length === 12 ? 'upca' : null;
  if (!kind) return null;
  // GS1 mod 10: from the right, skipping the check digit, weights 3, 1, 3, 1…
  let sum = 0;
  for (let i = code.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(code[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]) ? kind : null;
}

export function isValidBarcode(code: string): boolean {
  return barcodeKind(code) !== null;
}

export type OffParseResult =
  { ok: true; food: Food } | { ok: false; reason: 'notFound' | 'incomplete' };

const KJ_PER_KCAL = 4.184;

function numberOf(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const grams = (n: number): number => Math.round(n * 10) / 10;
/** A per-100 g gram value that can be real (0–100), else unknown. */
const gramsOrUndef = (v: unknown): number | undefined => {
  const n = numberOf(v);
  return n !== undefined && n >= 0 && n <= 100 ? grams(n) : undefined;
};

/**
 * Open Food Facts `/api/v2/product/<code>.json` → a per-100 g food (`source: 'openfoodfacts'`).
 * kcal falls back to kJ (`energy-kj_100g`, then `energy_100g`, which OFF stores in kJ).
 * Missing kcal or protein, or impossible values, → `incomplete`; no product → `notFound`.
 */
export function offProductToFood(json: unknown, code: string): OffParseResult {
  const body = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const p = body.product;
  if (typeof p !== 'object' || p === null || body.status === 0)
    return { ok: false, reason: 'notFound' };
  const product = p as Record<string, unknown>;
  const n = (
    typeof product.nutriments === 'object' && product.nutriments !== null ? product.nutriments : {}
  ) as Record<string, unknown>;

  let kcal = numberOf(n['energy-kcal_100g']);
  if (kcal === undefined) {
    const kj = numberOf(n['energy-kj_100g']) ?? numberOf(n['energy_100g']);
    if (kj !== undefined) kcal = kj / KJ_PER_KCAL;
  }
  const protein = numberOf(n['proteins_100g']);
  // Pure fat is ~900 kcal per 100 g; anything far above is a data error.
  if (
    kcal === undefined ||
    protein === undefined ||
    kcal < 0 ||
    kcal > 950 ||
    protein < 0 ||
    protein > 100
  )
    return { ok: false, reason: 'incomplete' };

  const baseName =
    text(product.product_name) || text(product.product_name_en) || text(product.generic_name);
  const brand = text(product.brands).split(',')[0]?.trim() ?? '';
  const name = baseName ? (brand ? `${baseName} (${brand})` : baseName) : `Product ${code}`;
  const nameTh = text(product.product_name_th);

  const food: Food = {
    id: `off:${code}`,
    name,
    source: 'openfoodfacts',
    basis: { per100g: true },
    kcal: Math.round(kcal),
    proteinG: grams(protein),
    barcode: code,
    note: 'Open Food Facts (ODbL), per 100 g. Check it against the label.',
  };
  if (nameTh) food.nameTh = nameTh;
  const carbs = gramsOrUndef(n['carbohydrates_100g']);
  const fat = gramsOrUndef(n['fat_100g']);
  if (carbs !== undefined) food.carbsG = carbs;
  if (fat !== undefined) food.fatG = fat;
  return { ok: true, food };
}
