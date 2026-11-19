// M13d task 40a (SPEC M13d Goal 7): the chrome and sheet buttons are the shared round icon
// button. Render tests on the fake DOM: each control keeps its hook, its accessible name and its
// click path, and gets the agreed look (variant, word placement, icon, whole-row tap area).
// The CSS checks read chromeButtons.css / topBar.css from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CameraInfo } from '../core/exercises';
import { cameraInfoSheet, closeCameraInfo } from './cameraInfoSheet';
import { coachSheet } from './coach/coachSheet';
import { closeLearnCard, learnCardSheet } from './coach/learnCard';
import { undoToast } from './coach/undoToast';
import { DEMO_IDS } from './demo3d/ids';
import { sheetShell } from './fuel/common';
import { createHowToSheet, howToContent } from './howToSheet';
import { FakeEl, asFake, useFakeDom } from './screens/testDom';
import { reportSheet } from './todo/reportSheet';
import { workoutTopBar } from './topBar';

vi.mock('./demo3d/player', () => ({ createDemoPlayer: () => new Promise(() => {}) }));

useFakeDom();

beforeAll(() => {
  Object.defineProperty(FakeEl.prototype, 'dataset', {
    configurable: true,
    get(this: FakeEl & { _ds?: Record<string, string> }) {
      this._ds ??= {};
      return this._ds;
    },
  });
});
beforeEach(() => {
  (FakeEl.prototype as unknown as { remove: () => void }).remove = function (this: FakeEl) {
    this.isConnected = false;
  };
});
afterEach(() => {
  closeCameraInfo();
  closeLearnCard();
  delete (FakeEl.prototype as unknown as { remove?: () => void }).remove;
});

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = (f: string) => strip(readFileSync(join(__dirname, f), 'utf8'));
function block(source: string, selector: string): string {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) =>
      (m[1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/\s+/g, ' '))
        .includes(selector),
    )
    .map((m) => m[2] ?? '')
    .join('\n');
}

const one = (el: FakeEl, attr: string, value?: string): FakeEl => {
  const hit = el.find(
    (e) => e.hasAttribute(attr) && (value === undefined || e.getAttribute(attr) === value),
  )[0];
  if (!hit) throw new Error(`no [${attr}${value === undefined ? '' : `=${value}`}]`);
  return hit;
};
const byWord = (el: FakeEl, word: string): FakeEl => {
  const hit = el.byTag('button').find((b) => b.textContent.trim() === word);
  if (!hit) throw new Error(`no button "${word}"`);
  return hit;
};

type Look = {
  variant: 'main' | 'secondary' | 'quiet' | 'danger';
  at: 'beside' | 'below';
  icon: string;
  word: string;
  wide?: boolean;
};

/** The control is the shared round icon button with this look; the word is its name. */
function expectRound(btn: FakeEl, look: Look): void {
  expect(btn.tag).toBe('button');
  expect(btn.getAttribute('type')).toBe('button');
  expect(btn.hasAttribute('data-icon-btn')).toBe(true);
  expect(btn.classes).toContain('icon-btn');
  expect(btn.getAttribute('data-variant')).toBe(look.variant);
  expect(btn.getAttribute('data-label-at')).toBe(look.at);
  expect(btn.hasAttribute('data-wide-hit')).toBe(look.wide === true);
  expect(btn.oneByClass('icon-btn-label').textContent).toBe(look.word);
  const ics = btn.find((e) => e.hasAttribute('data-icon'));
  expect(ics.map((i) => i.getAttribute('data-icon'))).toEqual([look.icon]);
  expect(btn.oneByClass('icon-btn-circle').getAttribute('aria-hidden')).toBe('true');
}

describe('workout top bar (mid-set: styling only)', () => {
  const bar = (withCamera: boolean) => {
    const calls: string[] = [];
    const el = asFake(
      workoutTopBar({
        dayName: 'Pull A',
        exIndex: 2,
        exTotal: 5,
        onList: () => calls.push('list'),
        onCamera: withCamera ? () => calls.push('camera') : undefined,
        onPause: () => calls.push('pause'),
      }),
    );
    return { el, calls };
  };

  it('Camera and Pause are round buttons with the word under the circle', () => {
    const { el, calls } = bar(true);
    const pause = one(el, 'data-pause-open');
    expectRound(pause, { variant: 'secondary', at: 'below', icon: 'pause', word: 'Pause' });
    const camera = byWord(el, 'Camera');
    expectRound(camera, { variant: 'secondary', at: 'below', icon: 'camera', word: 'Camera' });
    camera.click();
    pause.click();
    expect(calls).toEqual(['camera', 'pause']);
  });

  it('the exercise list keeps its name, both lines and its row; the circle holds the list icon', () => {
    const { el, calls } = bar(false);
    const list = el.byTag('button').find((b) => b.classes.includes('wtb-list'));
    if (!list) throw new Error('no list button');
    expect(list.getAttribute('aria-label')).toBe('Pull A, 3 of 5, Exercise list');
    expect(list.getAttribute('data-variant')).toBe('secondary');
    expect(list.getAttribute('data-label-at')).toBe('beside');
    expect(list.oneByClass('wtb-day').textContent).toBe('Pull A');
    expect(list.oneByClass('wtb-pos').textContent).toBe('3 of 5');
    expect(list.find((e) => e.hasAttribute('data-icon'))[0]?.getAttribute('data-icon')).toBe(
      'list',
    );
    list.click();
    expect(calls).toEqual(['list']);
    // Nothing new to tap: list + Pause without a camera, + Camera with one.
    expect(el.byTag('button')).toHaveLength(2);
    expect(bar(true).el.byTag('button')).toHaveLength(3);
  });

  it('css: the bar stays 60px (nothing below moves); Camera / Pause keep 88px; no motion', () => {
    const c = css('topBar.css');
    expect(block(c, '.wtb .icon-btn')).toMatch(/min-height:\s*var\(--tap-bar\)/);
    expect(block(c, '.wtb .wtb-side')).toMatch(/min-width:\s*88px/);
    // Circle over word inside 60px: a 36px circle + 2px gap + the 18px label at 1.2.
    expect(block(c, '.wtb .icon-btn-circle')).toMatch(/width:\s*36px/);
    expect(block(c, '.wtb .wtb-side')).toMatch(/gap:\s*2px/);
    expect(c).not.toMatch(/transition|animation|transform/);
    expect(c).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe('How-to sheet', () => {
  const ID = DEMO_IDS.find((id) => howToContent(id).lines.length > 0) ?? '';
  it('Close: a quiet round button, word beside, same hook and path', () => {
    const closes: number[] = [];
    const sheet = createHowToSheet({
      exerciseId: ID,
      tracking: 'manual',
      onClose: () => closes.push(1),
    });
    const el = asFake(sheet.el);
    const close = one(el, 'data-howto', 'close');
    expectRound(close, { variant: 'quiet', at: 'beside', icon: 'close', word: 'Close' });
    close.click();
    expect(closes).toEqual([1]);
    sheet.dispose();
  });
});

describe('Camera sheet', () => {
  const INFO: CameraInfo = {
    counts: 'Counts each squat from your knee angle.',
    lines: ['Phone at hip height, facing you'],
    view: 'front',
    facing: 'Facing the phone',
    distanceM: [2, 3],
    heightHint: 'Hip height',
    learning: false,
  };
  it('Practice is the main round button on a full-width row; Close a full-width secondary', () => {
    const calls: string[] = [];
    const el = asFake(
      cameraInfoSheet(INFO, {
        name: 'Goblet Squat',
        onPractice: () => calls.push('practice'),
        onClose: () => calls.push('close'),
      }),
    );
    const practice = one(el, 'data-camera-practice');
    expectRound(practice, {
      variant: 'main',
      at: 'beside',
      icon: 'camera',
      word: 'Practice',
      wide: true,
    });
    expect(practice.getAttribute('aria-describedby')).toMatch(/^camsheet-practice-note-/);
    const close = one(el, 'data-camera-close');
    expectRound(close, {
      variant: 'secondary',
      at: 'beside',
      icon: 'close',
      word: 'Close',
      wide: true,
    });
    practice.click();
    close.click();
    expect(calls).toEqual(['practice', 'close']);
  });
});

describe('Fuel sheet shell', () => {
  it('Close / Cancel: a quiet round button, word beside, [data-close] kept', () => {
    for (const word of ['Close', 'Cancel']) {
      const onClose = vi.fn();
      const shell = sheetShell({ title: 'Log food', key: 'log-sheet', closeLabel: word, onClose });
      const close = one(asFake(shell.el), 'data-close');
      expectRound(close, { variant: 'quiet', at: 'beside', icon: 'close', word });
      close.click();
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Report sheet (To-dos)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const render = (over: { nothingNew?: boolean; ok?: boolean } = {}) => {
    const calls: string[] = [];
    const el = asFake(
      reportSheet(
        {
          text: 'Made-up report text.',
          nothingNew: over.nothingNew ?? false,
          copy: async () => over.ok ?? true,
          selectCopy: () => true,
        },
        {
          onClose: () => calls.push('close'),
          onCopied: () => calls.push('copied'),
          onCopyAll: () => calls.push('all'),
        },
      ),
    );
    return { el, calls };
  };

  it('Copy is the main round button (whole row); Close is quiet, word beside', () => {
    const { el, calls } = render();
    expectRound(one(el, 'data-report-copy'), {
      variant: 'main',
      at: 'beside',
      icon: 'list',
      word: 'Copy',
      wide: true,
    });
    const close = one(el, 'data-report-close');
    expectRound(close, { variant: 'quiet', at: 'beside', icon: 'close', word: 'Close' });
    close.click();
    expect(calls).toEqual(['close']);
  });

  it('the fallback: Select all and copy (main) and I copied it (secondary), both whole rows', async () => {
    const { el, calls } = render({ ok: false });
    one(el, 'data-report-copy').click();
    await flush();
    expectRound(one(el, 'data-report-select'), {
      variant: 'main',
      at: 'beside',
      icon: 'list',
      word: 'Select all and copy',
      wide: true,
    });
    const manual = one(el, 'data-report-manual');
    expectRound(manual, {
      variant: 'secondary',
      at: 'beside',
      icon: 'check',
      word: 'I copied it',
      wide: true,
    });
    manual.click();
    expect(calls).toEqual(['copied']);
  });

  it('nothing new: Copy all again is the main round button', () => {
    const { el, calls } = render({ nothingNew: true });
    const all = one(el, 'data-report-copy-all');
    expectRound(all, {
      variant: 'main',
      at: 'beside',
      icon: 'refresh',
      word: 'Copy all again',
      wide: true,
    });
    all.click();
    expect(calls).toEqual(['all']);
  });
});

describe('Learn card', () => {
  it('Got it: the main round button on the whole row, hook kept', () => {
    const onClose = vi.fn();
    const el = asFake(
      learnCardSheet({ id: 'x', title: 'Made-up tip', body: 'One line.' }, { onClose }),
    );
    const got = one(el, 'data-learn-close');
    expectRound(got, { variant: 'main', at: 'beside', icon: 'check', word: 'Got it', wide: true });
    expect(got.classes).toContain('learn-close');
    got.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Coach sheet', () => {
  const mount = (allowTyping: boolean) => {
    const log: string[] = [];
    const el = asFake(
      coachSheet(
        { items: [], allowTyping },
        {
          onClose: () => log.push('close'),
          onChip: () => undefined,
          onArea: () => undefined,
          onText: (t: string) => log.push(`text:${t}`),
          onApply: () => undefined,
          onDismiss: () => undefined,
          onEndWorkout: () => undefined,
        },
      ),
    );
    return { el, log };
  };

  it('Close is quiet with the word beside; Send is a round button beside the text box', () => {
    const { el, log } = mount(true);
    const close = byWord(el, 'Close');
    expectRound(close, { variant: 'quiet', at: 'beside', icon: 'close', word: 'Close' });
    expect(close.classes).toContain('cs-close');
    const send = byWord(el, 'Send');
    expectRound(send, { variant: 'secondary', at: 'beside', icon: 'arrow-right', word: 'Send' });
    expect(send.classes).toContain('cs-send');
    close.click();
    expect(log).toEqual(['close']);
  });

  it('the quick-action chips stay chips (not round buttons)', () => {
    const { el } = mount(false);
    const chips = el.find((e) => e.hasAttribute('data-coach-chip'));
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c.hasAttribute('data-icon-btn')).toBe(false);
  });
});

describe('Undo toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('Undo is a round button with the undo arrow and the word beside it (the toast stays one row)', () => {
    const log: string[] = [];
    const el = undoToast({ text: 'Done.' }, { onUndo: () => log.push('undo') });
    const undo = byWord(asFake(el), 'Undo');
    expectRound(undo, { variant: 'secondary', at: 'beside', icon: 'undo', word: 'Undo' });
    undo.click();
    expect(log).toEqual(['undo']);
    el.dispose();
  });
});

describe('chromeButtons.css (the main pill track from the agreed preview)', () => {
  it('a wide main button sits on a pill track; tokens only, no motion of its own', () => {
    const c = css('chromeButtons.css');
    const pill = block(c, ".chrome-pill.icon-btn[data-variant='main']");
    expect(pill).toMatch(/border-radius:\s*var\(--r-pill\)/);
    expect(pill).toMatch(/background:\s*var\(--surface\)/);
    // The word keeps the body font (Barlow Condensed is for numbers, timers, Start, tabs).
    expect(c).not.toMatch(/--font-display/);
    expect(c).not.toMatch(/transition|animation|transform/);
    expect(c).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
