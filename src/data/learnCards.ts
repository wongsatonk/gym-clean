/**
 * M12 1b learn cards (SPEC M12 trainer kit item 12): short "why" cards the coach, the rest
 * screen's effort row and the Fuel protein nudge link to ("Why?"). Written for this app in plain
 * coaching language for anyone using it: no medical claims, no personal numbers. The coach's
 * intent → card links are in src/core/trainer/replies.ts `LEARN_FOR_INTENT`.
 *
 * M13d task 18 ("some screens have too much text"): each card opens on `short`, one sentence of
 * ≤ 20 words; `body` and `why` stay as they are and sit behind "More" (src/ui, task 19).
 */
import type { LearnCard } from '../core/types';

export const LEARN_CARDS: readonly LearnCard[] = [
  {
    id: 'progressiveOverload',
    title: 'Small steps up',
    short: 'Ask a little more over time: one more rep, then a bit more weight.',
    body:
      'Muscles adapt to what you ask of them. To keep moving, ask a little more over time: one more rep, then a little more weight, then one more set.\n\n' +
      'When a lift stops moving for a few sessions, a short step back (lighter, more reps) often gets it going again.',
    why: 'The app suggests the next weight from your last sets, so each step stays small.',
  },
  {
    id: 'effort',
    title: 'How hard was that set?',
    short: 'Easy means plenty left, good means two or three clean reps left, hard means one more would be a grind.',
    body:
      'Easy means you had plenty left. Good means two or three clean reps left. Hard means one more would have been a grind.\n\n' +
      'Most working sets land on good. A few hard ones are fine; all hard every time is a lot.',
    why: 'Your answer helps the app pick the next weight: up after easy, the same after hard.',
  },
  {
    id: 'warmups',
    title: 'Why warm-up sets',
    short: 'A couple of lighter sets before your first heavy lift get you ready for the weight.',
    body:
      'A couple of lighter sets before your first heavy lift get you used to the movement and the weight. They are quick: a lighter set of eight, then a few reps closer to your working weight.\n\n' +
      'They do not count toward your volume or your bests.',
  },
  {
    id: 'protein',
    title: 'Protein across the day',
    short: 'Spread protein over your meals; a palm-sized portion at each meal covers most days.',
    body:
      'Your body builds muscle from the protein you eat. Spreading it over your meals is easier than catching up at night.\n\n' +
      'A palm-sized portion of eggs, yogurt, tofu, fish or chicken at each meal covers most days.',
    why: 'Your protein target in Fuel comes from your goal and body weight.',
  },
  {
    id: 'sleep',
    title: 'Sleep is part of training',
    short: 'Rest is when you adapt to training; after a short night, a lighter session still counts.',
    body:
      'Training is the signal; rest is when you adapt to it. After short nights, sets often feel heavier and focus drifts.\n\n' +
      'On those days a lighter session still counts, and a regular bedtime helps the next one.',
  },
  {
    id: 'deloads',
    title: 'Lighter days and weeks',
    short: 'A lighter day or week lets you catch up on rest while you keep the habit.',
    body:
      'A lighter day or a lighter week (fewer sets, a bit less weight) lets you catch up on rest while you keep the habit.\n\n' +
      'Many people come back from one feeling stronger. Your plan picks up where it was afterwards.',
  },
  {
    id: 'focusBlocks',
    title: 'Focus blocks',
    short: 'One area gets more sets for a few weeks while everything else stays as it is.',
    body:
      'A focus block gives one area more sets for a few weeks while everything else stays as it is. The last week is lighter so you finish fresh.\n\n' +
      'After the block your usual plan comes back, or you can start the next one.',
  },
  {
    id: 'shortSessions',
    title: 'Short on time',
    short: 'A short session beats a skipped one: your main lifts stay and smaller moves get trimmed.',
    body:
      'A short session beats a skipped one. Your main lifts stay, and the smaller moves are paired back to back or trimmed.\n\n' +
      'Doing most of the work most weeks matters more than any single long session.',
  },
  {
    id: 'measurements',
    title: 'Why measure',
    short: 'A tape measure every few weeks shows slow changes that day-to-day scale numbers hide.',
    body:
      'The scale moves for many reasons from day to day. A tape measure every few weeks, at the same spots and the same time of day, shows slower changes more clearly.\n\n' +
      'Look at the trend over weeks, not a single number.',
  },
  {
    id: 'consistency',
    title: 'Show up, most weeks',
    short: 'Steady weeks matter more than one perfect session, and missing a day is normal.',
    body:
      'Progress comes from weeks of steady training, not from one perfect session. Missing a day is normal; the plan moves with you.\n\n' +
      'If a week keeps slipping, try fewer days you can keep rather than more you skip.',
  },
  // M13c: opened by the Learning badge (day preview, Library) and the Camera sheet's note.
  {
    id: 'cameraLearning',
    title: 'Camera still learning',
    short: 'Camera counting is new for this exercise; if a count is off, fix it on the Rest screen.',
    body:
      'Counting with the camera is new for this exercise. While it learns, it may miss a rep or add one.\n\n' +
      'If the count is off, fix it on the Rest screen. The number you save is the one that counts.',
    why: 'Your fixes keep your saved numbers right, so your progress uses real counts.',
  },
  // M13c: the "Also add abs?" step's Why? in the focus flow (abs join a plan only when you choose).
  {
    id: 'coreTraining',
    title: 'Why train your abs',
    short: 'Your abs keep your trunk steady in big lifts; a few direct sets a week train them.',
    body:
      'Your abs and the muscles around your middle hold your trunk steady when you squat, press, row and carry. Big lifts work them some; a few direct sets a week give them their own work.\n\n' +
      'They grow like any other muscle: a few sets, a little harder over time.',
    why: 'Yes adds abs sets on 2 or more days of the block. Your main focus stays the same, and the abs end with the block.',
  },
];

const byId = new Map(LEARN_CARDS.map((c) => [c.id, c]));

/** The card with this id, if any. */
export function learnCard(id: string): LearnCard | undefined {
  return byId.get(id);
}
