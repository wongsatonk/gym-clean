// M7b task 7: classifier scores → what the photo sheet shows. Pure: no DOM, no MediaPipe import.
// Rules (PROGRESS M7b task 7, M7b-q3):
// - unknown labels and NaN / out-of-range scores are ignored;
// - sorted by score, ties keep the input order; a repeated label keeps its best score;
// - a dish already offered by a higher option is not offered again;
// - at most 3 options; top-1 ≥ threshold (0.6) → confident, its default dish preselected;
//   below → unsure, nothing preselected; no known label → noMatch (search);
// - offerClaude only when claudeAvailable and not confident. Always false in the local part.
import { dishesForLabel, type ClassMap } from './classMap';

/** The fields we read from a MediaPipe `Category` (it has more; they're ignored). */
export interface ScoredLabel {
  categoryName: string;
  score: number;
}

export interface DecideOption {
  label: string;
  /** Dish ids for this class, default first, minus dishes a higher option already offers. */
  dishIds: readonly string[];
  score: number;
}

export interface Decision {
  kind: 'confident' | 'unsure' | 'noMatch';
  options: readonly DecideOption[];
  /** The top option's default dish id; only when confident. */
  preselect?: string;
  offerClaude: boolean;
}

export interface DecideOptions {
  /** Top-1 score at or above this is confident. Default 0.6. */
  threshold?: number;
  /** The Claude backup is set up and opted into (step 4; false in the local part). */
  claudeAvailable: boolean;
}

export const DEFAULT_THRESHOLD = 0.6;
const MAX_OPTIONS = 3;

const validScore = (s: unknown): s is number =>
  typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1;

export function decide(
  categories: readonly ScoredLabel[],
  map: ClassMap,
  opts: DecideOptions,
): Decision {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  // Best score per known label, remembering first-seen order for stable ties.
  const best = new Map<string, { score: number; order: number }>();
  categories.forEach((c, order) => {
    if (!validScore(c.score) || dishesForLabel(c.categoryName, map).length === 0) return;
    const prev = best.get(c.categoryName);
    if (prev === undefined) best.set(c.categoryName, { score: c.score, order });
    else if (c.score > prev.score) prev.score = c.score;
  });

  const ranked = [...best.entries()].sort(
    ([, a], [, b]) => b.score - a.score || a.order - b.order,
  );

  const offered = new Set<string>();
  const options: DecideOption[] = [];
  for (const [label, { score }] of ranked) {
    if (options.length >= MAX_OPTIONS) break;
    const dishIds = dishesForLabel(label, map).filter((id) => !offered.has(id));
    if (dishIds.length === 0) continue;
    for (const id of dishIds) offered.add(id);
    options.push({ label, dishIds, score });
  }

  const top = options[0];
  if (top === undefined) return { kind: 'noMatch', options, offerClaude: opts.claudeAvailable };
  if (top.score >= threshold) {
    const preselect = top.dishIds[0];
    return preselect === undefined
      ? { kind: 'confident', options, offerClaude: false }
      : { kind: 'confident', options, preselect, offerClaude: false };
  }
  return { kind: 'unsure', options, offerClaude: opts.claudeAvailable };
}
