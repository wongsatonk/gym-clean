// M6 PWA icons: renders the app's own logo glyph (ICON_PATHS.logo in src/ui/icons.ts, a dumbbell
// with a pulse line, drawn for this project) to PNG with headless Chromium. Original art only.
// Run: node scripts/icons.mjs  ->  public/icons/*.png + favicon.svg (committed; rerun only if the
// logo changes).
// M13: `node scripts/icons.mjs --splash <dir>` also renders the iOS launch image (the mark centred on
// the app background) as splash@1x/@2x/@3x.png (455/910/1365 px) into <dir>. Keep them this small:
// iOS refuses a launch image that decodes past ~25 MB (a 2732 px RGBA square is ~30 MB) and shows
// black instead.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

/** iOS launch image: 455 pt square, the mark small and centred (aspect-fit ≈ 70 pt wide on a phone). */
const SPLASH = { pt: 455, glyph: 0.18 };
const SPLASH_FILES = [
  { file: 'splash@1x.png', scale: 1 },
  { file: 'splash@2x.png', scale: 2 },
  { file: 'splash@3x.png', scale: 3 },
];

const targets = [
  { file: 'favicon-32.png', size: 32, shape: 'any', glyph: 0.74 },
  { file: 'icon-192.png', size: 192, shape: 'any', glyph: 0.66 },
  { file: 'icon-512.png', size: 512, shape: 'any', glyph: 0.66 },
  { file: 'icon-maskable-512.png', size: 512, shape: 'full', glyph: 0.56 },
  { file: 'apple-touch-icon.png', size: 180, shape: 'full', glyph: 0.62 },
];

const splashArg = process.argv.indexOf('--splash');
const splashDir = splashArg >= 0 ? process.argv[splashArg + 1] : undefined;
if (splashArg >= 0 && !splashDir) throw new Error('--splash needs a directory');

mkdirSync(outDir, { recursive: true });
// The favicon is the same "any" icon as SVG (crisp in tabs; the 32 px PNG is the fallback).
writeFileSync(join(outDir, 'favicon.svg'), svg(64, 'any', 0.74) + '\n');
console.log('public/icons/favicon.svg');
const browser = await chromium.launch();
try {
  if (splashDir) {
    mkdirSync(splashDir, { recursive: true });
    for (const { file, scale } of SPLASH_FILES) {
      const size = SPLASH.pt * scale;
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<html><body style="margin:0">${svg(size, 'full', SPLASH.glyph)}</body></html>`,
      );
      await page.screenshot({ path: join(splashDir, file) });
      await page.close();
      console.log(`${splashDir}/${file} (${size}x${size})`);
    }
  }
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
