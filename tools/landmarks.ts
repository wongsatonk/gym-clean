// Dev-only: runs Pose Landmarker (VIDEO mode, CPU for reproducibility) over every frame of a
// video and returns LandmarkFrame[] (SPEC §4). Driven by scripts/landmarks.mjs.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkFrame } from '../src/core/types';

declare global {
  interface Window {
    __extract: (
      url: string,
      fps?: number,
    ) => Promise<{ frames: LandmarkFrame[]; total: number; error?: string }>;
  }
}

const MAX_SECONDS = 600;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

async function landmarker(): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = t;
  });
}

window.__extract = async (url, fps = 30) => {
  const status = document.getElementById('status');
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  document.body.append(video);
  const ok = await new Promise<boolean>((resolve) => {
    video.addEventListener('loadeddata', () => resolve(true), { once: true });
    video.addEventListener('error', () => resolve(false), { once: true });
  });
  if (!ok) return { frames: [], total: 0, error: `cannot decode (${video.error?.code ?? '?'})` };
  if (!Number.isFinite(video.duration)) {
    // MediaRecorder WebM has no duration header: seek far past the end so the browser computes it.
    await new Promise<void>((resolve) => {
      video.addEventListener('durationchange', () => resolve(), { once: true });
      video.currentTime = 1e101;
    });
    await seek(video, 0);
  }
  if (!Number.isFinite(video.duration) || video.duration > MAX_SECONDS) {
    return { frames: [], total: 0, error: `unsupported duration (${video.duration}s)` };
  }

  const lm = await landmarker();
  const frames: LandmarkFrame[] = [];
  const total = Math.floor(video.duration * fps);
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    await seek(video, t);
    const ms = Math.round(t * 1000);
    const r = lm.detectForVideo(video, ms);
    const pose = r.landmarks[0];
    if (pose) {
      const frame: LandmarkFrame = {
        t: ms,
        landmarks: pose.map((p) => ({
          x: r4(p.x),
          y: r4(p.y),
          z: r4(p.z),
          visibility: r4(p.visibility ?? 0),
        })),
      };
      const world = r.worldLandmarks[0];
      if (world) frame.world = world.map((p) => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) }));
      frames.push(frame);
    }
    if (status && i % 30 === 0) status.textContent = `${i}/${total} frames`;
  }
  lm.close();
  video.remove();
  return { frames, total };
};
