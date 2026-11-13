// App controller: owns the session state, renders screens, runs side effects
// (voice, wake lock, IndexedDB). All workout rules live in src/core/.
import { formatDuration, formatKg, formatRest } from '../core/format';
import { restCueText, restCuesBetween } from '../core/restCues';
import {
  currentPlanned,
  next,
  restElapsedMs,
  startSession,
  summarize,
  type SessionEvent,
  type SessionState,
} from '../core/session';
import type { ProgramDay } from '../core/types';
import { cueFor, exerciseName, program } from '../data/catalog';
import { GymDb, finishSession, saveSet, startSessionRow } from '../data/db';
import { h } from './dom';
import { voice } from './voice';
import { wakeLock } from './wakeLock';

export const WEIGHT_STEP_KG = 2.5;
const TICK_MS = 250;
const END_CONFIRM_MS = 3000;

type View =
  { screen: 'today'; upNextDayId: string | null } | { screen: 'session'; s: SessionState };

export function mountApp(root: HTMLElement): void {
  const db = new GymDb();
  let view: View = { screen: 'today', upNextDayId: null };
  let lastCueElapsedMs = 0;
  let ticker: number | undefined;

  const now = () => Date.now();

  function render(): void {
    root.replaceChildren(
      view.screen === 'today' ? todayScreen(view.upNextDayId) : sessionScreen(view.s),
    );
  }

  // ---------- Today ----------

  async function loadUpNext(): Promise<void> {
    try {
      const last = await db.sessions.orderBy('startedAt').last();
      const idx = last ? program.days.findIndex((d) => d.id === last.dayId) : -1;
      const upNext = program.days[(idx + 1) % program.days.length]?.id ?? null;
      if (view.screen === 'today') {
        view = { screen: 'today', upNextDayId: upNext };
        render();
      }
    } catch (err) {
      console.warn('Could not read history', err);
    }
  }

  function todayScreen(upNextDayId: string | null): HTMLElement {
    return h(
      'main',
      { class: 'screen today' },
      h('h1', { class: 'app-title' }, 'Gym Clean'),
      h('p', { class: 'muted' }, 'Pick today’s workout'),
      h(
        'div',
        { class: 'day-list' },
        ...program.days.map((day) => {
          const sets = day.exercises.reduce((n, e) => n + e.sets, 0);
          const upNext = day.id === upNextDayId;
          return h(
            'button',
            {
              class: `day-btn${upNext ? ' up-next' : ''}`,
              'data-day': day.id,
              onclick: () => startDay(day),
            },
            h('span', { class: 'day-name' }, day.name),
            h('span', { class: 'day-meta' }, `${day.exercises.length} exercises · ${sets} sets`),
            upNext ? h('span', { class: 'badge' }, 'Up next') : null,
          );
        }),
      ),
    );
  }

  function startDay(day: ProgramDay): void {
    voice.unlock(); // must happen inside the tap
    const t = now();
    const s = startSession(day, crypto.randomUUID(), t);
    view = { screen: 'session', s };
    lastCueElapsedMs = 0;
    void wakeLock.hold();
    void startSessionRow(db, { sessionId: s.sessionId, dayId: day.id, startedAt: t }).catch(
      logDbError,
    );
    startTicker();
    render();
  }

  // ---------- Session ----------

  function dispatch(e: SessionEvent): void {
    if (view.screen !== 'session') return;
    const prev = view.s;
    const s = next(prev, e);
    if (s === prev) return;
    view = { screen: 'session', s };

    for (const log of s.logs.slice(prev.logs.length)) void saveSet(db, log).catch(logDbError);
    if (prev.phase !== 'rest' && s.phase === 'rest') lastCueElapsedMs = 0;
    if (s.phase === 'summary') onFinished(s);
    render();
  }

  function onFinished(s: SessionState): void {
    stopTicker();
    void wakeLock.release();
    const { setsDone, totalVolumeKg, restOverruns } = summarize(s);
    void finishSession(db, s.sessionId, s.endedAt ?? now(), {
      setsDone,
      totalVolumeKg,
      restOverruns,
    }).catch(logDbError);
  }

  function startTicker(): void {
    stopTicker();
    ticker = window.setInterval(tick, TICK_MS);
  }

  function stopTicker(): void {
    if (ticker !== undefined) window.clearInterval(ticker);
    ticker = undefined;
  }

  function tick(): void {
    if (view.screen !== 'session') return;
    const s = view.s;
    if (s.phase !== 'rest' || s.paused) return;
    const elapsed = restElapsedMs(s, now());
    const cues = restCuesBetween(s.restTargetSec, lastCueElapsedMs, elapsed);
    lastCueElapsedMs = elapsed;
    // If the tab was throttled and several cues piled up, only the latest is still relevant.
    const cue = cues.at(-1);
    if (cue) voice.speak(restCueText(cue.kind, upcoming(s)));
    updateRestClock(s, elapsed);
  }

  function upcoming(s: SessionState) {
    return { name: exerciseName(currentPlanned(s).exerciseId), setNumber: s.setIndex + 1 };
  }

  function updateRestClock(s: SessionState, elapsed: number): void {
    const el = root.querySelector<HTMLElement>('[data-rest-clock]');
    if (!el) return;
    const remaining = s.restTargetSec * 1000 - elapsed;
    el.textContent = formatRest(remaining);
    el.classList.toggle('overtime', remaining < 0);
  }

  function sessionScreen(s: SessionState): HTMLElement {
    if (s.phase === 'summary') return summaryScreen(s);
    const body = s.phase === 'rest' ? restScreen(s) : exerciseScreen(s);
    return s.paused ? h('div', { class: 'stack' }, body, pausedOverlay()) : body;
  }

  function topBar(s: SessionState): HTMLElement {
    return h(
      'header',
      { class: 'top-bar' },
      h('span', { class: 'muted' }, `${s.day.name} · ${s.exIndex + 1}/${s.day.exercises.length}`),
      h(
        'button',
        { class: 'ghost-btn', onclick: () => dispatch({ type: 'PAUSE', now: now() }) },
        'Pause',
      ),
    );
  }

  function footer(): HTMLElement {
    return h(
      'footer',
      { class: 'footer-row' },
      h(
        'button',
        { class: 'ghost-btn', onclick: () => dispatch({ type: 'SKIP_EXERCISE', now: now() }) },
        'Skip exercise',
      ),
      endButton(),
    );
  }

  function endButton(): HTMLElement {
    const btn = h('button', { class: 'ghost-btn danger' }, 'End workout');
    let timer: number | undefined;
    btn.addEventListener('click', () => {
      if (btn.dataset.armed) {
        window.clearTimeout(timer);
        dispatch({ type: 'FINISH', now: now() });
        return;
      }
      btn.dataset.armed = 'true';
      btn.textContent = 'Tap again to end';
      timer = window.setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = 'End workout';
      }, END_CONFIRM_MS);
    });
    return btn;
  }

  function stepper(
    label: string,
    value: string,
    field: 'reps' | 'weight',
    step: number,
  ): HTMLElement {
    return h(
      'div',
      { class: 'stepper', 'data-stepper': field },
      h('span', { class: 'stepper-label' }, label),
      h(
        'button',
        {
          class: 'step-btn',
          'aria-label': `${label} minus`,
          onclick: () => dispatch({ type: 'ADJUST', field, delta: -step }),
        },
        '−',
      ),
      h('output', { class: 'stepper-value', 'aria-label': label }, value),
      h(
        'button',
        {
          class: 'step-btn',
          'aria-label': `${label} plus`,
          onclick: () => dispatch({ type: 'ADJUST', field, delta: step }),
        },
        '+',
      ),
    );
  }

  function exerciseScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    const [min, max] = p.targetReps;
    return h(
      'main',
      { class: 'screen exercise', 'data-screen': 'exercise' },
      topBar(s),
      h('h1', { class: 'exercise-name' }, exerciseName(p.exerciseId)),
      h(
        'p',
        { class: 'set-counter', 'data-set-counter': true },
        `Set ${s.setIndex + 1} of ${p.sets}`,
      ),
      h('p', { class: 'muted' }, `Target ${min === max ? min : `${min}–${max}`} reps`),
      h('p', { class: 'focus-cue' }, cueFor(p.exerciseId)),
      stepper('Reps', String(s.reps), 'reps', 1),
      stepper('kg', formatKg(s.weightKg), 'weight', WEIGHT_STEP_KG),
      h(
        'button',
        { class: 'primary-btn', onclick: () => dispatch({ type: 'SET_DONE', now: now() }) },
        'Set done',
      ),
      footer(),
    );
  }

  function restScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    const remaining = s.restTargetSec * 1000 - restElapsedMs(s, now());
    return h(
      'main',
      { class: 'screen rest', 'data-screen': 'rest' },
      topBar(s),
      h('p', { class: 'muted rest-label' }, 'Rest'),
      h(
        'p',
        {
          class: `rest-clock${remaining < 0 ? ' overtime' : ''}`,
          role: 'timer',
          'data-rest-clock': true,
        },
        formatRest(remaining),
      ),
      h(
        'p',
        { class: 'next-up' },
        'Next: ',
        h('strong', {}, exerciseName(p.exerciseId)),
        ' — ',
        h('span', { class: 'nowrap' }, `set ${s.setIndex + 1} of ${p.sets}`),
        h('br'),
        h('span', { class: 'muted' }, `${s.reps} reps × ${formatKg(s.weightKg)} kg`),
      ),
      h(
        'button',
        { class: 'primary-btn', onclick: () => dispatch({ type: 'START_SET', now: now() }) },
        'Start set',
      ),
      footer(),
    );
  }

  function pausedOverlay(): HTMLElement {
    return h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-label': 'Paused' },
      h('p', { class: 'overlay-title' }, 'Paused'),
      h(
        'button',
        { class: 'primary-btn', onclick: () => dispatch({ type: 'RESUME', now: now() }) },
        'Resume',
      ),
      endButton(),
    );
  }

  function summaryScreen(s: SessionState): HTMLElement {
    const sum = summarize(s);
    const byExercise = new Map<string, string[]>();
    for (const l of s.logs) {
      const list = byExercise.get(l.exerciseId) ?? [];
      list.push(`${l.reps}×${formatKg(l.weightKg)}`);
      byExercise.set(l.exerciseId, list);
    }
    const stat = (label: string, value: string, key: string) =>
      h(
        'div',
        { class: 'stat', 'data-stat': key },
        h('span', { class: 'stat-value' }, value),
        h('span', { class: 'muted' }, label),
      );
    return h(
      'main',
      { class: 'screen summary', 'data-screen': 'summary' },
      h('h1', { class: 'summary-title' }, 'Workout done'),
      h('p', { class: 'muted' }, `${s.day.name} · ${formatDuration(sum.durationSec)}`),
      h(
        'div',
        { class: 'stats' },
        stat('sets', String(sum.setsDone), 'sets'),
        stat('kg volume', formatKg(sum.totalVolumeKg), 'volume'),
        stat('rest overruns', String(sum.restOverruns), 'overruns'),
      ),
      h(
        'ul',
        { class: 'set-list' },
        ...[...byExercise].map(([id, sets]) =>
          h(
            'li',
            {},
            h('strong', {}, exerciseName(id)),
            h(
              'span',
              { class: 'muted' },
              sets.join(', ') + (sum.skipped.includes(id) ? ' · rest skipped' : ''),
            ),
          ),
        ),
        ...sum.skipped
          .filter((id) => !byExercise.has(id))
          .map((id) =>
            h(
              'li',
              { class: 'skipped' },
              h('strong', {}, exerciseName(id)),
              h('span', { class: 'muted' }, 'skipped'),
            ),
          ),
      ),
      h(
        'button',
        {
          class: 'primary-btn',
          onclick: () => {
            view = { screen: 'today', upNextDayId: null };
            render();
            void loadUpNext();
          },
        },
        'Done',
      ),
    );
  }

  function logDbError(err: unknown): void {
    console.error('Saving to IndexedDB failed', err);
  }

  render();
  void loadUpNext();
}
