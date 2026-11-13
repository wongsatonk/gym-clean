import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { FAKE_PERSON_VIDEO } from './e2e/fake-camera.setup';

// E2E_PORT lets several checkouts/worktrees run e2e side by side.
const PORT = Number(process.env.E2E_PORT ?? 5174);

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/fake-camera.setup.ts',
  fullyParallel: true,
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
      name: 'mobile',
      testIgnore: /(camera-person|rep-count)\.spec\.ts/,
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
      testMatch: /(camera-person|rep-count)\.spec\.ts/,
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
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `https://localhost:${PORT}`,
    ignoreHTTPSErrors: true,
    // Never reuse: a server left on this port by another checkout would silently test its code.
    reuseExistingServer: false,
  },
});
