// M12 slice 1c task 12: the glue between the to-do / What's New data (src/data/todos,
// src/data/whatsNew), the pure rules (src/core/todo) and the screens (src/ui/todo), kept out of
// app.ts (which owns routing and where the tour overlay sits).
//
// - Facts are gathered on app open, on foreground and on entering To-dos (`refresh`):
//   gatherFacts → pendingAutoTicks → recordAutoTicks. Auto ticks stick once stored.
// - The iPhone app notes the build id (`__APP_VERSION__`) at launch for the 7-day re-sign clock.
// - Ask answers save on each tap (`saveAnswer`); a decision step then writes its mapped setting
//   (`applyDecision`). Skip this topic stores a skip row.
// - Copy report: `buildReport` → the preview sheet → on a confirmed copy `markSent`. With nothing
//   new the sheet offers Copy all again (`all: true`).
// - The tour: `pendingTour` applies the fresh-install rule (marks the release seen without
//   showing) and returns the unseen pages; every way out of the tour marks the release seen.
// Privacy: nothing here touches the network or the developer log. The report only reaches the
// clipboard on his tap.
import {
  pendingAutoTicks,
  resignReminder,
  todoSummary,
  topicStatus,
} from '../../core/todo/progress';
import { runDetector } from '../../core/todo/detectors';
import { buildReport } from '../../core/todo/report';
import { addedTopics, replayPages, tourReleases, tourToShow } from '../../core/todo/whatsNew';
import type {
  AppRoute,
  DetectorResult,
  TodoAnswer,
  TodoFacts,
  TodoTopic,
  WhatsNewPage,
} from '../../core/types';
import { APP_BUILD, APP_RELEASE } from '../../core/version';
import type { GymDb } from '../../data/db';
import { gatherFacts } from '../../data/todos/facts';
import {
  applyDecision,
  getWhatsNew,
  listAnswers,
  markSeen,
  markSent,
  noteBuildSeen,
  recordAutoTicks,
  saveAnswer,
  skipTopic,
} from '../../data/todos/store';
import { topicsForRelease } from '../../data/todos/topics';
import { WHATS_NEW_PAGES } from '../../data/whatsNew/pages';
import { reportSheet } from './reportSheet';
import type { TodoCardProps } from './todoCard';
import { todoGuideScreen } from './todoGuide';
import { todoListScreen } from './todoList';
import { whatsNewTour, type WhatsNewTour } from './whatsNewTour';

export type TodoHostDeps = {
  db: GymDb;
  now: () => number;
  platform: 'web' | 'native';
  /** Re-render the screen shown now (the host never decides which screen that is). */
  onChange: () => void;
  logError: (err: unknown) => void;
  /** Per-build id for the re-sign clock (default `__APP_VERSION__`). */
  buildId?: string | undefined;
  /** Defaults: package.json version / short sha from the build. */
  release?: string | undefined;
  build?: string | undefined;
  topics?: readonly TodoTopic[] | undefined;
  pages?: readonly WhatsNewPage[] | undefined;
  /** Where the ready signal goes (default: `<html>`'s data attributes, see `ReadySignal`). */
  signal?: ((s: ReadySignal) => void) | undefined;
};

/**
 * Settled points for tests (e2e waits on these before asserting that something is absent):
 * `refreshes` facts refreshes finished, `tourChecks` tour checks finished (app.ts calls
 * `tourChecked`), `ready` once both have happened at least once since the app opened.
 */
export type ReadySignal = { refreshes: number; tourChecks: number; ready: boolean };

/** Default signal: `data-todo-refreshes`, `data-tour-checks` and `data-todo-ready` on `<html>`. */
function stampHtml(s: ReadySignal): void {
  const root = typeof document === 'undefined' ? null : document.documentElement;
  if (!root) return;
  root.setAttribute('data-todo-refreshes', String(s.refreshes));
  root.setAttribute('data-tour-checks', String(s.tourChecks));
  if (s.ready) root.setAttribute('data-todo-ready', '');
}

export type GuideNav = {
  onTryIt: (route: AppRoute) => void;
  onStep: (index: number) => void;
  onClose: () => void;
};

export type ListNav = {
  onBack: () => void;
  onOpenTopic: (topicId: string, stepIndex: number) => void;
};

export type TourNav = {
  onTryIt: (route: AppRoute) => void;
  onOpenTodos: () => void;
  /** The tour was closed (any way out); the caller removes `el`. */
  onClosed: () => void;
};

type ReportState = { text: string; answerIds: string[]; nothingNew: boolean };

/** True only inside the Capacitor native app (no Capacitor import needed to ask). */
export function nativeShell(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function createTodoHost(deps: TodoHostDeps) {
  const { db, now, platform } = deps;
  const release = deps.release ?? APP_RELEASE;
  const build = deps.build ?? APP_BUILD;
  const buildId = deps.buildId ?? __APP_VERSION__;
  const topics = deps.topics ?? topicsForRelease(release);
  const pages = deps.pages ?? WHATS_NEW_PAGES;

  let answers: TodoAnswer[] = [];
  let facts: TodoFacts | null = null;
  let report: ReportState | null = null;
  let refreshing: Promise<void> | null = null;
  let again = false;
  /** The guide step on screen (its own taps are painted by the guide, not re-rendered). */
  let shown: { topicId: string; stepId: string } | null = null;
  /** A caller of the refresh in flight wants the screen re-rendered after it. */
  let loud = false;
  const settled: ReadySignal = { refreshes: 0, tourChecks: 0, ready: false };
  const signal = deps.signal ?? stampHtml;
  function bump(key: 'refreshes' | 'tourChecks'): void {
    settled[key] += 1;
    settled.ready = settled.refreshes > 0 && settled.tourChecks > 0;
    signal({ ...settled });
  }

  const topicOf = (id: string) => topics.find((t) => t.id === id);
  const statusOf = (t: TodoTopic) => (facts ? topicStatus(t, answers, facts) : undefined);

  async function reloadAnswers(): Promise<void> {
    answers = await listAnswers(db);
  }

  async function refreshOnce(): Promise<void> {
    const f = await gatherFacts(db, platform, now(), platform === 'native' ? { buildId } : {});
    const stored = await listAnswers(db);
    const ticks = pendingAutoTicks(topics, stored, f);
    if (ticks.length) await recordAutoTicks(db, ticks, now(), release);
    facts = f;
    answers = ticks.length ? await listAnswers(db) : stored;
  }

  /**
   * Facts + auto ticks; calls never overlap (one asked for meanwhile runs once more after).
   * `quiet`: no re-render after it (an answer saved from the guide, which paints its own taps; a
   * re-render there would rebuild the note box he may be typing in).
   */
  function refresh(opts: { quiet?: boolean } = {}): Promise<void> {
    if (!opts.quiet) loud = true;
    if (refreshing) {
      again = true;
      return refreshing;
    }
    refreshing = (async () => {
      try {
        do {
          again = false;
          await refreshOnce();
        } while (again);
      } catch (err) {
        deps.logError(err);
      } finally {
        refreshing = null;
      }
      if (loud) {
        loud = false;
        deps.onChange();
      }
      bump('refreshes');
    })();
    return refreshing;
  }

  /** App launch: the iPhone app notes this build (re-sign clock), then facts + ticks. */
  async function start(): Promise<void> {
    if (platform === 'native') {
      try {
        await noteBuildSeen(db, buildId, now());
      } catch (err) {
        deps.logError(err);
      }
    }
    await refresh();
  }

  /** The Today card's props (null until facts are in, or when everything is done). */
  function cardProps(): TodoCardProps | null {
    if (!facts) return null;
    const summary = todoSummary(topics, answers, facts);
    const next = topics.find((t) => {
      if (t.platform === 'native' && platform !== 'native') return false;
      const s = topicStatus(t, answers, facts as TodoFacts);
      return !s.done && !s.skipped;
    });
    return {
      ...summary,
      nextTitle: next?.title ?? null,
      resignDaysLeft: platform === 'native' ? resignReminder(topics, facts) : null,
    };
  }

  /** Where a topic's guide opens: its first step not done yet. */
  function firstStep(topicId: string): number {
    const t = topicOf(topicId);
    const next = t ? statusOf(t)?.nextStepId : undefined;
    const i = t && next ? t.steps.findIndex((s) => s.id === next) : 0;
    return Math.max(0, i);
  }

  function results(t: TodoTopic): Record<string, DetectorResult> {
    const out: Record<string, DetectorResult> = {};
    if (!facts) return out;
    for (const s of t.steps) if (s.kind === 'auto') out[s.id] = runDetector(s, facts);
    return out;
  }

  // ---------- report ----------

  function makeReport(all: boolean): ReportState | null {
    if (!facts) return null;
    const r = buildReport({ topics, answers, facts, release, build, platform, now: now(), all });
    return { text: r.text, answerIds: r.answerIds, nothingNew: !all && r.answerIds.length === 0 };
  }

  async function openReport(): Promise<void> {
    await refresh();
    report = makeReport(false);
    deps.onChange();
  }

  function reportEl(): HTMLElement | null {
    if (!report) return null;
    const shown = report;
    return reportSheet(
      { text: shown.text, nothingNew: shown.nothingNew },
      {
        onClose: () => {
          report = null;
          deps.onChange();
        },
        onCopied: () => {
          // The sheet shows "Copied." itself: only the stored state changes here (no re-render,
          // which would rebuild the sheet).
          void markSent(db, shown.answerIds, now()).then(reloadAnswers).catch(deps.logError);
        },
        onCopyAll: () => {
          report = makeReport(true);
          deps.onChange();
        },
      },
    );
  }

  // ---------- screens ----------

  function listScreen(nav: ListNav): HTMLElement {
    shown = null;
    const status: Record<string, NonNullable<ReturnType<typeof statusOf>>> = {};
    for (const t of topics) {
      const s = statusOf(t);
      if (s) status[t.id] = s;
    }
    const summary = facts ? todoSummary(topics, answers, facts) : { done: 0, total: 0 };
    const el = todoListScreen(
      { topics, status, platform, summary },
      {
        onBack: () => {
          report = null;
          nav.onBack();
        },
        onOpenTopic: (id) => nav.onOpenTopic(id, firstStep(id)),
        onCopyReport: () => void openReport(),
      },
    );
    const sheet = reportEl();
    if (sheet) el.append(sheet);
    return el;
  }

  function guideScreen(topicId: string, stepIndex: number, nav: GuideNav): HTMLElement | null {
    const topic = topicOf(topicId);
    if (!topic) return null;
    const status = statusOf(topic) ?? {
      done: false,
      skipped: false,
      stepsDone: 0,
      steps: topic.steps.length,
    };
    const mine = answers.filter((a) => a.topicId === topic.id);
    const at = topic.steps[Math.max(0, Math.min(stepIndex, topic.steps.length - 1))];
    shown = at ? { topicId: topic.id, stepId: at.id } : null;
    return todoGuideScreen(
      { topic, status, stepIndex, answers: mine, results: results(topic), platform },
      {
        onAnswer: (stepId, optionIds, note) => void answer(topic, stepId, optionIds, note),
        onTryIt: (route) => nav.onTryIt(route),
        onSkipTopic: () => {
          void skipTopic(db, topic.id, now(), release)
            .then(() => refresh())
            .catch(deps.logError);
        },
        onBack: () => nav.onStep(Math.max(0, stepIndex - 1)),
        onNext: () => nav.onStep(Math.min(topic.steps.length - 1, stepIndex + 1)),
        onClose: () => nav.onClose(),
      },
    );
  }

  async function answer(
    topic: TodoTopic,
    stepId: string,
    optionIds: string[],
    note: string | undefined,
  ): Promise<void> {
    const step = topic.steps.find((s) => s.id === stepId);
    if (!step || step.kind !== 'ask') return;
    const blank = optionIds.length === 0 && (note ?? '').trim() === '';
    const had = answers.some(
      (a) => a.topicId === topic.id && a.stepId === stepId && a.kind === 'ask',
    );
    if (blank && !had) return; // nothing to keep (e.g. a note box left empty)
    try {
      const input = {
        topicId: topic.id,
        stepId,
        optionIds,
        ...(note !== undefined ? { note } : {}),
      };
      await saveAnswer(db, input, now(), release);
      const chosen = optionIds[0];
      if (step.setting && optionIds.length === 1 && chosen !== undefined)
        await applyDecision(db, step, chosen);
      // A decision can change facts (e.g. the paid account stops the re-sign reminder).
      if (step.setting) await refresh({ quiet: true });
      else await reloadAnswers();
      // The guide already shows the tap on this step: re-rendering it would rebuild the note box
      // he may be typing in. Anywhere else (he moved on before the save ended), show it.
      if (shown?.topicId !== topic.id || shown.stepId !== stepId) deps.onChange();
    } catch (err) {
      deps.logError(err);
    }
  }

  // ---------- What's New ----------

  /**
   * The tour to show now ([] = none). A fresh install (no session, no 'whatsNew' row) is marked
   * seen without showing anything.
   */
  async function pendingTour(): Promise<WhatsNewPage[]> {
    try {
      const [state, sessions] = await Promise.all([getWhatsNew(db), db.sessions.count()]);
      const r = tourToShow(pages, state, release, sessions > 0);
      if (!Array.isArray(r)) {
        await markSeen(db, release);
        return [];
      }
      return r;
    } catch (err) {
      deps.logError(err);
      return [];
    }
  }

  /** Settings → What's new: the running release's pages (or the latest release that has some). */
  function replay(): WhatsNewPage[] {
    return replayPages(pages, release);
  }

  /** The tour for `shown`; every way out marks this release seen and calls `nav.onClosed`. */
  function createTour(shown: readonly WhatsNewPage[], nav: TourNav): WhatsNewTour {
    const added = addedTopics(topics, tourReleases(shown)).map((t) => ({
      id: t.id,
      title: t.title,
      checkpoint: t.checkpoint,
    }));
    let closed = false;
    const close = (then?: () => void) => {
      if (closed) return;
      closed = true;
      tour.dispose();
      nav.onClosed();
      void markSeen(db, release).catch(deps.logError);
      then?.();
    };
    const tour = whatsNewTour(
      { pages: shown, addedTopics: added },
      {
        onSkip: () => close(),
        onDone: () => close(),
        onTryIt: (route) => close(() => nav.onTryIt(route)),
        onOpenTodos: () => close(() => nav.onOpenTodos()),
      },
    );
    return tour;
  }

  return {
    start,
    refresh,
    cardProps,
    firstStep,
    listScreen,
    guideScreen,
    pendingTour,
    replay,
    createTour,
    /** The app finished a tour check (shown or not): moves the ready signal on. */
    tourChecked: () => bump('tourChecks'),
    /** Drops an open report preview (leaving To-dos). */
    closeReport: () => {
      report = null;
    },
  };
}

export type TodoHost = ReturnType<typeof createTodoHost>;
