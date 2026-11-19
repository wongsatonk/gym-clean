// M13b task 13: one-sided sets (Decision "One-arm sets") on the Exercise screen and the camera.
// Right arm first, a full-width "Next arm" button, then the left arm and Set done. The copy is
// core data (ONE_SIDED_COPY); this module only maps the session to it, speaks the switch and
// builds the shared pieces (side label, Next arm button). Styles: oneArm.css.
import type { SideTurn } from '../core/autoSet';
import { FIRST_SIDE, ONE_SIDED_COPY, oneSidedLimb, otherSide } from '../core/exercises/oneSided';
import { sideTurn, type SessionState } from '../core/session';
import type { OneSidedLimb, WorkSide } from '../core/types';
import { h } from './dom';
import { midPill } from './midsetButtons';
import { voice } from './voice';
import './oneArm.css';

/**
 * Taps on Set done this soon after Next arm are ignored: both buttons sit in the same spot, so
 * a sweaty double tap on Next arm must not end the set before the second arm starts.
 */
export const SWITCH_GUARD_MS = 700;

/** The side a turn of a one-sided set is on: 'first' = right, 'second' = left. */
export function sideOfTurn(turn: SideTurn): WorkSide {
  return turn === 'first' ? FIRST_SIDE : otherSide(FIRST_SIDE);
}

/** What the Exercise screen needs to show a one-sided set. */
export type OneSidedView = {
  limb: OneSidedLimb;
  turn: SideTurn;
  /** The first side's reps once Next arm moved on (second turn only). */
  doneReps?: number | undefined;
  /** Wall-clock ms of the Next arm tap (second turn only): the Set done tap guard. */
  switchedAt?: number | undefined;
};

/** The one-sided view of the session's current set; undefined for a two-sided exercise. */
export function oneSidedView(exerciseId: string, s: SessionState): OneSidedView | undefined {
  const limb = oneSidedLimb(exerciseId);
  const turn = sideTurn(s);
  if (!limb || !turn) return undefined;
  return {
    limb,
    turn,
    ...(s.doneSide ? { doneReps: s.doneSide.reps, switchedAt: s.doneSide.at } : {}),
  };
}

/** "Right arm" / "Left leg". */
export function sideLabelText(limb: OneSidedLimb, side: WorkSide): string {
  return ONE_SIDED_COPY[limb].sideLabel[side];
}

/**
 * Speaks the switch line ("Left arm. Turn so your left arm faces the phone."), cutting off any
 * count word still speaking or queued. Returns the line actually spoken (persona rewrite) or the
 * copy when speech is unsupported, for the dev log.
 */
export function speakSideSwitch(limb: OneSidedLimb, to: WorkSide): string {
  const text = ONE_SIDED_COPY[limb].spokenSwitch[to];
  voice.cancel();
  const u = voice.speak(text, { kind: 'cue' });
  return u?.text ?? text;
}

/** The side label shown over the count: static text, the limb word, never colour alone. */
export function sideLabel(limb: OneSidedLimb, side: WorkSide, extraClass = ''): HTMLElement {
  return h(
    'p',
    {
      class: `side-label${extraClass ? ` ${extraClass}` : ''}`,
      'data-side-label': side,
    },
    sideLabelText(limb, side),
  );
}

/**
 * The full-width main "Next arm" button (the CTA slot on the first side): M13d task 40g, the
 * round-button pill in Set done's place and size.
 */
export function nextSideButton(limb: OneSidedLimb, onClick: () => void): HTMLElement {
  return midPill({
    icon: 'flip',
    label: ONE_SIDED_COPY[limb].nextButton,
    variant: 'main',
    wide: true,
    class: 'next-side-btn',
    hooks: { 'data-next-side': true },
    onClick: () => onClick(),
  });
}
