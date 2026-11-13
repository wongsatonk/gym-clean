// Camera screen: live video, 2D skeleton overlay, fps, camera switch, 3D live skeleton.
// Privacy: frames are only passed to on-device inference; nothing is recorded or uploaded.
import { FpsMeter } from '../core/fps';
import { JOINTS, SKELETON } from '../core/poseTopology';
import type { LandmarkFrame } from '../core/types';
import { openCamera, stopStream, type Facing } from '../pose/camera';
import type { PoseTracker } from '../pose/landmarker';
import { h } from './dom';
import type { Skeleton3D, SkeletonPreset } from './skeleton3d';

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

export function createCameraView(opts: { onClose: () => void; title: string }): CameraView {
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
    { class: 'overlay sheet camera-sheet', role: 'dialog', 'aria-label': 'Camera' },
    h(
      'header',
      { class: 'top-bar' },
      h('p', { class: 'page-title small-title' }, opts.title),
      h('button', { class: 'ghost-btn', onclick: () => opts.onClose() }, 'Close'),
    ),
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
      setStatus(`Tracking · ${tracker.delegate}`, { delegate: tracker.delegate });
      schedule();
    },
    stop() {
      running = false;
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
