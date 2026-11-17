// M11 task 11: the glue between Apple Health (src/native/health.ts), the Health sync (core
// src/core/health/sync.ts + data src/data/health/**) and the screens, kept out of app.ts.
//
// - The native module is imported lazily and only inside the iPhone app (`window.Capacitor`
//   says native), so the web main chunk carries no Capacitor plugin code and the PWA never makes
//   a HealthKit call. On the PWA the sync still runs with `health: null` (a quiet no-op).
// - A sync runs on app open (`start`), when the app comes back to the foreground
//   (visibilitychange), and on "Read now" / Connect / a switch turned on. Syncs never overlap:
//   one asked for while another runs runs once more after it.
// - "Connected" is derived, not stored: Health counts as connected while at least one type is on
//   (each type is switched on only through Connect or its switch, and both ask iOS for read
//   access first). Connect with every type off turns on the SPEC default list (all six) before
//   asking iOS; iOS then lets him pick per type. All types off → the Connect button again.
// - The "Lighter today?" card is only handed to Today; it is never spoken. Its buttons record
//   the answer (`answerCard`) and open the existing M10 coach proposals (the caller's `open`),
//   so Apply / Undo / Plan changes work as for any proposal. M12 1b: feel today alone (energy
//   ≤ 2 + a sore area) makes the card on the PWA / with Health off too; its answer is stored in
//   settings like any card, with no native call.
// - Turning a type off deletes what the app kept of it (setHealthTypeEnabled) and drops today's
//   saved card when it leaned on that type, so the next sync decides again without it.
// Privacy: nothing here touches the network or the developer log, and nothing from Health goes
// into the coach context.
import { answerCard, syncHealth, type HealthSyncSource } from '../core/health/sync';
import { weeklyLoad, type LoadSession } from '../core/health/weeklyLoad';
import { weeklyCardioMinutes } from '../core/health/cardio';
import type { BodyArea } from '../core/types';
import { listDayFeels } from '../data/trainerKit/store';
import { activityCheck } from '../core/nutrition/activityCheck';
import { addDate, localDate } from '../core/trainer/plan';
import {
  HEALTH_CONNECT_TYPES,
  HEALTH_TYPES,
  type HealthDay,
  type HealthSettings,
  type HealthType,
  type NutritionSettings,
  type ReadinessCard,
  type ReadinessSignal,
  type WeighIn,
} from '../core/types';
import type { GymDb } from '../data/db';
import {
  HEALTH_SETTINGS_DEFAULT,
  getHealthSettings,
  listHealthDays,
  saveHealthSettings,
  setHealthTypeEnabled,
} from '../data/health/store';
import { healthSyncStore } from '../data/health/sync';
import { getNutritionSettings, listWeighIns } from '../data/nutrition/store';
import type { FuelHealthHost } from './fuel/fuelController';
import { healthSettingsScreen } from './screens/healthSettings';
import type { ReadinessActions } from './screens/readinessCard';
import type { WeekLoad } from './screens/weekLoad';

/** The Health API this host needs (`Health` in src/native/health.ts has this shape). */
export type HealthApi = HealthSyncSource & {
  requestRead(types: readonly HealthType[]): Promise<boolean>;
};

/** The coach chip a card button opens (existing M10 proposals). */
export type CardChip = 'lighter' | 'deload' | 'notToday';

export type HealthHostDeps = {
  db: GymDb;
  now: () => number;
  /** Re-render whatever is on screen, if it shows Health data (Today, Settings → Health, Fuel). */
  render: () => void;
  /**
   * Today is a training day in his plan that isn't done yet (undefined while the plan isn't
   * loaded). Also checked on every Today render: the card goes once today's workout is done.
   */
  trainingDay: () => boolean | undefined;
  /** A workout is running. */
  inWorkout: () => boolean;
  /** Gym Clean sessions for the weekly load and the card (WHOOP logging his own session). */
  sessions: () => readonly LoadSession[];
  /** A sync imported weigh-ins: Fuel reloads its list. */
  onWeighIns: () => void;
  logError: (err: unknown) => void;
  /** Test seam. Default: the native GymHealth plugin inside the iPhone app, else null. */
  loadHealth?: () => Promise<HealthApi | null>;
};

/**
 * Days of `healthDays` kept in memory (weekly load and cardio: this week; activity check: 14
 * days; M12 1b body fat / lean mass trends on the weigh-in screen: 5 weeks).
 */
const DAYS_KEPT = 35;
/** M12 1b: feel-today rows read for the card (today's row is the one it uses). */
const FEEL_DAYS = 7;
/** After Switch / Keep on the activity line, it isn't asked again for this many days. */
const ACTIVITY_QUIET_DAYS = 7;

/** Which Health type each card signal comes from (route B's WHOOP signal: none here). */
const SIGNAL_TYPE: Record<ReadinessSignal, HealthType | null> = {
  sleepShort: 'sleep',
  hrvLow: 'hrv',
  restingHrHigh: 'restingHr',
  hardOutsideWorkout: 'workouts',
  whoopLow: null,
  // M12 1b "feel today" signals don't come from Health.
  feltLow: null,
  sore: null,
};

/** True only inside the Capacitor native app (no Capacitor import needed to ask). */
function nativeShell(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

async function defaultLoadHealth(): Promise<HealthApi | null> {
  if (!nativeShell()) return null;
  const { loadHealth } = await import('../native/health');
  const health = await loadHealth();
  return (await health.isAvailable()) ? health : null;
}

const anyOn = (s: HealthSettings): boolean => HEALTH_TYPES.some((t) => s.enabled[t]);

export function createHealthHost(deps: HealthHostDeps) {
  const { db } = deps;
  const store = healthSyncStore(db);
  let api: HealthApi | null = null;
  let loaded: Promise<HealthApi | null> | null = null;
  let settings: HealthSettings = structuredClone(HEALTH_SETTINGS_DEFAULT) as HealthSettings;
  let card: ReadinessCard | null = null;
  let days: HealthDay[] = [];
  let nutrition: NutritionSettings | null = null;
  let weighIns: WeighIn[] = [];
  let reading = false;
  let activityQuietUntil: string | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  const today = () => localDate(deps.now());

  function load(): Promise<HealthApi | null> {
    loaded ??= (deps.loadHealth ?? defaultLoadHealth)()
      .catch((err: unknown) => {
        deps.logError(err);
        return null;
      })
      .then((h) => {
        api = h;
        return h;
      });
    return loaded;
  }

  /** Settings, recent days and the Fuel inputs, as stored now. */
  async function reload(): Promise<void> {
    settings = await getHealthSettings(db);
    days = await listHealthDays(db, addDate(today(), -DAYS_KEPT));
    nutrition = await getNutritionSettings(db);
    weighIns = await listWeighIns(db);
  }

  async function syncOnce(): Promise<void> {
    const health = await load();
    const now = deps.now();
    const trainingDay = deps.trainingDay();
    // M12 1b: his "How do you feel today" answers count as card signals (never spoken).
    const feels = await listDayFeels(db, addDate(localDate(now), -FEEL_DAYS)).catch(
      (err: unknown) => {
        deps.logError(err);
        return [];
      },
    );
    const res = await syncHealth({
      health,
      store,
      now,
      today: localDate(now),
      ...(trainingDay !== undefined ? { trainingDay } : {}),
      inWorkout: deps.inWorkout(),
      gymSessions: deps.sessions(),
      feels,
    });
    // Without Health (PWA / not connected) the card can still come from feel today alone.
    card = res.card;
    if (!health) return; // PWA: no Health data stored, nothing else to reload
    await reload();
    if (res.weighIns.length > 0) deps.onWeighIns();
  }

  /** One sync (queued behind a running one). Never throws. */
  function sync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await syncOnce();
        } catch (err) {
          deps.logError(err);
        }
      } while (again);
    })().finally(() => {
      running = null;
      deps.render();
    });
    return running;
  }

  /** A Settings action that reads: buttons show "Reading…" until it's done. */
  async function withReading(work: () => Promise<void>): Promise<void> {
    reading = true;
    deps.render();
    try {
      await work();
    } catch (err) {
      deps.logError(err);
    } finally {
      reading = false;
      deps.render();
    }
  }

  async function connect(): Promise<void> {
    const health = await load();
    if (!health) return;
    await withReading(async () => {
      let s = await getHealthSettings(db);
      if (!anyOn(s)) {
        s = {
          ...s,
          enabled: Object.fromEntries(
            HEALTH_CONNECT_TYPES.map((t) => [t, true]),
          ) as HealthSettings['enabled'],
        };
        delete s.lastReadAt; // first connect reads the full 35 days
        await saveHealthSettings(db, s);
      }
      settings = s;
      await health.requestRead(HEALTH_TYPES.filter((t) => s.enabled[t]));
      await sync();
    });
  }

  async function enable(type: HealthType): Promise<void> {
    const health = await load();
    if (!health) return;
    settings = { ...settings, enabled: { ...settings.enabled, [type]: true } };
    await withReading(async () => {
      await setHealthTypeEnabled(db, type, true);
      await health.requestRead([type]);
      await sync();
    });
  }

  async function turnOff(type: HealthType): Promise<void> {
    settings = { ...settings, enabled: { ...settings.enabled, [type]: false } };
    deps.render();
    try {
      await setHealthTypeEnabled(db, type, false);
      // Today's saved card is kept as is for the day (core): drop it when it used this type, so
      // the next sync decides again from what is left.
      await store.patchSettings((s) => {
        const last = s.readiness?.lastCard;
        if (!last?.signals.some((x) => SIGNAL_TYPE[x] === type)) return {};
        const readiness = { ...s.readiness };
        delete readiness.lastCard;
        return { readiness };
      });
      if (card?.signals.some((x) => SIGNAL_TYPE[x] === type)) card = null;
    } catch (err) {
      deps.logError(err);
    }
    await sync();
  }

  /** He answered the card: record it, hide it, then do what the button says. */
  function answer(then?: () => void): void {
    const c = card;
    if (!c) return;
    card = null;
    void answerCard(store, c.date).then((ok) => {
      if (!ok) deps.logError(new Error('Could not save the Health card answer'));
    });
    deps.render();
    then?.();
  }

  const fuelHost: FuelHealthHost = {
    activitySuggestion(current) {
      if (!api || !settings.enabled.activeEnergy || !nutrition) return null;
      const d = today();
      if (activityQuietUntil !== null && d <= activityQuietUntil) return null;
      const s = activityCheck({
        settings: { ...nutrition, activity: current },
        weighIns,
        healthDays: days,
        today: d,
      });
      return s?.suggested ?? null;
    },
    onActivityAnswered() {
      activityQuietUntil = addDate(today(), ACTIVITY_QUIET_DAYS - 1);
    },
  };

  return {
    fuelHost,
    sync,
    /** App open: the first sync, then one each time the app comes back to the foreground. */
    start(): void {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void sync();
      });
      void sync();
    },
    /**
     * Today's Health props: the card (also on the PWA, from feel today alone) and the weekly-load
     * line (Health only: null on the PWA). The card from the last sync is shown only while it is
     * still today's and today is still a training day that isn't done (no sync needed for it to
     * go after midnight or the workout).
     */
    todayProps(): { readiness: ReadinessCard | null; weekLoad: WeekLoad | null } {
      // M12 1b item 9: feel today alone can make the card, so it shows without Health too.
      const readiness = card && card.date === today() && deps.trainingDay() === true ? card : null;
      const weekLoad =
        api && settings.enabled.workouts
          ? weeklyLoad({ sessions: deps.sessions(), healthDays: days, today: deps.now() })
          : null;
      return { readiness, weekLoad };
    },
    /**
     * The card's buttons; `open` opens the coach on that M10 chip. M12 1b: `onEasyOn` (a sore
     * area's "Go easy on … today?") answers the card and opens today's avoid-area proposal.
     */
    readinessActions(
      open: (chip: CardChip) => void,
      easyOn?: (area: BodyArea) => void,
    ): ReadinessActions {
      return {
        onLighterToday: () => answer(() => open('lighter')),
        onDeloadWeek: () => answer(() => open('deload')),
        onNotToday: () => answer(() => open('notToday')),
        onTrainAsPlanned: () => answer(),
        ...(easyOn
          ? {
              onEasyOn: (area: BodyArea) => {
                // The feel row offers it too (no card): only a card on show is answered.
                if (card) answer(() => easyOn(area));
                else easyOn(area);
              },
            }
          : {}),
      };
    },
    /**
     * M12 1b: cardio minutes this week from Health workouts; null on the PWA or with workouts
     * off (the line is hidden).
     */
    cardioMinutes(): number | null {
      if (!api || !settings.enabled.workouts) return null;
      return weeklyCardioMinutes(days, deps.sessions(), deps.now());
    },
    /** M12 1b: Health days with body fat / lean mass (weigh-in screen only; never the coach). */
    bodyCompDays(): readonly HealthDay[] {
      if (!api) return [];
      return days.filter((d) => d.bodyFatPct !== undefined || d.leanMassKg !== undefined);
    },
    /** Settings → Health. */
    settingsScreen(onBack: () => void): HTMLElement {
      // Until the first sync has loaded the plugin, `native` is false; that sync re-renders.
      return healthSettingsScreen(
        { native: api !== null, connected: anyOn(settings), settings, now: deps.now(), reading },
        {
          onBack,
          onConnect: () => void connect(),
          onEnable: (t) => void enable(t),
          onTurnOffAndDelete: (t) => void turnOff(t),
          onReadNow: () => void withReading(sync),
        },
      );
    },
  };
}

export type HealthHost = ReturnType<typeof createHealthHost>;
