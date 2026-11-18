// Wraps MediaPipe Pose Landmarker (lite, VIDEO mode) and emits LandmarkFrame objects.
// Model and wasm are self-hosted under public/ (no CDN, no uploads).
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkFrame } from '../core/types';
import { isNativeScheme, loadModelBuffer, loadWasmFileset } from './fileset';
import { describeLoadError } from './loadError';

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

/**
 * Detection/presence/tracking confidences (MediaPipe default 0.5). 0.3 keeps the pose through the
 * bent-over row (M13b task 2: frames with a pose 92/52/64/57/61% -> 95/71/76/80/87% on the five
 * real row clips, same speed). Fixtures in fixtures/landmarks stay extracted at the defaults.
 */
export const POSE_CONFIDENCE = {
  minPoseDetectionConfidence: 0.3,
  minPosePresenceConfidence: 0.3,
  minTrackingConfidence: 0.3,
} as const;

export type CreateOptions = {
  /**
   * Fetch the wasm loader + model ourselves (blob: loader, modelAssetBuffer) instead of letting
   * MediaPipe load them. Defaults to on for the native app (capacitor://), off on the web.
   */
  ownFetch?: boolean;
};

async function create(delegate: Delegate, ownFetch: boolean): Promise<PoseLandmarker> {
  const { fileset, release } = await loadWasmFileset({
    base,
    native: ownFetch,
    origin: location.origin,
    fetchFn: (url) => fetch(url),
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
  });
  try {
    const baseOptions = ownFetch
      ? { modelAssetBuffer: await loadModelBuffer(new URL(MODEL_URL, location.origin).href, (u) => fetch(u)), delegate }
      : { modelAssetPath: MODEL_URL, delegate };
    return await PoseLandmarker.createFromOptions(fileset, {
      baseOptions,
      runningMode: 'VIDEO',
      numPoses: 1,
      ...POSE_CONFIDENCE,
    });
  } finally {
    release();
  }
}

/** A thrown Error with a readable message (MediaPipe can reject with a bare script error Event). */
function readable(err: unknown): Error {
  if (err instanceof Error && err.message) return err;
  return new Error(describeLoadError(err), { cause: err });
}

/** GPU delegate first; falls back to CPU if the GPU path fails to initialise. */
export async function createPoseTracker(prefer: Delegate = 'GPU', opts: CreateOptions = {}): Promise<PoseTracker> {
  const ownFetch = opts.ownFetch ?? isNativeScheme(location.protocol);
  let delegate: Delegate = prefer;
  let landmarker: PoseLandmarker;
  try {
    landmarker = await create(prefer, ownFetch);
  } catch (err) {
    if (prefer === 'CPU') {
      console.error('Pose model failed to load', err);
      throw readable(err);
    }
    console.warn('Pose GPU delegate failed, using CPU', err);
    delegate = 'CPU';
    try {
      landmarker = await create('CPU', ownFetch);
    } catch (err2) {
      console.error('Pose model failed to load', err2);
      throw readable(err2);
    }
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
