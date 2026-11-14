// M6 PWA icons: renders the app's own logo glyph (ICON_PATHS.logo in src/ui/icons.ts, a dumbbell
// with a pulse line, drawn for this project) to PNG with headless Chromium. Original art only.
// Run: node scripts/icons.mjs  ->  public/icons/*.png (committed; rerun only if the logo changes).
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
const BG = '#0d0f12';
const ACCENT = '#ff7a1a';

// Read the logo path straight from the icon set so the PWA icon can't drift from the in-app logo.
const iconsTs = readFileSync(join(root, 'src', 'ui', 'icons.ts'), 'utf8');
const logo = /logo:\s*'([^']+)'/.exec(iconsTs)?.[1];
if (!logo) throw new Error('logo path not found in src/ui/icons.ts');

/**
 * @param {number} size output px
 * @param {'any' | 'full'} shape 'any' = rounded square on transparent corners (Android/desktop
 *   "any" icon); 'full' = full-bleed square (maskable, and iOS which rounds it itself).
 * @param {number} glyph glyph width as a share of the icon (maskable keeps it inside the 80% safe zone)
 */
function svg(size, shape, glyph) {
  const g = size * glyph; // glyph box, the 24-unit grid scaled up
  const s = g / 24;
  const off = (size - g) / 2;
  const bg =
    shape === 'any'
      ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>`
      : `<rect width="${size}" height="${size}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <g transform="translate(${off} ${off}) scale(${s})" fill="none" stroke="${ACCENT}"
     stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${logo}</g>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, shape: 'any', glyph: 0.66 },
  { file: 'icon-512.png', size: 512, shape: 'any', glyph: 0.66 },
  { file: 'icon-maskable-512.png', size: 512, shape: 'full', glyph: 0.56 },
  { file: 'apple-touch-icon.png', size: 180, shape: 'full', glyph: 0.62 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg(t.size, t.shape, t.glyph)}</body></html>`,
    );
    await page.screenshot({ path: join(outDir, t.file), omitBackground: true });
    await page.close();
    console.log(`public/icons/${t.file} (${t.size}x${t.size})`);
  }
} finally {
  await browser.close();
}
