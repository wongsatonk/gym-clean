// M12 slice 2 task 21: fake native plugins for the e2e specs (not a spec itself). Each installer
// adds an init script that makes `window.Capacitor` look like the iPhone app (or, with
// `native: false`, like a Capacitor object that says "not native") and puts a fake plugin on
// `Capacitor.Plugins`, which src/native/*.ts `load*()` pick up before anything else. Every fake
// keeps what it was asked on `window.__gymBrain` / `window.__gymSpeech` so specs can assert it.
// Several installers can run on one page: each keeps the plugins already there.
//
// All data is made up (the repo is public). Nothing here makes a request.
import type { Page } from '@playwright/test';

export type FakeBrainAvailability =
  | { available: true }
  | { available: false; reason: string }
  /** The check itself fails (plugin rejection). */
  | { reject: true }
  /** The check never answers (the app's own timeout must give up). */
  | { hang: true };

/** One queued `respond` outcome. `echo` answers with the first sentence of that tool result. */
export type FakeBrainStep =
  | { text: string; toolCalls?: { name: string; args?: Record<string, unknown> }[] }
  | { echo: string; toolCalls?: { name: string; args?: Record<string, unknown> }[] }
  | { error: string };

export type FakeBrainRequest = {
  instructions: string;
  context: string;
  messages: { role: string; text: string }[];
  toolResults: Record<string, string>;
};

export type FakeBrainState = {
  availability: FakeBrainAvailability;
  /** Consumed one per `respond`; empty → `{ text: DEFAULT_BRAIN_TEXT }`. */
  queue: FakeBrainStep[];
  requests: FakeBrainRequest[];
  availabilityCalls: number;
  prewarms: number;
};

export type FakeSpeechState = {
  availability: { available: true } | { available: false; reason: string };
  /** iOS microphone permission: the first `start` asks once ('notDetermined' → `grant`). */
  permission: 'notDetermined' | 'granted' | 'denied';
  grant: boolean;
  /** How many times the iOS microphone prompt would have shown. */
  prompts: number;
  calls: string[];
  /** What `stop()` returns as the final text. */
  final: string;
  /** Checkpoint J: `installModel()` waits until the spec calls `__gymSpeechFinishInstall`. */
  installs: number;
};

declare global {
  interface Window {
    __gymBrain: FakeBrainState;
    __gymSpeech: FakeSpeechState;
    __gymSpeechEmit: (event: string, data: unknown) => void;
    /** Ends a pending `installModel()`: ok → { installed: true } and the model is available. */
    __gymSpeechFinishInstall: (ok: boolean) => void;
  }
}

/** What the fake brain says when nothing is queued. */
export const DEFAULT_BRAIN_TEXT = 'Keep your elbows tucked on the bench today.';

/** Fake `GymBrain` (src/native/gymBrain.ts). `native: false` → the plugin must never be called. */
export async function installGymBrain(
  page: Page,
  opts: { native?: boolean; availability?: FakeBrainAvailability } = {},
): Promise<void> {
  await page.addInitScript(
    ({ native, availability, defaultText }) => {
      const state: FakeBrainState = {
        availability,
        queue: [],
        requests: [],
        availabilityCalls: 0,
        prewarms: 0,
      };
      window.__gymBrain = state;
      const firstSentence = (s: string) => (/^[^.!?]*[.!?]/.exec(s)?.[0] ?? s).trim();
      const plugin = {
        availability: () => {
          state.availabilityCalls++;
          const a = state.availability;
          if ('reject' in a) return Promise.reject(new Error('GymBrain check failed'));
          if ('hang' in a) return new Promise<never>(() => undefined);
          return Promise.resolve({ ...a });
        },
        respond: (req: FakeBrainRequest) => {
          state.requests.push(JSON.parse(JSON.stringify(req)) as FakeBrainRequest);
          const step = state.queue.shift() ?? { text: defaultText };
          if ('error' in step)
            return Promise.reject(
              Object.assign(new Error('GymBrain failed'), { code: step.error }),
            );
          const text = 'echo' in step ? firstSentence(req.toolResults[step.echo] ?? '') : step.text;
          return Promise.resolve({ text, toolCalls: step.toolCalls ?? [], latencyMs: 420 });
        },
        prewarm: () => {
          state.prewarms++;
          return Promise.resolve({});
        },
        measure: () =>
          Promise.resolve({ instructions: 1180, tools: 1420, prompt: 950, contextSize: 4096 }),
      };
      type Cap = {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
        Plugins?: Record<string, unknown>;
      };
      const w = window as unknown as { Capacitor?: Cap };
      const cap: Cap = w.Capacitor ?? {};
      cap.isNativePlatform = () => native;
      cap.getPlatform = () => (native ? 'ios' : 'web');
      cap.Plugins = { ...(cap.Plugins ?? {}), GymBrain: plugin };
      w.Capacitor = cap;
    },
    {
      native: opts.native ?? true,
      availability: opts.availability ?? { available: true },
      defaultText: DEFAULT_BRAIN_TEXT,
    },
  );
}

/**
 * Fake `GymSpeech` (src/native/speech.ts): availability, start / stop and the four events, which
 * the spec fires with `speechEmit`. Permission is modelled like iOS: asked on the first `start`
 * only, never at launch.
 */
export async function installGymSpeech(
  page: Page,
  opts: {
    native?: boolean;
    availability?: FakeSpeechState['availability'];
    permission?: FakeSpeechState['permission'];
    grant?: boolean;
  } = {},
): Promise<void> {
  await page.addInitScript(
    ({ native, availability, permission, grant }) => {
      const state: FakeSpeechState = {
        availability,
        permission,
        grant,
        prompts: 0,
        calls: [],
        final: '',
        installs: 0,
      };
      window.__gymSpeech = state;
      let finishInstall: ((ok: boolean) => void) | null = null;
      window.__gymSpeechFinishInstall = (ok) => finishInstall?.(ok);
      const listeners = new Map<string, ((data: unknown) => void)[]>();
      window.__gymSpeechEmit = (event, data) => {
        for (const cb of listeners.get(event) ?? []) cb(data);
      };
      const plugin = {
        availability: () => {
          state.calls.push('availability');
          return Promise.resolve({ ...state.availability });
        },
        start: () => {
          state.calls.push('start');
          if (state.permission === 'notDetermined') {
            state.prompts++;
            state.permission = state.grant ? 'granted' : 'denied';
          }
          if (state.permission === 'denied')
            return Promise.reject(
              Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }),
            );
          return Promise.resolve({});
        },
        installModel: () => {
          state.calls.push('installModel');
          state.installs++;
          return new Promise((resolve) => {
            finishInstall = (ok) => {
              finishInstall = null;
              if (ok) state.availability = { available: true };
              resolve({ installed: ok });
            };
          });
        },
        stop: () => {
          state.calls.push('stop');
          return Promise.resolve({ text: state.final });
        },
        addListener: (event: string, cb: (data: unknown) => void) => {
          listeners.set(event, [...(listeners.get(event) ?? []), cb]);
          return Promise.resolve({ remove: () => undefined });
        },
      };
      type Cap = {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
        Plugins?: Record<string, unknown>;
      };
      const w = window as unknown as { Capacitor?: Cap };
      const cap: Cap = w.Capacitor ?? {};
      cap.isNativePlatform = () => native;
      cap.getPlatform = () => (native ? 'ios' : 'web');
      cap.Plugins = { ...(cap.Plugins ?? {}), GymSpeech: plugin };
      w.Capacitor = cap;
    },
    {
      native: opts.native ?? true,
      availability: opts.availability ?? { available: true },
      permission: opts.permission ?? 'notDetermined',
      grant: opts.grant ?? true,
    },
  );
}

/** Ends the pending fake `installModel()` (ok → installed and available). */
export async function speechFinishInstall(page: Page, ok: boolean): Promise<void> {
  await page.evaluate((v) => window.__gymSpeechFinishInstall(v), ok);
}

/** Fires a GymSpeech event (`partial { text }`, `level { rms }`, `final`, `error { code }`). */
export async function speechEmit(page: Page, event: string, data: unknown): Promise<void> {
  await page.evaluate(([e, d]) => window.__gymSpeechEmit(e as string, d), [event, data] as const);
}

export const brainState = (page: Page): Promise<FakeBrainState> =>
  page.evaluate(() => window.__gymBrain);

export const speechState = (page: Page): Promise<FakeSpeechState> =>
  page.evaluate(() => window.__gymSpeech);

/** Queues `respond` outcomes on the fake brain. */
export async function queueBrain(page: Page, ...steps: FakeBrainStep[]): Promise<void> {
  await page.evaluate((s) => window.__gymBrain.queue.push(...s), steps);
}

export async function setBrainAvailability(page: Page, a: FakeBrainAvailability): Promise<void> {
  await page.evaluate((v) => {
    window.__gymBrain.availability = v;
  }, a);
}
