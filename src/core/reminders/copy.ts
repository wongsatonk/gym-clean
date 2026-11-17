/**
 * M12 slice 2 reminder text, as data. Coaching tone, no numbers about body, Health, weight or
 * food (a test checks every template for digits and unit words). `{day}` is the plan day's name;
 * without a usable name the generic line is used.
 */
import { checkCopy } from '../trainer/replies';
import type { ReminderKind } from '../types';

export const REMINDER_TITLE = 'Gym Clean';

export const REMINDER_COPY = {
  session: '{day} today. Ready when you are.',
  sessionGeneric: 'Training day today. Ready when you are.',
  missedDay: "Missed {day} yesterday? Pick it up when you're ready.",
  missedDayGeneric: "Missed yesterday's session? Pick it up when you're ready.",
  sundayRecap: 'Sunday check-in: how did this week feel?',
} as const;

const usable = (name: string | undefined): name is string =>
  name !== undefined && name.trim() !== '' && checkCopy(name).ok;

export function reminderText(
  kind: ReminderKind,
  dayName?: string,
): { title: string; body: string } {
  const fill = (template: string, generic: string) =>
    usable(dayName) ? template.replace('{day}', dayName.trim()) : generic;
  const body =
    kind === 'session'
      ? fill(REMINDER_COPY.session, REMINDER_COPY.sessionGeneric)
      : kind === 'missedDay'
        ? fill(REMINDER_COPY.missedDay, REMINDER_COPY.missedDayGeneric)
        : REMINDER_COPY.sundayRecap;
  return { title: REMINDER_TITLE, body };
}
