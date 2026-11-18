import { describe, expect, it, vi } from 'vitest';
import {
  OWNER_UNLOCKED_TEXT,
  TAP_START,
  UNLOCK_TAPS,
  UNLOCK_WINDOW_MS,
  ownerTools,
  tapUnlock,
  type TapState,
} from './ownerUnlock';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

const taps = (times: readonly number[], from: TapState = TAP_START): TapState =>
  times.reduce((s, t) => tapUnlock(s, t), from);

/** n taps, `gap` ms apart, starting at `t0`. */
const evenly = (n: number, gap: number, t0 = 1_000_000) =>
  Array.from({ length: n }, (_, i) => t0 + i * gap);

describe('tapUnlock (pure)', () => {
  it('is 7 taps inside 3 s of each other', () => {
    expect(UNLOCK_TAPS).toBe(7);
    expect(UNLOCK_WINDOW_MS).toBe(3000);
  });

  it('6 taps → nothing; the 7th unlocks', () => {
    const six = taps(evenly(6, 400));
    expect(six).toMatchObject({ count: 6, unlocked: false });
    expect(tapUnlock(six, 1_000_000 + 6 * 400).unlocked).toBe(true);
  });

  it('a gap of exactly 3 s still counts; more than 3 s starts over at 1', () => {
    expect(taps(evenly(7, 3000)).unlocked).toBe(true);
    const slow = taps([...evenly(5, 500), 1_000_000 + 4 * 500 + 3001]);
    expect(slow).toMatchObject({ count: 1, unlocked: false });
  });

  it('slow taps reset: 4 quick, a pause, then 6 quick is not enough; 7 is', () => {
    const t = evenly(4, 300);
    const later = 1_000_000 + 60_000;
    expect(taps([...t, ...evenly(6, 300, later)]).unlocked).toBe(false);
    expect(taps([...t, ...evenly(7, 300, later)]).unlocked).toBe(true);
  });

  it('a clock that goes backwards starts over', () => {
    const s = taps(evenly(3, 300));
    expect(tapUnlock(s, 10).count).toBe(1);
  });

  it('stays unlocked once unlocked', () => {
    const on = taps(evenly(7, 100));
    expect(tapUnlock(on, 1e12).unlocked).toBe(true);
  });

  it('does not mutate its input', () => {
    const s: TapState = { ...TAP_START };
    tapUnlock(s, 5);
    expect(s).toEqual(TAP_START);
  });
});

describe('ownerTools controller', () => {
  useFakeDom();

  const setup = (owner: boolean) => {
    let t = 1_000_000;
    const onOwnerChange = vi.fn();
    const ui = ownerTools({ versionText: 'Version 1.15', owner, now: () => t }, { onOwnerChange });
    const tap = (n: number, gap = 300) => {
      for (let i = 0; i < n; i++) {
        asFake(ui.version).click();
        t += gap;
      }
    };
    const sw = (): FakeEl | undefined =>
      asFake(ui.tools).find((e) => e.getAttribute('role') === 'switch')[0];
    const status = (): FakeEl | undefined =>
      asFake(ui.tools).find((e) => e.getAttribute('role') === 'status')[0];
    return { ui, tap, sw, status, onOwnerChange, advance: (ms: number) => (t += ms) };
  };

  it('the version line is a button showing the version text', () => {
    const { ui } = setup(false);
    const v = asFake(ui.version);
    expect(v.tag).toBe('button');
    expect(v.textContent).toBe('Version 1.15');
    expect(v.hasAttribute('data-about-version')).toBe(true);
  });

  it('owner off: 6 taps show nothing, the 7th shows the switch and the status line', () => {
    const { tap, sw, status } = setup(false);
    tap(6);
    expect(sw()).toBeUndefined();
    expect(status()).toBeUndefined();
    tap(1);
    expect(sw()?.getAttribute('aria-checked')).toBe('false');
    expect(sw()?.textContent).toContain('Owner tools');
    expect(status()?.textContent).toBe(OWNER_UNLOCKED_TEXT);
    expect(status()?.getAttribute('aria-atomic')).toBe('true');
  });

  it('slow taps reset the count', () => {
    const { tap, sw, advance } = setup(false);
    tap(5);
    advance(5000);
    tap(5);
    expect(sw()).toBeUndefined();
    tap(2);
    expect(sw()).toBeDefined();
  });

  it('owner on: the switch is there from the start (no status line), checked', () => {
    const { sw, status } = setup(true);
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
    expect(status()).toBeUndefined();
  });

  it('flipping the switch calls onOwnerChange and stays visible while on and after turning off', () => {
    const { tap, sw, onOwnerChange } = setup(false);
    tap(7);
    sw()?.click();
    expect(onOwnerChange).toHaveBeenLastCalledWith(true);
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
    sw()?.click();
    expect(onOwnerChange).toHaveBeenLastCalledWith(false);
    expect(sw()?.getAttribute('aria-checked')).toBe('false');
  });

  it('more taps after unlocking do nothing new', () => {
    const { tap, sw, onOwnerChange } = setup(false);
    tap(14);
    expect(sw()).toBeDefined();
    expect(onOwnerChange).not.toHaveBeenCalled();
  });
});
