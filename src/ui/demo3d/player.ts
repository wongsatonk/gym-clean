// M4b exercise demo player: a looping 3D mannequin for the "How to" sheet.
//
// This module is light (no three.js import): createDemoPlayer() loads ./scene (and three.js with
// it) on demand, so importing the player from a sheet doesn't grow the main bundle.
//
// Each player owns its own WebGL renderer, created on open and freed in dispose() (PROGRESS
// Decisions, M4b). The animation loop only runs while playing, on screen and the page is
// visible; otherwise frames are drawn on demand (drag, view change, resize).
// Under reduced motion the player starts paused on the start pose and preset turns snap; the Play
// button still plays the loop when the user asks for it.
import { exerciseById } from '../../data/catalog';
import { highlightFor } from './highlight';
import { demoFor, phaseAt, tempoLabel, type Phase } from './moves';
import { phaseLabel } from './rig';
import type { DemoScene } from './scene';

export type DemoView = 'front' | 'side';

export type DemoPlayerOptions = {
  /** Start paused on the start pose, snap view turns. Default: the user's media query. */
  reducedMotion?: boolean;
  /** Override the exercise's muscles (default: the exercise data). */
  muscles?: { primary: readonly string[]; secondary: readonly string[] };
  /** Called whenever the phase text changes ("Lift", "Lower", "Down", "Up", "Hold"). */
  onPhase?: (label: string, phase: Phase) => void;
  /** Draw the Front / Side / Play buttons under the canvas. Default true. */
  controls?: boolean;
  /** Draw the phase text over the canvas. Default true. */
  phaseOverlay?: boolean;
  /** Abort while three.js is loading (sheet closed): the promise resolves to null. */
  signal?: AbortSignal;
};

export type DemoPlayer = {
  /** div.demo3d > div.demo3d-stage (canvas + phase text) + div.demo3d-controls. Size with CSS. */
  readonly el: HTMLDivElement;
  readonly exerciseId: string;
  /** "Lift 1 s · Lower 2 s" / "Down 2 s · Up 1 s". */
  readonly tempo: string;
  /** Current phase text. */
  readonly phase: string;
  readonly playing: boolean;
  readonly view: DemoView;
  play(): void;
  pause(): void;
  setView(v: DemoView): void;
  /** Jump to `seconds` into the loop (keeps playing/paused state). */
  seek(seconds: number): void;
  dispose(): void;
};

/** Small turn off the exact preset so the figure never looks flat (same idea as M2). */
const YAW: Record<DemoView, number> = { side: -0.3, front: -Math.PI / 2 + 0.3 };
const TURN_EASE = 0.2;
const DRAG_RAD_PER_PX = 0.012;
const MAX_STEP_S = 0.1;

function canUseWebGL(): boolean {
  return typeof window !== 'undefined' && 'WebGLRenderingContext' in window;
}

const BTN_STYLE =
  'min-height:56px;min-width:56px;flex:1;font-size:20px;font-weight:600;border-radius:12px;';

/**
 * Builds a player for `exerciseId` and appends its element to `container` (if given).
 * Resolves to null when the exercise has no demo, WebGL is missing, three.js fails to load, or
 * `opts.signal` aborted meanwhile; the caller then shows the 2D muscle map.
 */
export async function createDemoPlayer(
  container: HTMLElement | null,
  exerciseId: string,
  opts: DemoPlayerOptions = {},
): Promise<DemoPlayer | null> {
  const found = demoFor(exerciseId);
  if (!found || !canUseWebGL()) return null;
  const move = found;
  const reducedMotion =
    opts.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const ex = exerciseById(exerciseId);
  const muscles = opts.muscles ?? {
    primary: ex?.primaryMuscles ?? [],
    secondary: ex?.secondaryMuscles ?? [],
  };

  let scene: DemoScene;
  try {
    const mod = await import('./scene');
    if (opts.signal?.aborted) return null;
    scene = mod.createDemoScene(move, highlightFor(muscles.primary, muscles.secondary));
  } catch (err) {
    console.warn('3D demo unavailable, using the muscle map', err);
    return null;
  }
  if (opts.signal?.aborted) {
    scene.dispose();
    return null;
  }

  // --- DOM ------------------------------------------------------------------------------------
  const el = document.createElement('div');
  el.className = 'demo3d';
  el.dataset.exercise = exerciseId;
  el.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;height:100%;';
  const stage = document.createElement('div');
  stage.className = 'demo3d-stage';
  stage.style.cssText = 'position:relative;flex:1;min-height:0;touch-action:none;';
  stage.append(scene.canvas);
  scene.canvas.setAttribute('role', 'img');
  scene.canvas.setAttribute('aria-label', `${ex?.name ?? exerciseId}: 3D demo. Drag to turn.`);
  const phaseEl = document.createElement('div');
  phaseEl.className = 'demo3d-phase';
  phaseEl.style.cssText =
    'position:absolute;left:12px;top:8px;font-size:28px;font-weight:700;color:#fff;' +
    'text-shadow:0 1px 3px #000;pointer-events:none;';
  if (opts.phaseOverlay !== false) stage.append(phaseEl);
  el.append(stage);

  const btn = (label: string, cls: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `demo3d-btn ${cls}`;
    b.textContent = label;
    b.style.cssText = BTN_STYLE;
    return b;
  };
  const frontBtn = btn('Front', 'demo3d-front');
  const sideBtn = btn('Side', 'demo3d-side');
  const playBtn = btn('Play', 'demo3d-play');
  if (opts.controls !== false) {
    const bar = document.createElement('div');
    bar.className = 'demo3d-controls';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Demo controls');
    bar.style.cssText = 'display:flex;gap:8px;';
    bar.append(frontBtn, sideBtn, playBtn);
    el.append(bar);
  }
  container?.append(el);

  // --- state ----------------------------------------------------------------------------------
  let t = 0;
  let playing = false;
  let view: DemoView = move.view;
  let yaw = YAW[view];
  let targetYaw = yaw;
  let onScreen = true;
  let frameId = 0;
  let lastTs = 0;
  let label = '';
  let disposed = false;

  const pageVisible = () => document.visibilityState !== 'hidden';
  const turning = () => Math.abs(targetYaw - yaw) > 0.002;
  const shouldLoop = () => !disposed && onScreen && pageVisible() && (playing || turning());

  function updatePhase(): void {
    const phase = phaseAt(move, t);
    const next = phaseLabel(move, phase);
    if (next === label) return;
    label = next;
    phaseEl.textContent = next;
    el.dataset.demoPhase = next;
    opts.onPhase?.(next, phase);
  }

  function draw(): void {
    if (disposed) return;
    scene.setYaw(yaw);
    scene.setTime(t);
    scene.render();
    el.dataset.angle = yaw.toFixed(2);
  }

  function tick(ts: number): void {
    frameId = 0;
    if (disposed) return;
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, MAX_STEP_S) : 0;
    lastTs = ts;
    if (playing) t += dt;
    if (turning()) yaw += (targetYaw - yaw) * TURN_EASE;
    else yaw = targetYaw;
    updatePhase();
    draw();
    if (shouldLoop()) frameId = requestAnimationFrame(tick);
    else lastTs = 0;
  }

  /** Start the loop if anything needs animating; otherwise draw one frame. */
  function kick(): void {
    if (disposed) return;
    if (shouldLoop()) {
      if (!frameId) frameId = requestAnimationFrame(tick);
    } else if (onScreen) {
      draw();
    }
  }

  function setPlaying(on: boolean): void {
    if (disposed) return;
    playing = on;
    el.dataset.demoPlaying = String(on);
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(on));
    lastTs = 0;
    kick();
  }

  function setView(v: DemoView): void {
    if (disposed) return;
    view = v;
    el.dataset.view = v;
    frontBtn.setAttribute('aria-pressed', String(v === 'front'));
    sideBtn.setAttribute('aria-pressed', String(v === 'side'));
    // Turn the shortest way round to the preset.
    const raw = YAW[v];
    targetYaw = raw + Math.round((yaw - raw) / (2 * Math.PI)) * 2 * Math.PI;
    if (reducedMotion) yaw = targetYaw;
    kick();
  }

  // --- events (all removed by one abort in dispose) -------------------------------------------
  const ac = new AbortController();
  const on = { signal: ac.signal };
  frontBtn.addEventListener('click', () => setView('front'), on);
  sideBtn.addEventListener('click', () => setView('side'), on);
  playBtn.addEventListener('click', () => setPlaying(!playing), on);

  let dragX: number | null = null;
  const canvas = scene.canvas;
  canvas.style.touchAction = 'none';
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      dragX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    },
    on,
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (dragX === null) return;
      yaw += (e.clientX - dragX) * DRAG_RAD_PER_PX;
      targetYaw = yaw;
      dragX = e.clientX;
      if (!frameId) draw();
    },
    on,
  );
  const endDrag = () => (dragX = null);
  canvas.addEventListener('pointerup', endDrag, on);
  canvas.addEventListener('pointercancel', endDrag, on);
  document.addEventListener('visibilitychange', kick, on);

  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    scene.setSize(w, h);
    kick();
  });
  ro.observe(stage);
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          onScreen = entries.some((e) => e.isIntersecting);
          kick();
        });
  io?.observe(el);

  // --- start ----------------------------------------------------------------------------------
  updatePhase();
  setView(view);
  yaw = targetYaw;
  setPlaying(!reducedMotion);

  return {
    el,
    exerciseId,
    tempo: tempoLabel(move),
    get phase() {
      return label;
    },
    get playing() {
      return playing;
    },
    get view() {
      return view;
    },
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    setView,
    seek(seconds) {
      if (disposed) return;
      t = Math.max(0, seconds);
      updatePhase();
      kick();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      el.dataset.demoPlaying = 'false';
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      ac.abort();
      ro.disconnect();
      io?.disconnect();
      scene.dispose();
      el.remove();
    },
  };
}
