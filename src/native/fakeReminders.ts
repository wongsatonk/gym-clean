// Fake of `@capacitor/local-notifications` for unit tests and Playwright e2e (M12 slice 2 task 11).
// Never part of the app bundle: nothing in src/ imports this file except tests.
//
// `installFakeLocalNotifications` is self-contained (no imports, no module-level references), so a
// spec can pass it straight to Playwright:
//
//   await page.addInitScript(installFakeLocalNotifications, { display: 'prompt', grantOnRequest: true });
//   // later: await page.evaluate(() => window.__gymCleanFakeNotifications)
//
// It makes `window.Capacitor` look native (keeping any other fake plugins already there) and
// exposes the fake's state on `window.__gymCleanFakeNotifications`.

export type FakeDisplay = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export type FakeNotificationsOptions = {
  /** What `checkPermissions()` says before any request. Default 'prompt'. */
  display?: FakeDisplay;
  /** What `requestPermissions()` turns a 'prompt' into. Default true (→ 'granted'). */
  grantOnRequest?: boolean;
  /** Numeric ids already pending (e.g. someone else's notification). */
  pendingIds?: number[];
};

export type FakeNotificationsState = {
  display: FakeDisplay;
  /** How many times the iOS prompt would have been shown. */
  prompts: number;
  /** Every method call in order, e.g. 'checkPermissions', 'schedule'. */
  calls: string[];
  /** Pending notifications by numeric id; `at` as epoch ms. */
  pending: { id: number; title: string; body: string; at: number }[];
};

export type FakeLocalNotifications = {
  plugin: {
    checkPermissions(): Promise<{ display: FakeDisplay }>;
    requestPermissions(): Promise<{ display: FakeDisplay }>;
    schedule(o: {
      notifications: { id: number; title: string; body: string; schedule: { at: Date } }[];
    }): Promise<{ notifications: { id: number }[] }>;
    cancel(o: { notifications: { id: number }[] }): Promise<void>;
    getPending(): Promise<{ notifications: { id: number; title: string; body: string }[] }>;
  };
  state: FakeNotificationsState;
};

/** Builds the fake plugin + its inspectable state without touching `window`. */
export function createFakeLocalNotifications(
  options: FakeNotificationsOptions = {},
): FakeLocalNotifications {
  const target: { Capacitor?: { Plugins?: Record<string, unknown> } } = {};
  const state = installFakeLocalNotifications({ ...options, target });
  const plugin = target.Capacitor?.Plugins?.LocalNotifications as FakeLocalNotifications['plugin'];
  return { plugin, state };
}

/**
 * Installs the fake as `window.Capacitor.Plugins.LocalNotifications` (native look) and returns its
 * state. Self-contained so Playwright can serialize it for `page.addInitScript(fn, options)`;
 * `target` (unit tests only) installs onto another object instead of `globalThis`.
 */
export function installFakeLocalNotifications(
  options: FakeNotificationsOptions & { target?: object } = {},
): FakeNotificationsState {
  const state: FakeNotificationsState = {
    display: options.display ?? 'prompt',
    prompts: 0,
    calls: [],
    pending: (options.pendingIds ?? []).map((id) => ({ id, title: 'Other', body: '', at: 0 })),
  };
  const grant = options.grantOnRequest ?? true;
  const plugin = {
    checkPermissions() {
      state.calls.push('checkPermissions');
      return Promise.resolve({ display: state.display });
    },
    requestPermissions() {
      state.calls.push('requestPermissions');
      if (state.display === 'prompt' || state.display === 'prompt-with-rationale') {
        state.prompts += 1;
        state.display = grant ? 'granted' : 'denied';
      }
      return Promise.resolve({ display: state.display });
    },
    schedule(o: {
      notifications: { id: number; title: string; body: string; schedule: { at: Date } }[];
    }) {
      state.calls.push('schedule');
      // Same rules as the plugin on iOS: a whole number id and a body string are required.
      for (const n of o.notifications) {
        if (!Number.isInteger(n.id)) return Promise.reject(new Error('Missing id'));
        if (typeof n.body !== 'string') return Promise.reject(new Error('Missing body'));
      }
      for (const n of o.notifications) {
        const at = new Date(n.schedule.at).getTime();
        state.pending = state.pending.filter((p) => p.id !== n.id);
        state.pending.push({ id: n.id, title: n.title, body: n.body, at });
      }
      return Promise.resolve({ notifications: o.notifications.map((n) => ({ id: n.id })) });
    },
    cancel(o: { notifications: { id: number }[] }) {
      state.calls.push('cancel');
      if (!Array.isArray(o.notifications) || o.notifications.length === 0) {
        return Promise.reject(new Error('Must provide notifications array'));
      }
      const ids = new Set(o.notifications.map((n) => String(n.id)));
      state.pending = state.pending.filter((p) => !ids.has(String(p.id)));
      return Promise.resolve();
    },
    getPending() {
      state.calls.push('getPending');
      return Promise.resolve({
        notifications: state.pending.map((p) => ({ id: p.id, title: p.title, body: p.body })),
      });
    },
  };
  type Cap = { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
  const w = (options.target ?? globalThis) as {
    Capacitor?: Cap;
    __gymCleanFakeNotifications?: unknown;
  };
  const cap: Cap = w.Capacitor ?? {};
  cap.isNativePlatform ??= () => true;
  cap.Plugins = { ...(cap.Plugins ?? {}), LocalNotifications: plugin };
  w.Capacitor = cap;
  w.__gymCleanFakeNotifications = state;
  return state;
}
