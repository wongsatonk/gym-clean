/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Build identity for the developer log: git short sha (+ "-dirty") and build time.
function appVersion(): string {
  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
    if (execSync('git status --porcelain').toString().trim()) sha += '-dirty';
  } catch {
    /* not a git checkout */
  }
  return `${sha} ${new Date().toISOString()}`;
}

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/gym-clean/"); "/" locally.
const base = process.env.BASE_PATH ?? '/';

// M6 PWA. Build-only: the service worker is never registered by the dev server (devOptions off),
// so dev and the dev-server e2e run exactly as before. Offline after first load: everything is
// precached at install, including the pose model (5.8 MB) and the MediaPipe wasm (14.7 MB), so the
// camera works in airplane mode even if it was never opened online. Workbox revisions are content
// hashes, so an app update re-downloads only files that changed (the model/wasm rarely do).
// Updates never take over a running workout: no skipWaiting/clientsClaim; a new worker installs
// in the background and waits until every app window is closed, then serves the next launch.
const pwa = VitePWA({
  registerType: 'prompt', // = no skipWaiting; we show no prompt, the update lands on next launch
  injectRegister: 'script', // external /registerSW.js: no inline script, no app-code change
  devOptions: { enabled: false },
  manifest: {
    id: base,
    name: 'Gym Clean',
    short_name: 'Gym Clean',
    description: 'Phone-first workout focus app',
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#0d0f12',
    background_color: '#0d0f12',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: 'icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  includeAssets: ['icons/apple-touch-icon.png'],
  workbox: {
    // woff2 only: every target browser takes it, the .woff fallbacks would never be fetched.
    // The manifest, its icons and the apple-touch-icon are added by the plugin itself.
    globPatterns: ['**/*.{js,css,html,woff2}', 'models/*.task', 'mediapipe/wasm/*'],
    maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // the wasm is 14.7 MB
    cleanupOutdatedCaches: true,
    navigateFallback: 'index.html',
  },
});

export default defineConfig({
  base,
  // HTTPS so getUserMedia works when the phone opens the dev server over the LAN.
  plugins: [basicSsl(), pwa],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  server: { host: true },
  // Pre-bundle lazily imported deps so the dev server never reloads the page mid-session
  // when it first sees them (this broke e2e runs once three.js became a dynamic import).
  optimizeDeps: { include: ['three', 'dexie', '@mediapipe/tasks-vision'] },
  preview: { host: true },
  // three.js is a lazy chunk (~135 kB gzip) loaded only when a workout starts.
  build: { chunkSizeWarningLimit: 600 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
