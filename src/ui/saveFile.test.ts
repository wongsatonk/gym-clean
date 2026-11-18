// saveFile: the system share sheet when it takes files (the iPhone app's WKWebView ignores an
// <a download> click), else a download link (desktop browsers).
import { describe, expect, it, vi } from 'vitest';
import { saveFile, type SaveEnv } from './saveFile';

function env(over: Partial<SaveEnv> = {}) {
  const clicks: { href: string; download: string }[] = [];
  const doc = {
    createElement: () => {
      const a = {
        href: '',
        download: '',
        rel: '',
        click() {
          clicks.push({ href: a.href, download: a.download });
        },
        remove() {},
      };
      return a;
    },
    body: { append() {} },
  } as unknown as SaveEnv['doc'];
  return {
    clicks,
    e: {
      doc,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
      ...over,
    } as SaveEnv,
  };
}

const blob = () => new Blob(['{}'], { type: 'application/json' });

describe('saveFile', () => {
  it('uses the share sheet when it can share files', async () => {
    const share = vi.fn(async () => {});
    const { e, clicks } = env({ nav: { share, canShare: () => true } });
    expect(await saveFile(blob(), 'a.json', 'Coach eval', e)).toBe('shared');
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files?.[0]?.name).toBe('a.json');
    expect(data.files?.[0]?.type).toBe('application/json');
    expect(clicks).toEqual([]);
  });

  it('a cancelled share sheet is cancelled, with no download behind his back', async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'AbortError' });
    });
    const { e, clicks } = env({ nav: { share, canShare: () => true } });
    expect(await saveFile(blob(), 'a.json', 't', e)).toBe('cancelled');
    expect(clicks).toEqual([]);
  });

  it('falls back to a download link without file sharing or on a share error', async () => {
    const a = env({ nav: { share: vi.fn(), canShare: () => false } });
    expect(await saveFile(blob(), 'a.json', 't', a.e)).toBe('downloaded');
    expect(a.clicks).toEqual([{ href: 'blob:x', download: 'a.json' }]);
    const b = env({
      nav: {
        share: vi.fn(async () => {
          throw new Error('NotAllowed');
        }),
        canShare: () => true,
      },
    });
    expect(await saveFile(blob(), 'b.json', 't', b.e)).toBe('downloaded');
    const c = env({ nav: undefined });
    expect(await saveFile(blob(), 'c.json', 't', c.e)).toBe('downloaded');
  });
});
