// M13b task 15: how a one-sided set reads on Summary, Calendar day, History and the Fix line.
// "R 12 · L 11" (right first, the order he trains them), "R 12 · L 11 × 20 kg" with a weight.
// One letter per side keeps a set on one line at 20px on a 390px phone; aria-labels spell the
// sides out. Sets logged without `sides` (two-sided, or one-arm sets from before 1.15.1) read
// exactly as before.
import { FIRST_SIDE, otherSide } from '../core/exercises/oneSided';
import type { SetLog, WorkSide } from '../core/types';
import { formatWeight, type Unit } from '../core/units';
import { h } from './dom';

export type SetSides = NonNullable<SetLog['sides']>;
export type SidedSet = { reps: number; weightKg: number; sides?: SetSides | null | undefined };

const ORDER: readonly WorkSide[] = [FIRST_SIDE, otherSide(FIRST_SIDE)];
const LETTER: Readonly<Record<WorkSide, string>> = { right: 'R', left: 'L' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function present(sides: SetSides): WorkSide[] {
  return ORDER.filter((s) => sides[s] !== undefined);
}

export function hasSides(set: { sides?: SetSides | null | undefined }): boolean {
  return !!set.sides && present(set.sides).length > 0;
}

/** "R 12 · L 11"; a side that wasn't logged is left out ("R 12"). */
export function sidesRepsText(sides: SetSides): string {
  return present(sides)
    .map((s) => `${LETTER[s]} ${sides[s]?.reps ?? 0}`)
    .join(' · ');
}

/** "Right 12, left 11 reps" (screen readers; the letters alone read badly). */
export function sidesAria(sides: SetSides): string {
  const shown = present(sides);
  const parts = shown.map((s, i) => {
    const word = i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    return `${word} ${sides[s]?.reps ?? 0}`;
  });
  const last = shown.at(-1);
  const lastReps = last ? (sides[last]?.reps ?? 0) : 0;
  return `${parts.join(', ')} ${lastReps === 1 ? 'rep' : 'reps'}`;
}

/** One set: "R 12 · L 11 × 20 kg" / "R 12 · L 11 reps"; without sides "12 × 20 kg" / "12 reps". */
export function sidedSetText(set: SidedSet, unit: Unit): string {
  const sided = set.sides && hasSides(set) ? sidesRepsText(set.sides) : null;
  if (set.weightKg > 0) return `${sided ?? set.reps} × ${formatWeight(set.weightKg, unit)} ${unit}`;
  return sided ? `${sided} reps` : plural(set.reps, 'rep');
}

/** The spoken form of a set with sides ("Right 12, left 11 reps × 20 kg"); null without sides. */
export function sidedSetAria(set: SidedSet, unit: Unit): string | null {
  if (!set.sides || !hasSides(set)) return null;
  const said = sidesAria(set.sides);
  return set.weightKg > 0 ? `${said} × ${formatWeight(set.weightKg, unit)} ${unit}` : said;
}

/** One line per set when any set has sides; null keeps the caller's old one-line text. */
export function sidedSetLines(sets: readonly SidedSet[], unit: Unit): string[] | null {
  if (!sets.some(hasSides)) return null;
  return sets.map((s) => sidedSetText(s, unit));
}

/** The Fix line: "R 12 · L 11", plus " · 3 partials" (both sides added) when there are any. */
export function sidesLineText(sides: SetSides): string {
  const partials = present(sides).reduce((n, s) => n + (sides[s]?.partials ?? 0), 0);
  const reps = sidesRepsText(sides);
  return partials > 0 ? `${reps} · ${plural(partials, 'partial')}` : reps;
}

/**
 * The DOM for `sidedSetLines`: a block of `.side-set` lines (each with a spoken aria-label when
 * it has sides); null when no set has sides, so the caller keeps its old one-line text.
 */
export function sidedSetBlock(
  sets: readonly SidedSet[],
  unit: Unit,
  cls: string,
): HTMLElement | null {
  if (!sets.some(hasSides)) return null;
  return h(
    'span',
    { class: cls ? `side-sets ${cls}` : 'side-sets', 'data-side-sets': true },
    ...sets.map((set) =>
      h(
        'span',
        { class: 'side-set', 'aria-label': sidedSetAria(set, unit) ?? undefined },
        sidedSetText(set, unit),
      ),
    ),
  );
}
