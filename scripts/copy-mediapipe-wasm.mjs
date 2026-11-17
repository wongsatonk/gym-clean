// Copies MediaPipe's wasm runtime from node_modules into public/ so the app self-hosts it
// (no CDN requests). Runs on `npm install` (postinstall). public/mediapipe/ is gitignored.
//
// `--strict` (for build steps): fail instead of skipping when the runtime can't be copied, so a
// build from a checkout where postinstall never ran (e.g. a fresh git worktree) can't ship an app
// without the pose runtime ("Pose model failed to load", the camera's only symptom).
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const strict = process.argv.includes('--strict');
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/mediapipe/wasm';
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
if (!files.every((f) => existsSync(`${src}/${f}`))) {
  const msg = `copy-mediapipe-wasm: ${src} not found`;
  if (strict) {
    console.error(`${msg} (run npm install first)`);
    process.exit(1);
  }
  console.warn(`${msg}, skipping`);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of files) {
  cpSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log(`copy-mediapipe-wasm: copied to ${dest}`);
