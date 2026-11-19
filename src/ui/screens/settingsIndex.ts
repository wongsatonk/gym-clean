// M13c task 14 (SPEC M13c goal 3): what search can find in Settings. One item per thing you
// might look for; `section` is the `data-section` key of the Settings section that holds it
// (settings.ts gives that section `id = settingsSectionId(section)` and tabindex=-1, so app.ts
// scrolls to it and focuses it). Data only: the ranking is core search (src/core/search.ts).
//
// Owner mode (M13): `ownerOnly` items are in sections that only show while owner mode is on
// (To-dos, Developer log), so search hides them when it is off. "What's new" lives in the
// To-dos section while owner mode is on and in its own section when it is off (`ownerSection`).
// Some sections show only when app.ts passes their callback (Health, Reminders, …):
// `settingsSearchItems({ owner, has })` drops the ones the Settings screen won't render.
import type { SearchItem } from '../../core/types';

export type SettingsSearchItem = SearchItem & {
  kind: 'setting';
  /** The `data-section` key that holds it (with owner mode off, or on when no `ownerSection`). */
  section: string;
  /** The section that holds it while owner mode is on, when that differs. */
  ownerSection?: string;
  /** Only shown while owner mode is on. */
  ownerOnly?: true;
};

const item = (
  id: string,
  title: string,
  subtitle: string,
  keywords: string[],
  extra: Partial<Pick<SettingsSearchItem, 'section' | 'ownerSection' | 'ownerOnly'>> = {},
): SettingsSearchItem => ({
  kind: 'setting',
  id,
  title,
  subtitle,
  keywords,
  section: extra.section ?? id,
  ...(extra.ownerSection ? { ownerSection: extra.ownerSection } : {}),
  ...(extra.ownerOnly ? { ownerOnly: true as const } : {}),
});

/** Every Settings search item, in Settings order. */
export const SETTINGS_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  item('goal', 'Your goal', 'Your answers and the go-easy list', [
    'goal',
    'goals',
    'answers',
    'intake',
    'go easy',
    'easy on',
    'sore',
  ]),
  item('display', 'Display', 'Text size: Standard, Large or Larger', [
    'display',
    'text',
    'text size',
    'font',
    'font size',
    'size',
    'bigger',
    'larger',
    'large',
    'read',
    'readable',
  ]),
  item('accent', 'Accent colour', 'The colour of buttons and marks', [
    'accent',
    'colour',
    'color',
    'theme',
  ]),
  item(
    'background',
    'Background',
    'Moving glow or plain',
    ['background', 'glow', 'moving glow', 'plain', 'wallpaper', 'theme'],
    { section: 'accent' },
  ),
  item('voice', 'Voice', 'Counting out loud, tips and the coach voice', [
    'voice',
    'voices',
    'speaker',
    'speak',
    'speech',
    'sound',
    'audio',
    'volume',
    'count out loud',
    'tips',
    'rudeness',
    'drill sergeant',
    'drill',
  ]),
  item('camera', 'Camera', 'Hands-free sets and the camera test', [
    'camera',
    'hands-free',
    'hands free',
    'camera test',
    'rep counting',
    'tracking',
  ]),
  item('unit', 'Units', 'kg or lb, cm or ft·in', [
    'unit',
    'units',
    'kg',
    'lb',
    'lbs',
    'pounds',
    'kilos',
    'weight unit',
    'height',
    'cm',
    'centimetres',
    'feet',
    'ft',
    'inches',
    'inch',
    'tape',
    'metric',
    'imperial',
  ]),
  item('nutrition', 'Nutrition', 'Your food targets', [
    'nutrition',
    'calories',
    'kcal',
    'protein',
    'macros',
    'targets',
    'food',
  ]),
  item('food-photos', 'Food photos', 'Recognise food from a photo', [
    'food photos',
    'photo',
    'food model',
    'recognition',
  ]),
  item('gym', 'My gym', 'The kit your gym has', [
    'gym',
    'my gym',
    'kit',
    'equipment',
    'machines',
    'dumbbells',
  ]),
  item('health', 'Health', 'What the coach reads from Apple Health', [
    'health',
    'apple health',
    'steps',
    'sleep',
    'heart rate',
  ]),
  item('coach', 'Coach', 'Who answers, and when replies are spoken', [
    'coach',
    'brain',
    'claude',
    'replies',
    'answers',
    'chat',
  ]),
  item('selfcheck', 'Self-check', 'Is the app ready for the gym?', [
    'self-check',
    'self check',
    'ready',
    'check',
  ]),
  item('reminders', 'Reminders', 'Off until you turn them on', [
    'reminders',
    'reminder',
    'notifications',
    'notify',
    'alerts',
  ]),
  item('plan', 'Plan changes', 'What changed in your plan', [
    'plan',
    'plan changes',
    'program',
    'changes',
    'undo',
  ]),
  item('todos', 'To-dos', 'Things to try and answer', ['to-dos', 'todos', 'todo', 'checklist'], {
    ownerOnly: true,
  }),
  item(
    'whats-new',
    "What's new",
    'What changed in this version',
    ["what's new", 'whats new', 'new', 'release', 'version', 'tour'],
    { ownerSection: 'todos' },
  ),
  item('progress-photos', 'Progress photos', 'Photos that stay on this phone', [
    'progress photos',
    'photos',
    'pictures',
    'body photos',
  ]),
  item('backup', 'Backup', 'Save or restore your data', [
    'backup',
    'back up',
    'export',
    'import',
    'restore',
    'save',
  ]),
  item(
    'devlog',
    'Developer log',
    'Logs and the coach eval',
    ['developer', 'dev log', 'log', 'debug', 'coach eval'],
    { ownerOnly: true },
  ),
  item('about', 'About', 'Version, privacy, licenses and the welcome', [
    'about',
    'privacy',
    'licenses',
    'licences',
    'credits',
    'version',
    'welcome',
  ]),
];

/** The section that holds an item with owner mode on or off. */
export function sectionFor(item: SettingsSearchItem, owner: boolean): string {
  return owner && item.ownerSection ? item.ownerSection : item.section;
}

/**
 * The Settings items search should use: owner-only ones dropped when owner mode is off, each
 * item's `section` resolved for that mode, and (with `has`) items whose section Settings won't
 * render dropped. `has(key)` answers "will Settings show the section with this `data-section`
 * key?" (app.ts knows from the callbacks it passes).
 */
export function settingsSearchItems(opts: {
  owner: boolean;
  has?: ((sectionKey: string) => boolean) | undefined;
}): SettingsSearchItem[] {
  const out: SettingsSearchItem[] = [];
  for (const it of SETTINGS_SEARCH_ITEMS) {
    if (it.ownerOnly && !opts.owner) continue;
    const section = sectionFor(it, opts.owner);
    if (opts.has && !opts.has(section)) continue;
    const copy: SettingsSearchItem = { ...it, section };
    delete copy.ownerSection;
    out.push(copy);
  }
  return out;
}

/** The section for a setting hit's id (`SearchHit.id`), or null for an unknown id. */
export function settingsSectionFor(id: string, owner: boolean): string | null {
  const it = SETTINGS_SEARCH_ITEMS.find((i) => i.id === id);
  if (!it || (it.ownerOnly && !owner)) return null;
  return sectionFor(it, owner);
}
