// Screenshots the six mix screens (390x844) and the comparison sheet. Run after build.mjs.
// node docs/design/m4e-mix/_src/shoot.mjs
// Flags: page overflow, elements past the screen edge, text under 16px, tap targets under 56px,
// any request that isn't file:/data:.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..');
const SCREENS = ['today', 'exercise', 'rest', 'summary', 'camera', 'settings'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 2600, height: 1000 } });
const page = await ctx.newPage();
let external = 0;
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
page.on('request', (r) => {
  if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) { external++; console.log('EXTERNAL REQUEST', r.url()); }
});
await page.goto(pathToFileURL(join(OUT, 'mix.html')).href);
await page.evaluate(() => document.fonts.ready);
let total = 0;
for (const s of SCREENS) {
  const el = page.locator(`#${s}`);
  const issues = await el.evaluate((root) => {
    const r = root.getBoundingClientRect();
    const out = [];
    if (root.scrollWidth > 390) out.push(`scrollWidth ${root.scrollWidth}`);
    for (const c of root.querySelectorAll('*')) {
      const b = c.getBoundingClientRect();
      // .days scrolls sideways on purpose; .scroll is the Settings scroll body; .hero-rings is decoration clipped by the hero
      if (b.width === 0) continue;
      if (!c.closest('.days') && !c.closest('.scroll') && !c.closest('.hero-rings') && (b.bottom > r.bottom + 0.5 || b.right > r.right + 0.5)) out.push(`${c.className?.baseVal ?? c.className} overflows (${Math.round(b.bottom - r.bottom)}px down, ${Math.round(b.right - r.right)}px right)`);
      const fs = parseFloat(getComputedStyle(c).fontSize);
      if ([...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && fs < 16 && !c.closest('.placeholder-tag'))
        out.push(`small text ${fs}px: "${c.textContent.trim().slice(0, 20)}"`);
    }
    for (const b of root.querySelectorAll('button, .tab')) {
      const bb = b.getBoundingClientRect();
      if (bb.bottom > r.bottom) continue; // below the fold of a scroll body
      if (bb.height < 56 || bb.width < 56) out.push(`tap ${Math.round(bb.width)}x${Math.round(bb.height)} "${b.textContent.trim()}"`);
    }
    return [...new Set(out)];
  });
  if (issues.length) { total += issues.length; console.log(s, issues); }
  await el.screenshot({ path: join(OUT, `${s}.png`) });
}
const sctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 2704, height: 1000 } });
const sp = await sctx.newPage();
sp.on('request', (r) => {
  if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) { external++; console.log('EXTERNAL REQUEST', r.url()); }
});
await sp.goto(pathToFileURL(join(SRC, 'mix-sheet.html')).href);
await sp.evaluate(() => document.fonts.ready);
await sp.screenshot({ path: join(OUT, 'mix-sheet.png'), fullPage: true });
await browser.close();
console.log(`done: ${total} layout issues, ${external} external requests`);
