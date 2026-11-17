/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProgressPhoto } from '../../core/types';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import {
  PHOTOS_COPY,
  PHOTOS_PRIVACY,
  PHOTO_MAX_EDGE,
  createProgressPhotos,
  downscalePhoto,
  fitSize,
  groupByDate,
  photoAlt,
  photoCount,
  sortPhotos,
  type NewProgressPhoto,
  type ProgressPhotosActions,
  type ProgressPhotosProps,
} from './progressPhotos';

useFakeDom();
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Made-up photos: the blob is never read in these tests.
const blob = (name: string) => ({ name }) as unknown as Blob;
const photo = (
  id: string,
  date: string,
  createdAt: number,
  pose?: ProgressPhoto['pose'],
): ProgressPhoto => ({ id, date, createdAt, blob: blob(id), ...(pose ? { pose } : {}) });

const OCT = photo('p-oct', '2026-10-03', 10, 'front');
const NOV_A = photo('p-nov-a', '2026-11-14', 20, 'front');
const NOV_B = photo('p-nov-b', '2026-11-14', 30, 'side');
const ALL = [NOV_A, OCT, NOV_B];

function render(over: Partial<ProgressPhotosProps> = {}, act: Partial<ProgressPhotosActions> = {}) {
  const calls = {
    back: 0,
    enable: 0,
    add: [] as NewProgressPhoto[],
    del: [] as string[],
    delAll: 0,
    scaled: [] as Blob[],
  };
  const view = createProgressPhotos(
    {
      enabled: true,
      photos: ALL,
      today: '2026-11-17',
      urlFor: (p) => `fake:${p.id}`,
      downscale: (f) => {
        calls.scaled.push(f);
        return Promise.resolve(blob('small'));
      },
      confirmMs: 3000,
      ...over,
    },
    {
      onBack: () => calls.back++,
      onEnable: () => calls.enable++,
      onAdd: (p) => {
        calls.add.push(p);
      },
      onDelete: (id) => calls.del.push(id),
      onDeleteAll: () => calls.delAll++,
      ...act,
    },
  );
  const el = asFake(view.el);
  const all = (attr: string, value?: string) =>
    el.find((e) => (value === undefined ? e.hasAttribute(attr) : e.getAttribute(attr) === value));
  const at = (attr: string, value?: string) => all(attr, value)[0];
  return { el, calls, view, all, at };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('Progress photos: off (the default)', () => {
  it('shows only the title, the privacy line and Turn on: no photos, no way to add', () => {
    const { el, calls, all, at } = render({ enabled: false, photos: [] });
    expect(el.getAttribute('data-screen')).toBe('progress-photos');
    expect(el.getAttribute('data-state')).toBe('off');
    expect(el.byTag('h1')[0]?.textContent).toBe('Progress photos');
    expect(at('data-photos-privacy')?.textContent).toBe(PHOTOS_PRIVACY);
    expect(at('data-photos-off')?.textContent).toBe(PHOTOS_COPY.off);
    expect(el.byTag('input')).toHaveLength(0);
    expect(el.byTag('img')).toHaveLength(0);
    expect(all('data-photo')).toHaveLength(0);
    expect(all('data-photos-delete-all')).toHaveLength(0);
    at('data-photos-enable')?.click();
    expect(calls.enable).toBe(1);
    el.byTag('button')
      .find((b) => b.textContent === 'Back')
      ?.click();
    expect(calls.back).toBe(1);
  });

  it('kept photos stay hidden while off, but can still be deleted (two taps)', () => {
    const { el, calls, at } = render({ enabled: false });
    expect(el.byTag('img')).toHaveLength(0);
    expect(at('data-photos-kept')?.textContent).toBe(
      '3 photos kept on this phone while this is off.',
    );
    at('data-photos-delete-all')?.click();
    expect(calls.delAll).toBe(0);
    at('data-photos-delete-all')?.click();
    expect(calls.delAll).toBe(1);
  });
});

describe('Progress photos: list', () => {
  it('groups by date, newest first, with the privacy line on top', () => {
    const { el, all, at } = render();
    expect(el.getAttribute('data-state')).toBe('on');
    expect(at('data-photos-privacy')?.textContent).toBe('Stays on this phone. Not in backups.');
    const groups = all('data-photo-date');
    expect(groups.map((g) => g.getAttribute('data-photo-date'))).toEqual([
      '2026-11-14',
      '2026-10-03',
    ]);
    expect(groups.map((g) => g.byTag('h2')[0]?.textContent)).toEqual(['14 Nov 2026', '3 Oct 2026']);
    for (const g of groups)
      expect(g.getAttribute('aria-labelledby')).toBe(g.byTag('h2')[0]?.getAttribute('id'));
    expect(all('data-photo').map((t) => t.getAttribute('data-photo'))).toEqual([
      'p-nov-b',
      'p-nov-a',
      'p-oct',
    ]);
    const tile = at('data-photo', 'p-nov-b');
    expect(tile?.getAttribute('aria-label')).toBe('Progress photo, 14 Nov 2026, side. Compare');
    expect(tile?.getAttribute('aria-pressed')).toBe('false');
    expect(tile?.byTag('img')[0]?.getAttribute('src')).toBe('fake:p-nov-b');
    expect(all('data-photos-empty')).toHaveLength(0);
  });

  it('no photos yet → a hint, no compare, no Delete all', () => {
    const { all, at } = render({ photos: [] });
    expect(at('data-photos-empty')?.textContent).toBe(PHOTOS_COPY.empty);
    expect(all('data-compare')).toHaveLength(0);
    expect(all('data-photos-delete-all')).toHaveLength(0);
    // One photo: nothing to compare with yet.
    expect(render({ photos: [OCT] }).all('data-compare')).toHaveLength(0);
  });

  it('never offers a share, upload or export control', () => {
    const { el } = render();
    const words = el
      .byTag('button')
      .map((b) => b.textContent)
      .join(' | ');
    expect(words).not.toMatch(/share|upload|export|send|back ?up/i);
    expect(el.byTag('a')).toHaveLength(0);
    const src = readFileSync(new URL('./progressPhotos.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|navigator\.share|WebSocket/);
  });
});

describe('Progress photos: add', () => {
  const pick = async (input: FakeEl, file: unknown) => {
    (input as FakeEl & { files: unknown[]; value: string }).files = [file];
    (input as FakeEl & { value: string }).value = 'C:/fakepath/x.jpg';
    input.dispatch('change', {});
    await flush();
  };

  it('two image pickers: take (camera) and choose, both accept=image/*', () => {
    const { all, at } = render();
    const inputs = all('data-photo-input');
    expect(inputs.map((i) => i.getAttribute('data-photo-input'))).toEqual(['take', 'pick']);
    for (const i of inputs) {
      expect(i.getAttribute('type')).toBe('file');
      expect(i.getAttribute('accept')).toBe('image/*');
    }
    expect(at('data-photo-input', 'take')?.getAttribute('capture')).toBe('environment');
    expect(at('data-photo-input', 'pick')?.hasAttribute('capture')).toBe(false);
    const labels = all('data-photo-input').map(
      (i) => all('class').find((l) => l.tag === 'label' && l.children.includes(i))?.textContent,
    );
    expect(labels).toEqual([PHOTOS_COPY.take, PHOTOS_COPY.pick]);
  });

  it('a picked file is downscaled, then handed over with today and the chosen view', async () => {
    const { calls, at } = render();
    const file = blob('big.jpg');
    at('data-pose', 'side')?.click();
    expect(at('data-pose', 'side')?.getAttribute('aria-checked')).toBe('true');
    expect(at('data-pose', 'front')?.getAttribute('aria-checked')).toBe('false');
    const input = at('data-photo-input', 'pick') as FakeEl;
    await pick(input, file);
    expect(calls.scaled).toEqual([file]);
    expect(calls.add).toEqual([{ blob: blob('small'), date: '2026-11-17', pose: 'side' }]);
    // The original file is never passed on.
    expect(calls.add[0]?.blob).not.toBe(file);
    expect(at('data-photos-status')?.textContent).toBe('');
    expect((input as FakeEl & { value: string }).value).toBe('');
  });

  it('defaults the view to Front and says "Saving…" while it works', async () => {
    let done: (b: Blob) => void = () => {};
    const { calls, at } = render({
      downscale: () => new Promise<Blob>((res) => (done = res)),
    });
    expect(at('data-pose', 'front')?.getAttribute('aria-checked')).toBe('true');
    const input = at('data-photo-input', 'take') as FakeEl;
    (input as FakeEl & { files: unknown[] }).files = [blob('a')];
    input.dispatch('change', {});
    await flush();
    expect(at('data-photos-status')?.textContent).toBe(PHOTOS_COPY.saving);
    expect(at('data-photos-status')?.getAttribute('role')).toBe('status');
    // A second pick while busy is ignored.
    input.dispatch('change', {});
    done(blob('small'));
    await flush();
    expect(calls.add).toHaveLength(1);
    expect(calls.add[0]?.pose).toBe('front');
  });

  it('a file that cannot be read says so and saves nothing', async () => {
    const { calls, at } = render({ downscale: () => Promise.reject(new Error('bad')) });
    await pick(at('data-photo-input', 'pick') as FakeEl, blob('x'));
    expect(calls.add).toEqual([]);
    expect(at('data-photos-status')?.textContent).toBe(PHOTOS_COPY.failed);
  });

  it('no file picked → nothing happens', async () => {
    const { calls, at } = render();
    const input = at('data-photo-input', 'pick') as FakeEl & { files: unknown[] };
    input.files = [];
    input.dispatch('change', {});
    await flush();
    expect(calls.scaled).toEqual([]);
  });
});

describe('Progress photos: compare', () => {
  it('starts with a hint; one pick asks for one more; two show side by side, older left', () => {
    const { all, at } = render();
    const cmp = () => at('data-compare');
    expect(cmp()?.textContent).toBe(PHOTOS_COPY.compareHint);
    at('data-photo', 'p-nov-a')?.click();
    expect(at('data-photo', 'p-nov-a')?.getAttribute('aria-pressed')).toBe('true');
    expect(at('data-photo', 'p-nov-a')?.find((e) => e.tag === 'svg')).toHaveLength(1);
    expect(cmp()?.textContent).toBe(PHOTOS_COPY.compareOne);
    at('data-photo', 'p-oct')?.click();
    expect(cmp()?.getAttribute('data-compare')).toBe('pair');
    const sides = all('data-compare-side');
    expect(sides.map((s) => s.getAttribute('data-compare-side'))).toEqual(['p-oct', 'p-nov-a']);
    expect(sides.map((s) => s.byTag('strong')[0]?.textContent)).toEqual([
      '3 Oct 2026',
      '14 Nov 2026',
    ]);
    expect(sides[0]?.byTag('img')[0]?.getAttribute('alt')).toBe(
      'Progress photo, 3 Oct 2026, front',
    );
    expect(sides[0]?.byTag('img')[0]?.getAttribute('src')).toBe('fake:p-oct');
  });

  it('a third pick replaces the first; a tap on a picked photo unpicks; Clear resets', () => {
    const { all, at } = render();
    at('data-photo', 'p-nov-a')?.click();
    at('data-photo', 'p-oct')?.click();
    at('data-photo', 'p-nov-b')?.click();
    expect(all('data-compare-side').map((s) => s.getAttribute('data-compare-side'))).toEqual([
      'p-oct',
      'p-nov-b',
    ]);
    expect(at('data-photo', 'p-nov-a')?.getAttribute('aria-pressed')).toBe('false');
    at('data-photo', 'p-oct')?.click();
    expect(at('data-compare')?.textContent).toBe(PHOTOS_COPY.compareOne);
    at('data-photo', 'p-oct')?.click();
    at('data-compare-clear')?.click();
    expect(at('data-compare')?.textContent).toBe(PHOTOS_COPY.compareHint);
    expect(all('data-photo').every((t) => t.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});

describe('Progress photos: delete', () => {
  it('one photo: the first tap arms (words change), the second deletes', () => {
    vi.useFakeTimers();
    const { calls, at } = render();
    const btn = at('data-photo-delete', 'p-oct');
    expect(btn?.textContent).toBe('Delete');
    expect(btn?.getAttribute('aria-label')).toBe('Delete the photo from 3 Oct 2026');
    btn?.click();
    expect(calls.del).toEqual([]);
    expect(btn?.textContent).toBe(PHOTOS_COPY.delArmed);
    expect(btn?.hasAttribute('data-armed')).toBe(true);
    expect(btn?.getAttribute('aria-label')).toBe(
      'Delete the photo from 3 Oct 2026. Tap again to delete',
    );
    btn?.click();
    expect(calls.del).toEqual(['p-oct']);
    expect(btn?.hasAttribute('data-armed')).toBe(false);
  });

  it('an armed Delete disarms by itself', () => {
    vi.useFakeTimers();
    const { calls, at } = render();
    const btn = at('data-photo-delete', 'p-nov-a');
    btn?.click();
    vi.advanceTimersByTime(3000);
    expect(btn?.textContent).toBe('Delete');
    expect(btn?.hasAttribute('data-armed')).toBe(false);
    btn?.click();
    expect(calls.del).toEqual([]);
  });

  it('Delete all: two taps', () => {
    vi.useFakeTimers();
    const { calls, at } = render();
    const btn = at('data-photos-delete-all');
    expect(btn?.textContent).toBe(PHOTOS_COPY.delAll);
    btn?.click();
    expect(btn?.textContent).toBe(PHOTOS_COPY.delAllArmed);
    expect(calls.delAll).toBe(0);
    btn?.click();
    expect(calls.delAll).toBe(1);
    expect(calls.del).toEqual([]);
  });
});

describe('Progress photos: image URLs and downscale', () => {
  it('default URLs are object URLs, made once per photo and revoked by dispose()', () => {
    const made: unknown[] = [];
    const revoked: string[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (b: unknown) => {
        made.push(b);
        return `blob:${made.length}`;
      },
      revokeObjectURL: (u: string) => revoked.push(u),
    });
    const { view, at } = render({ urlFor: undefined, photos: [OCT, NOV_A] });
    expect(made).toEqual([NOV_A.blob, OCT.blob]);
    at('data-photo', 'p-oct')?.click();
    at('data-photo', 'p-nov-a')?.click();
    expect(made).toHaveLength(2); // the compare view reuses them
    view.dispose();
    expect(revoked).toEqual(['blob:1', 'blob:2']);
  });

  it('dispose() also clears an armed Delete timer', () => {
    vi.useFakeTimers();
    const { view, at } = render();
    at('data-photo-delete', 'p-oct')?.click();
    view.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fitSize: long edge ≤ 1080, ratio kept, never upscaled', () => {
    expect(PHOTO_MAX_EDGE).toBe(1080);
    expect(fitSize(4032, 3024, 1080)).toEqual({ w: 1080, h: 810 });
    expect(fitSize(3024, 4032, 1080)).toEqual({ w: 810, h: 1080 });
    expect(fitSize(800, 600, 1080)).toEqual({ w: 800, h: 600 });
    expect(fitSize(0, 0, 1080)).toEqual({ w: 1, h: 1 });
  });

  it('downscalePhoto redraws on a canvas at the fitted size and returns a JPEG (no EXIF)', async () => {
    const drawn: unknown[][] = [];
    let closed = 0;
    const out = blob('jpeg');
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...a: unknown[]) => drawn.push(a) }),
      toBlob: (cb: (b: Blob) => void, type: string, q: number) => {
        expect(type).toBe('image/jpeg');
        expect(q).toBeGreaterThan(0.5);
        cb(out);
      },
    };
    const bmp = { width: 4000, height: 3000, close: () => closed++ };
    const opts: unknown[] = [];
    vi.stubGlobal('createImageBitmap', (_f: unknown, o: unknown) => {
      opts.push(o);
      return Promise.resolve(bmp);
    });
    (globalThis.document as unknown as { createElement: () => unknown }).createElement = () =>
      canvas;
    await expect(downscalePhoto(blob('big'))).resolves.toBe(out);
    expect([canvas.width, canvas.height]).toEqual([1080, 810]);
    expect(drawn).toEqual([[bmp, 0, 0, 1080, 810]]);
    expect(opts).toEqual([{ imageOrientation: 'from-image' }]);
    expect(closed).toBe(1);
  });
});

describe('Progress photos: helpers and copy', () => {
  it('sorts and groups newest first', () => {
    expect(sortPhotos(ALL).map((p) => p.id)).toEqual(['p-nov-b', 'p-nov-a', 'p-oct']);
    expect(groupByDate(ALL).map(([d, l]) => [d, l.length])).toEqual([
      ['2026-11-14', 2],
      ['2026-10-03', 1],
    ]);
    expect(photoAlt({ date: '2026-10-03' })).toBe('Progress photo, 3 Oct 2026');
    expect(photoCount(1)).toBe('1 photo');
    expect(photoCount(4)).toBe('4 photos');
  });

  it('every string passes the coaching-words check and judges no body', () => {
    for (const s of [PHOTOS_PRIVACY, ...Object.values(PHOTOS_COPY)]) {
      expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
      expect(s).not.toMatch(/\b(fat|thin|skinny|weight|flaw|better|worse|before|after)\b/i);
    }
  });

  it('targets are ≥ 56px and text is at body size or larger (css)', () => {
    const css = readFileSync(new URL('./photos.css', import.meta.url), 'utf8');
    const rule = (sel: string) =>
      new RegExp(`${sel.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.photos-add')).toContain('min-height: var(--tap-cta)');
    expect(rule('.photos-pose')).toContain('min-height: var(--tap-min)');
    expect(css).toMatch(
      /\.photo-delete,\s*\.photos-delete-all\s*\{[^}]*min-height: var\(--tap-min\)/,
    );
    expect(css).not.toMatch(/font-size:\s*var\(--fs-label\)/);
  });
});
