import { describe, expect, it, vi } from 'vitest';
import { deliverFile, devLogSummary, formatBytes } from './devLogPanel';
import { clampCount, lastSetText } from './lastSetCorrection';

describe('dev log panel formatting', () => {
  it('formats sizes in kB under 1 MB, one decimal under 10 MB, whole MB above', () => {
    expect(formatBytes(0)).toBe('0 kB');
    expect(formatBytes(820 * 1024)).toBe('820 kB');
    expect(formatBytes(6.4 * 1024 * 1024)).toBe('6.4 MB');
    expect(formatBytes(142.3 * 1024 * 1024)).toBe('142 MB');
  });

  it('summarises size and session count', () => {
    expect(devLogSummary({ bytes: 0, sessions: 0 })).toBe('Empty');
    expect(devLogSummary({ bytes: 2 * 1024 * 1024, sessions: 1 })).toBe('2.0 MB · 1 session');
    expect(devLogSummary({ bytes: 6.4 * 1024 * 1024, sessions: 3 })).toBe('6.4 MB · 3 sessions');
  });
});

describe('deliverFile', () => {
  const file = new File(['{}'], 'log.json.gz');
  const nav = (share: () => Promise<void>, canShare = true) =>
    ({ canShare: () => canShare, share }) as unknown as Navigator;
  const reject = (name: string) => () => Promise.reject(new DOMException('x', name));

  it('uses the share sheet when the browser can share files', async () => {
    const share = vi.fn(() => Promise.resolve());
    const download = vi.fn();
    expect(await deliverFile(file, { nav: nav(share), download })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'log.json.gz' });
    expect(download).not.toHaveBeenCalled();
  });

  it('reports a cancelled share and a share that needs a fresh tap', async () => {
    const download = vi.fn();
    expect(await deliverFile(file, { nav: nav(reject('AbortError')), download })).toBe('cancelled');
    expect(await deliverFile(file, { nav: nav(reject('NotAllowedError')), download })).toBe(
      'needs-tap',
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('downloads when the browser cannot share files', async () => {
    const share = vi.fn(() => Promise.resolve());
    const download = vi.fn();
    expect(await deliverFile(file, { nav: nav(share, false), download })).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(file);
  });

  it('downloads when there is no share API at all', async () => {
    const download = vi.fn();
    expect(await deliverFile(file, { nav: {} as Navigator, download })).toBe('downloaded');
    expect(download).toHaveBeenCalledWith(file);
  });

  it('downloads on any other share error', async () => {
    const download = vi.fn();
    const typeError = () => Promise.reject(new TypeError('bad'));
    expect(await deliverFile(file, { nav: nav(reject('DataError')), download })).toBe('downloaded');
    expect(await deliverFile(file, { nav: nav(typeError), download })).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('downloads when the second "Tap to share" is refused again', async () => {
    const download = vi.fn();
    const result = await deliverFile(file, {
      nav: nav(reject('NotAllowedError')),
      download,
      secondTry: true,
    });
    expect(result).toBe('downloaded');
    expect(download).toHaveBeenCalledWith(file);
  });
});

describe('last set correction formatting', () => {
  it('pluralises and hides zero partials', () => {
    expect(lastSetText(9, 1)).toBe('9 reps · 1 partial');
    expect(lastSetText(1, 2)).toBe('1 rep · 2 partials');
    expect(lastSetText(12, 0)).toBe('12 reps');
  });

  it('clamps counts to 0..max whole numbers', () => {
    expect(clampCount(-1)).toBe(0);
    expect(clampCount(100)).toBe(99);
    expect(clampCount(5, 4)).toBe(4);
    expect(clampCount(3.6)).toBe(4);
  });
});
