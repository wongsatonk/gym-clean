/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_TAGLINE } from './src/core/brand';

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

// M12 slice 1c: release = package.json version (the What's New tour key); build = short git sha.
function appRelease(): string {
  return (
    JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
      version: string;
    }
  ).version;
}

function appBuild(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// M9 native shell: `vite build --mode native` (npm run build:native) makes the bundle that
// Capacitor copies into the iOS app. It is served from capacitor://localhost/, so base is always
// "/" (BASE_PATH is ignored), and there is no service worker or web manifest: WKWebView doesn't run
// service workers for the capacitor:// scheme and the app is bundled (offline) anyway. The CSP meta
// in index.html is the same in both builds. Every other mode builds the web app exactly as before.
const NATIVE_MODE = 'native';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/gym-clean/"); "/" locally.
const webBase = process.env.BASE_PATH ?? '/';

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
    id: webBase,
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: webBase,
    scope: webBase,
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
    // M7: the USDA food list is imported as a `?url` asset (assets/usda-foods-*.json) so offline
    // search works; it's fetched on the first food search, not at startup.
    // M7 task 20: the zxing-wasm barcode reader wasm (~0.9 MB) is a `?url` asset loaded on the
    // first scan from our own origin (src/ui/fuel/barcodeDecoder.ts), never from a CDN.
    globPatterns: [
      '**/*.{js,css,html,woff2}',
      'assets/usda-foods-*.json',
      'assets/zxing_reader-*.wasm',
      'models/*.task',
      'mediapipe/wasm/*',
    ],
    maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // the wasm is 14.7 MB
    cleanupOutdatedCaches: true,
    navigateFallback: 'index.html',
    // M13: the static landing page (public/welcome/) is its own page, never the app shell.
    navigateFallbackDenylist: [/\/welcome\//],
  },
});

export default defineConfig(({ mode }) => ({
  base: mode === NATIVE_MODE ? '/' : webBase,
  // HTTPS so getUserMedia works when the phone opens the dev server over the LAN.
  plugins: mode === NATIVE_MODE ? [basicSsl()] : [basicSsl(), pwa],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_RELEASE__: JSON.stringify(appRelease()),
    __APP_BUILD__: JSON.stringify(appBuild()),
  },
  // E2E_NO_WATCH (playwright.config.ts): no watcher / HMR, so edits never reload pages under test.
  server: { host: true, ...(process.env.E2E_NO_WATCH ? { watch: null, hmr: false } : {}) },
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
}));
