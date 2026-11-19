// M12 slice 1c task 8 (+ 2b): the What's New tour. Pure render: pages and topics in, callbacks
// out. No DB, no speech, no routing: app.ts decides when to show it (Today, on open, never in a
// session or on the camera), removes `el` on Skip / Done / Try it / Open to-dos, and records the
// release as seen.
//
// Layout (full screen, one page at a time): a top row with "What's new", the "2 of 6" text and
// Skip (always visible); the page (icon, title, the version on page 1, what + why, Try it); the
// page dots (shape + size, never colour alone, and the "2 of 6" text says it in words); Back /
// Next (Done on the last page) at the bottom, in thumb reach. The last page lists the to-do
// topics this release added, with Open to-dos. A release with no new topics ends on its last
// feature page (Done there).
//
// Input: buttons (≥ 56px) are the way through; swipe left/right is a shortcut only (M13d:
// gestures/pageSwipe.ts, the core `pageSwipe` classifier, the page follows the finger). Keyboard:
// ArrowRight / ArrowLeft = Next / Back, Escape = Skip, Tab is trapped in the dialog.
// Motion: a page change is motion.ts enterScreen (fade + 8px slide in the direction of travel),
// a no-op under prefers-reduced-motion. No other animation here.
import type { AppRoute, WhatsNewPage } from '../../core/types';
import { h } from '../dom';
import { installPageSwipe } from '../gestures/pageSwipe';
import { icon, ICON_NAMES, type IconName } from '../icons';
import { enterScreen, type Stop } from '../motion';
import './whatsNewTour.css';

/** What the last page needs from a to-do topic (a `TodoTopic` fits). */
export type TourTopic = { id: string; title: string; checkpoint?: string | undefined };

export type WhatsNewTourProps = {
  /** Pages to show, in order (tour selection already put the newest release first). */
  pages: readonly WhatsNewPage[];
  /** To-do topics new in these releases; empty → no "Added to your to-dos" page. */
  addedTopics: readonly TourTopic[];
  /**
   * Shown under page 1's title. The caller decides it (M13): owner mode on → `versionLabel()`
   * ("Version 1.15.0 (build abc1234)"), off → the short line ("Version 1.15"). The tour has no
   * version or build of its own.
   */
  version: string;
  /** Page to open on (default 0). */
  startIndex?: number | undefined;
};

export type WhatsNewTourActions = {
  /** Try it on a page: the caller closes the tour and goes to `route`. */
  onTryIt: (route: AppRoute) => void;
  /** Skip (any page) or Escape. */
  onSkip: () => void;
  /** Done on the last page. */
  onDone: () => void;
  /** Open to-dos on the "Added to your to-dos" page. */
  onOpenTodos: () => void;
};

export type WhatsNewTour = {
  el: HTMLElement;
  /** The page shown now (0-based). */
  index: () => number;
  /** Number of pages, the "Added to your to-dos" page included. */
  total: () => number;
  next: () => void;
  back: () => void;
  /** Stops a running page animation. */
  dispose: () => void;
};

const TITLE_ID = 'wn-title';

const present = (e: HTMLElement | null): e is HTMLElement => e !== null;

function isIcon(name: string | undefined): name is IconName {
  return name !== undefined && (ICON_NAMES as string[]).includes(name);
}

/** "2 of 6". */
export function pageCount(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

export function whatsNewTour(props: WhatsNewTourProps, actions: WhatsNewTourActions): WhatsNewTour {
  const pages = props.pages;
  const hasTodoPage = props.addedTopics.length > 0;
  const total = Math.max(1, pages.length + (hasTodoPage ? 1 : 0));
  const version = props.version;
  let index = Math.min(Math.max(0, props.startIndex ?? 0), total - 1);
  let stopAnim: Stop = () => {};
  /** The page's own buttons (Try it / Open to-dos), for the focus trap. */
  let pageButtons: HTMLElement[] = [];

  const isLast = () => index === total - 1;
  const isTodoPage = () => hasTodoPage && index === pages.length;

  const counter = h('p', { class: 'wn-count', 'data-wn': 'count' });
  // Words for screen readers on every page change (the visible counter stays short).
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite', 'data-wn': 'live' });
  const skipBtn = h(
    'button',
    { type: 'button', class: 'wn-skip', 'data-wn': 'skip', onclick: () => actions.onSkip() },
    'Skip',
  );
  const page = h('section', { class: 'wn-page', 'data-wn': 'page' });
  const dots = h('div', { class: 'wn-dots', 'aria-hidden': 'true', 'data-wn': 'dots' });
  const backBtn = h(
    'button',
    { type: 'button', class: 'wn-back', 'data-wn': 'back', onclick: () => back() },
    icon('back', 'sm'),
    h('span', {}, 'Back'),
  );
  const nextBtn = h('button', {
    type: 'button',
    class: 'wn-next cta-btn',
    'data-wn': 'next',
    onclick: () => (isLast() ? actions.onDone() : next()),
  });

  function featurePage(p: WhatsNewPage): HTMLElement[] {
    const first = index === 0;
    return (
      [
        isIcon(p.icon) ? h('div', { class: 'wn-icon' }, icon(p.icon, 'lg')) : null,
        h('h2', { class: 'wn-title', id: TITLE_ID, 'data-wn': 'title' }, p.title),
        first ? h('p', { class: 'wn-version', 'data-wn': 'version' }, version) : null,
        h('p', { class: 'wn-what', 'data-wn': 'what' }, p.what),
        h('p', { class: 'wn-why', 'data-wn': 'why' }, p.why),
        p.tryIt
          ? h(
              'button',
              {
                type: 'button',
                class: 'wn-try',
                'data-wn': 'try',
                'data-route': p.tryIt,
                'aria-label': `Try it: ${p.title}`,
                onclick: () => {
                  if (p.tryIt) actions.onTryIt(p.tryIt);
                },
              },
              h('span', {}, 'Try it'),
            )
          : null,
      ] as (HTMLElement | null)[]
    ).filter(present);
  }

  function todoPage(): HTMLElement[] {
    return (
      [
        h('div', { class: 'wn-icon' }, icon('check', 'lg')),
        h('h2', { class: 'wn-title', id: TITLE_ID, 'data-wn': 'title' }, 'Added to your to-dos'),
        index === 0 ? h('p', { class: 'wn-version', 'data-wn': 'version' }, version) : null,
        h(
          'ul',
          { class: 'wn-topics', 'data-wn': 'topics' },
          ...props.addedTopics.map((t) =>
            h(
              'li',
              { class: 'wn-topic', 'data-topic': t.id },
              h('span', { class: 'wn-topic-title' }, t.title),
              t.checkpoint ? h('span', { class: 'wn-topic-cp' }, t.checkpoint) : null,
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'wn-open-todos',
            'data-wn': 'open-todos',
            onclick: () => actions.onOpenTodos(),
          },
          'Open to-dos',
        ),
      ] as (HTMLElement | null)[]
    ).filter(present);
  }

  function emptyPage(): HTMLElement[] {
    return [
      h('h2', { class: 'wn-title', id: TITLE_ID, 'data-wn': 'title' }, "What's new"),
      h('p', { class: 'wn-version', 'data-wn': 'version' }, version),
    ];
  }

  function render(dir?: 'next' | 'prev') {
    const p = pages[index];
    const content = isTodoPage() ? todoPage() : p ? featurePage(p) : emptyPage();
    page.replaceChildren(...content);
    pageButtons = content.filter((e) => {
      const role = e.getAttribute('data-wn');
      return role === 'try' || role === 'open-todos';
    });
    page.setAttribute('data-index', String(index));
    page.setAttribute('data-kind', isTodoPage() ? 'todos' : 'feature');
    counter.textContent = pageCount(index, total);
    const title = isTodoPage() ? 'Added to your to-dos' : (p?.title ?? "What's new");
    live.textContent = `Page ${pageCount(index, total)}: ${title}`;
    dots.replaceChildren(
      ...Array.from({ length: total }, (_, i) =>
        h('span', { class: i === index ? 'wn-dot on' : 'wn-dot' }),
      ),
    );
    if (index === 0) backBtn.setAttribute('disabled', '');
    else backBtn.removeAttribute('disabled');
    nextBtn.replaceChildren(h('span', {}, isLast() ? 'Done' : 'Next'));
    if (isLast()) nextBtn.append(icon('check', 'sm'));
    nextBtn.setAttribute('data-last', isLast() ? 'true' : 'false');
    if (dir) {
      stopAnim();
      stopAnim = enterScreen(page, dir);
    }
  }

  function go(to: number, dir: 'next' | 'prev') {
    const clamped = Math.min(Math.max(0, to), total - 1);
    if (clamped === index) return;
    const hadFocus = document.activeElement;
    index = clamped;
    render(dir);
    // Back just got disabled on page 1: keep focus inside the dialog, on Next.
    if (hadFocus === backBtn && index === 0) nextBtn.focus();
  }
  function next() {
    go(index + 1, 'next');
  }
  function back() {
    go(index - 1, 'prev');
  }

  /** Buttons Tab can reach, in order (disabled ones are skipped). */
  const focusable = (): HTMLElement[] =>
    [skipBtn, ...pageButtons, backBtn, nextBtn].filter((b) => !b.hasAttribute('disabled'));

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      actions.onSkip();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      if (!isLast()) next();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      back();
    } else if (ev.key === 'Tab') {
      const list = focusable();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const inside = list.includes(active as HTMLElement);
      if (ev.shiftKey && (active === first || !inside)) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && (active === last || !inside)) {
        ev.preventDefault();
        first.focus();
      }
    }
  }

  // Swipe (M13d task 25): left = Next, right = Back on the page area; a shortcut only, never the
  // only way through (Done stays a tap). The page follows the finger.
  const body = h('div', { class: 'wn-body', 'data-wn': 'body' }, page);
  const unswipe = installPageSwipe(body, {
    mover: page,
    onNext: () => next(),
    onBack: () => back(),
    canNext: () => !isLast(),
    canBack: () => index > 0,
  });

  const el = h(
    'div',
    {
      class: 'wn-tour',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': TITLE_ID,
      'data-tour': 'whats-new',
      onkeydown: onKey as (ev: Event) => void,
    },
    h('header', { class: 'wn-top' }, h('p', { class: 'wn-label' }, "What's new"), counter, skipBtn),
    live,
    body,
    dots,
    h('div', { class: 'wn-nav' }, backBtn, nextBtn),
  );

  render();

  // Focus the main way forward once the tour is in the document.
  queueMicrotask(() => {
    if (el.isConnected) nextBtn.focus();
  });

  return {
    el,
    index: () => index,
    total: () => total,
    next,
    back,
    dispose: () => {
      stopAnim();
      stopAnim = () => {};
      unswipe();
    },
  };
}
