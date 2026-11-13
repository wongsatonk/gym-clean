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

  it('uses the share sheet when the browser can share files', async () => {
    const share = vi.fn(() => Promise.resolve());
    expect(await deliverFile(file, nav(share))).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'log.json.gz' });
  });

  it('reports a cancelled share and a share that needs a fresh tap', async () => {
    const abort = () => Promise.reject(new DOMException('x', 'AbortError'));
    const notAllowed = () => Promise.reject(new DOMException('x', 'NotAllowedError'));
    expect(await deliverFile(file, nav(abort))).toBe('cancelled');
    expect(await deliverFile(file, nav(notAllowed))).toBe('needs-tap');
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
