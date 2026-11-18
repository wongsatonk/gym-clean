/**
 * M13c task 6c (the lists half of M12 slice 3 task 4): what the optional Claude coach would send
 * to Anthropic, and what it never sends, in plain words. One source for the explain card (1.16.0),
 * and later Settings → Claude coach, About and the landing page (slice 3, 1.17.0).
 *
 * Lists only: there is no request builder, client or key here (Decision "M13c answers"). Slice 3's
 * request builder must map every section it emits to one `CLAUDE_SENDS` id (its own test), so the
 * ids are stable; the labels are copy (checkCopy, "you", never he/she).
 *
 * The plan item covers the M13c plan line (rotation + weekly sets per body area, context.ts).
 * `goalWords` follows the M12-s3-q5 default (goal kind and lift goals only, never the own words).
 */

export type ClaudeSendItem = Readonly<{ id: string; label: string }>;

const list = (items: readonly { id: string; label: string }[]): readonly ClaudeSendItem[] =>
  Object.freeze(items.map((i) => Object.freeze({ ...i })));

/** Sent with a question, only after the explanation and your yes (slice 3). */
export const CLAUDE_SENDS: readonly ClaudeSendItem[] = list([
  {
    id: 'messages',
    label: 'Your question and the last 8 chat messages, minus any that used Health data',
  },
  {
    id: 'plan',
    label: 'Your plan: the days, weekly sets per body area, today and the next 7 days',
  },
  { id: 'planChanges', label: 'Plan changes and your focus block' },
  { id: 'topSets', label: 'Your top sets from the last 4 weeks: exercise, weight, reps, date' },
  { id: 'scores', label: 'Your week and month scores' },
  { id: 'food', label: "Today's food totals and your targets" },
  { id: 'goals', label: 'Your goal type and your lift goals' },
  {
    id: 'lookups',
    label: 'What the coach looks up: your week, progress, exercise tips, food ideas',
  },
]);

/** Never sent, whatever the question. */
export const CLAUDE_NEVER_SENDS: readonly ClaudeSendItem[] = list([
  { id: 'health', label: 'Health data, including the reasons behind "Lighter today?"' },
  { id: 'body', label: 'Your body weight, body fat and lean mass' },
  { id: 'measurements', label: 'Body measurements' },
  { id: 'photos', label: 'Progress photos and food photos' },
  { id: 'checkIns', label: 'Your weekly check-in answers' },
  { id: 'dayFeel', label: 'How you said you feel today' },
  { id: 'notes', label: 'Your notes' },
  { id: 'goalWords', label: 'Your goal in your own words' },
  { id: 'camera', label: 'The camera, video and body tracking' },
  { id: 'devlog', label: 'The developer log' },
  { id: 'key', label: 'Your key inside the message' },
]);
