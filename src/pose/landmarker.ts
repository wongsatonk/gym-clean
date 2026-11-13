// Wraps MediaPipe Pose Landmarker (lite, VIDEO mode) and emits LandmarkFrame objects.
// Model and wasm are self-hosted under public/ (no CDN, no uploads).
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkFrame } from '../core/types';

export type Delegate = 'GPU' | 'CPU';

export type PoseTracker = {
  readonly delegate: Delegate;
  /** Runs inference on the current frame. `t` = ms since stream start (must increase). */
  detect(source: HTMLVideoElement | HTMLCanvasElement, t: number): LandmarkFrame | null;
  close(): void;
};

const base = import.meta.env.BASE_URL;
export const MODEL_URL = `${base}models/pose_landmarker_lite.task`;
export const WASM_URL = `${base}mediapipe/wasm`;

async function create(delegate: Delegate): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

/** GPU delegate first; falls back to CPU if the GPU path fails to initialise. */
export async function createPoseTracker(prefer: Delegate = 'GPU'): Promise<PoseTracker> {
  let delegate: Delegate = prefer;
  let landmarker: PoseLandmarker;
  try {
    landmarker = await create(prefer);
  } catch (err) {
    if (prefer === 'CPU') throw err;
    console.warn('Pose GPU delegate failed, using CPU', err);
    delegate = 'CPU';
    landmarker = await create('CPU');
  }
  let lastTs = -1;
  return {
    delegate,
    detect(source, t) {
      const ts = Math.max(Math.round(t), lastTs + 1); // VIDEO mode needs strictly increasing timestamps
      lastTs = ts;
      const r = landmarker.detectForVideo(source, ts);
      const lm = r.landmarks[0];
      if (!lm) return null;
      const world = r.worldLandmarks[0];
      const frame: LandmarkFrame = {
        t: ts,
        landmarks: lm.map(({ x, y, z, visibility }) => ({ x, y, z, visibility: visibility ?? 0 })),
      };
      if (world) frame.world = world.map(({ x, y, z }) => ({ x, y, z }));
      return frame;
    },
    close() {
      landmarker.close();
    },
  };
}
