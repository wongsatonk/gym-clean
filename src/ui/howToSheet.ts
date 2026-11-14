// M4b "How to" sheet: full-screen, opened from the Exercise screen. Shows the looping 3D demo (or the
// 2D muscle map when there is no demo or no WebGL), the phase text big under it, the tempo, 2-3
// how-to lines, the focus line and the M2 form cue. The 3D player renders only while the sheet is
// open: dispose() frees it, and closing while three.js loads aborts the load.

import type { PlannedExercise } from '../core/types';
import { cueFor, exerciseById, exerciseName, howToFor } from '../data/catalog';
import { badgesFor } from './badges';
import { bodyMapSvg, pickView } from './bodyMap';
import { demoFor, hasDemo, tempoLabel } from './demo3d/moves';
import { createDemoPlayer, type DemoPlayer } from './demo3d/player';
import { h } from './dom';
import { icon } from './icons';
import './howto.css';

export type HowToSheetOptions = {
  exerciseId: string;
  tracking: PlannedExercise['tracking'];
  /** Called after Close (or Escape); the caller removes `el` and calls dispose(). */
  onClose: () => void;
  /** Test/harness override; default: the user's media query (the player reads it). */
  reducedMotion?: boolean;
};

export type HowToSheetHandle = {
  el: HTMLElement;
  /** Frees the 3D player (or aborts its load). Idempotent. */
  dispose: () => void;
};

export type HowToContent = {
  title: string;
  hasDemo: boolean;
  tempo: string;
  lines: string[];
  focus: string;
  cue: string;
  primary: string[];
  secondary: string[];
};

/** Pure: the sheet's text for one exercise. Missing data gives empty strings, never a throw. */
export function howToContent(exerciseId: string): HowToContent {
  const how = howToFor(exerciseId);
  const demo = demoFor(exerciseId);
  const ex = exerciseById(exerciseId);
  return {
    title: exerciseName(exerciseId),
    hasDemo: hasDemo(exerciseId),
    tempo: how?.tempo ?? (demo ? tempoLabel(demo) : ''),
    lines: how?.lines.slice(0, 3) ?? [],
    focus: how?.focus ?? '',
    cue: cueFor(exerciseId),
    primary: ex?.primaryMuscles ?? [],
    secondary: ex?.secondaryMuscles ?? [],
  };
}

let sheets = 0;

export function createHowToSheet(opts: HowToSheetOptions): HowToSheetHandle {
  const c = howToContent(opts.exerciseId);
  const titleId = `howto-title-${++sheets}`;
  const abort = new AbortController();
  let player: DemoPlayer | null = null;
  let disposed = false;

  const closeBtn = h(
    'button',
    { class: 'howto-close', 'data-howto': 'close', onclick: () => opts.onClose() },
    'Close',
  );
  const stage = h('div', { class: 'howto-stage', 'data-howto': 'stage' });
  const phase = h('p', { class: 'howto-phase', 'aria-live': 'off', 'data-howto': 'phase' });
  const note = h('p', { class: 'howto-note', 'data-howto': 'note', hidden: true });

  const showMap = (why: string) => {
    stage.dataset.mode = 'map';
    stage.innerHTML = bodyMapSvg({
      view: pickView(c.primary),
      primary: c.primary,
      secondary: c.secondary,
    });
    phase.hidden = true;
    note.hidden = false;
    note.textContent = `${why} Bright green: main muscles. Dark green: helpers.`;
  };

  if (c.hasDemo) {
    stage.dataset.mode = 'loading';
    stage.append(h('p', { class: 'howto-loading' }, 'Loading 3D demo…'));
    void createDemoPlayer(null, opts.exerciseId, {
      signal: abort.signal,
      phaseOverlay: false,
      onPhase: (label) => {
        phase.textContent = label;
      },
      ...(opts.reducedMotion === undefined ? {} : { reducedMotion: opts.reducedMotion }),
    })
      .then((p) => {
        if (disposed) {
          p?.dispose();
          return;
        }
        if (!p) {
          showMap('3D demo not available on this phone.');
          return;
        }
        player = p;
        stage.dataset.mode = '3d';
        stage.replaceChildren(p.el);
        phase.textContent = p.phase;
      })
      .catch((err: unknown) => {
        console.warn('[howto] demo failed', err);
        if (!disposed) showMap('3D demo not available on this phone.');
      });
  } else {
    showMap('Info: no 3D demo for this exercise yet.');
  }

  const el = h(
    'div',
    {
      class: 'howto-sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'data-howto': 'sheet',
      'data-exercise': opts.exerciseId,
      onkeydown: (ev: Event) => {
        if ((ev as KeyboardEvent).key === 'Escape') opts.onClose();
      },
    },
    h(
      'header',
      { class: 'howto-head' },
      h(
        'div',
        { class: 'howto-titles' },
        h('h2', { class: 'howto-title', id: titleId, 'data-howto': 'title' }, c.title),
        badgesFor({ exerciseId: opts.exerciseId, tracking: opts.tracking }),
      ),
      closeBtn,
    ),
    stage,
    phase,
    note,
    c.tempo ? h('p', { class: 'howto-tempo', 'data-howto': 'tempo' }, c.tempo) : null,
    c.lines.length
      ? h(
          'ol',
          { class: 'howto-lines', 'data-howto': 'lines' },
          ...c.lines.map((l) => h('li', {}, l)),
        )
      : null,
    // The focus line names the muscles: a cyan dot (the muscle colour) beside plain text.
    c.focus
      ? h(
          'p',
          { class: 'howto-focus', 'data-howto': 'focus' },
          h('i', { class: 'swatch-dot', 'aria-hidden': 'true' }),
          h('span', {}, c.focus),
        )
      : null,
    // The form cue is the line the coach speaks mid-set: the shared lavender cue panel.
    c.cue
      ? h(
          'div',
          { class: 'cue-panel howto-cue', 'data-howto': 'cue' },
          icon('speaker', 'md'),
          h('p', { class: 'cue-text' }, c.cue),
        )
      : null,
  );

  // Put focus in the sheet once it is attached (Close is the safe first target).
  queueMicrotask(() => {
    if (el.isConnected) closeBtn.focus();
  });

  return {
    el,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      abort.abort();
      player?.dispose();
      player = null;
    },
  };
}
