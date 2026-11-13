// Copies MediaPipe's wasm runtime from node_modules into public/ so the app self-hosts it
// (no CDN requests). Runs on `npm install` (postinstall). public/mediapipe/ is gitignored.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/mediapipe/wasm';
if (!existsSync(src)) {
  console.warn(`copy-mediapipe-wasm: ${src} not found, skipping`);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  cpSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log(`copy-mediapipe-wasm: copied to ${dest}`);
