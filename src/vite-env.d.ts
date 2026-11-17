/// <reference types="vite/client" />

/** Git short sha (+ "-dirty") and ISO build time, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

/** package.json version (M12 slice 1c; the What's New tour key). */
declare const __APP_RELEASE__: string;
/** Short git sha, or "unknown" outside git. */
declare const __APP_BUILD__: string;
