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
  getCoachVoice,
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
import { createDevLogPanel, type DevLogPanelHandle } from './devLogPanel';
import { createLastSetCorrection, type LastSetCorrectionHandle } from './lastSetCorrection';
import { h } from './dom';
import { createCoachVoiceSettings } from './coachVoiceSettings';
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
    if (view.screen === 'session') finishDevLog();
    devLogPanel?.destroy();
    devLogPanel = null;
    disposeAudioTest(); // stops its camera, restores audioSession 'auto'
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
            badgesFor({ exerciseId: p.exerciseId, tracking: p.tracking }),
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
        silentHint(), // iOS mutes spoken cues in Silent mode; a page can't detect it
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
    updateRestClock(s, elapsed);
    if (camera?.mode === 'rest') updateCameraRest(s);
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
              onclick: () => {
                const id = currentPlanned(s).exerciseId;
                openCameraView(exerciseName(id), id);
              },
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
          badgesFor({ exerciseId: p.exerciseId, tracking: p.tracking }),
          h('p', { class: 'muted' }, `Target ${repsRange(p)} reps`),
          h('p', { class: 'focus-cue' }, cueFor(p.exerciseId)),
          h(
            'button',
            {
              class: 'ghost-btn',
              'data-howto-open': true,
              onclick: (ev: Event) => openHowTo(p, ev.currentTarget as HTMLElement),
            },
            'How to',
          ),
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
      // Hands-free rest on the camera shows these in its own panel (one element, one place).
      ...(camera?.mode === 'rest' ? [] : [lastSetFix(s), coachTipFor(s)]),
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
