// Test-only: the made-up completion history (src/core/progress/fixtures/twoWeeks.json) as typed
// inputs, plus a tiny made-up catalog (one area per exercise). The repo is public: no real data.
import fixture from '../progress/fixtures/twoWeeks.json';
import { seedPlan } from '../trainer/plan';
import type { CompletionSession, CompletionSet } from '../progress/completion';
import type { BodyArea, Exercise, Program, TrainerState } from '../types';

/** Local time of 'YYYY-MM-DD HH:MM'. */
export function localTime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Not a local time: ${s}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi).getTime();
}

export const FIXTURE_PROGRAM = fixture.program as Program;

export const FIXTURE_SESSIONS: CompletionSession[] = fixture.sessions.map((s) => ({
  sessionId: s.sessionId,
  dayId: s.dayId,
  startedAt: localTime(s.start),
  ...(s.end ? { endedAt: localTime(s.end) } : {}),
}));

export const FIXTURE_SETS: CompletionSet[] = (fixture.sets as [string, string, number][]).map(
  ([sessionId, exerciseId, reps]) => ({ sessionId, exerciseId, reps }),
);

export function fixtureState(over: Partial<TrainerState> = {}): TrainerState {
  const s = seedPlan(FIXTURE_PROGRAM);
  return { ...s, schedule: { ...s.schedule, restWeekdays: fixture.restWeekdays }, ...over };
}

const ex = (id: string, area: BodyArea): Exercise => ({
  id,
  name: id,
  force: null,
  level: 'beginner',
  mechanic: null,
  equipment: null,
  category: 'strength',
  primaryMuscles: [area],
  secondaryMuscles: [],
  instructions: [],
});

/** Muscles are named after their area, so `areaOf` is the identity. */
export const FIXTURE_CATALOG = {
  exercises: [
    ex('press', 'chest'),
    ex('fly', 'chest'),
    ex('row', 'back'),
    ex('curl', 'arms'),
    ex('squat', 'legs'),
    ex('lunge', 'legs'),
  ],
  areaOf: (m: string) => m as BodyArea,
};
