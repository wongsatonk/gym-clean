// Turns the committed synthetic clip into an MJPEG file Chrome can use as a fake camera.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Outside test-results/, which Playwright empties at the start of every run (CI restores this file
// from its cache, so it must survive that).
export const FAKE_PERSON_VIDEO = 'node_modules/.cache/e2e-fake-camera/person.mjpeg';
const SOURCE = 'fixtures/synthetic/curl/synthetic-01__reps-3__partials-1.webm';

export default function globalSetup(): void {
  if (existsSync(FAKE_PERSON_VIDEO)) return;
  mkdirSync(dirname(FAKE_PERSON_VIDEO), { recursive: true });
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    SOURCE,
    '-vf',
    'scale=480:640',
    '-q:v',
    '5',
    '-r',
    '30',
    FAKE_PERSON_VIDEO,
  ]);
}
