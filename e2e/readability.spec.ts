// M13d task 15 (SPEC M13d goal 4 "Easier to read", Accept "A readability spec"): an audit of the
// screens a first-time user reads, at 390×844 in the real app. For each screen it measures:
//
// - words: body-text words in the FIRST VIEWPORT (no scrolling). Body text = every visible text
//   node in the screen (headings, paragraphs, labels, counts) except controls (buttons, radios,
//   checkboxes, switches, tabs, fields: the intake's options don't count), screen-reader-only
//   text, aria-hidden decoration and the tab bar. A word counts when its box's centre is inside the
//   viewport and inside every scrolling/clipping parent (a sheet's own scroll area).
// - smallest text: the smallest computed font-size of any visible text on the whole screen
//   (controls included; sr-only, aria-hidden and the tab bar left out).
// - paragraphs: the smallest font-size and the smallest line-height ÷ font-size of the visible
//   <p> elements ('normal' line-height counts as 1.2).
//
// Budgets (SPEC M13d Accept): first-run pages (welcome, Units, Apple Health) ≤ 30 words; an intake
// question ≤ 20 besides its options; any other listed screen ≤ 70; no text < 18px; paragraphs
// ≥ 20px with line-height ≥ 1.45. Budgets are soft assertions: one run measures every screen,
// writes the table (stdout, attachment `m13d-readability.md`) and a first-viewport screenshot per
// screen (`m13d-<tag>-<screen>.png`, tag `before` unless READABILITY_TAG is set, e.g. `after`),
// then fails listing every screen over budget. Red on 1.16.2 by design (task 15: "fails now");
// green when tasks 12, 16–19 land.
//
// Screens: the welcome pages and Units (fresh web install); the Apple Health page (fresh install
// as the iPhone app, a fake GymHealth plugin); each intake question + the summary; the abs
// question's Why? learn card; Set up Fuel (opened from the intake's Fuel row); What's New page 1,
// Settings (top) and the How-to sheet (an existing install). Nothing is spoken by any of them.
import { writeFileSync } from 'node:fs';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { expect, freshDbDefaults, test } from './fixtures';
import { animationsSettled, at, installMocks, openApp } from './app.helpers';

test.use({ firstRun: 'fresh' });

const TAG = process.env.READABILITY_TAG ?? 'before';
const NOW = at(13, 18);

const BUDGET = { firstRun: 30, question: 20, other: 70 } as const;
const MIN_TEXT_PX = 18;
const MIN_PARA_PX = 20;
const MIN_PARA_LH = 1.45;

type Kind = keyof typeof BUDGET;

type Measure = {
  words: number;
  /** Words in the first viewport counting controls too (information only, no budget). */
  allWords: number;
  minFont: number;
  minFontText: string;
  paraCount: number;
  minParaFont: number | null;
  minParaFontText: string;
  minParaLh: number | null;
  minParaLhText: string;
};

type Row = { screen: string; kind: Kind; m: Measure | null; note?: string };

/** Measures the screen under `rootSel` (see the header for what counts). */
async function measure(page: Page, rootSel: string): Promise<Measure> {
  const root = page.locator(rootSel).first();
  await expect(root).toBeVisible();
  await animationsSettled(page);
  return root.evaluate((rootEl) => {
    const CONTROL =
      'button,[role="button"],[role="radio"],[role="checkbox"],[role="switch"],[role="tab"],' +
      '[role="option"],[role="menuitem"],input,select,textarea';
    const EXCLUDED = '.sr-only,[aria-hidden="true"],[data-tabbar],script,style,template,svg';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const short = (t: string) => {
      const s = t.replace(/\s+/g, ' ').trim();
      return s.length > 40 ? `${s.slice(0, 37)}…` : s;
    };

    const shown = (el: Element): boolean => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.opacity === '0') return false;
      }
      return getComputedStyle(el).visibility === 'visible' && el.getClientRects().length > 0;
    };
    /**
     * The viewport cut down by every element up to the screen root that clips its overflow (not
     * above it: body / html can be 0 px tall under a fixed-position screen).
     */
    const clipOf = (el: Element) => {
      let l = 0;
      let t = 0;
      let r = vw;
      let b = vh;
      const stop = rootEl.parentElement;
      for (let e: Element | null = el; e && e !== stop; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const box = e.getBoundingClientRect();
          l = Math.max(l, box.left);
          t = Math.max(t, box.top);
          r = Math.min(r, box.right);
          b = Math.min(b, box.bottom);
        }
      }
      return { l, t, r, b };
    };

    let words = 0;
    let allWords = 0;
    let minFont = Infinity;
    let minFontText = '';
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? '';
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      const el = n.parentElement;
      if (!el || el.closest(EXCLUDED) || !shown(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
      if (rects.length === 0) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < minFont) {
        minFont = px;
        minFontText = short(text);
      }
      const isControl = el.closest(CONTROL) !== null;
      const clip = clipOf(el);
      const re = /[^\s]+/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (!/[\p{L}\p{N}]/u.test(m[0])) continue;
        const wr = document.createRange();
        wr.setStart(n, m.index);
        wr.setEnd(n, m.index + m[0].length);
        const box = wr.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        if (box.width > 0 && cx >= clip.l && cx <= clip.r && cy >= clip.t && cy <= clip.b) {
          allWords++;
          if (!isControl) words++;
        }
      }
    }

    let paraCount = 0;
    let minParaFont: number | null = null;
    let minParaFontText = '';
    let minParaLh: number | null = null;
    let minParaLhText = '';
    for (const p of rootEl.querySelectorAll('p')) {
      const text = p.textContent ?? '';
      if (!/[\p{L}\p{N}]/u.test(text) || p.closest(EXCLUDED) || !shown(p)) continue;
      paraCount++;
      const cs = getComputedStyle(p);
      const px = parseFloat(cs.fontSize);
      const lh = cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / px;
      if (minParaFont === null || px < minParaFont) {
        minParaFont = px;
        minParaFontText = short(text);
      }
      if (minParaLh === null || lh < minParaLh) {
        minParaLh = Math.round(lh * 100) / 100;
        minParaLhText = short(text);
      }
    }
    return {
      words,
      allWords,
      minFont: minFont === Infinity ? 0 : minFont,
      minFontText,
      paraCount,
      minParaFont,
      minParaFontText,
      minParaLh,
      minParaLhText,
    };
  });
}

class Audit {
  rows: Row[] = [];
  constructor(private testInfo: TestInfo) {}

  /**
   * `top`: scroll the page to the top first (a screen that opens keeping the last scroll position,
   * like Set up Fuel after the intake in 1.16.2, is measured as it reads from its start).
   */
  async add(page: Page, screen: string, kind: Kind, rootSel: string, top = false): Promise<void> {
    if (top) await page.evaluate(() => window.scrollTo(0, 0));
    const m = await measure(page, rootSel);
    this.rows.push({ screen, kind, m });
    await page.screenshot({ path: this.testInfo.outputPath(`m13d-${TAG}-${screen}.png`) });
  }

  missing(screen: string, kind: Kind, note: string): void {
    this.rows.push({ screen, kind, m: null, note });
  }

  /** Budget failures for one row (empty = within every budget). */
  static over(r: Row): string[] {
    if (!r.m) return [`not found (${r.note ?? 'missing'})`];
    const out: string[] = [];
    const budget = BUDGET[r.kind];
    if (r.m.words > budget) out.push(`${r.m.words} words > ${budget}`);
    if (r.m.minFont < MIN_TEXT_PX) out.push(`text ${r.m.minFont}px < ${MIN_TEXT_PX}`);
    if (r.m.minParaFont !== null && r.m.minParaFont < MIN_PARA_PX)
      out.push(`paragraph ${r.m.minParaFont}px < ${MIN_PARA_PX}`);
    if (r.m.minParaLh !== null && r.m.minParaLh < MIN_PARA_LH)
      out.push(`line-height ${r.m.minParaLh} < ${MIN_PARA_LH}`);
    return out;
  }

  table(): string {
    const head =
      '| Screen | Budget | Words (1st viewport) | incl. controls | Smallest text px | Paragraph px (min) | Paragraph line-height (min) | Over |\n' +
      '|---|---|---|---|---|---|---|---|';
    const lines = this.rows.map((r) => {
      const m = r.m;
      const cells = m
        ? [
            String(m.words),
            String(m.allWords),
            `${m.minFont} ("${m.minFontText}")`,
            m.minParaFont === null ? '–' : `${m.minParaFont} ("${m.minParaFontText}")`,
            m.minParaLh === null ? '–' : `${m.minParaLh} ("${m.minParaLhText}")`,
          ]
        : ['–', '–', '–', '–', '–'];
      const over = Audit.over(r);
      return `| ${r.screen} | ${BUDGET[r.kind]} | ${cells.join(' | ')} | ${over.length ? over.join('; ') : 'ok'} |`;
    });
    return [head, ...lines].join('\n');
  }
}

const welcome = (page: Page) => page.locator('[data-screen="welcome"]');
const obPage = (page: Page) => welcome(page).locator('[data-ob="page"]');
const intake = (page: Page) => page.locator('main[data-screen="intake"]');

/** A new phone-sized context like the mobile project's. */
async function phoneContext(
  browser: Browser,
  testInfo: TestInfo,
  fresh: 'web-existing' | 'native-fresh',
): Promise<BrowserContext> {
  const u = testInfo.project.use;
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    baseURL: u.baseURL ?? '',
    permissions: ['camera'],
  });
  if (fresh === 'web-existing') await freshDbDefaults(c);
  else await freshDbDefaults(c, { skipIntake: false, warmupsOff: true });
  return c;
}

/** The iPhone app look: Capacitor says native, with a GymHealth plugin (no data). */
async function fakeNativeHealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const plugin = {
      isAvailable: async () => ({ available: true }),
      requestRead: async () => ({ requested: true }),
      read: async () => ({}),
    };
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: { GymHealth: plugin },
    };
  });
}

/** Intake questions in order, with an answer to move on (first run: Next waits for a pick). */
const QUESTIONS: { id: string; pick: string | null }[] = [
  { id: 'goal', pick: 'fat' },
  { id: 'days', pick: '3' },
  { id: 'length', pick: '45' },
  { id: 'experience', pick: 'new' },
  { id: 'easyOn', pick: null },
  { id: 'wantsCore', pick: null },
];

test('readability audit: words, text sizes and line-height per screen at 390×844', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const audit = new Audit(testInfo);

  // --- 1. Fresh web install: the welcome pages, Units, the intake, a learn card, Set up Fuel ---
  await installMocks(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
  let sawUnits = false;
  for (let i = 0; i < 8 && !(await intake(page).isVisible()); i++) {
    await expect(welcome(page).or(intake(page))).toBeVisible();
    if (await intake(page).isVisible()) break;
    const key = (await obPage(page).getAttribute('data-step')) ?? `page-${i + 1}`;
    if (key === 'units') {
      sawUnits = true;
      // A real Units page offers both weight units (1.16.2 renders an empty placeholder page).
      const text = (await obPage(page).innerText()).toLowerCase();
      if (/\bkg\b/.test(text) && /\blb\b/.test(text))
        await audit.add(page, 'units', 'firstRun', '[data-screen="welcome"]');
      else audit.missing('units', 'firstRun', 'no kg / lb choice on the Units step');
    } else {
      await audit.add(page, key.replace(':', '-'), 'firstRun', '[data-screen="welcome"]');
    }
    await welcome(page).locator('[data-ob="primary"]').tap();
  }
  if (!sawUnits) audit.missing('units', 'firstRun', 'no Units step in the flow');

  await expect(intake(page)).toBeVisible();
  for (const q of QUESTIONS) {
    await expect(intake(page)).toHaveAttribute('data-step', q.id);
    await audit.add(page, `intake-${q.id}`, 'question', 'main[data-screen="intake"]');
    if (q.id === 'wantsCore') {
      const why = intake(page).locator('[data-learn-open]').first();
      await why.tap();
      await audit.add(page, 'learn-card', 'other', '[data-learn-sheet]');
      await page.locator('[data-learn-close]').first().tap();
      await expect(page.locator('[data-learn-sheet]')).toHaveCount(0);
    }
    if (q.pick) await intake(page).locator(`[data-option="${q.pick}"]`).tap();
    await intake(page).locator('[data-intake-next]').tap();
  }
  await expect(intake(page)).toHaveAttribute('data-step', 'summary');
  await audit.add(page, 'intake-summary', 'other', 'main[data-screen="intake"]');
  await intake(page).locator('[data-apply="fuel"]').tap();
  await expect(intake(page).locator('[data-apply="fuel"]')).toHaveAttribute('data-applied', 'true');
  await intake(page).locator('[data-intake-done]').tap();
  await audit.add(page, 'fuel-setup', 'other', 'main[data-screen="fuel-setup"]', true);

  // --- 2. Fresh install as the iPhone app: the Apple Health page ---
  const nativeCtx = await phoneContext(browser, testInfo, 'native-fresh');
  const nat = await nativeCtx.newPage();
  await fakeNativeHealth(nat);
  await installMocks(nat);
  await nat.clock.install({ time: NOW });
  await nat.goto('/');
  await expect(welcome(nat)).toBeVisible();
  let sawHealth = false;
  for (let i = 0; i < 14; i++) {
    await expect(welcome(nat).or(intake(nat))).toBeVisible();
    if (await intake(nat).isVisible()) {
      await intake(nat).locator('[data-intake-skip]').tap();
      continue;
    }
    const key = (await obPage(nat).getAttribute('data-step')) ?? '';
    if (key === 'permission:health') {
      await audit.add(nat, 'health', 'firstRun', '[data-screen="welcome"]');
      sawHealth = true;
      break;
    }
    const notNow = welcome(nat).locator('[data-ob="not-now"]');
    if (await notNow.isVisible()) await notNow.tap();
    else await welcome(nat).locator('[data-ob="primary"]').tap();
  }
  if (!sawHealth) audit.missing('health', 'firstRun', 'no Apple Health page in the flow');
  await nativeCtx.close();

  // --- 3. An existing install: What's New page 1, Settings (top), the How-to sheet ---
  const usedCtx = await phoneContext(browser, testInfo, 'web-existing');
  const used = await usedCtx.newPage();
  await openApp(used, NOW);
  await used.locator('[data-tab="settings"]').tap();
  await expect(used.locator('main[data-screen="settings"]')).toBeVisible();
  await audit.add(used, 'settings-top', 'other', 'main[data-screen="settings"]', true);
  const wnOpen = used.locator('[data-whats-new-open]');
  await wnOpen.scrollIntoViewIfNeeded();
  await wnOpen.tap();
  await audit.add(used, 'whats-new-1', 'other', '[data-tour="whats-new"]');
  await used
    .locator('[data-tour="whats-new"] [data-wn="skip"], [data-tour="whats-new"] [data-wn="done"]')
    .first()
    .tap();
  await expect(used.locator('[data-tour="whats-new"]')).toHaveCount(0);

  await used.locator('[data-tab="today"]').tap();
  await used
    .getByRole('button', { name: /Push A/ })
    .first()
    .tap();
  await used.getByRole('button', { name: 'Start workout' }).tap();
  await used.locator('[data-howto-open]').tap();
  await audit.add(used, 'howto-sheet', 'other', '[data-howto="sheet"]');
  await usedCtx.close();

  // --- The table, then every budget as a soft assertion ---
  const table = audit.table();
  console.log(`\nM13d readability (${TAG}), 390×844:\n${table}\n`);
  writeFileSync(testInfo.outputPath('m13d-readability.md'), `${table}\n`);
  await testInfo.attach('m13d-readability.md', { body: table, contentType: 'text/markdown' });
  for (const r of audit.rows) expect.soft(Audit.over(r), `${r.screen}`).toEqual([]);
});
