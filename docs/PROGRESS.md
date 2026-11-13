# Gym Clean — Progress Log

Claude Code updates this file at the end of every task. A fresh session resumes from here.

## Status

- **Current milestone:** M2 — Anatomy map (3D + 2D) + focus cues: done locally. Next: M3 pose pipeline.
- **Branch:** main (m2-anatomy-cues merged locally, not pushed yet)
- **Remote:** https://github.com/wongsatonk/gym-clean (live: https://wongsatonk.github.io/gym-clean/)
- **Next step:** Push main (on approval), then M3: camera + MediaPipe pose pipeline + 3D live skeleton → 🧍 Checkpoint B (record fixtures).
- **Waiting on human:** no. Checkpoint A runs alongside: Wongsaton said to keep going and will send feedback during development.

## Milestone checklist

- [x] M0 Scaffold
- [x] M1 Guided workout flow
- [x] M1b Lists, notes, units → 🧍 Checkpoint A (gym test)
- [x] M2 Anatomy map (3D + 2D fallback) + focus cues
- [ ] M3 Pose pipeline → 🧍 Checkpoint B (record fixtures)
- [ ] M4 Rep counter
- [ ] M5 Focus & form cues → 🧍 Checkpoint C (gym test with camera)
- [ ] M6 Polish & install

## Current milestone plan

### M2 — Anatomy map + focus cues
- [x] 1. `src/ui/bodyMap.ts`: original stylized SVG body (front + back), built from half-body point lists, mirrored and smoothed (Catmull-Rom). One `<path data-muscle="…">` per muscle group for all 17 free-exercise-db muscles. `pickView(primary)` chooses front or back. Tests first: every muscle in the dataset maps to a path, the view choice, and highlight classes.
- [x] 2. `src/core/cues.ts`: `shouldSpeakFocusCue(prev, next)`, true on a new set start (session start, Start set, skip/jump into an exercise), never on resume. Tests first.
- [x] 1b. 2D map verified visually (front/back, primary/secondary). It is kept as the fallback.
- [x] 2b. `src/ui/body3d/parts.ts`: pure 3D layout data (body segments + muscle ellipsoids, both sides) and `facingAngle(primary)`. Tests first: every muscle has 3D parts, numbers are finite, front/back muscles sit on the right side of the body.
- [x] 3. UI: `body3d/viewer.ts` (Three.js, lazy-loaded, render on demand, drag to rotate, eased turn to face the muscles), inline beside the exercise header and larger on the rest screen. Tap → full-screen viewer with a legend. Fallback to 2D (no WebGL / reduced motion). Speak the focus cue at set start.
- [x] 4. E2E: cue spoken at set start (not on resume); map shows the right view + highlighted muscles for push / pull / legs exercises.
- [x] 5. Verify (check, e2e, build, screenshots of a push, a pull and a legs exercise), merge, push.

### M1b — Lists, notes, units
- [x] 1. `src/core/units.ts` (kg↔lb, step, snap, format). Tests first.
- [x] 2. Reducer: `unit` in state, ADJUST weight steps in the display unit, `lastWeightKg` defaults, GO_TO_EXERCISE, next-unfinished-exercise with wrap-around, resume at the logged set count. Tests first.
- [x] 3. DB v2: `exerciseNotes` (machine setting + note), `sessionNotes` (today's note), `settings` (unit), and a last-session-sets query. Tests first.
- [x] 4. UI: day preview screen, exercise list sheet (jump), Today/Last time lines, notes sheet (3 fields), settings screen (kg/lb), Summary shows units + today's notes.
- [x] 5. E2E: update the M1 flow for the preview; new test for list jump, notes persisting across sessions, last time, lb display.
- [x] 6. Verify (check, e2e, build, 390×844 screenshots, console), merge, push on approval.

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
- 2026-11-13 — Wongsaton's feedback (before the gym test): wants the day's exercise list, today's + last time's sets, notes (lasting per exercise + per workout + machine setting number), and a kg/lb setting with conversion. Last-week history comes later. Logged as M1b in the SPEC.
- 2026-11-13 — M1b: weights are stored in kg; lb is display only (5 lb steps, 2.5 kg steps). The weight default is last time's final weight, else the plan's weight snapped to the step. Program start weights were moved onto 2.5 kg steps (16→15, 14→15, 18→17.5, 22→22.5, 12→12.5, 6→5, 8→7.5).
- 2026-11-13 — M1b: after an exercise finishes, the workout continues with the next unfinished exercise and wraps around to ones that were jumped over. Skipped exercises are not revisited unless you jump to one (which un-skips it). Finished exercises and the current one can't be jumped to.
- 2026-11-13 — M1b: the machine setting and exercise note last per exercise (`exerciseNotes`). Today's note is per session+exercise (`sessionNotes`) and shows on the Summary. Notes are only edited in the Notes sheet, between sets. The unit lives in the `settings` table.
- 2026-11-13 — M2: the 3D body is built from our own primitives (capsules/ellipsoids, muscles as ellipsoids), so no downloaded model or art. One WebGL context for the whole app: the canvas moves between slots on re-render. It renders on demand only (eased turn, drag), and reduced motion snaps the turn. The 2D SVG map shows until 3D loads, and stays when WebGL is missing.
- 2026-11-13 — M2: SVG ids can't contain spaces, so muscle paths use `data-muscle="middle back"` plus `id="muscle-<view>-middle-back"`.
- 2026-11-13 — M2: the focus cue is spoken at every set start (session start, Start set, skip/jump into an exercise), never on resume or stepper edits. Per spec; can drop to "first set only" if it gets repetitive.
- 2026-11-13 — M2: e2e broke because Vite discovered `three` (a dynamic import) mid-test, re-optimized and reloaded the page. Fixed with `optimizeDeps.include: ['three', 'dexie']`.
- 2026-11-13 — M2: stepper values of 5+ characters (e.g. "102.5") drop to 54px so the ± buttons stay in place. That's an exception to the 64px main-number rule.
- 2026-11-13 — Wongsaton wants 3D graphics in all three places: (1) a 3D muscle body in M2, (2) a 3D exercise demo, added as M4b, (3) a 3D live skeleton, added to M3. SPEC §6 now excludes only photoreal/medical 3D. Calendar sync parked: "focus on the app features for now".
- 2026-11-13 — Wongsaton: "go ahead" past Checkpoint A, with gym feedback to come during development. Started M2.
- 2026-11-13 — Asked whether the app syncs with Google Calendar / Claude Cowork: it doesn't. All data stays on the phone (SPEC §6 excludes cloud sync). Offered a later "Add to calendar" (.ics) option or real Google sync (needs sign-in). Waiting for a decision. Not in scope yet.
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

### M1b (2026-11-13)
- `npm run check`: typecheck + lint clean. Vitest **7 files / 57 tests passed**: session 29 (+9: units, last-time defaults, jump, wrap-around, un-skip), units 4, db 6 (+4), catalog 7 (+2).
- `npm run e2e`: **3 passed**, and passed 5 more times with `--repeat-each=5` (15/15). The new `lists-notes-units.spec.ts` covers: switch to lb → preview shows 45 lb → 5 lb steps → notes saved → Today line → list jump while resting → summary in lb with today's note → next session shows last time, machine setting, 50 lb default and a fresh today's note → unit persists after reload.
- `npm run build`: OK (JS 154 kB / 46 kB gzip).
- Screenshots 390×844: `docs/screenshots/m1b-{today,settings,preview,exercise,rest,list,notes,summary}.png`. All scrollWidth 390. Console errors/warnings: none.

### M2 (2026-11-13)
- `npm run check`: typecheck + lint clean. Vitest **9 files / 72 tests passed**. New: bodyMap 6 (every dataset muscle → SVG path, unique ids, view choice, highlight classes, aria label), body3d/parts 5 (3D coverage, symmetry, finite sizes, front/back placement, facing angle), focusCue 4.
- `npm run e2e`: **7 passed**, and passed 5 more times with `--repeat-each=5` (35/35). New `anatomy.spec.ts`: for a push, a pull and a legs exercise (Bench Press → chest/front, One-Arm Row → middle back/back, Goblet Squat → quadriceps/front) it checks the 2D view + highlight, the 3D body loads with the right muscles and turns the right way, tap opens the full-screen viewer, and drag rotates (> 0.5 rad). A 2D fallback test runs with WebGL disabled. The session test now asserts the focus cue at set start and silence on resume.
- `npm run build`: main JS 162 kB / 50 kB gzip, lazy `viewer` chunk 538 kB / 134 kB gzip (three.js).
- Screenshots 390×844: `docs/screenshots/m2-exercise-{push,pull,legs}.png`, `m2-rest.png`, `m2-viewer.png`. scrollWidth 390. Console errors: none.

## Blockers / questions for Wongsaton
- **Checkpoint A:** do one real session from https://wongsatonk.github.io/gym-clean/ and report what felt off, what annoyed you, and what you never used. Things worth checking: do the voice cues play with the screen on and the phone silent switch off? Does the screen stay awake? Are the starting weights in the program close?

