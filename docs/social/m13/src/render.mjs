// Renders the M13 Story frames (frames.html) to 1080x1920 PNGs in docs/social/m13/, then a
// contact sheet with ffmpeg. Run from the repo root:  node docs/social/m13/src/render.mjs
// Nothing is posted or uploaded; output is local files only.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');
const names = ['1-hook', '2-coaches-every-set', '3-plan-and-food', '4-privacy', '5-built-it-myself'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'frames.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState('networkidle');
const files = [];
for (let i = 0; i < names.length; i++) {
  const file = path.join(out, `story-${names[i]}.png`);
  await page.locator(`#f${i + 1}`).screenshot({ path: file });
  files.push(file);
  console.log('wrote', file);
}
await browser.close();

// Contact sheet: 5 frames at 432x768 side by side with a 24px gap.
const inputs = files.flatMap((f) => ['-i', f]);
const scaled = files.map((_, i) => `[${i}:v]scale=432:768,pad=456:792:12:12:color=0x0d0f12[s${i}]`).join(';');
const stack = files.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${files.length}`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${scaled};${stack}`, '-frames:v', '1', path.join(out, 'contact-sheet.png')]);
console.log('wrote', path.join(out, 'contact-sheet.png'));
