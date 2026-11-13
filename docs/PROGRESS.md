# Gym Clean — Progress Log

Claude Code updates this file at the end of every task. A fresh session resumes from here.

## Status

- **Current milestone:** M1 — Guided workout flow: built and verified locally → 🧍 Checkpoint A
- **Branch:** main (m1-guided-flow merged locally, not pushed yet)
- **Remote:** https://github.com/wongsatonk/gym-clean (live: https://wongsatonk.github.io/gym-clean/)
- **Next step:** Push main → Pages deploys → Wongsaton runs a real session at the gym (Checkpoint A). Then apply the feedback and start M2.
- **Waiting on human:** yes. Approval to push, then the Checkpoint A gym test

## Milestone checklist

- [x] M0 Scaffold
- [x] M1 Guided workout flow → 🧍 Checkpoint A (gym test)
- [ ] M2 Anatomy map + focus cues
- [ ] M3 Pose pipeline → 🧍 Checkpoint B (record fixtures)
- [ ] M4 Rep counter
- [ ] M5 Focus & form cues → 🧍 Checkpoint C (gym test with camera)
- [ ] M6 Polish & install

## Current milestone plan

### M1 — Guided workout flow (no camera)
- [x] 1. Data: `src/data/program.json` (6-day PPL, A/B days, chest/arms/back weighted), `exercises.json` (vendored subset of free-exercise-db), `cues.json` (≤ 8 words each), plus `src/data/catalog.ts` loader + types. Unit test: every exercise in the program has data + a cue, ranges are valid.
- [x] 2. `src/core/session.ts`: pure reducer `next(state, event)`. Events: SET_DONE, ADJUST (reps/weight), START_SET, SKIP_EXERCISE, PAUSE, RESUME, FINISH. Selectors: current exercise, rest elapsed (pause-aware), summary (sets, volume, overruns, duration). Tests first, covering every transition, including pause/resume and skip.
- [x] 3. `src/core/restCues.ts`: pure "which cues were crossed between two elapsed times" (ten-seconds, go, nudge every 30 s after target + 30 s) plus spoken text. Tests first.
- [x] 4. `src/data/db.ts`: Dexie DB (`sessions`, `sets`), saveSet / setsForSession. Tests first, with fake-indexeddb.
- [x] 5. UI (`src/ui/`): Today → Exercise → Rest → Summary screens, steppers, Pause overlay, two-tap End. `voice.ts` (speechSynthesis, unlocked on first tap), `wakeLock.ts` (re-acquire on visibility change, release on Summary), 250 ms ticker driving rest cues.
- [x] 6. E2E: a mini-session on a fake clock (`page.clock`) with mocked speechSynthesis + wakeLock. Asserts the 10 s / Go / nudge cues, pause/resume, skip, summary numbers, and the IndexedDB rows.
- [x] 7. Verify (check, e2e, build, 390×844 screenshots of each screen, console), merge, push → 🧍 Checkpoint A

## Decisions

- 2026-11-13 — Vite 8, TS 6, Vitest 5, ESLint 10 (flat config + typescript-eslint strict), Playwright 1.65 — latest stable at scaffold time.
- 2026-11-13 — Two tsconfigs: `tsconfig.json` (src, DOM only, no Node types) and `tsconfig.node.json` (configs + e2e). Keeps Node globals out of app code.
- 2026-11-13 — ESLint `no-restricted-imports` on `src/core/**` blocks `@mediapipe/*`, `dexie`, `../ui`, `../pose`. Enforces the "pure core" architecture rule.
- 2026-11-13 — Pages base path comes from the `BASE_PATH` env var, which CI sets to `/<repo-name>/`. Locally it is `/`.
- 2026-11-13 — The Playwright e2e project uses chromium only (390×844, isMobile, hasTouch) and runs against the HTTPS dev server with `ignoreHTTPSErrors`.
- 2026-11-13 — The Playwright **MCP** browser rejects the self-signed dev cert (ERR_CERT_AUTHORITY_INVALID), so phone-size screenshots are taken with a Playwright script using `ignoreHTTPSErrors` instead.
- 2026-11-13 — The repo is public (Wongsaton's choice) so GitHub Pages works on the free plan. Raw videos stay gitignored. Landmark JSON (M3+) will be public.
- 2026-11-13 — App renamed FocusRep → **Gym Clean** (Wongsaton's request). The package is named `gym-clean` and the IndexedDB is named `gym-clean`.
- 2026-11-13 — M1 flow: Exercise → "Set done" → Rest → "Start set" → next set. Two taps per set. Rest keeps counting past 0 (shown as "+0:12" in amber) until you start the set, so the rest you actually took is measured.
- 2026-11-13 — A rest overrun is rest > target + 30 s. It is counted when you start the next set, and the nudge repeats every 30 s after that point.
- 2026-11-13 — Reps default to the top of the target range, and the weight to `startWeightKg`. Both carry over to the next set of the same exercise. Weight steps by 2.5 kg, and volume = reps × weight as entered (per-dumbbell weight for DB lifts).
- 2026-11-13 — Skip during a set jumps to the next exercise with no rest. Skip during rest skips the upcoming exercise and keeps the rest clock running. Pause freezes the rest clock and blocks every other action until Resume. End workout takes two taps within 3 s.
- 2026-11-13 — If several cues pile up while the tab is throttled, only the latest one is spoken. "Up next" on Today = the day after the last session in IndexedDB.
- 2026-11-13 — Loader is `src/data/catalog.ts`: a `program.ts` next to `program.json` made `./program` resolve to the JSON.
- 2026-11-13 — `exercises.json` vendors all 30 program exercises, including instructions and muscles (needed for M2). The program's starting weights are guesses, so edit `program.json`.
- 2026-11-13 — Prettier ignores `*.md` so hand-written docs keep their formatting.
- 2026-11-13 — `npm audit`: 10 moderate advisories, all in the dev-only ESLint toolchain (minimatch / config-array). Nothing ships to the browser. Left as-is; recheck when ESLint updates.

## Verification evidence

### M0 (2026-11-13)
- `npm run check`: typecheck OK (both projects), lint OK, Vitest **1 file / 2 tests passed**.
- `npm run e2e`: **1 passed** (`[mobile] smoke.spec.ts`: title visible, h1 ≥ 64px, no console errors).
- `npm run build`: OK (index.html 0.50 kB, JS 1.00 kB, CSS 0.85 kB). `BASE_PATH=/focusrep/` build emits `/focusrep/assets/...` URLs.
- Screenshot 390×844: `docs/screenshots/m0-home-390x844.png`. Console errors: none.
- CI run 43485291125 (push to main, 706ae53): `test` ✓ (check + e2e, 1 passed), `build` ✓, `deploy` ✗. The deploy failed with "Ensure GitHub Pages has been enabled" (404). Pages isn't turned on in the repo settings yet.
- Repo made public (Pages on the free plan needs it). The deploy re-run passed: run 43485291125 is all green (test ✓, build ✓, deploy ✓).
- Live: https://wongsatonk.github.io/gym-clean/ loads with title "FocusRep" and 0 console errors/warnings. Screenshot: `docs/screenshots/m0-pages-desktop.png`.
- CI warnings (not failures): actions v4 run on Node 20, which is deprecated. Bump action majors in a later milestone.

### M1 (2026-11-13)
- `npm run check`: typecheck + lint clean. Vitest **5 files / 39 tests passed**: session 20, restCues 8, catalog 5, format 4, db 2.
- `npm run e2e`: **2 passed**, and passed 5 more times with `--repeat-each=5` (10/10). The session test runs on a fake clock with speechSynthesis + wakeLock mocked. It asserts the 10 s / Go / nudge cues, pause freezing cues, reps/weight carry-over, skip, two-tap End, the summary (2 sets, 372 kg, 1 overrun), wake lock request → release, and the IndexedDB rows.
- `npm run build`: OK (JS 147 kB / 44 kB gzip, mostly Dexie + exercise data).
- Screenshots 390×844 in `docs/screenshots/`: `m1-today.png`, `m1-exercise.png`, `m1-rest.png`, `m1-rest-overtime.png`, `m1-paused.png`, `m1-summary.png`. No horizontal overflow (scrollWidth 390). Console errors/warnings: none.

## Blockers / questions for Wongsaton
- **Checkpoint A:** do one real session from https://wongsatonk.github.io/gym-clean/ and report what felt off, what annoyed you, and what you never used. Things worth checking: do the voice cues play with the screen on and the phone silent switch off? Does the screen stay awake? Are the starting weights in the program close?

