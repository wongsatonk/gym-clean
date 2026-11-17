// M12 slice 2 task 11: local-notification bridge for the training reminders.
// Wraps `@capacitor/local-notifications@8.3.1` (task 1 choice, docs/ios-setup.md "Slice 2 API
// notes" §3), a thin layer over iOS `UNUserNotificationCenter`.
//
// - Web first: on the PWA (no native Capacitor) reminders are unavailable and every call is a
//   quiet no-op. Nothing here imports `@capacitor/core` at module level.
// - Never throws: a missing plugin, junk replies and plugin errors end in a plain result.
// - Only `request()` can show the iOS notification prompt. `loadReminders`, `permission()`,
//   `schedule()`, `cancel()` and `pending()` never prompt, and `schedule()` schedules nothing
//   unless notifications are already allowed.
// - Items whose time is not in the future are dropped: this plugin version delivers a past-dated
//   notification immediately instead of rejecting it.
// - No network: local notifications only. What to schedule (and the text) is decided by
//   src/core/reminders/schedule.ts; ids follow its scheme (`${kind}:${YYYY-MM-DD}` ↔ number).
import { reminderIdFromNumber, reminderNumericId } from '../core/reminders/schedule';
import { isNative, type CapacitorGlobal } from './health';

export const LOCAL_NOTIFICATIONS_PLUGIN = 'LocalNotifications';

/** `unavailable`: not the iPhone app, or the plugin is missing. */
export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** One notification to schedule. `id` is the plan's string id (`session:2026-11-18`). */
export type ReminderItem = {
  id: string;
  /** When to show it: epoch ms or a Date. */
  at: number | Date;
  title: string;
  body?: string;
};

export type ScheduleResult = {
  /** String ids handed to iOS. */
  scheduled: string[];
  /** String ids left out: time not in the future, bad id/time, or no permission. */
  dropped: string[];
};

/** Raw shape of the plugin methods we use (as `registerPlugin('LocalNotifications')` returns). */
export interface LocalNotificationsBridge {
  checkPermissions(): Promise<unknown>;
  requestPermissions(): Promise<unknown>;
  schedule(options: {
    notifications: { id: number; title: string; body: string; schedule: { at: Date } }[];
  }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<unknown>;
  getPending(): Promise<unknown>;
}

export interface Reminders {
  /** False on the web / without the plugin. */
  readonly available: boolean;
  /** Reads the stored permission. Never prompts. */
  permission(): Promise<ReminderPermission>;
  /** Shows the iOS prompt the first time; afterwards iOS just returns the stored answer. */
  request(): Promise<ReminderPermission>;
  /** Schedules future items (same id replaces). Nothing is scheduled without permission. */
  schedule(items: readonly ReminderItem[], now?: number): Promise<ScheduleResult>;
  /** Cancels pending reminders by string id. Unknown ids are ignored. */
  cancel(ids: readonly string[]): Promise<void>;
  /** String ids of our pending reminders (other notifications are ignored). */
  pending(): Promise<string[]>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pure mapping of `checkPermissions()` / `requestPermissions()` replies. */
export function mapReminderPermission(reply: unknown): ReminderPermission {
  const display = isObj(reply) ? reply.display : undefined;
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  if (display === 'prompt' || display === 'prompt-with-rationale') return 'prompt';
  return 'unavailable';
}

function numericId(id: string): number | null {
  try {
    const n: unknown = reminderNumericId(id);
    return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 0x7fffffff ? n : null;
  } catch {
    return null;
  }
}

function stringId(n: unknown): string | null {
  const num = typeof n === 'string' && /^\d+$/.test(n) ? Number(n) : n;
  if (typeof num !== 'number' || !Number.isSafeInteger(num)) return null;
  try {
    return reminderIdFromNumber(num) ?? null;
  } catch {
    return null;
  }
}

function timeOf(at: number | Date): number {
  return at instanceof Date ? at.getTime() : at;
}

/** Wraps the plugin (or `null` on the web) into the never-throwing `Reminders` API. */
export function createReminders(bridge: LocalNotificationsBridge | null): Reminders {
  const read = async (): Promise<ReminderPermission> => {
    if (!bridge) return 'unavailable';
    try {
      return mapReminderPermission(await bridge.checkPermissions());
    } catch {
      return 'unavailable';
    }
  };

  return {
    available: bridge !== null,

    permission: read,

    async request() {
      if (!bridge) return 'unavailable';
      try {
        return mapReminderPermission(await bridge.requestPermissions());
      } catch {
        return 'unavailable';
      }
    },

    async schedule(items, now = Date.now()) {
      const all = items.map((i) => i.id);
      if (!bridge || items.length === 0) return { scheduled: [], dropped: all };
      if ((await read()) !== 'granted') return { scheduled: [], dropped: all };

      const notifications: { id: number; title: string; body: string; schedule: { at: Date } }[] =
        [];
      const scheduled: string[] = [];
      const dropped: string[] = [];
      const seen = new Set<number>();
      for (const item of items) {
        const id = numericId(item.id);
        const t = timeOf(item.at);
        if (id === null || !Number.isFinite(t) || t <= now || seen.has(id)) {
          dropped.push(item.id);
          continue;
        }
        seen.add(id);
        // iOS rejects a notification without a body string, so an empty one is sent.
        notifications.push({
          id,
          title: item.title,
          body: item.body ?? '',
          schedule: { at: new Date(t) },
        });
        scheduled.push(item.id);
      }
      if (notifications.length === 0) return { scheduled: [], dropped };
      try {
        await bridge.schedule({ notifications });
        return { scheduled, dropped };
      } catch {
        return { scheduled: [], dropped: all };
      }
    },

    async cancel(ids) {
      if (!bridge) return;
      const nums = [...new Set(ids.map(numericId).filter((n): n is number => n !== null))];
      // The plugin rejects an empty list.
      if (nums.length === 0) return;
      try {
        await bridge.cancel({ notifications: nums.map((id) => ({ id })) });
      } catch {
        // Nothing to do: the next plan run cancels again.
      }
    },

    async pending() {
      if (!bridge) return [];
      try {
        const reply: unknown = await bridge.getPending();
        const list = isObj(reply) && Array.isArray(reply.notifications) ? reply.notifications : [];
        const ids = list
          .map((n: unknown) => (isObj(n) ? stringId(n.id) : null))
          .filter((id): id is string => id !== null);
        return [...new Set(ids)];
      } catch {
        return [];
      }
    },
  };
}

type CoreModule = { registerPlugin: (name: string) => unknown };

export type LoadRemindersEnv = {
  cap?: CapacitorGlobal | undefined;
  importCore?: () => Promise<CoreModule>;
};

function globalCapacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

function looksLikeBridge(p: unknown): p is LocalNotificationsBridge {
  if ((typeof p !== 'object' && typeof p !== 'function') || p === null) return false;
  const o = p as Obj;
  return ['checkPermissions', 'requestPermissions', 'schedule', 'cancel', 'getPending'].every(
    (m) => typeof o[m] === 'function',
  );
}

/**
 * Resolves the Reminders API for this runtime. Web → `createReminders(null)` without importing
 * `@capacitor/core`. Native → an already-present `Capacitor.Plugins.LocalNotifications` (e2e
 * fake), else the plugin registered through `@capacitor/core` when its header is there.
 * Loading asks for nothing.
 */
export async function loadReminders(env: LoadRemindersEnv = {}): Promise<Reminders> {
  const cap = 'cap' in env ? env.cap : globalCapacitor();
  if (!isNative(cap)) return createReminders(null);

  const existing = cap?.Plugins?.[LOCAL_NOTIFICATIONS_PLUGIN];
  if (looksLikeBridge(existing)) return createReminders(existing);

  const hasHeader = cap?.PluginHeaders?.some((h) => h.name === LOCAL_NOTIFICATIONS_PLUGIN) === true;
  if (!hasHeader) return createReminders(null);

  try {
    const importCore = env.importCore ?? (() => import('@capacitor/core'));
    const core = await importCore();
    const plugin = core.registerPlugin(LOCAL_NOTIFICATIONS_PLUGIN);
    return createReminders(looksLikeBridge(plugin) ? plugin : null);
  } catch {
    return createReminders(null);
  }
}
