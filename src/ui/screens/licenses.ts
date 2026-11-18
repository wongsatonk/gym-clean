// M13 task 14: Settings → About → Licenses (route 'settings/licenses', Pro mood). The bundled
// open-source credits (src/data/licenses.ts `loadLicenses`, generated at dev time; nothing is
// fetched): name, version and licence per entry; an entry with a licence text opens it in place.
//
// Licence texts hold URLs and angle brackets. They are shown as plain text only (textContent in a
// <pre> with white-space: pre-wrap): never innerHTML, never turned into links ("no external
// links", SPEC M13 goal 6).
//
// e2e hooks: `main[data-screen="licenses"]`, `[data-license]` (one per entry, its name),
// `[data-license-text]` (the <pre>), `[data-licenses-loading]`, `[data-licenses-error]`.
import type { LicenseEntry } from '../../core/types';
import { loadLicenses } from '../../data/licenses';
import { backButton } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import './about.css';

export type LicensesProps = {
  entries: readonly LicenseEntry[] | 'loading' | 'error';
};

export type LicensesActions = {
  /** Back to About. */
  onBack: () => void;
};

/** "4.0.0 · Apache-2.0", or the licence alone when there is no version. */
export function licenseMeta(e: LicenseEntry): string {
  return e.version ? `${e.version} · ${e.license}` : e.license;
}

function frame(...kids: (HTMLElement | null)[]): HTMLElement {
  return h(
    'main',
    { class: `screen licenses settings ${moodClass('pro')}`, 'data-screen': 'licenses' },
    ...kids,
  );
}

function rowWords(e: LicenseEntry): HTMLElement {
  return h(
    'span',
    { class: 'about-row-words' },
    h('span', { class: 'about-row-label' }, e.name),
    h('span', { class: 'about-row-note' }, licenseMeta(e)),
  );
}

export function licensesScreen(p: LicensesProps, a: LicensesActions): HTMLElement {
  const root = frame();
  fill(root, p, a);
  return root;
}

/** Draws the list (or a text) into `root`, replacing what is there. */
function fill(root: HTMLElement, p: LicensesProps, a: LicensesActions): void {
  const showList = () => {
    const head = [
      h('header', { class: 'top-bar' }, backButton(a.onBack, 'About')),
      h('h1', { class: 'page-title' }, 'Open-source credits'),
    ];
    if (p.entries === 'loading') {
      root.replaceChildren(
        ...head,
        h('p', { class: 'set-note', 'data-licenses-loading': true, role: 'status' }, 'Loading…'),
      );
      return;
    }
    if (p.entries === 'error') {
      root.replaceChildren(
        ...head,
        h(
          'p',
          { class: 'set-note', 'data-licenses-error': true, role: 'status' },
          "Couldn't open the list. Go back and try again.",
        ),
      );
      return;
    }
    const items = p.entries.map((e) =>
      e.text
        ? h(
            'button',
            {
              type: 'button',
              class: 'about-row',
              'data-license': e.name,
              onclick: () => showText(e),
            },
            rowWords(e),
            icon('arrow-right', 'md'),
          )
        : h('div', { class: 'about-row about-row-plain', 'data-license': e.name }, rowWords(e)),
    );
    root.replaceChildren(
      ...head,
      h(
        'p',
        { class: 'set-note muted' },
        'The libraries, data and fonts this app is built with, and their licences.',
      ),
      h('ul', { class: 'license-list' }, ...items.map((it) => h('li', {}, it))),
    );
  };

  const showText = (e: LicenseEntry) => {
    const pre = h('pre', { class: 'license-text', 'data-license-text': true });
    pre.textContent = e.text ?? '';
    root.replaceChildren(
      h('header', { class: 'top-bar' }, backButton(showList, 'Credits')),
      h('h1', { class: 'page-title license-title' }, e.name),
      h('p', { class: 'set-note' }, licenseMeta(e)),
      pre,
    );
    (globalThis as { scrollTo?: (x: number, y: number) => void }).scrollTo?.(0, 0);
  };

  showList();
}

/**
 * The Licenses screen that loads its own list: "Loading…" first, then the list (or the error
 * line). `load` defaults to the bundled list (a dynamic import, so it stays out of the main bundle).
 */
export function licensesView(
  a: LicensesActions,
  load: () => Promise<LicenseEntry[]> = loadLicenses,
): HTMLElement {
  const root = frame();
  const put = (entries: LicensesProps['entries']) => fill(root, { entries }, a);
  put('loading');
  load().then(
    (entries) => put(entries),
    (err: unknown) => {
      console.warn('Could not load the licences', err);
      put('error');
    },
  );
  return root;
}
