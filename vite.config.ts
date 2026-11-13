/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/gym-clean/"); "/" locally.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // HTTPS so getUserMedia works when the phone opens the dev server over the LAN.
  plugins: [basicSsl()],
  server: { host: true },
  // Pre-bundle lazily imported deps so the dev server never reloads the page mid-session
  // when it first sees them (this broke e2e runs once three.js became a dynamic import).
  optimizeDeps: { include: ['three', 'dexie'] },
  preview: { host: true },
  // three.js is a lazy chunk (~135 kB gzip) loaded only when a workout starts.
  build: { chunkSizeWarningLimit: 600 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
