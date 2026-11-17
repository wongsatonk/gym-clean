import { describe, expect, it, vi } from 'vitest';
import {
  STATE_WORD,
  copyText,
  selfCheckView,
  summaryText,
  type CheckRow,
  type SelfCheck,
} from './selfCheck';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

const ok = (id: string, name = id): SelfCheck => ({
  id,
  name,
  run: () => Promise.resolve({ state: 'ok', detail: `${name} fine` }),
});

const rowsOf = (el: FakeEl) => el.find((e) => e.hasAttribute('data-check'));
const row = (el: FakeEl, id: string) => {
  const r = rowsOf(el).find((e) => e.getAttribute('data-check') === id);
  if (!r) throw new Error(`no row ${id}`);
  return r;
};
const summary = (el: FakeEl) => el.find((e) => e.hasAttribute('data-selfcheck-summary'))[0];
const button = (el: FakeEl, attr: string) => {
  const b = el.find((e) => e.hasAttribute(attr))[0];
  if (!b) throw new Error(`no ${attr}`);
  return b;
};

const mount = (checks: SelfCheck[], copy = vi.fn(() => Promise.resolve())) => {
  const onBack = vi.fn();
  const v = selfCheckView(
    { checks, version: 'Version 1.15.0 (build abc1234)', copy, timeoutMs: 1000 },
    { onBack },
  );
  return { v, el: asFake(v.el), copy, onBack };
};

describe('summaryText', () => {
  const r = (state: CheckRow['state'], info = false): CheckRow => ({
    id: state,
    name: state,
    state,
    info,
  });

  it('counts the checks that are not info rows: "All 8 ready"', () => {
    const rows = [r('ok', true), ...Array.from({ length: 8 }, () => r('ok'))];
    expect(summaryText(rows)).toBe('All 8 ready');
  });

  it('info results (e.g. "iPhone app only") are ready', () => {
    expect(summaryText([r('ok'), r('info'), r('info', true)])).toBe('All 2 ready');
  });

  it('warn and fail need attention, singular and plural', () => {
    expect(summaryText([r('ok'), r('warn')])).toBe('1 needs attention');
    expect(summaryText([r('fail'), r('warn'), r('ok')])).toBe('2 need attention');
  });

  it('while checks run it says how far it got', () => {
    expect(summaryText([r('ok'), r('running'), r('waiting')])).toBe('Checking… 1 of 3 done');
  });
});

describe('copyText', () => {
  it('lists name, state word and detail per check, with the version; text only', () => {
    const rows: CheckRow[] = [
      { id: 'version', name: 'App version', state: 'info', info: true, detail: '1.15.0' },
      {
        id: 'pose',
        name: 'Pose engine',
        state: 'fail',
        detail: "couldn't load x.wasm",
        fix: 'Install again.',
      },
      { id: 'voice', name: 'Coach voice', state: 'ok' },
    ];
    const t = copyText(rows, 'Version 1.15.0 (build abc1234)');
    expect(t.split('\n')).toEqual([
      'Gym Clean self-check',
      'Version 1.15.0 (build abc1234)',
      '1 needs attention',
      'App version: Info. 1.15.0',
      "Pose engine: Failed. couldn't load x.wasm Fix: Install again.",
      'Coach voice: OK',
    ]);
  });
});

describe('selfCheckView', () => {
  it('is a screen with a back button, a title, the version and one row per check, all waiting', () => {
    const { el, onBack } = mount([ok('a', 'Alpha'), ok('b', 'Beta')]);
    expect(el.tag).toBe('main');
    expect(el.getAttribute('data-screen')).toBe('selfcheck');
    expect(el.textContent).toContain('Self-check');
    expect(el.textContent).toContain('Version 1.15.0 (build abc1234)');
    expect(rowsOf(el)).toHaveLength(2);
    expect(row(el, 'a').getAttribute('data-state')).toBe('waiting');
    expect(row(el, 'a').textContent).toContain('Alpha');
    expect(row(el, 'a').textContent).toContain(STATE_WORD.waiting);
    el.find((e) => e.tag === 'button' && e.textContent.includes('Settings'))[0]?.click();
    expect(onBack).toHaveBeenCalled();
  });

  it('the summary is one atomic status region', () => {
    const { el } = mount([ok('a')]);
    const s = summary(el);
    expect(s?.getAttribute('role')).toBe('status');
    expect(s?.getAttribute('aria-atomic')).toBe('true');
  });

  it('runs the checks in order and shows every state as a word and an icon', async () => {
    let release: () => void = () => undefined;
    const slow: SelfCheck = {
      id: 'slow',
      name: 'Slow',
      run: () => new Promise((res) => (release = () => res({ state: 'ok' }))),
    };
    const checks: SelfCheck[] = [
      ok('a'),
      slow,
      {
        id: 'w',
        name: 'Warny',
        run: () => Promise.resolve({ state: 'warn', detail: 'Not allowed yet', fix: 'Tap Allow.' }),
      },
      { id: 'f', name: 'Faily', run: () => Promise.reject(new Error('boom')) },
      {
        id: 'i',
        name: 'Infoy',
        run: () => Promise.resolve({ state: 'info', detail: 'iPhone app only' }),
      },
    ];
    const { v, el } = mount(checks);
    const done = v.run();
    await vi.waitFor(() => expect(row(el, 'slow').getAttribute('data-state')).toBe('running'));
    expect(row(el, 'a').getAttribute('data-state')).toBe('ok');
    expect(row(el, 'w').getAttribute('data-state')).toBe('waiting');
    expect(row(el, 'slow').textContent).toContain(STATE_WORD.running);
    expect(summary(el)?.textContent).toBe('Checking… 1 of 5 done');
    release();
    await done;

    const states = rowsOf(el).map((r) => r.getAttribute('data-state'));
    expect(states).toEqual(['ok', 'ok', 'warn', 'fail', 'info']);
    for (const r of rowsOf(el)) {
      const state = r.getAttribute('data-state') as CheckRow['state'];
      expect(r.textContent).toContain(STATE_WORD[state]);
      expect(r.find((e) => e.tag === 'svg')).toHaveLength(1);
    }
    expect(row(el, 'w').textContent).toContain('Not allowed yet');
    expect(row(el, 'w').find((e) => e.hasAttribute('data-check-fix'))[0]?.textContent).toBe(
      'Tap Allow.',
    );
    expect(row(el, 'f').textContent).toContain('boom');
    expect(row(el, 'a').find((e) => e.hasAttribute('data-check-fix'))).toHaveLength(0);
    expect(summary(el)?.textContent).toBe('2 need attention');
  });

  it('a check that never answers fails after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { v, el } = mount([{ id: 'h', name: 'Hang', run: () => new Promise(() => undefined) }]);
      const done = v.run();
      await vi.advanceTimersByTimeAsync(1001);
      await done;
      expect(row(el, 'h').getAttribute('data-state')).toBe('fail');
      expect(row(el, 'h').textContent).toContain("Didn't answer");
    } finally {
      vi.useRealTimers();
    }
  });

  it('Run again re-runs every check; it is off while running', async () => {
    const run = vi.fn(() => Promise.resolve({ state: 'ok' as const }));
    const { v, el } = mount([{ id: 'a', name: 'A', run }]);
    const again = button(el, 'data-selfcheck-again');
    const first = v.run();
    expect(again.hasAttribute('disabled')).toBe(true);
    again.click(); // ignored while running
    await first;
    expect(again.hasAttribute('disabled')).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    again.click();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(again.textContent).toContain('Run again');
  });

  it('Copy results copies the text and says so', async () => {
    const { v, el, copy } = mount([ok('a', 'Alpha')]);
    await v.run();
    button(el, 'data-selfcheck-copy').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalled());
    const text = (copy.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('Alpha: OK');
    expect(text).toContain('All 1 ready');
    await vi.waitFor(() =>
      expect(el.find((e) => e.hasAttribute('data-selfcheck-copied'))[0]?.textContent).toBe(
        'Copied. Paste it in a message to yourself.',
      ),
    );
  });

  it('a failed copy says it could not copy', async () => {
    const { v, el } = mount(
      [ok('a')],
      vi.fn(() => Promise.reject(new Error('no'))),
    );
    await v.run();
    button(el, 'data-selfcheck-copy').click();
    await vi.waitFor(() =>
      expect(el.find((e) => e.hasAttribute('data-selfcheck-copied'))[0]?.textContent).toBe(
        "Couldn't copy on this phone.",
      ),
    );
  });
});
