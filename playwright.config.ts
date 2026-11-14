import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { FAKE_PERSON_VIDEO } from './e2e/fake-camera.setup';

// E2E_PORT lets several checkouts/worktrees run e2e side by side.
const PORT = Number(process.env.E2E_PORT ?? 5174);
// M6 PWA: the service worker only exists in a production build, so pwa.spec.ts runs against
// `vite preview` of a build in its own out dir (dist/ stays untouched) on a second port.
const PWA_PORT = Number(process.env.E2E_PWA_PORT ?? PORT + 1000);
const PWA_OUT = 'node_modules/.cache/e2e-pwa-dist'; // ignored by git, eslint and prettier

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
  },
  projects: [
    {
      // M5 focus cues replay a fixture clip on the wall clock over several sets: under parallel
      // load the page drops frames and misses rep turnarounds. One test at a time, like the
      // live-camera project (CI already runs workers: 1).
      name: 'mobile-clips',
      workers: 1,
      testMatch: /(focus-cues|hands-free-break)\.spec\.ts/,
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
      testIgnore:
        /(camera-person|rep-count|devlog-camera|hands-free-live|focus-cues|hands-free-break|pwa)\.spec\.ts/,
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
      // bottom (reps read as partials). One at a time they run at ~20 fps.
      workers: 1,
      testMatch: /(camera-person|rep-count|devlog-camera|hands-free-live)\.spec\.ts/,
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
