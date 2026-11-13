// npm run synthetic [-- <folder>...] [--force]
// Renders the synthetic mannequin clips (tools/synthetic.ts) to
// fixtures/synthetic/<folder>/synthetic-0N__reps-<n>__partials-<m>.webm.
// Existing clips are kept unless --force: rendering is real-time and not byte-reproducible, and
// curl/synthetic-01 is the e2e fake-camera clip, which must stay byte-identical.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
// The e2e fake-camera clip. This guard only protects it while the file exists: if it is deleted,
// the next run renders a new (different) clip in its place. Restore it from git instead.
const PROTECTED = 'fixtures/synthetic/curl/synthetic-01__reps-3__partials-1.webm';

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  browser = await chromium.launch();
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  const url = new URL('tools/synthetic.html', base).href;
  const load = async () => {
    await page.goto(url);
    await page.waitForFunction(() => typeof window.__render === 'function');
  };
  await load();
  const all = await page.evaluate(() => window.__clips());
  const folders = [...new Set(all.map((c) => c.folder))];
  const unknown = only.filter((f) => !folders.includes(f));
  if (unknown.length) {
    console.warn(
      `synthetic: no clips for ${unknown.join(', ')}; valid folders: ${folders.join(', ')}`,
    );
  }
  const clips = all.filter((c) => only.length === 0 || only.includes(c.folder));

  for (const { folder, name } of clips) {
    const out = `fixtures/synthetic/${folder}/${name}.webm`;
    if (existsSync(out) && (!force || out === PROTECTED)) {
      console.log(`kept  ${out}`);
      continue;
    }
    await load(); // fresh page per clip
    const b64 = await page.evaluate((o) => window.__render(o), { folder, name });
    mkdirSync(`fixtures/synthetic/${folder}`, { recursive: true });
    // MediaRecorder output has no duration/cues; remux (no re-encode) so it is seekable.
    const raw = `${out}.raw.webm`;
    writeFileSync(raw, Buffer.from(b64, 'base64'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c', 'copy', out]);
    unlinkSync(raw);
    console.log(`wrote ${out} (${Math.round(statSync(out).size / 1024)} kB)`);
  }
} finally {
  await browser?.close();
  await server.close();
}
