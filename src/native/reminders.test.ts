import { describe, expect, it, vi } from 'vitest';
import { reminderIdFromNumber, reminderNumericId } from '../core/reminders/schedule';
import { createFakeLocalNotifications, installFakeLocalNotifications } from './fakeReminders';
import {
  createReminders,
  loadReminders,
  mapReminderPermission,
  type LocalNotificationsBridge,
  type ReminderItem,
} from './reminders';

// Made-up dates and text only. The bridge is a fake of @capacitor/local-notifications.

const NOW = Date.UTC(2026, 10, 17, 8, 0); // 2026-11-17 08:00 UTC
const HOUR = 3_600_000;

const item = (
  id: string,
  at: number,
  title = 'Pull A today. Ready when you are.',
): ReminderItem => ({
  id,
  at,
  title,
});

function setup(options: Parameters<typeof createFakeLocalNotifications>[0] = {}) {
  const fake = createFakeLocalNotifications({ display: 'granted', ...options });
  return { ...fake, reminders: createReminders(fake.plugin) };
}

describe('createReminders: no plugin (web / PWA)', () => {
  it('is unavailable and does nothing, never throws', async () => {
    const r = createReminders(null);
    expect(r.available).toBe(false);
    expect(await r.permission()).toBe('unavailable');
    expect(await r.request()).toBe('unavailable');
    expect(await r.schedule([item('session:2026-11-18', NOW + 24 * HOUR)], NOW)).toEqual({
      scheduled: [],
      dropped: ['session:2026-11-18'],
    });
    await expect(r.cancel(['session:2026-11-18'])).resolves.toBeUndefined();
    expect(await r.pending()).toEqual([]);
  });
});

describe('permission: only request() prompts', () => {
  it('creating, permission(), schedule(), cancel() and pending() never prompt', async () => {
    const { reminders, state } = setup({ display: 'prompt' });
    expect(state.calls).toEqual([]);
    expect(await reminders.permission()).toBe('prompt');
    await reminders.schedule([item('session:2026-11-18', NOW + 24 * HOUR)], NOW);
    await reminders.cancel(['session:2026-11-18']);
    await reminders.pending();
    expect(state.calls).not.toContain('requestPermissions');
    expect(state.prompts).toBe(0);
  });

  it('request() asks once; afterwards permission() reads the stored answer', async () => {
    const { reminders, state } = setup({ display: 'prompt' });
    expect(await reminders.request()).toBe('granted');
    expect(state.prompts).toBe(1);
    expect(await reminders.permission()).toBe('granted');
    expect(await reminders.request()).toBe('granted');
    expect(state.prompts).toBe(1);
  });

  it('a denied request stays denied', async () => {
    const { reminders } = setup({ display: 'prompt', grantOnRequest: false });
    expect(await reminders.request()).toBe('denied');
    expect(await reminders.permission()).toBe('denied');
  });

  it('maps the plugin replies; junk and errors are unavailable', async () => {
    expect(mapReminderPermission({ display: 'granted' })).toBe('granted');
    expect(mapReminderPermission({ display: 'denied' })).toBe('denied');
    expect(mapReminderPermission({ display: 'prompt' })).toBe('prompt');
    expect(mapReminderPermission({ display: 'prompt-with-rationale' })).toBe('prompt');
    expect(mapReminderPermission({ display: 'maybe' })).toBe('unavailable');
    expect(mapReminderPermission(null)).toBe('unavailable');
    const { plugin } = createFakeLocalNotifications();
    plugin.checkPermissions = vi.fn(() => Promise.reject(new Error('boom')));
    plugin.requestPermissions = vi.fn(() => Promise.reject(new Error('boom')));
    const r = createReminders(plugin);
    expect(await r.permission()).toBe('unavailable');
    expect(await r.request()).toBe('unavailable');
  });
});

describe('schedule', () => {
  it('maps string ids to the numeric scheme and passes title, body and time', async () => {
    const { reminders, state } = setup();
    const at = NOW + 26 * HOUR;
    const res = await reminders.schedule(
      [{ id: 'session:2026-11-18', at: new Date(at), title: 'Pull A today.', body: 'Ready?' }],
      NOW,
    );
    expect(res).toEqual({ scheduled: ['session:2026-11-18'], dropped: [] });
    expect(state.pending).toEqual([
      { id: reminderNumericId('session:2026-11-18'), title: 'Pull A today.', body: 'Ready?', at },
    ]);
  });

  it('sends an empty body when the item has none (iOS requires a body string)', async () => {
    const { reminders, state } = setup();
    await reminders.schedule([item('sundayRecap:2026-11-22', NOW + 5 * 24 * HOUR)], NOW);
    expect(state.pending[0]?.body).toBe('');
  });

  it('drops items whose time is now or in the past (the plugin would deliver them at once)', async () => {
    const { reminders, state } = setup();
    const res = await reminders.schedule(
      [
        item('missedDay:2026-11-16', NOW - HOUR),
        item('session:2026-11-17', NOW),
        item('session:2026-11-18', NOW + HOUR),
      ],
      NOW,
    );
    expect(res).toEqual({
      scheduled: ['session:2026-11-18'],
      dropped: ['missedDay:2026-11-16', 'session:2026-11-17'],
    });
    expect(state.pending.map((p) => p.id)).toEqual([reminderNumericId('session:2026-11-18')]);
  });

  it('all past → the plugin is not called at all', async () => {
    const { reminders, state } = setup();
    await reminders.schedule([item('session:2026-11-16', NOW - HOUR)], NOW);
    expect(state.calls).not.toContain('schedule');
  });

  it('drops ids outside the scheme, bad times and repeated ids', async () => {
    const { reminders } = setup();
    const res = await reminders.schedule(
      [
        item('hello', NOW + HOUR),
        item('session:2026-11-18', Number.NaN),
        item('session:2026-11-19', NOW + 2 * HOUR),
        item('session:2026-11-19', NOW + 3 * HOUR),
      ],
      NOW,
    );
    expect(res.scheduled).toEqual(['session:2026-11-19']);
    expect(res.dropped).toEqual(['hello', 'session:2026-11-18', 'session:2026-11-19']);
  });

  it('schedules nothing without permission (and does not ask)', async () => {
    for (const display of ['prompt', 'denied'] as const) {
      const { reminders, state } = setup({ display });
      const res = await reminders.schedule([item('session:2026-11-18', NOW + HOUR)], NOW);
      expect(res).toEqual({ scheduled: [], dropped: ['session:2026-11-18'] });
      expect(state.pending).toEqual([]);
      expect(state.prompts).toBe(0);
    }
  });

  it('the same id again replaces the pending one', async () => {
    const { reminders, state } = setup();
    await reminders.schedule([item('session:2026-11-18', NOW + HOUR, 'A')], NOW);
    await reminders.schedule([item('session:2026-11-18', NOW + 2 * HOUR, 'B')], NOW);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.title).toBe('B');
  });

  it('a plugin error reports everything as dropped', async () => {
    const { plugin } = createFakeLocalNotifications({ display: 'granted' });
    plugin.schedule = vi.fn(() => Promise.reject(new Error('scheduleFailed')));
    const r = createReminders(plugin);
    expect(await r.schedule([item('session:2026-11-18', NOW + HOUR)], NOW)).toEqual({
      scheduled: [],
      dropped: ['session:2026-11-18'],
    });
  });
});

describe('cancel and pending', () => {
  it('cancels by string id and leaves the others', async () => {
    const { reminders } = setup();
    await reminders.schedule(
      [
        item('session:2026-11-18', NOW + 24 * HOUR),
        item('session:2026-11-20', NOW + 72 * HOUR),
        item('sundayRecap:2026-11-22', NOW + 5 * 24 * HOUR),
      ],
      NOW,
    );
    await reminders.cancel(['session:2026-11-18', 'sundayRecap:2026-11-22']);
    expect(await reminders.pending()).toEqual(['session:2026-11-20']);
  });

  it('cancel with no usable ids does not call the plugin (it rejects an empty list)', async () => {
    const { reminders, state } = setup();
    await reminders.cancel([]);
    await reminders.cancel(['not-ours']);
    expect(state.calls).not.toContain('cancel');
  });

  it('pending() maps numbers back and ignores notifications that are not ours', async () => {
    const { reminders } = setup({ pendingIds: [7, 999_999_999] });
    await reminders.schedule([item('missedDay:2026-11-19', NOW + 49 * HOUR)], NOW);
    expect(await reminders.pending()).toEqual(['missedDay:2026-11-19']);
  });

  it('the id scheme round-trips for every kind', () => {
    for (const id of ['session:2026-11-18', 'missedDay:2026-12-31', 'sundayRecap:2027-01-03']) {
      const n = reminderNumericId(id);
      expect(Number.isInteger(n) && n > 0 && n <= 0x7fffffff).toBe(true);
      expect(reminderIdFromNumber(n)).toBe(id);
    }
  });

  it('plugin errors end quietly', async () => {
    const bridge: LocalNotificationsBridge = {
      checkPermissions: () => Promise.resolve({ display: 'granted' }),
      requestPermissions: () => Promise.resolve({ display: 'granted' }),
      schedule: () => Promise.resolve({}),
      cancel: () => Promise.reject(new Error('x')),
      getPending: () => Promise.reject(new Error('x')),
    };
    const r = createReminders(bridge);
    await expect(r.cancel(['session:2026-11-18'])).resolves.toBeUndefined();
    expect(await r.pending()).toEqual([]);
  });
});

describe('loadReminders', () => {
  it('web: unavailable without importing @capacitor/core', async () => {
    const importCore = vi.fn();
    const r = await loadReminders({ cap: undefined, importCore });
    expect(r.available).toBe(false);
    const r2 = await loadReminders({ cap: { isNativePlatform: () => false }, importCore });
    expect(r2.available).toBe(false);
    expect(importCore).not.toHaveBeenCalled();
  });

  it('uses the installed e2e fake on window.Capacitor and asks for nothing at load', async () => {
    const target: { Capacitor?: { isNativePlatform?: () => boolean } } = {};
    const state = installFakeLocalNotifications({ display: 'prompt', target });
    const importCore = vi.fn();
    const r = await loadReminders({ cap: target.Capacitor, importCore });
    expect(r.available).toBe(true);
    expect(state.calls).toEqual([]);
    expect(importCore).not.toHaveBeenCalled();
    expect(await r.request()).toBe('granted');
    expect(state.prompts).toBe(1);
  });

  it('keeps other fake plugins already on window.Capacitor', () => {
    const other = {};
    const target = { Capacitor: { isNativePlatform: () => true, Plugins: { GymSpeech: other } } };
    installFakeLocalNotifications({ target });
    expect(target.Capacitor.Plugins.GymSpeech).toBe(other);
  });

  it('native with the header → registers LocalNotifications through @capacitor/core', async () => {
    const { plugin } = createFakeLocalNotifications({ display: 'granted' });
    const registerPlugin = vi.fn(() => plugin);
    const importCore = vi.fn(async () => ({ registerPlugin }));
    const cap = { isNativePlatform: () => true, PluginHeaders: [{ name: 'LocalNotifications' }] };
    const r = await loadReminders({ cap, importCore });
    expect(registerPlugin).toHaveBeenCalledWith('LocalNotifications');
    expect(await r.permission()).toBe('granted');
  });

  it('native without the plugin, or a failing import → unavailable', async () => {
    const cap = { isNativePlatform: () => true };
    expect((await loadReminders({ cap })).available).toBe(false);
    const importCore = vi.fn(() => Promise.reject(new Error('no core')));
    const withHeader = { ...cap, PluginHeaders: [{ name: 'LocalNotifications' }] };
    expect((await loadReminders({ cap: withHeader, importCore })).available).toBe(false);
  });
});

describe('no network', () => {
  it('the bridge and the fake contain no network calls or URLs', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const f of ['reminders.ts', 'fakeReminders.ts']) {
      const src = await readFile(new URL(`./${f}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\//);
    }
  });
});
