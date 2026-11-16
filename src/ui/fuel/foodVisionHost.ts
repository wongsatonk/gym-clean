// M7b task 16b: the glue between food-vision, the photo store and the UI, kept out of app.ts.
// - `photoHost`: what the Fuel controller's photo flow needs (classifier load / dispose). The
//   food-vision classifier module is imported lazily, so MediaPipe and the model loader stay out
//   of the first load; MediaPipe itself is a further lazy import inside it.
// - `settingsEl()`: Settings → Food photos (one instance, kept across Settings re-renders so an
//   import status stays on screen). Each change is saved here, then the Fuel controller hears of
//   it (`onChange`) and Undo toasts put things back.
// Privacy: nothing here touches the network or the developer log; photos leave the phone only
// through his own Export (share sheet / download).
import type { FoodModelRecord, FoodVisionSettings } from '../../core/types';
import type { GymDb } from '../../data/db';
import {
  countPhotos,
  deletePhotos,
  getFoodVisionSettings,
  getModel,
  listPhotos,
  removeModel,
  restorePhotos,
  saveModel,
  setFoodVisionSettings,
} from '../../data/nutrition/photoStore';
import {
  createFoodPhotosSettings,
  type FoodModelSummary,
  type FoodPhotosSettings,
} from '../screens/foodPhotos';
import type { FuelPhotoHost } from './fuelController';

const classifier = () => import('../../food-vision/classifier');

export type FoodVisionHostDeps = {
  db: GymDb;
  now: () => number;
  /** The Fuel controller's `setPhoto` (model / setting changed). */
  onChange: (next: { model?: FoodModelRecord | null; settings?: FoodVisionSettings }) => void;
  toast: (text: string, onUndo: () => void) => void;
  logError: (err: unknown) => void;
};

const summary = (m: FoodModelRecord | null | undefined): FoodModelSummary | null =>
  m ? { name: m.name, sizeBytes: m.sizeBytes, labels: m.labels } : null;

export function createFoodVisionHost(d: FoodVisionHostDeps) {
  const { db } = d;
  let ui: FoodPhotosSettings | null = null;

  const photoHost: FuelPhotoHost = {
    load: async (model) => (await classifier()).loadFoodClassifier(model),
    dispose: () => {
      void classifier()
        .then((m) => m.disposeFoodClassifier())
        .catch(d.logError);
    },
  };

  /** Puts the model back (Undo) or removes it, and tells the UI and Fuel. */
  async function setModel(m: FoodModelRecord | null): Promise<void> {
    if (m) await saveModel(db, m);
    else await removeModel(db);
    d.onChange({ model: m });
    ui?.update({ model: summary(m) });
  }

  async function importModel(file: File, labels: string[]): Promise<void> {
    const prev = (await getModel(db)) ?? null;
    const rec: FoodModelRecord = {
      id: 'food',
      name: file.name,
      sizeBytes: file.size,
      labels,
      // A new value even within the same ms, so the old classifier is always replaced.
      importedAt: Math.max(d.now(), (prev?.importedAt ?? 0) + 1),
      blob: file,
    };
    await saveModel(db, rec);
    d.onChange({ model: rec });
    ui?.update({ model: summary(rec) });
    d.toast(prev ? 'Food model replaced.' : 'Food model added.', () => {
      void setModel(prev).catch(d.logError);
    });
  }

  async function removeNow(): Promise<void> {
    const old = (await removeModel(db)) ?? null;
    d.onChange({ model: null });
    ui?.update({ model: null });
    if (old)
      d.toast('Food model removed.', () => {
        void setModel(old).catch(d.logError);
      });
  }

  async function setSave(on: boolean): Promise<void> {
    const s: FoodVisionSettings = { savePhotos: on };
    await setFoodVisionSettings(db, s);
    d.onChange({ settings: s });
    ui?.update({ settings: s });
  }

  async function deleteAll(): Promise<void> {
    const rows = await deletePhotos(db);
    ui?.update({ photoCount: 0 });
    if (rows.length === 0) return;
    d.toast(
      rows.length === 1 ? 'Deleted 1 saved photo.' : `Deleted ${rows.length} saved photos.`,
      () => {
        void restorePhotos(db, rows)
          .then(() => countPhotos(db))
          .then((n) => ui?.update({ photoCount: n }))
          .catch(d.logError);
      },
    );
  }

  /** Re-reads model, setting and photo count (Settings opened, photos saved meanwhile). */
  async function refresh(): Promise<void> {
    const [m, s, n] = await Promise.all([getModel(db), getFoodVisionSettings(db), countPhotos(db)]);
    ui?.update({ model: summary(m), settings: s, photoCount: n });
  }

  return {
    photoHost,
    refresh,
    /** Settings → Food photos; the first call builds it, later calls re-read the numbers. */
    settingsEl(): HTMLElement {
      if (!ui) {
        ui = createFoodPhotosSettings(
          {
            model: null,
            settings: { savePhotos: false },
            photoCount: 0,
            validateModel: async (file) => (await classifier()).validateModel(file),
            loadPhotos: () => listPhotos(db),
            now: d.now,
          },
          {
            onImportModel: (file, labels) => importModel(file, labels),
            onRemoveModel: () => void removeNow().catch(d.logError),
            onSavePhotos: (on) => void setSave(on).catch(d.logError),
            onDeletePhotos: () => void deleteAll().catch(d.logError),
          },
        );
      }
      void refresh().catch(d.logError);
      return ui.el;
    },
  };
}

export type FoodVisionHost = ReturnType<typeof createFoodVisionHost>;
