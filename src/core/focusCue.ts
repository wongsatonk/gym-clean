import type { SessionState } from './session';

/** The focus cue is spoken whenever a new set begins (SPEC M2) — never on resume or edits. */
export function shouldSpeakFocusCue(prev: SessionState | null, next: SessionState): boolean {
  if (next.phase !== 'exercise' || next.paused) return false;
  if (!prev) return true;
  if (prev.paused) return false;
  return (
    prev.phase !== 'exercise' || prev.exIndex !== next.exIndex || prev.setIndex !== next.setIndex
  );
}
