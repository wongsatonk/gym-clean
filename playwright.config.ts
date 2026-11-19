import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { FAKE_PERSON_VIDEO } from './e2e/fake-camera.setup';

// E2E_PORT lets several checkouts/worktrees run e2e side by side. Unset, each run picks its own
// port from the runner's pid (5200–5999; PWA = +1000), so two runs at once never fight over 5174.
// It goes back into process.env so the worker processes (which load this config too) agree.
if (!process.env.E2E_PORT) process.env.E2E_PORT = String(5200 + (process.pid % 800));
const PORT = Number(process.env.E2E_PORT);
// M6 PWA: the service worker only exists in a production build, so pwa.spec.ts runs against
// `vite preview` of a build in its own out dir (dist/ stays untouched) on a second port.
const PWA_PORT = Number(process.env.E2E_PWA_PORT ?? PORT + 1000);
const PWA_OUT = 'node_modules/.cache/e2e-pwa-dist'; // ignored by git, eslint and prettier

// Specs that count reps on the wall clock: a fixture clip replayed in place of the pose model
// (CLIP_SPECS) or the real model on the fake camera's synthetic person (PERSON_SPECS). Starved
// of CPU by parallel workers they drop frames, miss the curl's turnarounds and read 0 reps. So
// they never run beside other tests: the parallel phase (mobile, pwa) runs first, then
// mobile-person-camera alone, then mobile-clips alone (project dependencies, one worker each).
// A failure in an earlier phase skips the later ones (the run is red either way). To run one of
// these specs on its own without the phases before it: `npx playwright test <file> --no-deps`.
const CLIP_SPECS = /(^|\/)(focus-cues|hands-free|hands-free-break|learning|coach-voice)\.spec\.ts/;
const PERSON_SPECS = /(^|\/)(camera-person|rep-count|devlog-camera|hands-free-live)\.spec\.ts/;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/fake-camera.setup.ts',
  fullyParallel: true,
  // CI runners have 2 cores and no GPU: software WebGL (3D demos) in parallel starves the live
  // camera tests. Run one at a time there; locally stay parallel.
  ...(process.env.CI ? { workers: 1 } : {}),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `https://localhost:${PORT}`,
    ignoreHTTPSErrors: true, // dev server uses a self-signed cert (plugin-basic-ssl)
    trace: 'retain-on-failure',
    // M13d: fresh installs preselect units from the region; specs run as a metric phone (Thailand,
    // like his and his wife's). e2e/units.spec.ts sets en-US / th-TH itself.
    locale: 'en-TH',
  },
  projects: [
    {
      // Fixture clips counted on the wall clock (CLIP_SPECS): last, alone, one test at a time.
      // CI already runs workers: 1 overall.
      name: 'mobile-clips',
      // One test at a time (workers: 1); fullyParallel only lets CI shard by test, not by file.
      workers: 1,
      fullyParallel: true,
      dependencies: ['mobile-person-camera'],
      testMatch: CLIP_SPECS,
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        permissions: ['camera'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
    {
      name: 'mobile',
      testIgnore: [CLIP_SPECS, PERSON_SPECS, /pwa\.spec\.ts/],
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        permissions: ['camera'],
        launchOptions: {
          // Fake camera (test pattern) and auto-accepted permission prompts.
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            ...(process.env.FAKE_VIDEO
              ? [`--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`]
              : []),
          ],
        },
      },
    },
    {
      // Same phone, but the fake camera plays the synthetic mannequin clip (a "person").
      name: 'mobile-person-camera',
      // Live pose inference is CPU-heavy: in parallel, pages drop to 3–6 fps and miss the curl
      // bottom (reps read as partials). Alone, one at a time, after the parallel phase: ~20 fps.
      workers: 1,
      fullyParallel: false,
      dependencies: ['mobile', 'pwa'],
      testMatch: PERSON_SPECS,
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${FAKE_PERSON_VIDEO}`,
          ],
        },
      } satisfies PlaywrightTestConfig['use'],
    },
    {
      // M6 offline/install: same phone, against the production build (service worker active).
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: {
        browserName: 'chromium',
        baseURL: `https://localhost:${PWA_PORT}`,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        permissions: ['camera'],
        launchOptions: {
          // Chromium refuses to register a service worker over a self-signed cert even with
          // ignoreHTTPSErrors (that only covers page requests); this covers the worker too.
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--ignore-certificate-errors',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `https://localhost:${PORT}`,
      // No file watching: an edit in this shared checkout mid-run would full-reload pages under test.
      env: { E2E_NO_WATCH: '1' },
      ignoreHTTPSErrors: true,
      // Never reuse: a server left on this port by another checkout would silently test its code.
      reuseExistingServer: false,
    },
    {
      command: `npx vite build --outDir ${PWA_OUT} --emptyOutDir --logLevel warn && npx vite preview --outDir ${PWA_OUT} --port ${PWA_PORT} --strictPort`,
      url: `https://localhost:${PWA_PORT}`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
