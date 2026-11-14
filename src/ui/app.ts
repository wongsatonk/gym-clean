// App controller: owns the session state, renders screens, runs side effects
// (voice, wake lock, IndexedDB). All workout rules live in src/core/.
import { formatDuration } from '../core/format';
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
import type { FocusCueId, PlannedExercise, ProgramDay, SetLog } from '../core/types';
import { formatWeight, snapToStep, stepFor, type Unit } from '../core/units';
import { shouldSpeakFocusCue } from '../core/focusCue';
import {
  adviceSpeakDue,
  adviceSpeakOnCommit,
  afterSetAdvice,
  coachSummary,
  type Advice,
} from '../core/advice';
import { cueFor, exerciseById, exerciseName, program } from '../data/catalog';
import {
  GymDb,
  finishSession,
  getExerciseNote,
  getCoachTips,
  getAccent,
  getCoachVoice,
  sessionsSince,
  setsForSessions,
  type SessionRow,
  getHandsFree,
  COACH_VOICE_DEFAULT,
  setCoachVoice,
  type CoachVoice,
  getSpokenCount,
  getUnit,
  lastSessionSets,
  lastWeights,
  saveExerciseNote,
  saveSessionNote,
  saveSet,
  setCoachTips,
  setHandsFree,
  setSpokenCount,
  setUnit,
  startSessionRow,
  updateSet,
  type ExerciseNoteRow,
  type SetRow,
} from '../data/db';
import { startDevLogSession, type DevLogRecorder } from '../data/devlog';
import { bodyMapSvg, pickView } from './bodyMap';
import type { Body3D } from './body3d/viewer';
import { badgesFor } from './badges';
import {
  createCameraView,
  type CameraTarget,
  type CameraView,
  type HandsFreeOptions,
} from './cameraView';
import { createHowToSheet } from './howToSheet';
import { silentHint } from './silentHint';
import { audioTestPanel, disposeAudioTest } from './audioTest';
import { createCoachTip } from './coachTip';
import { createCoachSummary } from './coachSummary';
import { createFocusSummary } from './focusSummary';
import { exerciseScreen as renderExercise } from './screens/exercise';
import { pauseSheet as renderPauseSheet } from './screens/pauseSheet';
import { previewScreen as renderPreview } from './screens/preview';
import { restScreen as renderRest } from './screens/rest';
import { todayScreen as renderToday, type TodayLast } from './screens/today';
import { applyAccent } from './tokens';
import {
  lastSession,
  previousSameDaySession,
  STREAK_MIN_PER_WEEK,
  volumeVsLast,
  weekDots,
  weeklyStreak,
  type WeekDot,
} from '../core/stats';
import { createDevLogPanel, type DevLogPanelHandle } from './devLogPanel';
import { createLastSetCorrection, type LastSetCorrectionHandle } from './lastSetCorrection';
import { h } from './dom';
import { createCoachVoiceSettings } from './coachVoiceSettings';
import { voice } from './voice';
import { wakeLock } from './wakeLock';

const TICK_MS = 250;

type Sheet =
  | null
  | { kind: 'list' }
  | { kind: 'notes'; exerciseId: string }
  | { kind: 'body'; exerciseId: string };

/** M4e Today tiles (loaded with the up-next day). */
type TodayStats = {
  streakWeeks: number;
  weekDots: WeekDot[];
  last: TodayLast | null;
  doneThisWeek: Record<string, number>;
};

type View =
  | { screen: 'today'; upNextDayId: string | null; stats: TodayStats | null }
  | { screen: 'settings' }
  | { screen: 'preview'; day: ProgramDay; loading: boolean }
  | { screen: 'session'; s: SessionState; sheet: Sheet };

export function mountApp(root: HTMLElement): void {
  const db = new GymDb();
  let view: View = { screen: 'today', upNextDayId: null, stats: null };
  let unit: Unit = 'kg';
  let spokenCount = true;
  let coachTips = true;
  let handsFree = true;
  let coachVoice: CoachVoice = { ...COACH_VOICE_DEFAULT };
  let lastCueElapsedMs = 0;
  let ticker: number | undefined;

  // Developer log (M4c): numbers only, stays on the phone. Calls queue until the recorder exists,
  // then run at once: a hands-free set is opened and the camera's first writes to it (meta, the
  // auto-start rep) follow in the same task, so a queued beginSet would drop them.
  let recorder: DevLogRecorder | null = null;
  let recorderReady: Promise<DevLogRecorder | null> = Promise.resolve(null);
  const rec = (f: (r: DevLogRecorder) => unknown) => {
    if (recorder) {
      f(recorder);
      return;
    }
    void recorderReady.then((r) => {
      if (r) f(r);
    });
  };
  let lastCounted: { reps: number; partials: number } | null = null;
  // A camera set that never counted a rep still logs counted {0, 0} (vs a manual set: none).
  let cameraThisSet = false;
  let pendingSet: Parameters<DevLogRecorder['beginSet']>[0] | null = null;
  // Exercises whose phone-placement sentence was already spoken this workout.
  let placementSpoken = new Set<string>();
  let devLogPanel: DevLogPanelHandle | null = null;
  let howTo: { el: HTMLElement; dispose(): void } | null = null;
  // M5b after-set coach: one tip instance per logged set; spoken once per logged set.
  let coachTip: { key: string; tip: ReturnType<typeof createCoachTip>; applied: boolean } | null =
    null;
  let adviceSpokenKey = '';

  function currentAdvice(s: SessionState): Advice | null {
    return coachTips ? afterSetAdvice(s, exerciseName, lastTime) : null;
  }

  /** Rest: the coach tip for the set just logged (null when off or nothing to say). */
  function coachTipFor(s: SessionState): HTMLElement | null {
    const advice = currentAdvice(s);
    if (!advice || s.paused) return null;
    const key = `${s.sessionId}:${s.logs.length}`;
    // Apply only while the upcoming set is the advice's exercise (the reducer checks this too).
    const canApply = currentPlanned(s).exerciseId === advice.exerciseId;
    if (coachTip?.key !== key) {
      const tip = createCoachTip({
        advice,
        unit,
        canApply,
        onApply: (weightKg) => {
          if (coachTip) coachTip.applied = true;
          // The APPLY_NEXT_WEIGHT event itself is logged by logToDevLog.
          dispatch({ type: 'APPLY_NEXT_WEIGHT', exerciseId: advice.exerciseId, weightKg });
        },
      });
      coachTip = { key, tip, applied: false };
      rec((r) =>
        r.logEvent('advice', { rule: advice.rule, exerciseId: advice.exerciseId, shown: true }),
      );
    } else {
      // `applied` stays true once applied: a Fix can't change the suggested weight, and the
      // reducer state really holds the applied weight.
      coachTip.tip.update(advice, { canApply, unit, applied: coachTip.applied });
    }
    return coachTip.tip.el;
  }

  /** M4b: full-screen "How to" sheet with the 3D demo (or the muscle map when there's none). */
  function openHowTo(p: PlannedExercise, opener: HTMLElement | null): void {
    if (howTo) return;
    const sheet = createHowToSheet({
      exerciseId: p.exerciseId,
      tracking: p.tracking,
      onClose: () => {
        if (howTo !== sheet) return; // Close and Escape may both fire
        sheet.dispose();
        sheet.el.remove();
        howTo = null;
        root.inert = false;
        opener?.focus();
      },
    });
    howTo = sheet;
    root.inert = true; // nothing behind the sheet takes focus or taps
    document.body.append(sheet.el); // same task as create, so focus lands on Close
  }
  let correction: { key: string; handle: LastSetCorrectionHandle } | null = null;

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
  // M4e Rest: the mounted Rest screen's cheap per-tick updater (clock + ring).
  let restView: { update(remainingMs: number, targetMs: number): void } | null = null;
  // Hands-free (M5c): the exercise the open camera counts, and the pre-roll for the next set.
  let cameraExerciseId: string | null = null;
  // The hands-free setting the open camera was created with (Settings can't change it mid-camera).
  let cameraHandsFree = false;
  let cameraPrerollFromT: number | undefined;

  /** `exerciseId` turns on rep counting (M4); leave it out for Settings → Camera test. */
  function openCameraView(title: string, exerciseId?: string): void {
    if (camera) return;
    voice.unlock(); // inside the tap, so iOS lets the count be spoken
    camera = createCameraView({
      title,
      onClose: closeCameraView,
      ...(exerciseId === undefined
        ? {}
        : {
            exerciseId,
            spokenCount,
            ...cameraTarget(),
            speakPlacement: !placementSpoken.has(exerciseId),
            recorder,
            // The reducer ignores this outside an active, unpaused set.
            onCount: (reps: number, partials: number) =>
              dispatch({ type: 'SET_COUNTED', reps, partials }),
            // M5: every cue fired so far this set (ids); the reducer scores it at Set done.
            onFocus: (cues: FocusCueId[]) => dispatch({ type: 'SET_FOCUS', cues }),
            onSetDone: () => {
              // Hands-free keeps the camera for the next set of the same exercise (syncCamera).
              if (!cameraHandsFree) closeCameraView();
              dispatch({ type: 'SET_DONE', now: now() });
            },
            ...(handsFree ? { handsFree: handsFreeOptions() } : {}),
          }),
    });
    cameraExerciseId = exerciseId ?? null;
    cameraHandsFree = handsFree && exerciseId !== undefined;
    if (exerciseId !== undefined) {
      placementSpoken.add(exerciseId);
      cameraThisSet = true;
      openLoggedSet(); // before the camera writes frames
    }
    root.append(camera.el);
    syncCamera(); // before start(), so the camera knows the phase from its first frame
    void camera.start();
  }

  function handsFreeOptions(): HandsFreeOptions {
    return {
      onAutoStart: ({ at, frameT }) => {
        // The set's frames from 1.5 s before the first rep go into the dev log (pre-roll).
        cameraPrerollFromT = frameT - 1500;
        dispatch({ type: 'START_SET', now: at });
        cameraPrerollFromT = undefined;
      },
      onCommit: ({ endedAt }) => {
        dispatch({ type: 'SET_DONE', now: endedAt });
        // The rest is backdated (~11 s in): no rest cue for the seconds already gone.
        if (view.screen === 'session' && view.s.phase === 'rest')
          lastCueElapsedMs = restElapsedMs(view.s, now());
        speakAdviceOnCommit();
      },
      // M5c break hold: "Start next set" saves the held set (backdated to its last rep) and
      // starts the next one now; the break counts as that set's rest. No coach tip here — the
      // lifter is already starting.
      onHoldNext: ({ endedAt }) => {
        dispatch({ type: 'SET_DONE', now: endedAt });
        dispatch({ type: 'START_SET', now: now() });
      },
      onIdleClose: () => closeCameraView(),
      onStartSet: () => dispatch({ type: 'START_SET', now: now() }),
    };
  }

  /**
   * Hands-free commit: say the coach tip now if it fits before "Ten seconds"; else it is shown
   * only (the rest is backdated past the usual 2 s moment). Also after an exercise's last set,
   * when the camera has already closed.
   */
  function speakAdviceOnCommit(): void {
    if (view.screen !== 'session') return;
    const s = view.s;
    if (s.phase !== 'rest' || s.paused) return;
    const key = `${s.sessionId}:${s.logs.length}`;
    if (adviceSpokenKey === key) return;
    if (!adviceSpeakOnCommit(restElapsedMs(s, now()), s.restTargetSec)) return;
    const advice = currentAdvice(s);
    if (!advice) return;
    adviceSpokenKey = key;
    voice.speak(advice.say, { kind: 'cue' });
    rec((r) =>
      r.logEvent('advice', {
        rule: advice.rule,
        exerciseId: advice.exerciseId,
        spoken: true,
        atCommit: true,
      }),
    );
  }

  /**
   * Hands-free: tell the open camera the session phase (after every dispatch), close it when the
   * next set is another exercise or the workout ended, and open the dev-log set it now counts.
   */
  function syncCamera(): void {
    if (!camera || cameraExerciseId === null || view.screen !== 'session') return;
    const s = view.s;
    const nextId = s.phase === 'summary' ? null : currentPlanned(s).exerciseId;
    if (cameraHandsFree && nextId !== cameraExerciseId) {
      closeCameraView();
      return;
    }
    camera.setSession({
      phase: s.phase === 'exercise' ? 'exercise' : s.phase === 'rest' ? 'rest' : 'other',
      paused: s.paused,
      restElapsedMs: restElapsedMs(s, now()),
      ...cameraTarget(),
    });
    if (s.phase === 'exercise' && pendingSet) {
      cameraThisSet = true;
      openLoggedSet(cameraPrerollFromT === undefined ? {} : { prerollFromT: cameraPrerollFromT });
      camera.setBegun();
    }
    if (camera.mode === 'rest') updateCameraRest(s);
  }

  /** Hands-free rest panel on the camera: clock, next set, coach tip and Fix. */
  function updateCameraRest(s: SessionState): void {
    if (!camera || s.phase !== 'rest') return;
    const p = currentPlanned(s);
    camera.setRest({
      restMs: s.restTargetSec * 1000 - restElapsedMs(s, now()),
      nextLine: `Next: Set ${s.setIndex + 1} of ${p.sets} · ${s.reps} reps × ${w(s.weightKg)} ${unit}`,
      coachTipEl: coachTipFor(s),
      fixEl: lastSetFix(s),
    });
  }

  /** "3 / 12" and "Set 2 of 3 · 8–12 reps" on the camera page, from the current set. */
  function cameraTarget(): { target?: CameraTarget } {
    if (view.screen !== 'session') return {};
    const s = view.s;
    const p = currentPlanned(s);
    return {
      target: {
        setNumber: s.setIndex + 1,
        sets: p.sets,
        targetReps: p.targetReps[1],
        minReps: p.targetReps[0],
      },
    };
  }

  function closeCameraView(): void {
    camera?.stop();
    camera = null;
    cameraExerciseId = null;
    render();
  }

  function render(): void {
    const screen = screenFor(view);
    if (camera && camera.el.parentNode === root) {
      // Camera sheet open: swap only the screen under it, so the sheet keeps focus and scroll.
      for (const el of [...root.children]) if (el !== camera.el) el.remove();
      root.prepend(screen);
    } else {
      root.replaceChildren(screen);
      if (camera) root.append(camera.el);
    }
    if (view.screen === 'session') {
      ensureBody3d();
      placeBody3d();
    }
  }

  function screenFor(v: View): HTMLElement {
    switch (v.screen) {
      case 'today':
        return todayScreen(v.upNextDayId, v.stats);
      case 'settings':
        return settingsScreen();
      case 'preview':
        return previewScreen(v.day, v.loading);
      case 'session':
        return sessionScreen(v.s, v.sheet);
    }
  }

  function goToday(): void {
    if (view.screen === 'session') finishDevLog();
    devLogPanel?.destroy();
    devLogPanel = null;
    disposeAudioTest(); // stops its camera, restores audioSession 'auto'
    view = { screen: 'today', upNextDayId: null, stats: null };
    render();
    void loadUpNext();
  }

  // ---------- Today ----------

  /** Weeks of history loaded for the streak (generous: the streak stops at the first gap). */
  const STATS_WEEKS = 26;

  async function loadUpNext(): Promise<void> {
    let upNext: string | null;
    try {
      const last = await db.sessions.orderBy('startedAt').last();
      const idx = last ? program.days.findIndex((d) => d.id === last.dayId) : -1;
      upNext = program.days[(idx + 1) % program.days.length]?.id ?? null;
    } catch (err) {
      console.warn('Could not read history', err);
      upNext = program.days[0]?.id ?? null; // never leave Start disabled
    }
    if (view.screen !== 'today') return;
    view = { screen: 'today', upNextDayId: upNext, stats: null };
    render();
    // The tiles load separately, so a failed history query never blocks Start.
    try {
      const t = now();
      const sessions = await sessionsSince(db, t - STATS_WEEKS * 7 * 24 * 3600 * 1000);
      const sets = await setsForSessions(
        db,
        sessions.map((x) => x.sessionId),
      );
      if (view.screen === 'today' && view.upNextDayId === upNext) {
        view = { screen: 'today', upNextDayId: upNext, stats: todayStats(sessions, sets, t) };
        render();
      }
    } catch (err) {
      console.warn('Could not read history stats', err);
    }
  }

  function todayStats(sessions: SessionRow[], sets: SetRow[], t: number): TodayStats {
    const dots = weekDots(sessions, t);
    const weekStart = dots[0]?.dayStart ?? t;
    const doneThisWeek: Record<string, number> = {};
    for (const x of sessions)
      if (x.endedAt !== undefined && x.startedAt >= weekStart) doneThisWeek[x.dayId] = x.startedAt;
    const info = lastSession(sessions, sets);
    let last: TodayLast | null = null;
    if (info) {
      const prev = previousSameDaySession(sessions, info.sessionId);
      last = {
        dayName: program.days.find((d) => d.id === info.dayId)?.name ?? info.dayId,
        date: info.date,
        durationMs: info.durationMs,
        volumeKg: info.volumeKg,
        volumeVsLast: volumeVsLast(
          sets.filter((x) => x.sessionId === info.sessionId),
          prev ? sets.filter((x) => x.sessionId === prev.sessionId) : [],
        ),
      };
    }
    return {
      streakWeeks: weeklyStreak(sessions, t, STREAK_MIN_PER_WEEK),
      weekDots: dots,
      last,
      doneThisWeek,
    };
  }

  function todayScreen(upNextDayId: string | null, stats: TodayStats | null): HTMLElement {
    return renderToday(
      {
        now: now(),
        days: program.days,
        upNextDayId,
        streakWeeks: stats?.streakWeeks ?? 0,
        weekDots: stats?.weekDots ?? weekDots([], now()),
        last: stats?.last ?? null,
        doneThisWeek: stats?.doneThisWeek,
        unit,
      },
      {
        // The hero goes through the preview, which loads last time's weights for the defaults.
        onStart: (day) => void openPreview(day),
        onOpenDay: (day) => void openPreview(day),
        onTab: (tab) => {
          if (tab === 'settings') {
            view = { screen: 'settings' };
            render();
          }
        },
      },
    );
  }

  // ---------- Settings ----------

  /** Settings → Voice: speak a test phrase and show what the browser reports (no sound on iOS?). */
  function voiceTest(): HTMLElement {
    const statusLine = h('p', { class: 'muted', role: 'status', 'data-voice-status': true }, '');
    const show = (text: string) => {
      statusLine.textContent = text;
    };
    const btn = h(
      'button',
      {
        class: 'ghost-btn wide-btn',
        'data-voice-test': true,
        onclick: () => {
          voice.unlock(); // inside the tap
          const st = voice.status();
          if (!st.supported) {
            show('This browser has no speech. Try Safari or Chrome.');
            return;
          }
          const u = voice.speak('Voice test. One, two, three.', { kind: 'cue' });
          if (!u) return;
          show('Speaking…');
          u.addEventListener('start', () => show('Speaking… can you hear it?'));
          u.addEventListener('end', () =>
            show('Done. If you heard nothing, Silent mode is on or the volume is down.'),
          );
          u.addEventListener('error', (e) =>
            show(`Speech error: ${(e as SpeechSynthesisErrorEvent).error ?? 'unknown'}.`),
          );
          // iOS gives no event when speech is blocked: report what we know after a moment.
          window.setTimeout(() => {
            const now = voice.status();
            if (statusLine.textContent === 'Speaking…')
              show(
                `Nothing started (voices: ${now.voices}, English: ${now.english}, paused: ${now.paused ? 'yes' : 'no'}). Turn off Silent mode, turn the volume up, then tap again.`,
              );
          }, 2500);
        },
      },
      'Speaker check',
    );
    return h(
      'div',
      { class: 'voice-test' },
      btn,
      statusLine,
      h(
        'p',
        { class: 'muted' },
        'No sound? On iPhone, Safari mutes spoken cues in Silent mode: turn Silent mode off and the volume up.',
      ),
    );
  }

  function settingsScreen(): HTMLElement {
    devLogPanel?.destroy();
    devLogPanel = createDevLogPanel({ db });
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
      h('p', { class: 'field-label' }, 'Voice'),
      h(
        'button',
        {
          class: `switch-btn${spokenCount ? ' on' : ''}`,
          role: 'switch',
          'aria-checked': spokenCount ? 'true' : 'false',
          'data-setting': 'spoken-count',
          onclick: () => {
            spokenCount = !spokenCount;
            void setSpokenCount(db, spokenCount).catch(logDbError);
            render();
          },
        },
        h('span', { class: 'switch-label' }, 'Count reps out loud'),
        h('span', { class: 'switch-state', 'aria-hidden': 'true' }, spokenCount ? 'On' : 'Off'),
      ),
      h(
        'button',
        {
          class: `switch-btn${coachTips ? ' on' : ''}`,
          role: 'switch',
          'aria-checked': coachTips ? 'true' : 'false',
          'data-setting': 'coach-tips',
          onclick: () => {
            coachTips = !coachTips;
            void setCoachTips(db, coachTips).catch(logDbError);
            render();
          },
        },
        h('span', { class: 'switch-label' }, 'Coach tips after a set'),
        h('span', { class: 'switch-state', 'aria-hidden': 'true' }, coachTips ? 'On' : 'Off'),
      ),
      createCoachVoiceSettings({
        value: coachVoice,
        voices: voice.maleVoices(),
        onChange: (v) => {
          coachVoice = { ...v };
          voice.configure(coachVoice);
          void setCoachVoice(db, coachVoice).catch(logDbError);
          render();
        },
        onTest: (v) => {
          voice.unlock(); // inside the tap (iOS)
          voice.configure(v);
          voice.speak('Keep going.', { kind: 'cue' });
        },
      }).el,
      voiceTest(),
      audioTestPanel(),
      h('p', { class: 'field-label' }, 'Camera sets'),
      h(
        'button',
        {
          class: `switch-btn${handsFree ? ' on' : ''}`,
          role: 'switch',
          'aria-checked': handsFree ? 'true' : 'false',
          'data-setting': 'hands-free',
          onclick: () => {
            handsFree = !handsFree;
            void setHandsFree(db, handsFree).catch(logDbError);
            render();
          },
        },
        h('span', { class: 'switch-label' }, 'Hands-free sets'),
        h('span', { class: 'switch-state', 'aria-hidden': 'true' }, handsFree ? 'On' : 'Off'),
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
      h('p', { class: 'field-label' }, 'Developer log'),
      devLogPanel.el,
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
    return renderPreview(
      {
        day,
        position: program.days.indexOf(day) + 1,
        total: program.days.length,
        loading,
        hint: silentHint(), // iOS mutes spoken cues in Silent mode; a page can't detect it
        rows: day.exercises.map((p) => {
          const wKg = defaultWeightKg(p);
          const last = setsText(lastTime[p.exerciseId] ?? []);
          return {
            exerciseId: p.exerciseId,
            tracking: p.tracking,
            name: exerciseName(p.exerciseId),
            plan: `${p.sets} × ${repsRange(p)} reps · ${wKg > 0 ? `${w(wKg)} ${unit}` : 'bodyweight'}`,
            machine: noteFor(p.exerciseId).machineSetting || undefined,
            last: last || undefined,
          };
        }),
      },
      { onBack: goToday, onStart: startDay },
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
    placementSpoken = new Set();
    correction = null;
    startDevLog(s, day.id);
    void wakeLock.hold();
    void startSessionRow(db, { sessionId: s.sessionId, dayId: day.id, startedAt: t }).catch(
      logDbError,
    );
    startTicker();
    render();
    speakFocusCue(null, s);
  }

  function startDevLog(s: SessionState, dayId: string): void {
    const old = recorder;
    if (old) void old.dispose();
    recorder = null;
    recorderReady = startDevLogSession(db, {
      id: s.sessionId,
      dayId,
      // App state only: never notes or other free text.
      settings: { unit, spokenCount },
    }).then((r) => {
      recorder = r.active ? r : null;
      return recorder;
    });
    // Ask iOS not to evict the workout data and the log under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    beginLoggedSet(s);
  }

  /** Dev-log set boundaries: a set starts when an exercise phase starts, ends when it's logged. */
  /**
   * Remember the set that just started. It is only opened in the dev log once it's used
   * (camera opened, or the set logged), so sets skipped or jumped over leave no empty rows.
   */
  function beginLoggedSet(s: SessionState): void {
    lastCounted = null;
    cameraThisSet = false;
    if (s.phase !== 'exercise') {
      pendingSet = null;
      return;
    }
    const p = currentPlanned(s);
    pendingSet = {
      exerciseId: p.exerciseId,
      setIndex: s.setIndex,
      targetReps: p.targetReps,
      weightKg: s.weightKg,
      startedAt: s.setStartedAt ?? now(), // an auto start is backdated to the first rep
    };
  }

  function openLoggedSet(opts: { prerollFromT?: number } = {}): void {
    const info = pendingSet;
    if (!info) return;
    pendingSet = null;
    rec((r) => r.beginSet(info, opts));
  }

  function logToDevLog(prev: SessionState, s: SessionState, e: SessionEvent): void {
    rec((r) => r.logEvent(e.type, e));
    if (e.type === 'SET_COUNTED') lastCounted = { reps: e.reps, partials: e.partials };
    const newLog = s.logs.length > prev.logs.length ? s.logs.at(-1) : undefined;
    if (newLog) {
      openLoggedSet();
      const counted = lastCounted ?? (cameraThisSet ? { reps: 0, partials: 0 } : undefined);
      rec(
        (r) =>
          void r.endSet({
            ...(counted ? { counted } : {}),
            logged: { reps: newLog.reps, partials: newLog.partials ?? 0 },
            weightKg: newLog.weightKg,
            endedAt: newLog.endedAt,
            restTakenSec: newLog.restTakenSec,
          }),
      );
      if (newLog.focusScore !== undefined) logFocusScore(newLog);
    }
    const newSet =
      s.phase === 'exercise' &&
      (prev.phase !== 'exercise' || prev.exIndex !== s.exIndex || prev.setIndex !== s.setIndex);
    if (newSet) beginLoggedSet(s);
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
    logToDevLog(prev, s, e);
    if (prev.phase !== 'rest' && s.phase === 'rest') lastCueElapsedMs = 0;
    if (s.phase === 'summary' && prev.phase !== 'summary') onFinished(s);
    syncCamera(); // before render: the rest screen leaves the tip/Fix to the camera's rest panel
    render();
    // Pause sheet: move focus into the dialog (the Pause button it came from is gone).
    if (s.paused && !prev.paused) root.querySelector<HTMLElement>('[data-pause="resume"]')?.focus();
    speakFocusCue(prev, s);
  }

  function onFinished(s: SessionState): void {
    stopTicker();
    void wakeLock.release();
    saveTotals(s);
    // Keep the dev log open on Summary so a last-set fix there still reaches it;
    // it is finished when leaving Summary (goToday). Flush now in case the app is closed here.
    rec((r) => void r.flush());
  }

  function finishDevLog(): void {
    const endedAt = view.screen === 'session' ? (view.s.endedAt ?? now()) : now();
    rec((r) => void r.finish(endedAt));
    recorder = null;
    recorderReady = Promise.resolve(null);
  }

  function saveTotals(s: SessionState): void {
    const { setsDone, totalVolumeKg, restOverruns } = summarize(s);
    void finishSession(db, s.sessionId, s.endedAt ?? now(), {
      setsDone,
      totalVolumeKg,
      restOverruns,
    }).catch(logDbError);
  }

  /** Rest + Summary: fix the last set's count (the true numbers for the dev log). */
  function lastSetFix(s: SessionState): HTMLElement | null {
    const last = s.logs.at(-1);
    if (!last || s.paused) return null;
    const key = `${s.sessionId}:${s.logs.length}`;
    if (correction?.key !== key) {
      correction = {
        key,
        handle: createLastSetCorrection({
          reps: last.reps,
          partials: last.partials ?? 0,
          onCorrect: (reps, partials) => correctLastSet(reps, partials),
        }),
      };
    }
    return correction.handle.el;
  }

  /** Dev log (M5): ids and numbers only; logged at the save, so it lands after the set's end. */
  function logFocusScore(log: SetLog): void {
    rec((r) =>
      r.logEvent('focusScore', {
        score: log.focusScore ?? null,
        cues: log.cues?.length ?? 0,
        partials: log.partials ?? 0,
      }),
    );
  }

  function correctLastSet(reps: number, partials: number): void {
    dispatch({ type: 'CORRECT_LAST_SET', reps, partials });
    if (view.screen !== 'session') return;
    const s = view.s;
    const last = s.logs.at(-1);
    if (!last) return;
    const counts = { reps: last.reps, partials: last.partials ?? 0 };
    // The reducer recomputed the focus score from the stored cues; null removes it (0 reps).
    void updateSet(db, last, { ...counts, focusScore: last.focusScore ?? null }).catch(logDbError);
    rec((r) => void r.correctSet(counts));
    if (last.cues) logFocusScore(last);
    if (s.phase === 'summary') saveTotals(s);
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
    const key = `${s.sessionId}:${s.logs.length}`;
    if (adviceSpokenKey !== key && adviceSpeakDue(lastCueElapsedMs, elapsed, s.restTargetSec)) {
      adviceSpokenKey = key; // once per logged set; a later Fix updates the text only
      const advice = currentAdvice(s);
      if (advice) {
        voice.speak(advice.say, { kind: 'cue' });
        rec((r) =>
          r.logEvent('advice', { rule: advice.rule, exerciseId: advice.exerciseId, spoken: true }),
        );
      }
    }
    lastCueElapsedMs = elapsed;
    // If the tab was throttled and several cues piled up, only the latest is still relevant.
    const cue = cues.at(-1);
    if (cue) voice.speak(restCueText(cue.kind, upcoming(s)));
    restView?.update(s.restTargetSec * 1000 - elapsed, s.restTargetSec * 1000);
    if (camera?.mode === 'rest') updateCameraRest(s);
  }

  function upcoming(s: SessionState) {
    return { name: exerciseName(currentPlanned(s).exerciseId), setNumber: s.setIndex + 1 };
  }

  function sessionScreen(s: SessionState, sheet: Sheet): HTMLElement {
    if (s.phase !== 'rest') restView = null; // the tick only updates a live Rest screen
    if (s.phase === 'summary') return summaryScreen(s);
    const body = s.phase === 'rest' ? restScreen(s) : exerciseScreen(s);
    if (s.paused) return h('div', { class: 'stack' }, body, pausedOverlay(s));
    if (sheet?.kind === 'list') return h('div', { class: 'stack' }, body, listSheet(s));
    if (sheet?.kind === 'notes')
      return h('div', { class: 'stack' }, body, notesSheet(s, sheet.exerciseId));
    if (sheet?.kind === 'body')
      return h('div', { class: 'stack' }, body, bodySheet(sheet.exerciseId));
    return body;
  }

  function exerciseScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    const id = p.exerciseId;
    const note = noteFor(id);
    const today = setsText(s.logs.filter((l) => l.exerciseId === id));
    const last = setsText(lastTime[id] ?? []);
    return renderExercise(
      {
        dayName: s.day.name,
        exIndex: s.exIndex,
        exTotal: s.day.exercises.length,
        exerciseId: id,
        tracking: p.tracking,
        name: exerciseName(id),
        repsRange: repsRange(p),
        setIndex: s.setIndex,
        sets: p.sets,
        reps: s.reps,
        weightText: w(s.weightKg),
        unit,
        cue: cueFor(id),
        figure: muscleSlot(id, 'inline'),
        machine: note.machineSetting || undefined,
        note: note.note || undefined,
        hasNotes: Boolean(note.note || todayNotes[id]),
        today: today || undefined,
        last: last || undefined,
      },
      {
        onList: () => setSheet({ kind: 'list' }),
        onCamera: p.tracking === 'pose' ? () => openCameraView(exerciseName(id), id) : undefined,
        onPause: () => dispatch({ type: 'PAUSE', now: now() }),
        onHowTo: (opener) => openHowTo(p, opener),
        onNotes: () => setSheet({ kind: 'notes', exerciseId: id }),
        onAdjust: (field, dir) =>
          dispatch({
            type: 'ADJUST',
            field,
            delta: dir * (field === 'reps' ? 1 : stepFor(s.unit)),
          }),
        onSetDone: () => dispatch({ type: 'SET_DONE', now: now() }),
      },
    );
  }

  function restScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    const id = p.exerciseId;
    const note = noteFor(id);
    const today = setsText(s.logs.filter((l) => l.exerciseId === id));
    const last = setsText(lastTime[id] ?? []);
    const targetMs = s.restTargetSec * 1000;
    // Hands-free rest on the camera shows the Fix and tip in its own panel (one element, one place).
    const onCamera = camera?.mode === 'rest';
    const v = renderRest(
      {
        dayName: s.day.name,
        exIndex: s.exIndex,
        exTotal: s.day.exercises.length,
        remainingMs: targetMs - restElapsedMs(s, now()),
        targetMs,
        exerciseId: id,
        name: exerciseName(id),
        setIndex: s.setIndex,
        sets: p.sets,
        reps: s.reps,
        weightText: w(s.weightKg),
        unit,
        cue: cueFor(id),
        figure: muscleSlot(id, 'rest'),
        fixEl: onCamera ? null : lastSetFix(s),
        coachTipEl: onCamera ? null : coachTipFor(s),
        machine: note.machineSetting || undefined,
        note: note.note || undefined,
        hasNotes: Boolean(note.note || todayNotes[id]),
        today: today || undefined,
        last: last || undefined,
      },
      {
        onList: () => setSheet({ kind: 'list' }),
        onCamera: p.tracking === 'pose' ? () => openCameraView(exerciseName(id), id) : undefined,
        onPause: () => dispatch({ type: 'PAUSE', now: now() }),
        onExtend: () => dispatch({ type: 'EXTEND_REST', sec: 30, now: now() }),
        onNotes: () => setSheet({ kind: 'notes', exerciseId: id }),
        onStartSet: () => dispatch({ type: 'START_SET', now: now() }),
      },
    );
    restView = v;
    return v.el;
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
              badgesFor({ exerciseId: p.exerciseId, tracking: p.tracking }),
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

  function pausedOverlay(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    return renderPauseSheet(
      {
        context:
          s.phase === 'rest'
            ? `Resting · next ${exerciseName(p.exerciseId)}`
            : `${exerciseName(p.exerciseId)} · set ${s.setIndex + 1} of ${p.sets}`,
      },
      {
        onResume: () => dispatch({ type: 'RESUME', now: now() }),
        // The reducer only accepts RESUME while paused: resume, then skip.
        onSkip: () => {
          dispatch({ type: 'RESUME', now: now() });
          dispatch({ type: 'SKIP_EXERCISE', now: now() });
        },
        onEnd: () => dispatch({ type: 'FINISH', now: now() }),
      },
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
      lastSetFix(s),
      createCoachSummary(coachSummary(s, lastTime, exerciseName), exerciseName),
      createFocusSummary(s.logs, exerciseName),
      h('h2', { class: 'section-title' }, 'Sets'),
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
  void getSpokenCount(db)
    .then((on) => {
      spokenCount = on;
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void getCoachTips(db)
    .then((on) => {
      coachTips = on;
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void getAccent(db)
    .then((a) => applyAccent(a))
    .catch(logDbError);
  void getCoachVoice(db)
    .then((v) => {
      coachVoice = v;
      voice.configure(v);
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  // iOS loads its voice list late: refresh the picker when it arrives.
  voice.onVoicesChanged(() => {
    if (view.screen === 'settings') render();
  });
  void getHandsFree(db)
    .then((on) => {
      handsFree = on;
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void loadUpNext();
}
