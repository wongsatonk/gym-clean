// M13 task 14: Settings → About (route 'settings/about', Pro mood). Pure render: props in,
// element out. The lockup with the tagline, the version line (`versionLine(owner)`, passed in by
// main), the Owner tools switch (task 15, src/ui/ownerUnlock.ts, only when `onOwnerChange` is
// set), the privacy promise with its one opt-in exception, "Coaching, not medical advice.", the
// "Open-source credits" row (→ Licenses) and the credit line. In-app only: no links out.
//
// The privacy promise is checked against the code (2026-11-17): the only request the app makes to
// another server is the barcode lookup (src/data/nutrition/offClient.ts): off by default, only
// for a barcode not already in My foods, a plain GET with the barcode number in the URL and
// nothing else (no cookies, no referrer). Speech is turned into text on the phone
// (GymSpeechEngine, on-device SpeechTranscriber). Add any new exception here when one ships.
//
// e2e hooks: `main[data-screen="about"]`, `[data-about-version]`, `[data-about-privacy]`,
// `[data-about-medical]`, `[data-about-licenses]`, `[data-about-credit]`, plus ownerUnlock's.
import { CREDIT } from '../../core/version';
import { backButton } from '../backButton';
import { brandLockup } from '../brand';
import { h } from '../dom';
import { icon } from '../icons';
import { ownerTools } from '../ownerUnlock';
import { moodClass } from '../tokens';
import './about.css';

export const PRIVACY_TITLE = 'Everything stays on this phone';

export const PRIVACY_POINTS: readonly string[] = [
  'Camera: reps are counted on the phone. No video is saved or sent.',
  'Your workouts, food and body numbers are stored only on this phone.',
  'Coach chat stays here. Speech is turned into text on the phone and the audio is never stored.',
  'Apple Health (iPhone app) is read-only and stays on this phone.',
  'No account, no ads, no tracking. Backups are files you save yourself.',
];

export const PRIVACY_EXCEPTION_HEAD = 'The one exception';
export const PRIVACY_EXCEPTION =
  'Barcode lookup (Settings, Nutrition) is off until you turn it on. Then it sends only the barcode number to Open Food Facts to find the food, and only for a barcode not already in My foods. Nothing else goes with it.';

export const ABOUT_MEDICAL = 'Coaching, not medical advice.';
export const CREDITS_LABEL = 'Open-source credits';

/** Every line this screen shows (for the copy checks). */
export function aboutCopy(): string[] {
  return [
    'About',
    PRIVACY_TITLE,
    ...PRIVACY_POINTS,
    PRIVACY_EXCEPTION_HEAD,
    PRIVACY_EXCEPTION,
    ABOUT_MEDICAL,
    CREDITS_LABEL,
    'Libraries, data and fonts this app is built with.',
  ];
}

export type AboutProps = {
  /** `versionLine(owner)`: "Version 1.15", or "Version 1.15.0 (build abc1234)" in owner mode. */
  version: string;
  /** Owner mode now (the Owner tools switch shows from the start while on). */
  owner: boolean;
  /** Clock for the 7-tap window (tests). Default Date.now. */
  now?: (() => number) | undefined;
};

export type AboutActions = {
  onBack: () => void;
  /** Opens Settings → About → Licenses (route 'settings/licenses'). */
  onLicenses: () => void;
  /** Owner tools switch flipped. Main calls setOwnerMode and re-renders. Omitted → no unlock. */
  onOwnerChange?: ((on: boolean) => void) | undefined;
};

export function aboutScreen(p: AboutProps, a: AboutActions): HTMLElement {
  const owner = a.onOwnerChange
    ? ownerTools(
        { versionText: p.version, owner: p.owner, now: p.now },
        {
          onOwnerChange: a.onOwnerChange,
        },
      )
    : null;
  const version =
    owner?.version ?? h('p', { class: 'about-version', 'data-about-version': true }, p.version);

  const privacy = h(
    'section',
    { class: 'about-card', 'data-about-privacy': true, 'aria-labelledby': 'about-privacy' },
    h(
      'h2',
      { class: 'about-card-head', id: 'about-privacy' },
      icon('check', 'md'),
      h('span', {}, PRIVACY_TITLE),
    ),
    h('ul', { class: 'about-points' }, ...PRIVACY_POINTS.map((t) => h('li', {}, t))),
    h(
      'div',
      { class: 'about-exception', 'data-about-exception': true },
      h('p', { class: 'about-exception-head' }, PRIVACY_EXCEPTION_HEAD),
      h('p', { class: 'about-exception-text' }, PRIVACY_EXCEPTION),
    ),
  );

  return h(
    'main',
    { class: `screen about settings ${moodClass('pro')}`, 'data-screen': 'about' },
    h('header', { class: 'top-bar' }, backButton(a.onBack, 'Settings')),
    h('h1', { class: 'page-title' }, 'About'),
    h(
      'div',
      { class: 'about-hero' },
      brandLockup({ size: 'lg', tagline: true, nameTag: 'h2' }),
      version,
      owner?.tools ?? null,
    ),
    privacy,
    h('p', { class: 'about-medical', 'data-about-medical': true }, ABOUT_MEDICAL),
    h(
      'button',
      {
        type: 'button',
        class: 'about-row',
        'data-about-licenses': true,
        onclick: () => a.onLicenses(),
      },
      h(
        'span',
        { class: 'about-row-words' },
        h('span', { class: 'about-row-label' }, CREDITS_LABEL),
        h('span', { class: 'about-row-note' }, 'Libraries, data and fonts this app is built with.'),
      ),
      icon('arrow-right', 'md'),
    ),
    h('p', { class: 'about-credit', 'data-about-credit': true }, CREDIT),
  );
}
