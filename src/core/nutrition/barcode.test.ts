import { describe, expect, it } from 'vitest';
import { barcodeKind, isValidBarcode, normalizeBarcode, offProductToFood } from './barcode';

describe('normalizeBarcode', () => {
  it('keeps digits only (spaces and dashes from typing are dropped)', () => {
    expect(normalizeBarcode(' 400-6381 333931 ')).toBe('4006381333931');
    expect(normalizeBarcode('abc')).toBe('');
  });
});

describe('barcode checksums', () => {
  it('accepts valid EAN-13, EAN-8 and UPC-A codes', () => {
    expect(barcodeKind('4006381333931')).toBe('ean13');
    expect(barcodeKind('8850999220000')).toBe('ean13'); // made-up Thai-prefix code, valid check digit
    expect(barcodeKind('96385074')).toBe('ean8');
    expect(barcodeKind('036000291452')).toBe('upca');
    expect(isValidBarcode('036000291452')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(barcodeKind('4006381333932')).toBeNull();
    expect(barcodeKind('96385075')).toBeNull();
    expect(barcodeKind('036000291453')).toBeNull();
    expect(isValidBarcode('8850999220001')).toBe(false);
  });

  it('rejects other lengths and non-digits', () => {
    for (const bad of [
      '',
      '1234567',
      '123456789',
      '40063813339310',
      '40063813339a1',
      ' 4006381333931',
    ])
      expect(isValidBarcode(bad), bad).toBe(false);
  });
});

// Made-up Open Food Facts responses (the shape of /api/v2/product/<code>.json).
const product = (nutriments: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  code: '4006381333931',
  status: 1,
  product: { product_name: 'Made-up soy milk', nutriments, ...extra },
});

describe('offProductToFood', () => {
  it('maps per-100 g nutriments to a My food with the barcode and a source note', () => {
    const r = offProductToFood(
      product(
        { 'energy-kcal_100g': 54, proteins_100g: 3.3, carbohydrates_100g: 6.1, fat_100g: 1.8 },
        { brands: 'Made-up Brand', product_name_th: 'นมถั่วเหลือง' },
      ),
      '4006381333931',
    );
    expect(r).toEqual({
      ok: true,
      food: {
        id: 'off:4006381333931',
        name: 'Made-up soy milk (Made-up Brand)',
        nameTh: 'นมถั่วเหลือง',
        source: 'openfoodfacts',
        basis: { per100g: true },
        kcal: 54,
        proteinG: 3.3,
        carbsG: 6.1,
        fatG: 1.8,
        barcode: '4006381333931',
        note: 'Open Food Facts (ODbL), per 100 g. Check it against the label.',
      },
    });
  });

  it('falls back to kJ when kcal is missing (and rounds)', () => {
    const r = offProductToFood(
      product({ 'energy-kj_100g': 1000, proteins_100g: 10 }),
      '4006381333931',
    );
    expect(r).toMatchObject({ ok: true, food: { kcal: 239, proteinG: 10 } });
    // `energy_100g` is kJ in Open Food Facts.
    const r2 = offProductToFood(product({ energy_100g: 418.4, proteins_100g: 1 }), '4006381333931');
    expect(r2).toMatchObject({ ok: true, food: { kcal: 100 } });
  });

  it('reads numeric strings, rounds grams to 1 decimal and leaves unknown macros out', () => {
    const r = offProductToFood(
      product({ 'energy-kcal_100g': '120.4', proteins_100g: '7.25', fat_100g: '' }),
      '4006381333931',
    );
    expect(r.ok && r.food).toMatchObject({ kcal: 120, proteinG: 7.3 });
    expect(r.ok && 'fatG' in r.food).toBe(false);
    expect(r.ok && 'carbsG' in r.food).toBe(false);
  });

  it('rejects a product without kcal or protein as incomplete', () => {
    expect(offProductToFood(product({ proteins_100g: 5 }), '4006381333931')).toEqual({
      ok: false,
      reason: 'incomplete',
    });
    expect(offProductToFood(product({ 'energy-kcal_100g': 50 }), '4006381333931')).toEqual({
      ok: false,
      reason: 'incomplete',
    });
  });

  it('rejects impossible per-100 g values as incomplete', () => {
    for (const n of [
      { 'energy-kcal_100g': 5000, proteins_100g: 5 },
      { 'energy-kcal_100g': -1, proteins_100g: 5 },
      { 'energy-kcal_100g': 100, proteins_100g: 150 },
    ])
      expect(offProductToFood(product(n), '4006381333931')).toMatchObject({ ok: false });
  });

  it('reports a missing product as notFound', () => {
    expect(
      offProductToFood({ status: 0, status_verbose: 'product not found' }, '4006381333931'),
    ).toEqual({
      ok: false,
      reason: 'notFound',
    });
    expect(offProductToFood(null, '4006381333931')).toMatchObject({ reason: 'notFound' });
    expect(offProductToFood('nope', '4006381333931')).toMatchObject({ reason: 'notFound' });
  });

  it('names an unnamed product after its barcode', () => {
    const r = offProductToFood(
      { status: 1, product: { nutriments: { 'energy-kcal_100g': 50, proteins_100g: 1 } } },
      '96385074',
    );
    expect(r.ok && r.food.name).toBe('Product 96385074');
  });
});
