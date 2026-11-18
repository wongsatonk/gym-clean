/**
 * M12 1b setup cues (trainer-kit item 10). Pure. Two or three short setup checks per exercise
 * (data: src/data/setupCues.json), for the things the camera can't judge: grip, feet, bench and
 * seat position, bracing. They are spoken once per session, before the exercise's first working
 * set (so after any warm-up sets), and never again that session.
 *
 * The caller speaks the lines between sets (never during one) and then records the exercise id
 * in `setupCuesSaid`, so a re-render or a return to the exercise stays quiet.
 */
import setupCuesJson from '../data/setupCues.json';
import type { SetLog } from './types';

/** Every cue is at most this many words. */
export const SETUP_CUE_MAX_WORDS = 8;

const CUES: Readonly<Record<string, readonly string[]>> = setupCuesJson.cues;

/** The setup checks of an exercise (none when it has no data). */
export function setupCueLines(exerciseId: string): string[] {
  return Object.hasOwn(CUES, exerciseId) ? [...(CUES[exerciseId] ?? [])] : [];
}

/**
 * What `setupCuesFor` needs from the running session: its logged sets (the session state's
 * `logs` fits) and the exercises whose cues were already spoken this session.
 */
export type SetupCueSession = {
  logs: readonly Pick<SetLog, 'exerciseId' | 'warmup'>[];
  setupCuesSaid?: readonly string[];
};

/**
 * The lines to speak now, before a set of `exerciseId`: its setup checks while no working set
 * of it is logged this session and they haven't been said; otherwise none.
 */
export function setupCuesFor(exerciseId: string, session: SetupCueSession): string[] {
  if (session.setupCuesSaid?.includes(exerciseId)) return [];
  const worked = session.logs.some((l) => l.exerciseId === exerciseId && l.warmup !== true);
  return worked ? [] : setupCueLines(exerciseId);
}
