// Shared by every e2e spec (not a spec itself): `test` with two M12 slice 1b options that act on a
// FRESH database (the first time the app creates it in a test's browser context):
//
// - `firstRun: 'skip'` (default) stores settings 'intakeSkipped', so a fresh install opens Today
//   instead of the first-run intake ("Skip for now" already tapped). Specs that test first run
//   use `test.use({ firstRun: 'fresh' })`.
// - `warmups: 'off'` (default) stores settings 'trainerKit' = { warmups: 'off' }, so "Set 1 of 4"
//   is the first set of the first heavy lift. The trainer-kit spec uses `warmups: 'default'`.
//
// How: an init script wraps IDBFactory.open. When the app's database is created (upgrade from
// version 0), the first successful open writes those rows in a readwrite transaction started
// before Dexie's own success handler runs, so every read the app makes sees them. A database that
// already exists (a reload, a seeded install) is left alone.
import { test as base, type BrowserContext } from '@playwright/test';

export * from '@playwright/test';

export type FreshDbOptions = { skipIntake: boolean; warmupsOff: boolean };

/** Adds the fresh-database init script to `context` (for specs that build their own context). */
export async function freshDbDefaults(
  context: BrowserContext,
  opts: FreshDbOptions = { skipIntake: true, warmupsOff: true },
): Promise<void> {
  if (!opts.skipIntake && !opts.warmupsOff) return;
  await context.addInitScript((o: FreshDbOptions) => {
    const proto = IDBFactory.prototype;
    const open = proto.open;
    let fresh = false;
    proto.open = function (this: IDBFactory, name: string, version?: number) {
      const req = version === undefined ? open.call(this, name) : open.call(this, name, version);
      if (name !== 'gym-clean') return req;
      req.addEventListener('upgradeneeded', (e) => {
        if (e.oldVersion === 0) fresh = true;
      });
      req.addEventListener('success', () => {
        if (!fresh) return;
        const db = req.result;
        if (!db.objectStoreNames.contains('settings')) return;
        fresh = false;
        const store = db.transaction('settings', 'readwrite').objectStore('settings');
        if (o.skipIntake) store.put({ key: 'intakeSkipped', value: Date.now() });
        if (o.warmupsOff) store.put({ key: 'trainerKit', value: { warmups: 'off' } });
      });
      return req;
    };
  }, opts);
}

export const test = base.extend<{
  /** 'skip' (default): a fresh install starts on Today; 'fresh': the first-run intake opens. */
  firstRun: 'skip' | 'fresh';
  /** 'off' (default): no warm-up sets; 'default': the trainer kit's default rule. */
  warmups: 'off' | 'default';
}>({
  firstRun: ['skip', { option: true }],
  warmups: ['off', { option: true }],
  context: async ({ context, firstRun, warmups }, use) => {
    await freshDbDefaults(context, {
      skipIntake: firstRun === 'skip',
      warmupsOff: warmups === 'off',
    });
    await use(context);
  },
});
