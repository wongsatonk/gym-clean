/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
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
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // HTTPS so getUserMedia works when the phone opens the dev server over the LAN.
  plugins: [basicSsl()],
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
