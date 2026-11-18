import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createFromOptions = vi.fn();
vi.mock('@mediapipe/tasks-vision', () => ({
  PoseLandmarker: { createFromOptions: (...a: unknown[]) => createFromOptions(...a) },
}));
vi.mock('./fileset', () => ({
  isNativeScheme: (p: string) => p === 'capacitor:',
  loadWasmFileset: async () => ({ fileset: { wasmLoaderPath: 'l.js', wasmBinaryPath: 'b.wasm' }, release: () => {} }),
  loadModelBuffer: async () => new Uint8Array([1, 2, 3]),
}));

const { createPoseTracker, MODEL_URL, POSE_CONFIDENCE } = await import('./landmarker');

const fakeLandmarker = () => ({ detectForVideo: vi.fn(() => ({ landmarks: [], worldLandmarks: [] })), close: vi.fn() });

describe('createPoseTracker options (M13b task 3)', () => {
  beforeEach(() => {
    createFromOptions.mockReset();
    vi.stubGlobal('location', { protocol: 'https:', origin: 'https://a.test' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pins the confidences at 0.3 (bent-over row detection), lite model, VIDEO mode, one pose', async () => {
    expect(POSE_CONFIDENCE).toEqual({ minPoseDetectionConfidence: 0.3, minPosePresenceConfidence: 0.3, minTrackingConfidence: 0.3 });
    createFromOptions.mockResolvedValue(fakeLandmarker());
    const t = await createPoseTracker('GPU');
    expect(t.delegate).toBe('GPU');
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    const opts = createFromOptions.mock.calls[0]?.[1];
    expect(opts).toEqual({
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });
    expect(MODEL_URL).toMatch(/pose_landmarker_lite\.task$/);
  });

  it('keeps the same confidences on the CPU fallback and the native (own fetch) path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    createFromOptions.mockRejectedValueOnce(new Error('no gpu')).mockResolvedValueOnce(fakeLandmarker());
    const t = await createPoseTracker('GPU', { ownFetch: true });
    expect(t.delegate).toBe('CPU');
    const opts = createFromOptions.mock.calls[1]?.[1];
    expect(opts.baseOptions.delegate).toBe('CPU');
    expect(opts.baseOptions.modelAssetBuffer).toBeInstanceOf(Uint8Array);
    expect(opts).toMatchObject({ minPoseDetectionConfidence: 0.3, minPosePresenceConfidence: 0.3, minTrackingConfidence: 0.3 });
  });
});
