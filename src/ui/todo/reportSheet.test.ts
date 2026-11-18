import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import {
  COPIED_TEXT,
  EMPTY_TEXT,
  FALLBACK_TEXT,
  reportSheet,
  type ReportSheetProps,
} from './reportSheet';
import { FIX_REPORT } from './todoFixture';

useFakeDom();

const flush = () => new Promise((r) => setTimeout(r, 0));

function render(over: Partial<ReportSheetProps> = {}) {
  const calls = { close: 0, copied: 0, all: 0, copiedText: [] as string[] };
  const el = asFake(
    reportSheet(
      {
        text: FIX_REPORT,
        nothingNew: false,
        copy: async (t) => {
          calls.copiedText.push(t);
          return true;
        },
        ...over,
      },
      {
        onClose: () => calls.close++,
        onCopied: () => calls.copied++,
        onCopyAll: () => calls.all++,
      },
    ),
  );
  return { el, calls };
}

const one = (el: FakeEl, attr: string) => {
  const hit = el.find((e) => e.hasAttribute(attr))[0];
  if (!hit) throw new Error(`no [${attr}]`);
  return hit;
};
const has = (el: FakeEl, attr: string) => el.find((e) => e.hasAttribute(attr)).length > 0;

describe('reportSheet', () => {
  it('is a modal dialog that shows the exact text before copying', () => {
    const { el, calls } = render();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(one(el, 'data-report-text').textContent).toBe(FIX_REPORT);
    expect(calls.copiedText).toEqual([]);
    expect(has(el, 'data-report-copied')).toBe(false);
  });

  it('Copy puts that same text on the clipboard, says so, and marks it sent once', async () => {
    const { el, calls } = render();
    one(el, 'data-report-copy').click();
    await flush();
    expect(calls.copiedText).toEqual([FIX_REPORT]);
    expect(one(el, 'data-report-copied').textContent).toBe(COPIED_TEXT);
    expect(calls.copied).toBe(1);
    one(el, 'data-report-copy').click();
    await flush();
    expect(calls.copied).toBe(1);
  });

  it('clipboard refused → selectable read-only text box + "Select all and copy"', async () => {
    let selected = 0;
    let legacyOk = false;
    const { el, calls } = render({
      copy: async () => false,
      selectCopy: () => {
        selected++;
        return legacyOk;
      },
    });
    one(el, 'data-report-copy').click();
    await flush();
    expect(el.textContent).toContain(FALLBACK_TEXT);
    const box = one(el, 'data-report-fallback') as FakeEl & { value: string };
    expect(box.tag).toBe('textarea');
    expect(box.hasAttribute('readonly')).toBe(true);
    expect(box.value).toBe(FIX_REPORT);
    expect(has(el, 'data-report-text')).toBe(false);
    one(el, 'data-report-select').click();
    expect(selected).toBe(1);
    expect(calls.copied).toBe(0); // legacy copy not confirmed: text stays selected
    legacyOk = true;
    one(el, 'data-report-select').click();
    expect(calls.copied).toBe(1);
    expect(one(el, 'data-report-copied').textContent).toBe(COPIED_TEXT);
  });

  it('fallback: "I copied it" marks it sent', async () => {
    const { el, calls } = render({ copy: async () => false, selectCopy: () => false });
    one(el, 'data-report-copy').click();
    await flush();
    one(el, 'data-report-manual').click();
    expect(calls.copied).toBe(1);
  });

  it('nothing new → says so and offers Copy all again (no preview, no Copy)', () => {
    const { el, calls } = render({ nothingNew: true, text: '' });
    expect(one(el, 'data-report-empty').textContent).toBe(EMPTY_TEXT);
    expect(has(el, 'data-report-copy')).toBe(false);
    one(el, 'data-report-copy-all').click();
    expect(calls.all).toBe(1);
  });

  it('Close calls back', () => {
    const { el, calls } = render();
    one(el, 'data-report-close').click();
    expect(calls.close).toBe(1);
  });

  it('copy passes checkCopy', () => {
    for (const s of [COPIED_TEXT, EMPTY_TEXT, FALLBACK_TEXT]) expect(checkCopy(s).ok).toBe(true);
  });
});
