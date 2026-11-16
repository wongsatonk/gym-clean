/**
 * M11 "Lighter today?" copy (SPEC M11 "Copy"). Reasons state what changed versus his usual,
 * never what it means for his health; no promises. Every string passes M10 `checkCopy` plus
 * the M11 banned list below. Pure.
 */
import { normalizeText } from '../trainer/intents';
import { checkCopy, type CopyCheck } from '../trainer/replies';
import type { ReadinessSignal } from '../types';

/**
 * Banned on top of `checkCopy` (SPEC M11 list + a few diagnosis-style words). Matched as whole
 * words on normalized text; a trailing `*` means any ending, and a plural `s` is always allowed.
 */
export const HEALTH_BANNED_TERMS: readonly string[] = [
  'sick*',
  'ill',
  'illness*',
  'infect*',
  'overtrain*',
  'over train*',
  'fatigue*',
  'stress*',
  'recover*',
  'risk*',
  'warning*',
  'unhealthy',
  'abnormal*',
  'danger*',
  'diagnos*',
  'symptom*',
  'disease*',
  'disorder*',
  'heart problem*',
  'medical*',
  'burnout*',
  'burn out',
];

const BANNED = HEALTH_BANNED_TERMS.map((raw) => {
  const prefix = raw.endsWith('*');
  const term = normalizeText(prefix ? raw.slice(0, -1) : raw);
  const body = term.replace(/ /g, '\\s+') + (prefix ? '[a-z0-9]*' : 's?');
  return { term, re: new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`) };
});

/** `checkCopy` + the M11 banned list. Every M11 string must pass. */
export function checkHealthCopy(text: string): CopyCheck {
  const base = checkCopy(text);
  const norm = normalizeText(text);
  const hits = [...base.hits, ...BANNED.filter((b) => b.re.test(norm)).map((b) => b.term)];
  return { ok: hits.length === 0, hits: [...new Set(hits)] };
}

export const CARD_TITLE = { lighter: 'Lighter today?', deload: 'Deload week?' } as const;

/** Minutes as "1 h 20 m", rounded to 10 minutes (at least 10 m). */
export function durationText(min: number): string {
  const r = Math.max(10, Math.round(min / 10) * 10);
  const h = Math.floor(r / 60);
  const m = r % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** HealthKit activity name → plain lowercase words ('traditionalStrengthTraining' → 'traditional strength training'). */
export function kindText(kind: string): string {
  const words = kind
    .replace(/^HKWorkoutActivityType/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words === '' || !checkHealthCopy(words).ok ? 'a workout' : words;
}

export type SignalDetail =
  | { signal: 'sleepShort'; shortByMin: number }
  | { signal: 'hrvLow'; lowerByPct: number }
  | { signal: 'restingHrHigh'; higherByBpm: number }
  | { signal: 'hardOutsideWorkout'; kind: string; minutes: number }
  | { signal: 'whoopLow' };

/** The one-line fact for a signal. */
export function reasonText(d: SignalDetail): string {
  switch (d.signal) {
    case 'sleepShort':
      return `Sleep was about ${durationText(d.shortByMin)} shorter than usual.`;
    case 'hrvLow':
      return `Heart rate variability is about ${Math.round(d.lowerByPct)}% lower than usual.`;
    case 'restingHrHigh':
      return `Resting heart rate is about ${Math.round(d.higherByBpm)} bpm higher than usual.`;
    case 'hardOutsideWorkout':
      return `You did ${durationText(d.minutes)} of ${kindText(d.kind)} in the last day.`;
    case 'whoopLow':
      return 'Your WHOOP score today is in its lowest band.';
  }
}

/** The extra line on a Deload offer. */
export function deloadReason(firedDays: number, windowDays: number): string {
  return `This came up on ${firedDays} of the last ${windowDays} days.`;
}

/** Fixed order the reasons are listed in. */
export const SIGNAL_ORDER: readonly ReadinessSignal[] = [
  'sleepShort',
  'hrvLow',
  'restingHrHigh',
  'hardOutsideWorkout',
  'whoopLow',
];
