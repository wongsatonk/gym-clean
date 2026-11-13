// Which spoken rest cues fire as the rest clock advances (SPEC M1). Pure.
import { REST_OVERRUN_GRACE_SEC } from './session';

export type RestCueKind = 'tenSeconds' | 'go' | 'nudge';
export type RestCue = { kind: RestCueKind; atMs: number };

export const NUDGE_EVERY_SEC = 30;

/** Cues whose trigger time lies in (prevMs, currMs], in time order. */
export function restCuesBetween(targetSec: number, prevMs: number, currMs: number): RestCue[] {
  if (currMs <= prevMs) return [];
  const crossed = (at: number) => at > prevMs && at <= currMs;
  const cues: RestCue[] = [];
  const target = targetSec * 1000;

  if (targetSec > 10 && crossed(target - 10_000))
    cues.push({ kind: 'tenSeconds', atMs: target - 10_000 });
  if (crossed(target)) cues.push({ kind: 'go', atMs: target });

  const first = target + REST_OVERRUN_GRACE_SEC * 1000;
  const step = NUDGE_EVERY_SEC * 1000;
  const startK = Math.max(0, Math.ceil((prevMs - first) / step));
  for (let k = startK; first + k * step <= currMs; k++) {
    const at = first + k * step;
    if (crossed(at)) cues.push({ kind: 'nudge', atMs: at });
  }
  return cues;
}

export function restCueText(kind: RestCueKind, next: { name: string; setNumber: number }): string {
  const upcoming = `${next.name}, set ${next.setNumber}.`;
  switch (kind) {
    case 'tenSeconds':
      return `Ten seconds. Next: ${upcoming}`;
    case 'go':
      return 'Go.';
    case 'nudge':
      return `Rest is over. ${upcoming}`;
  }
}
