// npm run landmarks [-- <dir>] [--force]  (default dir: fixtures/videos)
// Extracts pose landmarks from every video under <dir> into
// fixtures/landmarks/<path relative to fixtures/videos or fixtures/synthetic>.json, so
// `npm run landmarks -- fixtures/videos/curl` writes fixtures/landmarks/curl/<clip>.json.
// Clips whose JSON already exists are skipped unless --force.
// Raw videos never leave this machine; only the landmark JSON is committed (CLAUDE.md).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const root = process.cwd();
const args = process.argv.slice(2);
const force = args.includes('--force');
const inputDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'fixtures/videos');
const outDir = resolve('fixtures/landmarks');
const SOURCE_ROOTS = ['fixtures/videos', 'fixtures/synthetic'].map((d) => resolve(d));

/** Path of `file` relative to the fixtures/videos or fixtures/synthetic folder that holds it. */
function fixturePath(file) {
  const base = SOURCE_ROOTS.find((r) => file.startsWith(r + '/')) ?? inputDir;
  return relative(base, file);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : VIDEO_EXT.has(extname(p).toLowerCase()) ? [p] : [];
  });
}

const videos = walk(inputDir);
if (videos.length === 0) {
  console.log(`landmarks: no videos found under ${relative(root, inputDir) || '.'}`);
  process.exit(0);
}

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('vite did not report a URL');

// Google Chrome decodes H.264/HEVC (iPhone clips); Playwright's Chromium does not.
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch {
  browser = await chromium.launch();
}
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
await page.goto(new URL('tools/landmarks.html', base).href);
await page.waitForFunction(() => typeof window.__extract === 'function');

const tmp = mkdtempSync(join(tmpdir(), 'landmarks-'));
const toUrl = (abs) => '/' + relative(root, abs).split('/').map(encodeURIComponent).join('/');

let failures = 0;
for (const file of videos) {
  const rel = fixturePath(file);
  const out = join(outDir, rel.replace(/\.[^.]+$/, '.json'));
  if (!force && existsSync(out)) {
    console.log(`${rel} … kept existing ${relative(root, out)} (--force to redo)`);
    continue;
  }
  process.stdout.write(`${rel} … `);
  let result = await page.evaluate((u) => window.__extract(u), toUrl(file));
  if (result.error) {
    // Fall back to a VP9 transcode the browser can always decode.
    const webm = join(tmp, rel.replace(/[/\\]/g, '_') + '.webm');
    try {
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        file,
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        '32',
        '-an',
        webm,
      ]);
      const served = join(root, 'node_modules/.landmarks-tmp', 'clip.webm');
      mkdirSync(dirname(served), { recursive: true });
      execFileSync('cp', [webm, served]);
      result = await page.evaluate((u) => window.__extract(u), toUrl(served));
    } catch (err) {
      result = {
        frames: [],
        total: 0,
        error: `${result.error}; ffmpeg fallback failed: ${err.message}`,
      };
    }
  }
  if (result.error) {
    failures++;
    console.log(`FAILED: ${result.error}`);
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result.frames));
  console.log(
    `${result.frames.length}/${result.total} frames with a pose → ${relative(root, out)}`,
  );
}

await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
