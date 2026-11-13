// Renders the synthetic curl clip (tools/synthetic.ts) to fixtures/synthetic/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const reps = Number(process.argv[2] ?? 3);
const partials = Number(process.argv[3] ?? 1);
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local[0];
const browser = await chromium.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
await page.goto(new URL('tools/synthetic.html', base).href);
await page.waitForFunction(() => typeof window.__render === 'function');
const b64 = await page.evaluate((o) => window.__render(o), { reps, partials });
mkdirSync('fixtures/synthetic', { recursive: true });
const out = `fixtures/synthetic/curl/synthetic-01__reps-${reps}__partials-${partials}.webm`;
mkdirSync('fixtures/synthetic/curl', { recursive: true });
// MediaRecorder output has no duration/cues; remux (no re-encode) so it is seekable.
const raw = `${out}.raw.webm`;
writeFileSync(raw, Buffer.from(b64, 'base64'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c', 'copy', out]);
unlinkSync(raw);
console.log(`wrote ${out}`);
await browser.close();
await server.close();
