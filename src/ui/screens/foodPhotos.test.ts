import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodPhoto } from '../../core/types';
import { readZip } from '../../core/zip';
import { copyHits, oneAttr, byAttr } from '../fuel/fuelTestUtil';
import {
  MAX_MODEL_BYTES,
  SAVE_EXPLAINER,
  createFoodPhotosSettings,
  dishCount,
  formatModelSize,
  importErrorText,
  photoCountText,
  precheckModelFile,
  saveZip,
  type FoodPhotosProps,
  type ModelCheck,
  type ZipSaver,
} from './foodPhotos';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const photo = (dishId: string, createdAt: number): FoodPhoto => ({
  id: `p${createdAt}`,
  dishId,
  createdAt,
  w: 512,
  h: 384,
  blob: new Blob([new Uint8Array([0xff, 0xd8, createdAt % 256, 0xff, 0xd9])], {
    type: 'image/jpeg',
  }),
});

function fakeSaver(over: Partial<ZipSaver> = {}) {
  const log = { shared: [] as File[], downloaded: [] as File[] };
  const saver: ZipSaver = {
    canShare: () => true,
    share: (f) => {
      log.shared.push(f);
      return Promise.resolve();
    },
    download: (f) => log.downloaded.push(f),
    ...over,
  };
  return { saver, log };
}

function setup(over: Partial<FoodPhotosProps> = {}) {
  const calls = {
    imported: [] as { name: string; labels: string[] }[],
    removed: 0,
    save: [] as boolean[],
    deleted: 0,
    validated: [] as string[],
  };
  const { saver, log } = fakeSaver();
  const comp = createFoodPhotosSettings(
    {
      model: null,
      settings: { savePhotos: false },
      photoCount: 0,
      validateModel: (f) => {
        calls.validated.push(f.name);
        return Promise.resolve<ModelCheck>({ ok: true, labels: ['pad_thai', 'som_tam'] });
      },
      loadPhotos: () => Promise.resolve([]),
      now: () => Date.UTC(2026, 10, 15, 5),
      saver,
      confirmMs: 3000,
      ...over,
    },
    {
      onImportModel: (file, labels) => {
        calls.imported.push({ name: file.name, labels });
      },
      onRemoveModel: () => calls.removed++,
      onSavePhotos: (on) => calls.save.push(on),
      onDeletePhotos: () => calls.deleted++,
    },
  );
  return { comp, el: asFake(comp.el), calls, log };
}

const pick = (el: FakeEl, file: { name: string; size: number }) => {
  const input = oneAttr(el, 'data-food-model-file') as FakeEl & {
    files?: unknown[];
    value?: string;
  };
  input.files = [file];
  input.value = 'C:\\fakepath\\x';
  input.dispatch('change', {});
  return input;
};

const switchEl = (el: FakeEl) => oneAttr(el, 'data-setting', 'save-food-photos');

describe('food photos helpers', () => {
  it('formats size, dish count and photo count', () => {
    expect(formatModelSize(4.2 * 1024 * 1024)).toBe('4.2 MB');
    expect(formatModelSize(10)).toBe('0.1 MB');
    expect(dishCount(1)).toBe('1 dish');
    expect(dishCount(38)).toBe('38 dishes');
    expect(photoCountText(0)).toBe('No saved photos');
    expect(photoCountText(1)).toBe('1 saved photo');
    expect(photoCountText(120)).toBe('120 saved photos');
  });

  it('pre-checks the file: .tflite only, ≤ 25 MB', () => {
    expect(precheckModelFile({ name: 'food.tflite', size: 5e6 })).toBeNull();
    expect(precheckModelFile({ name: 'FOOD.TFLITE', size: MAX_MODEL_BYTES })).toBeNull();
    expect(precheckModelFile({ name: 'food.zip', size: 5e6 })).toBe('type');
    expect(precheckModelFile({ name: 'food.tflite', size: MAX_MODEL_BYTES + 1 })).toBe('tooBig');
  });

  it('every message passes checkCopy', async () => {
    const { checkCopy } = await import('../../core/trainer/replies');
    for (const e of ['type', 'tooBig', 'mismatch', 'unreadable', 'save'] as const) {
      expect(checkCopy(importErrorText(e)).ok).toBe(true);
    }
    expect(importErrorText('mismatch')).toBe("This model doesn't match the dish list.");
  });
});

describe('Food photos: model', () => {
  it('no model: says so, offers Import (a hidden .tflite input), no Remove', () => {
    const { el } = setup();
    const block = oneAttr(el, 'data-food-model');
    expect(block.getAttribute('data-state')).toBe('none');
    expect(block.textContent).toContain('No food model yet.');
    expect(oneAttr(el, 'data-food-model-import').textContent).toBe('Import model (.tflite)');
    const input = oneAttr(el, 'data-food-model-file');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('accept')).toBe('.tflite');
    expect(byAttr(el, 'data-food-model-remove')).toHaveLength(0);
  });

  it('a model: name, size and dish count, Replace and Remove', () => {
    const { el, calls } = setup({
      model: { name: 'thai-food-v1.tflite', sizeBytes: 4.2 * 1024 * 1024, labels: ['a', 'b', 'c'] },
    });
    const block = oneAttr(el, 'data-food-model');
    expect(block.getAttribute('data-state')).toBe('ready');
    expect(block.textContent).toContain('thai-food-v1.tflite');
    expect(block.textContent).toContain('4.2 MB · 3 dishes');
    expect(oneAttr(el, 'data-food-model-import').textContent).toBe('Replace model (.tflite)');
    oneAttr(el, 'data-food-model-remove').click();
    expect(calls.removed).toBe(1);
  });

  it('Remove → app updates to null → back to "No food model yet." (Undo → update puts it back)', () => {
    const model = { name: 'm.tflite', sizeBytes: 1e6, labels: ['a'] };
    const { el, comp } = setup({ model });
    comp.update({ model: null });
    expect(oneAttr(el, 'data-food-model').getAttribute('data-state')).toBe('none');
    comp.update({ model });
    expect(oneAttr(el, 'data-food-model').textContent).toContain('1 dish');
  });

  it('not a .tflite → message, the validator never runs', async () => {
    const { el, calls } = setup();
    const input = pick(el, { name: 'photo.jpg', size: 1000 });
    await flush();
    expect((input as unknown as { value: string }).value).toBe('');
    expect(oneAttr(el, 'data-food-model-status').textContent).toBe('Pick a .tflite model file.');
    expect(calls.validated).toEqual([]);
    expect(calls.imported).toEqual([]);
  });

  it('over 25 MB → message, the validator never runs', async () => {
    const { el, calls } = setup();
    pick(el, { name: 'big.tflite', size: MAX_MODEL_BYTES + 1 });
    await flush();
    const status = oneAttr(el, 'data-food-model-status');
    expect(status.getAttribute('data-kind')).toBe('error');
    expect(status.classes).toContain('error');
    expect(status.textContent).toBe('This model is over 25 MB. Pick a smaller one.');
    expect(calls.validated).toEqual([]);
  });

  it('labels do not match → "This model doesn\'t match the dish list.", nothing imported', async () => {
    const { el, calls } = setup({
      validateModel: () => Promise.resolve({ ok: false, reason: 'mismatch' }),
    });
    pick(el, { name: 'other.tflite', size: 1e6 });
    await flush();
    expect(oneAttr(el, 'data-food-model-status').textContent).toBe(
      "This model doesn't match the dish list.",
    );
    expect(calls.imported).toEqual([]);
  });

  it('validator throws → "Couldn\'t read this model."', async () => {
    const { el } = setup({ validateModel: () => Promise.reject(new Error('bad flatbuffer')) });
    pick(el, { name: 'x.tflite', size: 1e6 });
    await flush();
    expect(oneAttr(el, 'data-food-model-status').textContent).toBe(
      "Couldn't read this model. Nothing changed.",
    );
  });

  it('busy while checking (Import disabled), then imported with its labels', async () => {
    let resolve: (c: ModelCheck) => void = () => undefined;
    const { el, calls } = setup({
      validateModel: () => new Promise<ModelCheck>((r) => (resolve = r)),
    });
    pick(el, { name: 'food.tflite', size: 1e6 });
    await flush();
    expect(oneAttr(el, 'data-food-model-status').textContent).toBe('Checking the model…');
    expect(oneAttr(el, 'data-food-model-import').hasAttribute('disabled')).toBe(true);
    resolve({ ok: true, labels: ['pad_thai'] });
    await flush();
    expect(calls.imported).toEqual([{ name: 'food.tflite', labels: ['pad_thai'] }]);
    const status = oneAttr(el, 'data-food-model-status');
    expect(status.getAttribute('data-kind')).toBe('ok');
    expect(status.textContent).toBe('Model added: food.tflite.');
  });
});

describe('Food photos: save switch', () => {
  it('off by default, and turning it on shows the explainer first (nothing saved yet)', () => {
    const { el, calls } = setup();
    const sw = switchEl(el);
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toContain('Save photos to improve recognition');
    expect(byAttr(el, 'data-food-save-explainer')).toHaveLength(0);
    sw.click();
    expect(calls.save).toEqual([]);
    const box = oneAttr(el, 'data-food-save-explainer');
    expect(box.textContent).toContain(SAVE_EXPLAINER);
    expect(SAVE_EXPLAINER).toBe('Photos stay on this phone. Only you can export them.');
    expect(switchEl(el).getAttribute('aria-checked')).toBe('false');
    oneAttr(el, 'data-food-save-on').click();
    expect(calls.save).toEqual([true]);
  });

  it('"Not now" closes the explainer and leaves it off', () => {
    const { el, calls } = setup();
    switchEl(el).click();
    oneAttr(el, 'data-food-save-cancel').click();
    expect(byAttr(el, 'data-food-save-explainer')).toHaveLength(0);
    expect(calls.save).toEqual([]);
  });

  it('on → one tap turns it off, no explainer; kept photos get a note', () => {
    const { el, calls, comp } = setup({ settings: { savePhotos: true }, photoCount: 4 });
    expect(switchEl(el).getAttribute('aria-checked')).toBe('true');
    switchEl(el).click();
    expect(calls.save).toEqual([false]);
    expect(byAttr(el, 'data-food-save-explainer')).toHaveLength(0);
    comp.update({ settings: { savePhotos: false } });
    expect(el.textContent).toContain('Saved photos stay until you delete them.');
  });
});

describe('Food photos: count, export, delete', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('0 photos: the count, and no Export or Delete', () => {
    const { el } = setup();
    expect(oneAttr(el, 'data-food-photo-count').textContent).toBe('No saved photos');
    expect(byAttr(el, 'data-food-photos-export')).toHaveLength(0);
    expect(byAttr(el, 'data-food-photos-delete')).toHaveLength(0);
  });

  it('Export builds the zip from the photos and shares it as a File', async () => {
    const photos = [photo('thai:pad_thai', 1000), photo('thai:som_tam', 2000)];
    const { el, log } = setup({ photoCount: 2, loadPhotos: () => Promise.resolve(photos) });
    expect(oneAttr(el, 'data-food-photo-count').textContent).toBe('2 saved photos');
    oneAttr(el, 'data-food-photos-export').click();
    await vi.waitFor(() => expect(log.shared).toHaveLength(1));
    const file = log.shared[0];
    if (!file) throw new Error('nothing shared');
    expect(file.name).toBe('gym-clean-food-photos-2026-11-15.zip');
    expect(file.type).toBe('application/zip');
    const names = readZip(new Uint8Array(await file.arrayBuffer())).map((e) => e.name);
    expect(names).toContain('gym-clean-food-photos/thai_pad_thai/1000.jpg');
    expect(names).toContain('gym-clean-food-photos/labels.csv');
    await vi.waitFor(() =>
      expect(oneAttr(el, 'data-food-photos-status').textContent).toBe('Exported 2 photos.'),
    );
  });

  it('no file sharing → download; share refused after the async build → "Share the zip" tap', async () => {
    const photos = [photo('thai:pad_thai', 1000)];
    const dl = fakeSaver({ canShare: () => false });
    const a = setup({ photoCount: 1, loadPhotos: () => Promise.resolve(photos), saver: dl.saver });
    oneAttr(a.el, 'data-food-photos-export').click();
    await vi.waitFor(() => expect(dl.log.downloaded).toHaveLength(1));

    let refuse = true;
    const shared: File[] = [];
    const s = fakeSaver({
      share: (f) => {
        if (refuse) {
          refuse = false;
          return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
        }
        shared.push(f);
        return Promise.resolve();
      },
    });
    const b = setup({ photoCount: 1, loadPhotos: () => Promise.resolve(photos), saver: s.saver });
    oneAttr(b.el, 'data-food-photos-export').click();
    await vi.waitFor(() => expect(byAttr(b.el, 'data-food-photos-share')).toHaveLength(1));
    expect(oneAttr(b.el, 'data-food-photos-status').getAttribute('data-food-photos-status')).toBe(
      'ready',
    );
    oneAttr(b.el, 'data-food-photos-share').click();
    await vi.waitFor(() => expect(shared).toHaveLength(1));
  });

  it('cancelling the share sheet is silent; a failed load says so', async () => {
    const photos = [photo('thai:pad_thai', 1000)];
    const s = fakeSaver({
      share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })),
    });
    const a = setup({ photoCount: 1, loadPhotos: () => Promise.resolve(photos), saver: s.saver });
    oneAttr(a.el, 'data-food-photos-export').click();
    await vi.waitFor(() => expect(byAttr(a.el, 'data-food-photos-export')).toHaveLength(1));
    await flush();
    expect(byAttr(a.el, 'data-food-photos-status')).toHaveLength(0);

    const b = setup({ photoCount: 1, loadPhotos: () => Promise.reject(new Error('db')) });
    oneAttr(b.el, 'data-food-photos-export').click();
    await vi.waitFor(() =>
      expect(oneAttr(b.el, 'data-food-photos-status').textContent).toBe(
        "Couldn't export. Try again.",
      ),
    );
  });

  it('Delete takes two taps (armed words, then delete); it disarms after the window', () => {
    const { el, calls, comp } = setup({ photoCount: 3 });
    const del = () => oneAttr(el, 'data-food-photos-delete');
    expect(del().textContent).toBe('Delete saved photos');
    del().click();
    expect(calls.deleted).toBe(0);
    expect(del().hasAttribute('data-armed')).toBe(true);
    expect(del().textContent).toBe('Tap again to delete');
    vi.advanceTimersByTime(3000);
    expect(del().hasAttribute('data-armed')).toBe(false);
    del().click();
    del().click();
    expect(calls.deleted).toBe(1);
    comp.update({ photoCount: 0 });
    expect(byAttr(el, 'data-food-photos-delete')).toHaveLength(0);
    comp.update({ photoCount: 3 }); // Undo
    expect(del().hasAttribute('data-armed')).toBe(false);
  });

  it('saveZip: no share → download, share ok → shared, other errors throw', async () => {
    const f = new File([new Uint8Array([1])], 'x.zip');
    expect(await saveZip(f, fakeSaver({ canShare: () => false }).saver)).toBe('downloaded');
    expect(await saveZip(f, fakeSaver().saver)).toBe('shared');
    await expect(
      saveZip(f, fakeSaver({ share: () => Promise.reject(new TypeError('x')) }).saver),
    ).rejects.toThrow();
  });
});

describe('Food photos: copy and size', () => {
  it('every visible string passes checkCopy (all states)', () => {
    const a = setup({ photoCount: 2, settings: { savePhotos: false } });
    switchEl(a.el).click();
    const b = setup({ model: { name: 'm.tflite', sizeBytes: 1e6, labels: ['x'] }, photoCount: 0 });
    expect([...copyHits(a.el), ...copyHits(b.el)]).toEqual([]);
  });

  it('text is body size or bigger and controls keep the 60px settings row (css)', () => {
    const css = readFileSync(new URL('./foodPhotos.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(/\.settings \.food-photos \.set-action\s*\{([^}]*)\}/.exec(css)?.[1]).toContain(
      'min-height: var(--tap-bar)',
    );
  });
});
