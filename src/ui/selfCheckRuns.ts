// 1.15.0 Self-check: the real checks behind src/ui/screens/selfCheck.ts. Every dependency is
// injected (`SelfCheckDeps`) so the checks are tested with fakes; `defaultSelfCheckDeps(db)` wires
// the real modules. Rules: nothing asks for a permission (only "read the stored answer" calls:
// permissions.query, Reminders.permission, GymBrain/GymSpeech availability, Health isAvailable,
// storage.persisted), the camera is never opened, nothing leaves the phone. Each check has its own
// timeout and never throws (a throw or a timeout becomes a "fail" row with a readable reason).
// Native-only checks (coach, mic, notifications, Health) answer "iPhone app only" on the web
// without touching their module.
import type { GymBrainAvailability } from '../native/gymBrain';
import type { ReminderPermission } from '../native/reminders';
import type { SpeechAvailability } from '../native/speech';
import { APP_NAME } from '../core/brand';
import { describeLoadError } from '../pose/loadError';
import { BRAIN_REASON_COPY } from './screens/coachSettings';
import type { CheckOutcome, SelfCheck } from './screens/selfCheck';
import type { GymDb } from '../data/db';

export const SELF_CHECK_IDS = [
  'version',
  'pose',
  'camera',
  'voice',
  'storage',
  'brain',
  'speech',
  'notifications',
  'health',
] as const;
export type SelfCheckId = (typeof SELF_CHECK_IDS)[number];

export const SELF_CHECK_NAMES: Record<SelfCheckId, string> = {
  version: 'App version',
  pose: 'Pose engine (camera reps)',
  camera: 'Camera permission',
  voice: 'Coach voice',
  storage: 'Storage on this phone',
  brain: "Apple's on-device coach",
  speech: 'Mic speech to text',
  notifications: 'Notifications',
  health: 'Apple Health',
};

/** Per-check timeouts (ms). The pose engine loads a 14.7 MB wasm the first time. */
export const SELF_CHECK_TIMEOUT_MS: Record<SelfCheckId, number> = {
  version: 2000,
  pose: 30_000,
  camera: 4000,
  voice: 5000,
  storage: 6000,
  brain: 8000,
  speech: 8000,
  notifications: 6000,
  health: 8000,
};

export const IPHONE_ONLY = 'iPhone app only';
export const TEMP_KEY = 'selfCheckTemp';

type Availability<T> = { availability(): Promise<T> };

export type SelfCheckDeps = {
  release: string;
  build: string;
  /** Inside the Capacitor iPhone app. */
  native: boolean;
  /** Creates the pose tracker (no camera) — closed straight after. */
  createTracker: () => Promise<{ delegate: string; close(): void }>;
  /** The stored camera permission ('granted' | 'denied' | 'prompt'); undefined → can't tell. */
  cameraPermission?: (() => Promise<string>) | undefined;
  brain: () => Promise<Availability<GymBrainAvailability>>;
  speech: () => Promise<Availability<SpeechAvailability>>;
  reminders: () => Promise<{ available: boolean; permission(): Promise<ReminderPermission> }>;
  health: () => Promise<{ isAvailable(): Promise<boolean> }>;
  /** At least one Health type is on in our settings (the app's "connected"). */
  healthConnected: () => Promise<boolean>;
  storage: {
    put(key: string, value: unknown): Promise<void>;
    get(key: string): Promise<unknown>;
    delete(key: string): Promise<void>;
  };
  /** navigator.storage.persisted (never persist(), which may ask). */
  persisted?: (() => Promise<boolean>) | undefined;
  /** Installed voices; null when there is no speechSynthesis at all. */
  voices: () => Promise<readonly { lang: string; name: string }[] | null>;
};

const FRESH_BUILD = 'Install a fresh build of the app.';

function guarded(id: SelfCheckId, fn: () => Promise<CheckOutcome>, info = false): SelfCheck {
  const ms = SELF_CHECK_TIMEOUT_MS[id];
  return {
    id,
    name: SELF_CHECK_NAMES[id],
    ...(info ? { info: true } : {}),
    run: () =>
      new Promise<CheckOutcome>((resolve) => {
        const t = setTimeout(
          () =>
            resolve({
              state: 'fail',
              detail: `Didn't answer within ${Math.round(ms / 1000)} s.`,
              fix: 'Tap Run again. If it happens again, install a fresh build.',
            }),
          ms,
        );
        let p: Promise<CheckOutcome>;
        try {
          p = fn();
        } catch (e) {
          p = Promise.reject(e);
        }
        p.then(
          (r) => (clearTimeout(t), resolve(r)),
          (e: unknown) => (
            clearTimeout(t),
            resolve({ state: 'fail', detail: describeLoadError(e) })
          ),
        );
      }),
  };
}

const SPEECH_UNSUPPORTED = {
  detail: "This iPhone can't turn speech into text on the phone.",
  fix: 'Type in Coach instead.',
};

const SPEECH_COPY: Record<string, { detail: string; fix: string }> = {
  modelNotInstalled: {
    detail: "Speech for the mic isn't on this iPhone yet.",
    fix: 'Open Coach and tap Download speech for the mic.',
  },
  modelDownloading: {
    detail: 'Speech for the mic is still downloading.',
    fix: 'Keep the iPhone on Wi-Fi, then run this again.',
  },
  permissionDenied: {
    detail: `The microphone is off for ${APP_NAME}.`,
    fix: `Turn it on in iPhone Settings > ${APP_NAME} > Microphone.`,
  },
  unsupported: SPEECH_UNSUPPORTED,
};

export function selfCheckRuns(d: SelfCheckDeps): SelfCheck[] {
  const iphoneOnly = (): Promise<CheckOutcome> =>
    Promise.resolve({ state: 'info', detail: IPHONE_ONLY });

  return [
    guarded(
      'version',
      () => {
        const b = d.build.trim();
        const build = b === '' || b === 'unknown' ? '' : ` (build ${b})`;
        const where = d.native ? 'iPhone app' : 'web app';
        return Promise.resolve({ state: 'info', detail: `${d.release}${build}, ${where}` });
      },
      true,
    ),

    guarded('pose', async () => {
      try {
        const t = await d.createTracker();
        t.close();
        return { state: 'ok', detail: `Loaded (${t.delegate})` };
      } catch (e) {
        return {
          state: 'fail',
          detail: describeLoadError(e),
          fix: d.native
            ? `Camera reps won't work. ${FRESH_BUILD}`
            : 'Reload the app on Wi-Fi so the pose files download again.',
        };
      }
    }),

    guarded('camera', async () => {
      let s: string | undefined;
      try {
        s = d.cameraPermission ? await d.cameraPermission() : undefined;
      } catch {
        s = undefined;
      }
      if (s === 'granted') return { state: 'ok', detail: 'Allowed' };
      if (s === 'denied')
        return {
          state: 'warn',
          detail: 'Camera is blocked.',
          fix: d.native
            ? `Turn it on in iPhone Settings > ${APP_NAME} > Camera.`
            : 'In Safari tap aA > Website Settings > Camera > Allow.',
        };
      if (s === 'prompt')
        return {
          state: 'warn',
          detail: 'Not allowed yet.',
          fix: 'Open the camera on any exercise and tap Allow.',
        };
      return {
        state: 'info',
        detail: "Can't tell here. The camera asks the first time you open it.",
      };
    }),

    guarded('voice', async () => {
      const list = await d.voices();
      if (list === null)
        return {
          state: 'fail',
          detail: "This browser can't speak.",
          fix: 'Use Safari or the iPhone app.',
        };
      const n = list.filter((v) => /^en\b/i.test(v.lang.replace('_', '-'))).length;
      if (n === 0)
        return {
          state: 'fail',
          detail: 'No English voice is installed.',
          fix: 'Add one in iPhone Settings > Accessibility > Spoken Content > Voices.',
        };
      return { state: 'ok', detail: n === 1 ? '1 English voice' : `${n} English voices` };
    }),

    guarded('storage', async () => {
      const token = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await d.storage.put(TEMP_KEY, token);
        const back = await d.storage.get(TEMP_KEY);
        await d.storage.delete(TEMP_KEY);
        if (back !== token)
          return {
            state: 'fail',
            detail: "Saved data didn't read back.",
            fix: 'Restart the app. If it repeats, back up in Settings and reinstall.',
          };
      } catch (e) {
        return {
          state: 'fail',
          detail: describeLoadError(e),
          fix: 'Free some space on the iPhone, then run this again.',
        };
      }
      if (d.native) return { state: 'ok', detail: 'Saving works' };
      let kept: boolean | undefined;
      try {
        kept = d.persisted ? await d.persisted() : undefined;
      } catch {
        kept = undefined;
      }
      if (kept === false)
        return {
          state: 'warn',
          detail: 'Saving works, but Safari may clear it when space is low.',
          fix: 'Add the app to the Home Screen, and back up in Settings.',
        };
      return { state: 'ok', detail: 'Saving works' };
    }),

    guarded('brain', async () => {
      if (!d.native) return iphoneOnly();
      let a: GymBrainAvailability;
      try {
        a = await (await d.brain()).availability();
      } catch {
        return {
          state: 'warn',
          detail: "Couldn't check Apple Intelligence just now.",
          fix: 'Tap Run again. Quick replies answer in Coach meanwhile.',
        };
      }
      if (a.available) return { state: 'ok', detail: 'Ready' };
      const copy = BRAIN_REASON_COPY[a.reason];
      return {
        state: 'warn',
        detail: copy.why,
        fix: copy.how ?? 'Quick replies still answer in Coach.',
      };
    }),

    guarded('speech', async () => {
      if (!d.native) return iphoneOnly();
      const a = await (await d.speech()).availability();
      if (a.available) return { state: 'ok', detail: 'Ready' };
      const copy = SPEECH_COPY[a.reason] ?? SPEECH_UNSUPPORTED;
      return { state: 'warn', ...copy };
    }),

    guarded('notifications', async () => {
      if (!d.native) return iphoneOnly();
      const r = await d.reminders();
      const p = r.available ? await r.permission() : 'unavailable';
      if (p === 'granted') return { state: 'ok', detail: 'Allowed' };
      if (p === 'denied')
        return {
          state: 'warn',
          detail: `Notifications are off for ${APP_NAME}.`,
          fix: `Turn them on in iPhone Settings > Notifications > ${APP_NAME}.`,
        };
      if (p === 'prompt')
        return { state: 'info', detail: 'Not asked yet. Reminders asks when you turn one on.' };
      return { state: 'warn', detail: "Notifications didn't answer.", fix: FRESH_BUILD };
    }),

    guarded('health', async () => {
      if (!d.native) return iphoneOnly();
      if (!(await (await d.health()).isAvailable()))
        return {
          state: 'warn',
          detail: "Apple Health didn't answer.",
          fix: `Check the Health app is on this iPhone. If it is, ${FRESH_BUILD.toLowerCase()}`,
        };
      if (await d.healthConnected()) return { state: 'ok', detail: 'Connected' };
      return {
        state: 'info',
        detail: 'Not connected. Connect it in Settings > Apple Health if you want.',
      };
    }),
  ];
}

// ---------- the real wiring ----------

type Nav = {
  permissions?: { query(d: { name: string }): Promise<{ state: string }> };
  storage?: { persisted?: () => Promise<boolean> };
};

/** Voices; iOS fills the list a moment after load, so wait for voiceschanged (≤ 2 s). */
async function installedVoices(): Promise<readonly { lang: string; name: string }[] | null> {
  const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  if (!synth || typeof synth.getVoices !== 'function') return null;
  const now = synth.getVoices();
  if (now.length > 0) return now;
  await new Promise<void>((resolve) => {
    // Whichever comes first (voiceschanged or 2 s) clears the other: no listener or timer left.
    const done = (): void => {
      clearTimeout(t);
      synth.removeEventListener?.('voiceschanged', done);
      resolve();
    };
    const t = setTimeout(done, 2000);
    synth.addEventListener?.('voiceschanged', done, { once: true });
  });
  return synth.getVoices();
}

/** Wires the real modules. Native modules load lazily; the pose engine is a dynamic import. */
export function defaultSelfCheckDeps(
  db: GymDb,
  env: { release: string; build: string; native: boolean },
): SelfCheckDeps {
  const nav = (globalThis as { navigator?: Nav }).navigator;
  const perms = nav?.permissions;
  const persisted = nav?.storage?.persisted?.bind(nav.storage);
  return {
    ...env,
    createTracker: async () => {
      const { createPoseTracker } = await import('../pose/landmarker');
      return createPoseTracker('GPU');
    },
    cameraPermission: perms ? async () => (await perms.query({ name: 'camera' })).state : undefined,
    brain: async () => (await import('../native/gymBrain')).loadGymBrain(),
    speech: async () => (await import('../native/speech')).loadSpeech(),
    reminders: async () => (await import('../native/reminders')).loadReminders(),
    health: async () => (await import('../native/health')).loadHealth(),
    healthConnected: async () => {
      const { getHealthSettings } = await import('../data/health/store');
      const s = await getHealthSettings(db);
      return Object.values(s.enabled).some(Boolean);
    },
    storage: {
      put: async (key, value) => void (await db.settings.put({ key, value })),
      get: async (key) => (await db.settings.get(key))?.value,
      delete: (key) => db.settings.delete(key),
    },
    persisted,
    voices: installedVoices,
  };
}
