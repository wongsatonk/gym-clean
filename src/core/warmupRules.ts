/**
 * M12 1b warm-up sets, as data (SPEC M12 "Trainer kit" item 2, Decision "M12 slices 1b + 2",
 * M12-q4 default). Every number is a default tuned at a checkpoint; warmup.ts holds the logic.
 */
import type { Unit } from './units';

export type WarmupKind = 'barbell' | 'smith' | 'dumbbell';

/** Kit steps in the display unit. */
export type WarmupKitSteps = {
  /** Gap between neighbouring dumbbells. */
  dumbbellStep: number;
  /** The lightest dumbbell. */
  dumbbellMin: number;
  /** The smallest jump on a bar: one pair of the lightest plates. */
  plateStep: number;
  /** The empty barbell. */
  bar: number;
  /** The empty Smith bar; 0 = the logged weight is the plates only. */
  smithBar: number;
};

export const WARMUP_RULES = {
  /** Share of the working weight × reps, in order. */
  ramp: [
    { share: 0.5, reps: 8 },
    { share: 0.7, reps: 4 },
  ],
  /** A dumbbell lift is "heavy" from this working weight per dumbbell (kg). */
  heavyDumbbellKg: 12,
  /** Rest after a warm-up set (never longer than the exercise's own rest). */
  restSec: 45,
  /** Kit defaults per display unit; a gym profile can override any of them. */
  kit: {
    kg: { dumbbellStep: 2.5, dumbbellMin: 2.5, plateStep: 2.5, bar: 20, smithBar: 0 },
    lb: { dumbbellStep: 5, dumbbellMin: 5, plateStep: 5, bar: 45, smithBar: 0 },
  } satisfies Record<Unit, WarmupKitSteps>,
  /** Catalog `equipment` → kind. Anything else (cable, machine, body only, …) gets no warm-up. */
  equipmentKind: { barbell: 'barbell', dumbbell: 'dumbbell' } as Readonly<
    Record<string, WarmupKind>
  >,
  /** A Smith lift is a "machine" in the catalog; its name tells. */
  smithName: /\bsmith\b/i,
  /** Catalog `mechanic` of a compound lift (for the `everyCompound` setting). */
  compoundMechanic: 'compound',
} as const;
