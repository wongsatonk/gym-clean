// Camera screen: live video, 2D skeleton overlay, fps, camera switch, 3D live skeleton.
// Privacy: frames are only passed to on-device inference; nothing is recorded or uploaded.
import { ruleFor } from '../core/exercises';
import { FpsMeter } from '../core/fps';
import { createRepCounter, type RepCounter } from '../core/repCounter';
import { JOINTS, SKELETON } from '../core/poseTopology';
import type { LandmarkFrame } from '../core/types';
import { openCamera, stopStream, type Facing } from '../pose/camera';
import type { PoseTracker } from '../pose/landmarker';
import { h } from './dom';
import type { Skeleton3D, SkeletonPreset } from './skeleton3d';
import { voice } from './voice';

export type CameraView = { readonly el: HTMLElement; start(): Promise<void>; stop(): void };

const MIN_VISIBILITY = 0.5;

function drawOverlay(canvas: HTMLCanvasElement, frame: LandmarkFrame | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  const W = canvas.width;
  const H = canvas.height;
  const lm = frame.landmarks;
  ctx.lineWidth = Math.max(3, W / 160);
  ctx.strokeStyle = '#4ade80';
  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON) {
    const p = lm[a];
    const q = lm[b];
    if (!p || !q || p.visibility < MIN_VISIBILITY || q.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * W, p.y * H);
    ctx.lineTo(q.x * W, q.y * H);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f6f8';
  for (const i of JOINTS) {
    const p = lm[i];
    if (!p || p.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, Math.max(4, W / 120), 0, Math.PI * 2);
    ctx.fill();
  }
}

export type CameraViewOptions = {
  onClose: () => void;
  title: string;
  /** Exercise being trained. With a counting rule the sheet shows the live rep counter. */
  exerciseId?: string;
  /** Speak each counted rep ("One", "Two", …). Default true. */
  spokenCount?: boolean;
  /** Called whenever the rep or partial count changes. */
  onCount?: (reps: number, partials: number) => void;
  /** "Set done" tapped. Only shown when the counter is active. */
  onSetDone?: () => void;
};

const WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
  'Twenty',
];

/** "One", "Two", … for spoken counts; digits past twenty (speech reads them fine). */
function repWord(n: number): string {
  return WORDS[n] ?? String(n);
}

export type RepPanel = {
  readonly el: HTMLElement;
  /** Feed one detector result (null = no person found). */
  update(frame: LandmarkFrame | null): void;
  reset(): void;
  /** Stops a count word still speaking or queued (closing the sheet, Set done). */
  silence(): void;
};

/**
 * Live rep counter panel. The side label comes from the counter's landmark side, which is the
 * person's own anatomical side (MediaPipe reads the raw, un-mirrored video). Only the video and
 * skeleton canvas are CSS-mirrored, never this text, so "Right arm" means their right arm.
 */
export function createRepPanel(
  counter: RepCounter,
  limb: 'arm' | 'leg',
  opts: Pick<CameraViewOptions, 'spokenCount' | 'onCount'>,
): RepPanel {
  const num = h('p', { class: 'rep-num', 'data-reps': '0' }, '0');
  const label = h('p', { class: 'rep-label' }, 'reps');
  const side = h('p', { class: 'rep-side', 'data-side': '' });
  const partials = h('p', { class: 'rep-partials', 'data-partials': '0' }, '');
  const hint = h(
    'p',
    { class: 'rep-hint', 'data-hint': 'frame', 'aria-live': 'polite' },
    'Step into frame',
  );
  const el = h(
    'section',
    { class: 'rep-panel', 'aria-label': 'Rep counter' },
    h('div', { class: 'rep-count' }, num, label),
    h('div', { class: 'rep-info' }, side, hint, partials),
  );
  let shownReps = -1;
  let shownPartials = -1;
  let shownSide = '';
  let shownHint = '';

  const sideText = (s: RepCounter['side']): string => {
    if (!s) return '';
    const part = limb === 'arm' ? 'arm' : 'leg';
    if (s === 'both') return `Both ${part}s`;
    return `${s === 'left' ? 'Left' : 'Right'} ${part}`;
  };

  function render(present: boolean): void {
    const { reps, partials: p } = counter;
    if (reps !== shownReps || p !== shownPartials) {
      if (reps !== shownReps && shownReps >= 0) {
        num.classList.remove('bump');
        void num.offsetWidth; // restart the animation
        num.classList.add('bump');
      }
      shownReps = reps;
      shownPartials = p;
      num.textContent = String(reps);
      num.dataset.reps = String(reps);
      label.textContent = reps === 1 ? 'rep' : 'reps';
      partials.dataset.partials = String(p);
      partials.textContent = p > 0 ? `${p} partial${p === 1 ? '' : 's'}` : '';
    }
    const s = sideText(counter.side);
    if (s !== shownSide) {
      shownSide = s;
      side.textContent = s;
      side.dataset.side = counter.side ?? '';
    }
    const hintKey =
      !present || !counter.tracking ? 'frame' : counter.phase === 'setup' ? 'start' : '';
    if (hintKey !== shownHint) {
      shownHint = hintKey;
      hint.dataset.hint = hintKey;
      hint.textContent =
        hintKey === 'frame'
          ? 'Step into frame'
          : hintKey === 'start'
            ? 'Get into start position'
            : '';
    }
  }

  // The count word in flight, so closing the sheet only cancels speech this panel started.
  let pending: SpeechSynthesisUtterance | null = null;
  function say(text: string): void {
    // Cancel-then-speak: a count must never lag behind queued speech.
    if (pending) voice.cancel();
    const u = voice.speak(text);
    pending = u;
    if (u) {
      const done = () => {
        if (pending === u) pending = null;
      };
      u.addEventListener('end', done);
      u.addEventListener('error', done);
    }
  }

  render(false);
  return {
    el,
    update(frame) {
      if (frame) {
        const before = { reps: counter.reps, partials: counter.partials };
        for (const ev of counter.push(frame)) {
          // Partials are not spoken here: that cue belongs to the focus coach (M5).
          if (ev.type === 'rep' && opts.spokenCount !== false) say(repWord(ev.index));
        }
        if (counter.reps !== before.reps || counter.partials !== before.partials) {
          opts.onCount?.(counter.reps, counter.partials);
        }
      }
      render(frame !== null);
    },
    reset() {
      counter.reset();
      render(false);
    },
    silence() {
      if (pending) voice.cancel();
      pending = null;
    },
  };
}

export function createCameraView(opts: CameraViewOptions): CameraView {
  let facing: Facing = 'user';
  let stream: MediaStream | null = null;
  let tracker: PoseTracker | null = null;
  let skeleton: Skeleton3D | null = null;
  let running = false;
  let loopHandle = 0;
  let t0 = 0;
  const fps = new FpsMeter();
  let lastStatus = 0;

  const video = h('video', { class: 'cam-video', playsinline: true, muted: true });
  const overlay = h('canvas', { class: 'cam-overlay' });
  const stage = h('div', { class: 'cam-stage', 'data-facing': facing }, video, overlay);
  const status = h('p', { class: 'cam-status', 'aria-live': 'polite' }, 'Starting camera…');
  const skelSlot = h('div', { class: 'skeleton-slot' });
  const rule = opts.exerciseId ? ruleFor(opts.exerciseId) : undefined;
  const counter = rule ? createRepPanel(createRepCounter(rule), rule.limb, opts) : null;

  const presetBtn = (p: SkeletonPreset, label: string) =>
    h(
      'button',
      {
        class: 'seg-btn small-seg',
        'data-preset': p,
        onclick: () => {
          skeleton?.setPreset(p);
          el.querySelectorAll('[data-preset]').forEach((b) =>
            b.classList.toggle('active', (b as HTMLElement).dataset.preset === p),
          );
        },
      },
      label,
    );

  const el = h(
    'div',
    {
      class: `overlay sheet camera-sheet${counter ? ' counting' : ''}`,
      role: 'dialog',
      'aria-label': 'Camera',
    },
    h(
      'header',
      { class: 'top-bar' },
      h('p', { class: 'page-title small-title' }, opts.title),
      h(
        'button',
        {
          class: 'ghost-btn',
          onclick: () => {
            counter?.silence();
            opts.onClose();
          },
        },
        'Close',
      ),
    ),
    counter?.el,
    stage,
    status,
    h(
      'div',
      { class: 'cam-controls' },
      h('button', { class: 'ghost-btn', onclick: () => void switchCamera() }, 'Switch camera'),
      presetBtn('front', 'Front'),
      presetBtn('side', 'Side'),
    ),
    skelSlot,
    h('p', { class: 'muted small' }, 'On-device only. Nothing is recorded or uploaded.'),
    counter &&
      h(
        'div',
        { class: 'sticky-bottom' },
        h(
          'button',
          {
            class: 'primary-btn',
            onclick: () => {
              // Silence first so a late count word can't cut off the rest cue that follows.
              counter?.silence();
              opts.onSetDone?.();
            },
          },
          'Set done',
        ),
      ),
  );

  function setStatus(text: string, data: Record<string, string> = {}): void {
    status.textContent = text;
    Object.assign(el.dataset, data);
  }

  function loop(): void {
    if (!running || !tracker) return;
    if (video.readyState >= 2) {
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        // Match the stage to the camera's shape (portrait on an upright phone) so nothing is cropped.
        stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }
      const now = performance.now();
      const frame = tracker.detect(video, now - t0);
      fps.tick(now);
      drawOverlay(overlay, frame);
      counter?.update(frame);
      skeleton?.update(frame?.world, facing === 'user');
      if (now - lastStatus > 250) {
        lastStatus = now;
        const f = fps.fps;
        setStatus(
          `${f.toFixed(0)} fps · ${tracker.delegate} · ${frame ? 'tracking' : 'no person in view'}`,
          { fps: f.toFixed(1), delegate: tracker.delegate, person: String(Boolean(frame)) },
        );
      }
    }
    schedule();
  }

  function schedule(): void {
    if (!running) return;
    if ('requestVideoFrameCallback' in video) {
      loopHandle = video.requestVideoFrameCallback(() => loop());
    } else {
      loopHandle = requestAnimationFrame(() => loop());
    }
  }

  async function switchCamera(): Promise<void> {
    facing = facing === 'user' ? 'environment' : 'user';
    stage.dataset.facing = facing;
    // Counted reps survive a camera switch: the counter itself handles a re-zeroed or jumping
    // frame clock (t backwards → back to setup, counts kept; > 500 ms gap → reseed), so we just
    // keep feeding it frames. Only start() resets, before the first frame of the sheet.
    stopStream(stream);
    try {
      stream = await openCamera(video, facing);
    } catch (err) {
      setStatus(`Camera error: ${(err as Error).message}`);
    }
  }

  return {
    el,
    async start() {
      running = true;
      try {
        stream = await openCamera(video, facing);
      } catch (err) {
        const name = (err as Error).name;
        setStatus(
          name === 'NotAllowedError'
            ? 'Camera blocked. Allow camera access for this site in your browser settings.'
            : `Camera error: ${(err as Error).message}`,
          { error: name },
        );
        return;
      }
      setStatus('Loading pose model…');
      try {
        const [{ createPoseTracker }, sk] = await Promise.all([
          import('../pose/landmarker'),
          import('./skeleton3d'),
        ]);
        if (!running) return;
        tracker = await createPoseTracker('GPU');
        skeleton = sk.createSkeleton3D();
        skelSlot.append(skeleton.el);
        skeleton.setPreset('front');
        el.querySelector('[data-preset="front"]')?.classList.add('active');
      } catch (err) {
        setStatus(`Pose model failed to load: ${(err as Error).message}`, { error: 'model' });
        return;
      }
      if (!running) return;
      t0 = performance.now();
      // Fresh sheet: nothing counted yet, so no onCount(0, 0). Camera switches don't reset.
      counter?.reset();
      setStatus(`Tracking · ${tracker.delegate}`, { delegate: tracker.delegate });
      schedule();
    },
    stop() {
      running = false;
      counter?.silence();
      if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(loopHandle);
      cancelAnimationFrame(loopHandle);
      stopStream(stream);
      stream = null;
      video.srcObject = null;
      tracker?.close();
      tracker = null;
      skeleton?.dispose();
      skeleton = null;
      el.remove();
    },
  };
}
