/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/gym-clean/"); "/" locally.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // HTTPS so getUserMedia works when the phone opens the dev server over the LAN.
  plugins: [basicSsl()],
  server: { host: true },
  preview: { host: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
