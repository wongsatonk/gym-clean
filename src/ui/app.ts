// App controller: owns the session state, renders screens, runs side effects
// (voice, wake lock, IndexedDB). All workout rules live in src/core/.
import { formatDuration, formatRest } from '../core/format';
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
import type { PlannedExercise, ProgramDay, SetLog } from '../core/types';
import { formatWeight, snapToStep, stepFor, type Unit } from '../core/units';
import { shouldSpeakFocusCue } from '../core/focusCue';
import { cueFor, exerciseById, exerciseName, program } from '../data/catalog';
import {
  GymDb,
  finishSession,
  getExerciseNote,
  getUnit,
  lastSessionSets,
  lastWeights,
  saveExerciseNote,
  saveSessionNote,
  saveSet,
  setUnit,
  startSessionRow,
  type ExerciseNoteRow,
  type SetRow,
} from '../data/db';
import { bodyMapSvg, pickView } from './bodyMap';
import type { Body3D } from './body3d/viewer';
import { createCameraView, type CameraView } from './cameraView';
import { h } from './dom';
import { voice } from './voice';
import { wakeLock } from './wakeLock';

const TICK_MS = 250;
const END_CONFIRM_MS = 3000;

type Sheet =
  | null
  | { kind: 'list' }
  | { kind: 'notes'; exerciseId: string }
  | { kind: 'body'; exerciseId: string };

type View =
  | { screen: 'today'; upNextDayId: string | null }
  | { screen: 'settings' }
  | { screen: 'preview'; day: ProgramDay; loading: boolean }
  | { screen: 'session'; s: SessionState; sheet: Sheet };

export function mountApp(root: HTMLElement): void {
  const db = new GymDb();
  let view: View = { screen: 'today', upNextDayId: null };
  let unit: Unit = 'kg';
  let lastCueElapsedMs = 0;
  let ticker: number | undefined;

  // Per-day caches, loaded on the preview screen and kept for the session.
  let lastTime: Record<string, SetRow[]> = {};
  let exerciseNotes: Record<string, ExerciseNoteRow> = {};
  let todayNotes: Record<string, string> = {};

  const now = () => Date.now();
  const w = (kg: number) => formatWeight(kg, unit);
  const setsText = (sets: Pick<SetLog, 'reps' | 'weightKg'>[]) =>
    sets.length ? `${sets.map((l) => `${l.reps}×${w(l.weightKg)}`).join(', ')} ${unit}` : '';
  const repsRange = (p: PlannedExercise) =>
    p.targetReps[0] === p.targetReps[1]
      ? `${p.targetReps[0]}`
      : `${p.targetReps[0]}–${p.targetReps[1]}`;
  const noteFor = (id: string): ExerciseNoteRow =>
    exerciseNotes[id] ?? { exerciseId: id, machineSetting: '', note: '' };

  // ---------- 3D body (lazy, one WebGL context for the whole app) ----------

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let body3d: Body3D | null = null;
  let body3dState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

  function ensureBody3d(): void {
    if (body3dState !== 'idle') return;
    body3dState = 'loading';
    import('./body3d/viewer')
      .then((m) => {
        if (!m.webglAvailable()) {
          body3dState = 'failed';
          return;
        }
        body3d = m.createBody3D({ reducedMotion });
        body3dState = 'ready';
        placeBody3d();
      })
      .catch((err: unknown) => {
        body3dState = 'failed';
        console.warn('3D body unavailable, using the 2D map', err);
      });
  }

  const musclesOf = (exerciseId: string) => {
    const ex = exerciseById(exerciseId);
    return { primary: ex?.primaryMuscles ?? [], secondary: ex?.secondaryMuscles ?? [] };
  };

  /** Slot showing the 2D map until the 3D body is ready; the 3D canvas is moved into it. */
  function muscleSlot(exerciseId: string, variant: 'inline' | 'rest' | 'full'): HTMLElement {
    const { primary, secondary } = musclesOf(exerciseId);
    const slot = h('div', {
      class: `muscle-slot ${variant}`,
      'data-muscle-slot': exerciseId,
      'data-interactive': variant === 'full' ? 'true' : 'false',
    });
    slot.innerHTML = bodyMapSvg({ view: pickView(primary), primary, secondary });
    if (variant === 'full') return slot;
    return h(
      'button',
      {
        class: 'muscle-btn',
        'aria-label': 'Show target muscles in 3D',
        onclick: () => setSheet({ kind: 'body', exerciseId }),
      },
      slot,
    );
  }

  function placeBody3d(): void {
    if (!body3d) return;
    const slot =
      root.querySelector<HTMLElement>('.sheet [data-muscle-slot]') ??
      root.querySelector<HTMLElement>('[data-muscle-slot]');
    if (!slot) {
      body3d.el.remove();
      return;
    }
    const { primary, secondary } = musclesOf(slot.dataset.muscleSlot ?? '');
    slot.classList.add('has-3d');
    slot.append(body3d.el);
    body3d.setInteractive(slot.dataset.interactive === 'true');
    body3d.setMuscles(primary, secondary);
  }

  // ---------- Camera (M3) ----------

  let camera: CameraView | null = null;

  function openCameraView(title: string): void {
    if (camera) return;
    camera = createCameraView({ title, onClose: closeCameraView });
    root.append(camera.el);
    void camera.start();
  }

  function closeCameraView(): void {
    camera?.stop();
    camera = null;
    render();
  }

  function render(): void {
    root.replaceChildren(screenFor(view));
    if (camera) root.append(camera.el);
    if (view.screen === 'session') {
      ensureBody3d();
      placeBody3d();
    }
  }

  function screenFor(v: View): HTMLElement {
    switch (v.screen) {
      case 'today':
        return todayScreen(v.upNextDayId);
      case 'settings':
        return settingsScreen();
      case 'preview':
        return previewScreen(v.day, v.loading);
      case 'session':
        return sessionScreen(v.s, v.sheet);
    }
  }

  function goToday(): void {
    view = { screen: 'today', upNextDayId: null };
    render();
    void loadUpNext();
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
      h(
        'header',
        { class: 'top-bar end' },
        h(
          'button',
          {
            class: 'ghost-btn',
            onclick: () => {
              view = { screen: 'settings' };
              render();
            },
          },
          'Settings',
        ),
      ),
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
              onclick: () => void openPreview(day),
            },
            h('span', { class: 'day-name' }, day.name),
            h('span', { class: 'day-meta' }, `${day.exercises.length} exercises · ${sets} sets`),
            upNext ? h('span', { class: 'badge' }, 'Up next') : null,
          );
        }),
      ),
    );
  }

  // ---------- Settings ----------

  function settingsScreen(): HTMLElement {
    const unitBtn = (u: Unit, label: string) =>
      h(
        'button',
        {
          class: `seg-btn${unit === u ? ' active' : ''}`,
          'aria-pressed': unit === u ? 'true' : 'false',
          onclick: () => {
            unit = u;
            void setUnit(db, u).catch(logDbError);
            render();
          },
        },
        label,
      );
    return h(
      'main',
      { class: 'screen settings' },
      h(
        'header',
        { class: 'top-bar' },
        h('button', { class: 'ghost-btn', onclick: goToday }, '‹ Back'),
      ),
      h('h1', { class: 'page-title' }, 'Settings'),
      h('p', { class: 'field-label' }, 'Camera'),
      h(
        'button',
        { class: 'ghost-btn wide-btn', onclick: () => openCameraView('Camera test') },
        'Camera test',
      ),
      h('p', { class: 'field-label' }, 'Weight unit'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Weight unit' },
        unitBtn('kg', 'kg'),
        unitBtn('lb', 'lb'),
      ),
      h(
        'p',
        { class: 'muted' },
        unit === 'kg'
          ? 'Weights step by 2.5 kg.'
          : 'Weights step by 5 lb. Saved weights are converted, nothing is lost if you switch back.',
      ),
    );
  }

  // ---------- Day preview ----------

  async function openPreview(day: ProgramDay): Promise<void> {
    view = { screen: 'preview', day, loading: true };
    render();
    const ids = day.exercises.map((e) => e.exerciseId);
    try {
      const [last, notes] = await Promise.all([
        lastSessionSets(db, ids),
        Promise.all(ids.map((id) => getExerciseNote(db, id))),
      ]);
      lastTime = last;
      exerciseNotes = Object.fromEntries(notes.map((n) => [n.exerciseId, n]));
    } catch (err) {
      logDbError(err);
      lastTime = {};
      exerciseNotes = {};
    }
    if (view.screen === 'preview' && view.day === day) {
      view = { screen: 'preview', day, loading: false };
      render();
    }
  }

  function defaultWeightKg(p: PlannedExercise): number {
    return lastTime[p.exerciseId]?.at(-1)?.weightKg ?? snapToStep(p.startWeightKg ?? 0, unit);
  }

  function previewScreen(day: ProgramDay, loading: boolean): HTMLElement {
    return h(
      'main',
      { class: 'screen preview', 'data-screen': 'preview' },
      h(
        'header',
        { class: 'top-bar' },
        h('button', { class: 'ghost-btn', onclick: goToday }, '‹ Back'),
      ),
      h('h1', { class: 'page-title' }, day.name),
      h(
        'ol',
        { class: 'ex-list' },
        ...day.exercises.map((p) => {
          const note = noteFor(p.exerciseId);
          const last = setsText(lastTime[p.exerciseId] ?? []);
          return h(
            'li',
            { class: 'ex-row' },
            h('strong', {}, exerciseName(p.exerciseId)),
            h(
              'span',
              { class: 'muted' },
              `${p.sets} × ${repsRange(p)} reps · ${
                defaultWeightKg(p) > 0 ? `${w(defaultWeightKg(p))} ${unit}` : 'bodyweight'
              }`,
            ),
            note.machineSetting
              ? h('span', { class: 'machine' }, `Machine: ${note.machineSetting}`)
              : null,
            last ? h('span', { class: 'muted small' }, `Last time: ${last}`) : null,
          );
        }),
      ),
      h(
        'div',
        { class: 'sticky-bottom' },
        h(
          'button',
          { class: 'primary-btn', disabled: loading, onclick: () => startDay(day) },
          loading ? 'Loading…' : 'Start workout',
        ),
      ),
    );
  }

  function startDay(day: ProgramDay): void {
    voice.unlock(); // must happen inside the tap
    const t = now();
    const s = startSession(day, crypto.randomUUID(), t, {
      unit,
      lastWeightKg: lastWeights(lastTime),
    });
    view = { screen: 'session', s, sheet: null };
    todayNotes = {};
    lastCueElapsedMs = 0;
    void wakeLock.hold();
    void startSessionRow(db, { sessionId: s.sessionId, dayId: day.id, startedAt: t }).catch(
      logDbError,
    );
    startTicker();
    render();
    speakFocusCue(null, s);
  }

  function speakFocusCue(prev: SessionState | null, s: SessionState): void {
    if (shouldSpeakFocusCue(prev, s)) voice.speak(cueFor(currentPlanned(s).exerciseId));
  }

  // ---------- Session ----------

  function setSheet(sheet: Sheet): void {
    if (view.screen !== 'session') return;
    view = { ...view, sheet };
    render();
  }

  function dispatch(e: SessionEvent): void {
    if (view.screen !== 'session') return;
    const prev = view.s;
    const s = next(prev, e);
    if (s === prev) return;
    view = { screen: 'session', s, sheet: null };

    for (const log of s.logs.slice(prev.logs.length)) void saveSet(db, log).catch(logDbError);
    if (prev.phase !== 'rest' && s.phase === 'rest') lastCueElapsedMs = 0;
    if (s.phase === 'summary') onFinished(s);
    render();
    speakFocusCue(prev, s);
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

  function sessionScreen(s: SessionState, sheet: Sheet): HTMLElement {
    if (s.phase === 'summary') return summaryScreen(s);
    const body = s.phase === 'rest' ? restScreen(s) : exerciseScreen(s);
    if (s.paused) return h('div', { class: 'stack' }, body, pausedOverlay());
    if (sheet?.kind === 'list') return h('div', { class: 'stack' }, body, listSheet(s));
    if (sheet?.kind === 'notes')
      return h('div', { class: 'stack' }, body, notesSheet(s, sheet.exerciseId));
    if (sheet?.kind === 'body')
      return h('div', { class: 'stack' }, body, bodySheet(sheet.exerciseId));
    return body;
  }

  function topBar(s: SessionState): HTMLElement {
    return h(
      'header',
      { class: 'top-bar' },
      h(
        'button',
        {
          class: 'ghost-btn list-btn',
          'aria-label': 'Exercise list',
          onclick: () => setSheet({ kind: 'list' }),
        },
        `☰ ${s.day.name} · ${s.exIndex + 1}/${s.day.exercises.length}`,
      ),
      currentPlanned(s).tracking === 'pose'
        ? h(
            'button',
            {
              class: 'ghost-btn',
              onclick: () => openCameraView(exerciseName(currentPlanned(s).exerciseId)),
            },
            'Camera',
          )
        : null,
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
      h(
        'output',
        { class: `stepper-value${value.length >= 5 ? ' long' : ''}`, 'aria-label': label },
        value,
      ),
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

  /** Machine setting + notes button and the Today / Last time lines for one exercise. */
  function exerciseInfo(s: SessionState, exerciseId: string): HTMLElement[] {
    const note = noteFor(exerciseId);
    const today = setsText(s.logs.filter((l) => l.exerciseId === exerciseId));
    const last = setsText(lastTime[exerciseId] ?? []);
    const hasToday = Boolean(todayNotes[exerciseId]);
    return [
      h(
        'button',
        {
          class: 'notes-btn',
          'aria-label': 'Notes and machine setting',
          onclick: () => setSheet({ kind: 'notes', exerciseId }),
        },
        h(
          'span',
          { class: note.machineSetting ? 'machine' : 'muted' },
          note.machineSetting ? `Machine: ${note.machineSetting}` : 'Machine setting',
        ),
        h('span', { class: 'notes-tag' }, note.note || hasToday ? 'Notes •' : 'Notes'),
      ),
      ...(note.note ? [h('p', { class: 'lasting-note small' }, note.note)] : []),
      h(
        'div',
        { class: 'history small' },
        today
          ? h('p', { 'data-today': true }, h('span', { class: 'muted' }, 'Today: '), today)
          : null,
        last
          ? h('p', { 'data-last': true }, h('span', { class: 'muted' }, 'Last time: '), last)
          : null,
      ),
    ];
  }

  function exerciseScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    return h(
      'main',
      { class: 'screen exercise', 'data-screen': 'exercise' },
      topBar(s),
      h(
        'div',
        { class: 'exercise-head' },
        h(
          'div',
          { class: 'exercise-head-text' },
          h('h1', { class: 'exercise-name' }, exerciseName(p.exerciseId)),
          h('p', { class: 'muted' }, `Target ${repsRange(p)} reps`),
          h('p', { class: 'focus-cue' }, cueFor(p.exerciseId)),
        ),
        muscleSlot(p.exerciseId, 'inline'),
      ),
      h(
        'p',
        { class: 'set-counter', 'data-set-counter': true },
        `Set ${s.setIndex + 1} of ${p.sets}`,
      ),
      ...exerciseInfo(s, p.exerciseId),
      stepper('Reps', String(s.reps), 'reps', 1),
      stepper(unit, w(s.weightKg), 'weight', stepFor(s.unit)),
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
        'div',
        { class: 'rest-next' },
        muscleSlot(p.exerciseId, 'rest'),
        h(
          'p',
          { class: 'next-up' },
          h('span', { class: 'muted' }, 'Next'),
          h('br'),
          h('strong', {}, exerciseName(p.exerciseId)),
          h('br'),
          h('span', { class: 'nowrap' }, `Set ${s.setIndex + 1} of ${p.sets}`),
          h('br'),
          h('span', { class: 'muted' }, `${s.reps} reps × ${w(s.weightKg)} ${unit}`),
          h('br'),
          h('span', { class: 'focus-cue' }, cueFor(p.exerciseId)),
        ),
      ),
      ...exerciseInfo(s, p.exerciseId),
      h(
        'button',
        { class: 'primary-btn', onclick: () => dispatch({ type: 'START_SET', now: now() }) },
        'Start set',
      ),
      footer(),
    );
  }

  function bodySheet(exerciseId: string): HTMLElement {
    const { primary, secondary } = musclesOf(exerciseId);
    return h(
      'div',
      { class: 'overlay sheet body-sheet', role: 'dialog', 'aria-label': 'Target muscles' },
      h(
        'header',
        { class: 'top-bar' },
        h('p', { class: 'page-title small-title' }, exerciseName(exerciseId)),
        h('button', { class: 'ghost-btn', onclick: () => setSheet(null) }, 'Close'),
      ),
      muscleSlot(exerciseId, 'full'),
      h(
        'p',
        { class: 'legend' },
        h('span', { class: 'swatch primary' }),
        ` ${primary.join(', ') || '—'}`,
        secondary.length ? h('span', { class: 'swatch secondary' }) : null,
        secondary.length ? ` ${secondary.join(', ')}` : null,
      ),
      h('p', { class: 'muted small' }, body3d ? 'Drag to rotate.' : ''),
    );
  }

  function listSheet(s: SessionState): HTMLElement {
    return h(
      'div',
      { class: 'overlay sheet', role: 'dialog', 'aria-label': 'Exercise list' },
      h(
        'header',
        { class: 'top-bar' },
        h('p', { class: 'page-title' }, s.day.name),
        h('button', { class: 'ghost-btn', onclick: () => setSheet(null) }, 'Close'),
      ),
      h(
        'ol',
        { class: 'ex-list' },
        ...s.day.exercises.map((p, i) => {
          const done = s.logs.filter((l) => l.exerciseId === p.exerciseId).length;
          const finished = done >= p.sets;
          const skipped = s.skipped.includes(p.exerciseId);
          const current = i === s.exIndex;
          const status = finished ? 'done' : current ? 'current' : skipped ? 'skipped' : 'todo';
          const label = finished
            ? '✓ done'
            : current
              ? s.phase === 'rest'
                ? 'up next'
                : 'now'
              : skipped
                ? 'skipped'
                : '';
          return h(
            'li',
            {},
            h(
              'button',
              {
                class: `ex-row-btn ${status}`,
                'data-ex-index': i,
                disabled: finished || current,
                onclick: () => dispatch({ type: 'GO_TO_EXERCISE', exIndex: i, now: now() }),
              },
              h('strong', {}, exerciseName(p.exerciseId)),
              h('span', { class: 'muted' }, `${done}/${p.sets} sets · ${repsRange(p)} reps`),
              label ? h('span', { class: `status ${status}` }, label) : null,
            ),
          );
        }),
      ),
    );
  }

  function notesSheet(s: SessionState, exerciseId: string): HTMLElement {
    const note = noteFor(exerciseId);
    const machine = h('input', {
      id: 'machine-input',
      type: 'text',
      value: note.machineSetting,
      placeholder: 'e.g. Seat 4, pad 2',
      autocomplete: 'off',
      enterkeyhint: 'done',
    });
    const lasting = h('textarea', {
      id: 'note-input',
      rows: 2,
      placeholder: 'Shows every time you do this exercise',
    });
    lasting.value = note.note;
    const today = h('textarea', {
      id: 'today-input',
      rows: 2,
      placeholder: 'Only for this workout',
    });
    today.value = todayNotes[exerciseId] ?? '';

    const save = () => {
      const row = { exerciseId, machineSetting: machine.value.trim(), note: lasting.value.trim() };
      exerciseNotes[exerciseId] = row;
      const todayText = today.value.trim();
      todayNotes[exerciseId] = todayText;
      void saveExerciseNote(db, row).catch(logDbError);
      void saveSessionNote(db, s.sessionId, exerciseId, todayText).catch(logDbError);
      setSheet(null);
    };

    return h(
      'div',
      { class: 'overlay sheet', role: 'dialog', 'aria-label': 'Notes' },
      h(
        'header',
        { class: 'top-bar' },
        h('p', { class: 'page-title small-title' }, exerciseName(exerciseId)),
        h('button', { class: 'ghost-btn', onclick: () => setSheet(null) }, 'Cancel'),
      ),
      h('label', { class: 'field-label', for: 'machine-input' }, 'Machine setting'),
      machine,
      h('label', { class: 'field-label', for: 'note-input' }, 'Exercise note'),
      lasting,
      h('label', { class: 'field-label', for: 'today-input' }, 'Today’s note'),
      today,
      h('button', { class: 'primary-btn', onclick: save }, 'Save'),
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
    const byExercise = new Map<string, SetLog[]>();
    for (const l of s.logs)
      byExercise.set(l.exerciseId, [...(byExercise.get(l.exerciseId) ?? []), l]);
    const stat = (label: string, value: string, key: string) =>
      h(
        'div',
        { class: 'stat', 'data-stat': key },
        h('span', { class: 'stat-value' }, value),
        h('span', { class: 'muted' }, label),
      );
    const todayNote = (id: string) =>
      todayNotes[id] ? h('span', { class: 'today-note' }, `“${todayNotes[id]}”`) : null;
    return h(
      'main',
      { class: 'screen summary', 'data-screen': 'summary' },
      h('h1', { class: 'summary-title' }, 'Workout done'),
      h('p', { class: 'muted' }, `${s.day.name} · ${formatDuration(sum.durationSec)}`),
      h(
        'div',
        { class: 'stats' },
        stat('sets', String(sum.setsDone), 'sets'),
        stat(`${unit} volume`, w(sum.totalVolumeKg), 'volume'),
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
              setsText(sets) + (sum.skipped.includes(id) ? ' · rest skipped' : ''),
            ),
            todayNote(id),
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
              todayNote(id),
            ),
          ),
      ),
      h('button', { class: 'primary-btn', onclick: goToday }, 'Done'),
    );
  }

  function logDbError(err: unknown): void {
    console.error('Saving to IndexedDB failed', err);
  }

  render();
  void getUnit(db)
    .then((u) => {
      unit = u;
      if (view.screen !== 'session') render();
    })
    .catch(logDbError);
  void loadUpNext();
}
