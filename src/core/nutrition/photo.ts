/**
 * M7b photo entry builder (plan task 8). Pure.
 *
 * Wraps `entryFromFood` so a photo-logged dish matches a hand-logged one exactly, then adds
 * `source: 'photo-local'`, `estimate: true` and the accepted guess's confidence (2 dp).
 * Confidence is passed only when the logged dish was one of the offered options; a dish found
 * through search after a photo keeps the source but has no confidence.
 */
import type { Food, FoodEntry } from '../types';
import { THAI_PORTIONS, entryFromFood, type EntryOpts } from './portions';

/**
 * One plate of a Thai dish at a portion ('Small' | 'Regular' | 'Large', or the dish's own list).
 * Null = not a Thai dish (`thai:*`, thai-estimate), unknown portion, or confidence outside 0–1.
 */
export function entryFromPhoto(
  dish: Food,
  portion: string,
  confidence: number | undefined,
  opts: EntryOpts,
): FoodEntry | null {
  if (dish.source !== 'thai-estimate' || !dish.id.startsWith('thai:')) return null;
  if (!(dish.portions ?? THAI_PORTIONS).some((p) => p.label === portion)) return null;
  if (
    confidence !== undefined &&
    !(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1)
  )
    return null;
  const base = entryFromFood(dish, { servings: 1 }, { ...opts, portion });
  if (!base) return null;
  return {
    ...base,
    source: 'photo-local',
    estimate: true,
    ...(confidence !== undefined ? { photoConfidence: Math.round(confidence * 100) / 100 } : {}),
  };
}
