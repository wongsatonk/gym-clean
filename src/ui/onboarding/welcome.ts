// M13 task 12: the first-launch screen (SPEC M13 goal 1). Pure render of ONE step: steps + index
// in, callbacks out. No DB, no permission requests, no routing: app.ts (task 31) keeps the index,
// re-renders on onNext / onBack (passing `dir` for the slide), shows the slice 1b intake screen for
// an `intake` step, asks the system on onAllow, and stores done / skipped (markOnboarding).
//
// Layout (full screen, dark, one page at a time, thumb-reach buttons at the bottom):
//   top:    "2 of 7" and Skip (always visible, every page)
//   page:   welcome — page 1 is the brand lockup (mark, name, tagline) + one line; others are an
//           icon, title and body. permission — permissionPage.ts (icon, title, why, note).
//           units (M13d) — unitsPage.ts (kg | lb, cm | ft·in; taps go to onUnits).
//   dots:   current page is a wide filled pill (shape + size, not colour alone); the "2 of 7"
//           text and a polite live line say it in words.
//   bottom: welcome / mic / allowed pages → [Back][Next] (Go to Today on the last page);
//           ask pages → the action full width, then [Back][Not now].
// Keys are a shortcut only: Escape = Skip, ArrowLeft = Back, ArrowRight = Next where Next exists.
// Motion: a page change is motion.ts enterScreen in the direction of travel, a no-op under
// prefers-reduced-motion (the global rule in styles.css zeroes the press feedback too).
import {
  WELCOME_PAGE_IDS,
  type OnboardingPermission,
  type WelcomePageId,
} from '../../core/onboarding';
import type { OnboardingStep, UnitPrefs } from '../../core/types';
import {
  ONBOARDING_BUTTONS,
  PERMISSION_PAGES,
  UNITS_PAGE,
  WELCOME_PAGES,
} from '../../data/onboarding';
import { forwardContent } from '../backButton';
import { brandLockup } from '../brand';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { enterScreen, type Stop } from '../motion';
import { permissionPage } from './permissionPage';
import { unitsPage } from './unitsPage';
import './onboarding.css';

export type OnboardingProps = {
  /** onboardingSteps(...) for this install. */
  steps: readonly OnboardingStep[];
  /** The step shown now (0-based). */
  index: number;
  /** Permissions already allowed / connected / switched on (their page shows "Allowed"). */
  granted?: Partial<Record<OnboardingPermission, boolean>> | undefined;
  /** Direction of travel: slides the page in. Omit on first show (no motion). */
  dir?: 'next' | 'prev' | undefined;
  /**
   * M13d: the units the Units page shows as chosen (the saved rows, or
   * defaultUnits(deviceLocale()) on a fresh install). Missing → kg + cm.
   */
  units?: UnitPrefs | undefined;
};

export type OnboardingActions = {
  /** Next on a welcome / mic / allowed page (not the last). */
  onNext: () => void;
  onBack: () => void;
  /** Skip (any page) or Escape: the caller stores `skipped` and goes to Today. */
  onSkipAll: () => void;
  /** "Go to Today" on the last page when it has nothing left to ask. */
  onDone: () => void;
  /** The permission page's action button; the caller asks, then moves on (or finishes). */
  onAllow: (permission: OnboardingPermission) => void;
  /** "Not now" on a permission page; the caller moves on (or finishes on the last page). */
  onNotNow: (permission: OnboardingPermission) => void;
  /**
   * M13d: a tap on the Units page (both units as they are now). The caller keeps them and saves
   * both rows when the page is left with Next; Next itself is the usual onNext.
   */
  onUnits?: ((units: UnitPrefs) => void) | undefined;
};

export type OnboardingScreen = {
  el: HTMLElement;
  /** Stops a running page animation. */
  dispose: () => void;
};

/** Decorative icon on the welcome pages after the lockup. */
const WELCOME_ICON: Record<Exclude<WelcomePageId, 'hello'>, IconName> = {
  train: 'dumbbell',
};

const TITLE_ID = 'ob-title';

/** The Units page's choice when the caller passes none. */
const METRIC: UnitPrefs = { weight: 'kg', length: 'cm' };

/** "2 of 7". */
export function stepCount(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

const isWelcomeId = (id: string): id is WelcomePageId =>
  (WELCOME_PAGE_IDS as readonly string[]).includes(id);

function stepKey(step: OnboardingStep | undefined): string {
  if (!step) return 'none';
  if (step.kind === 'welcome') return `welcome:${step.id}`;
  if (step.kind === 'permission') return `permission:${step.permission}`;
  return step.kind; // 'units' (below) | 'intake' | 'fuelSetup' (the caller shows those screens)
}

function stepTitle(step: OnboardingStep | undefined): string {
  if (step?.kind === 'welcome' && isWelcomeId(step.id)) return WELCOME_PAGES[step.id].title;
  if (step?.kind === 'permission') return PERMISSION_PAGES[step.permission].title;
  if (step?.kind === 'units') return UNITS_PAGE.title;
  return '';
}

function welcomeBody(id: WelcomePageId): HTMLElement {
  const copy = WELCOME_PAGES[id];
  if (id === 'hello')
    return h(
      'section',
      { class: 'ob-welcome ob-hello' },
      brandLockup({ size: 'lg', tagline: copy.tagline ?? true, nameTag: 'h2', nameId: TITLE_ID }),
      h('p', { class: 'ob-text', 'data-ob': 'body' }, copy.body),
    );
  return h(
    'section',
    { class: 'ob-welcome' },
    h('div', { class: 'ob-icon' }, icon(WELCOME_ICON[id], 'lg')),
    h('h2', { class: 'ob-title', id: TITLE_ID, 'data-ob': 'title' }, copy.title),
    h('p', { class: 'ob-text', 'data-ob': 'body' }, copy.body),
  );
}

export function onboardingScreen(
  props: OnboardingProps,
  actions: OnboardingActions,
): OnboardingScreen {
  const total = Math.max(1, props.steps.length);
  const index = Math.min(Math.max(0, props.index), total - 1);
  const step = props.steps[index];
  const isLast = index === total - 1;

  // Page content + the buttons it needs.
  let content: HTMLElement;
  let allow: HTMLElement | null = null;
  let notNow: HTMLElement | null = null;
  if (step?.kind === 'permission') {
    const parts = permissionPage(
      {
        permission: step.permission,
        granted: props.granted?.[step.permission],
        titleId: TITLE_ID,
      },
      actions,
    );
    content = parts.body;
    allow = parts.allow;
    notNow = parts.notNow;
  } else if (step?.kind === 'welcome' && isWelcomeId(step.id)) {
    content = welcomeBody(step.id);
  } else if (step?.kind === 'units') {
    content = unitsPage(
      { units: props.units ?? METRIC, titleId: TITLE_ID },
      { onChange: (u) => actions.onUnits?.(u) },
    );
  } else {
    // The intake step is the slice 1b intake screen (the caller shows it); an empty page here.
    content = h('section', { class: 'ob-welcome' }, h('h2', { class: 'sr-only', id: TITLE_ID }));
  }

  const page = h(
    'div',
    { class: 'ob-page', 'data-ob': 'page', 'data-step': stepKey(step), 'data-index': index },
    content,
  );

  const skipBtn = h(
    'button',
    { type: 'button', class: 'ob-skip', 'data-ob': 'skip', onclick: () => actions.onSkipAll() },
    ONBOARDING_BUTTONS.skip,
  );
  const backBtn = h(
    'button',
    {
      type: 'button',
      class: 'ob-back',
      'data-ob': 'back',
      'data-swipe-back': true, // M13d task 24: the edge swipe's Back (disabled on page 1 = none)
      disabled: index === 0,
      onclick: () => actions.onBack(),
    },
    ONBOARDING_BUTTONS.back,
  );
  const forward = isLast ? () => actions.onDone() : () => actions.onNext();
  const nextBtn =
    allow ??
    h(
      'button',
      {
        type: 'button',
        class: 'ob-primary cta-btn',
        'data-ob': 'primary',
        'data-last': isLast ? 'true' : 'false',
        onclick: forward,
      },
      ...(isLast ? [ONBOARDING_BUTTONS.done] : forwardContent(ONBOARDING_BUTTONS.next)),
    );

  const nav = notNow
    ? h(
        'div',
        { class: 'ob-nav ob-nav-ask' },
        nextBtn,
        h('div', { class: 'ob-nav-row' }, backBtn, notNow),
      )
    : h('div', { class: 'ob-nav' }, h('div', { class: 'ob-nav-row' }, backBtn, nextBtn));

  const dots = h(
    'div',
    { class: 'ob-dots', 'aria-hidden': 'true', 'data-ob': 'dots' },
    ...Array.from({ length: total }, (_, i) =>
      h('span', { class: i === index ? 'ob-dot on' : 'ob-dot' }),
    ),
  );

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      actions.onSkipAll();
    } else if (ev.key === 'ArrowLeft' && index > 0) {
      ev.preventDefault();
      actions.onBack();
    } else if (ev.key === 'ArrowRight' && !allow && !isLast) {
      ev.preventDefault();
      actions.onNext();
    }
  }

  const el = h(
    'div',
    {
      class: 'ob-screen',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': TITLE_ID,
      'data-screen': 'welcome',
      onkeydown: onKey as (ev: Event) => void,
    },
    h(
      'header',
      { class: 'ob-top' },
      h('p', { class: 'ob-count', 'data-ob': 'count' }, stepCount(index, total)),
      skipBtn,
    ),
    h(
      'p',
      { class: 'sr-only', 'aria-live': 'polite', 'data-ob': 'live' },
      `Page ${stepCount(index, total)}: ${stepTitle(step)}`,
    ),
    h('div', { class: 'ob-body' }, page),
    dots,
    nav,
  );

  let stop: Stop = () => {};
  if (props.dir) stop = enterScreen(page, props.dir);

  // Focus the main way forward once the screen is in the document.
  queueMicrotask(() => {
    if (el.isConnected) nextBtn.focus();
  });

  return {
    el,
    dispose: () => {
      stop();
      stop = () => {};
    },
  };
}
