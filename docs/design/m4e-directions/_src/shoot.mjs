// Screenshots each mockup screen (390x844) and each comparison sheet. Run after build.mjs.
// node docs/design/m4e-directions/_src/shoot.mjs
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..');
const DIRS = ['energy', 'pro', 'track'];
const SCREENS = ['today', 'exercise', 'rest', 'summary'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1800, height: 1000 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
page.on('request', (r) => !r.url().startsWith('file:') && !r.url().startsWith('data:') && console.log('EXTERNAL REQUEST', r.url()));
for (const d of DIRS) {
  await page.goto(pathToFileURL(join(OUT, `${d}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  for (const s of SCREENS) {
    const el = page.locator(`#${s}`);
    const issues = await el.evaluate((root) => {
      const r = root.getBoundingClientRect();
      const out = [];
      if (root.scrollWidth > 390) out.push(`scrollWidth ${root.scrollWidth}`);
      for (const c of root.querySelectorAll('*')) {
        const b = c.getBoundingClientRect();
        if (b.width === 0 || c.closest('.days')) continue;
        if (b.bottom > r.bottom + 0.5 || b.right > r.right + 0.5) out.push(`${c.className?.baseVal ?? c.className} overflows (${Math.round(b.bottom - r.bottom)}px down, ${Math.round(b.right - r.right)}px right)`);
        const fs = parseFloat(getComputedStyle(c).fontSize);
        if (c.childNodes.length && [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && fs < 16 && !c.closest('.placeholder-tag'))
          out.push(`small text ${fs}px: "${c.textContent.trim().slice(0, 20)}"`);
      }
      for (const b of root.querySelectorAll('button, .tab')) {
        const bb = b.getBoundingClientRect();
        if (bb.height < 56 || bb.width < 56) out.push(`tap ${Math.round(bb.width)}x${Math.round(bb.height)} "${b.textContent.trim()}"`);
      }
      return [...new Set(out)];
    });
    if (issues.length) console.log(d, s, issues);
    await el.screenshot({ path: join(OUT, `${d}-${s}.png`) });
  }
}
const sctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1824, height: 1000 } });
const sp = await sctx.newPage();
for (const d of DIRS) {
  await sp.goto(pathToFileURL(join(SRC, `${d}-sheet.html`)).href);
  await sp.evaluate(() => document.fonts.ready);
  await sp.screenshot({ path: join(OUT, `${d}-sheet.png`), fullPage: true });
}
await browser.close();
console.log('done');
