# FocusRep — CLAUDE.md

A phone-first web app that keeps me focused during strength training at my apartment gym.
It runs a guided workout, highlights the target muscles on an anatomy map, and (later) uses
the phone camera + on-device pose estimation to count reps and call out focus/form drift by voice.

Full requirements: `docs/SPEC.md`. Current state and next step: `docs/PROGRESS.md`.
**Read both at the start of every session before doing anything else.**

## How you (Claude Code) work on this repo

This project is built agentically. You own the implementation; I own product decisions and
the things only a human can do (filming test videos, testing at the gym).

1. **Work milestone by milestone** in the order in `docs/SPEC.md`. Don't start milestone N+1
   until N meets every acceptance criterion.
2. **Plan, then build.** For each milestone, write a short task plan into `docs/PROGRESS.md`,
   then implement task by task. Use subagents for independent tasks (e.g. SVG anatomy map
   vs. IndexedDB layer); keep shared files (types, routing) in the main session.
3. **Test-first for all logic** (rep counter, timers, state machines, data layer): write the
   failing Vitest test, then the code. UI gets Playwright tests for the main flows.
4. **Verify before claiming done.** Run `npm run check` (typecheck + lint + unit tests) and
   `npm run e2e`. Open the app with the Playwright/browser MCP, click through the flow, take a
   screenshot at phone size (390×844), and read the console for errors. Paste the evidence
   (test summary, screenshot path) into `docs/PROGRESS.md`.
5. **Commit small and often** on a feature branch per milestone (`m1-guided-flow`, …) with
   clear messages. Never push to `main` or force-push without asking me.
6. **Update `docs/PROGRESS.md`** at the end of every task: done, in progress, next, blockers,
   decisions made. A fresh session must be able to resume from it alone.
7. **Stop and ask me** only when: a milestone ends at a 🧍 HUMAN CHECKPOINT, a product decision
   isn't covered by the spec, a dependency needs a paid account/API key, or the same failure
   survives 3 different fix attempts (write up what you tried).
8. If a library API doesn't match your expectations, look up current docs (Context7 MCP or the
   official site) instead of guessing — MediaPipe's web API has changed several times.

## Stack

- Vite + TypeScript (strict), no UI framework for v1 (vanilla TS + small components). Add a
  framework only if a milestone clearly needs it — note the decision in PROGRESS.md.
- Pose: `@mediapipe/tasks-vision` Pose Landmarker (lite model), `runningMode: "VIDEO"`,
  run in a Web Worker if the main thread drops below ~24 fps.
- Exercise data: `yuhonas/free-exercise-db` (Unlicense) — vendor the subset we use into
  `src/data/exercises.json`; don't fetch at runtime.
- Storage: IndexedDB via Dexie. Voice: Web Speech API (`speechSynthesis`). Screen: Wake Lock API.
- Tests: Vitest (unit), Playwright (e2e, mobile viewport). PWA: `vite-plugin-pwa` (milestone 6).

## Commands

```
npm run dev        # dev server (HTTPS via @vitejs/plugin-basic-ssl so phone camera works on LAN)
npm run check      # tsc --noEmit + eslint + vitest run
npm run e2e        # playwright test
npm run build      # production build
npm run landmarks  # extract pose landmarks from fixtures/videos -> fixtures/landmarks (milestone 3)
```

Keep these script names stable; add them in milestone 0.

## Architecture rules

- **Pure logic is separate from the browser.** Rep counting, tempo, focus scoring, and
  workout state machines live in `src/core/` as pure functions/classes that take landmark
  frames or events and return results. No DOM, no MediaPipe imports in `src/core/`.
  This is what makes them testable from recorded landmark JSON.
- `src/pose/` wraps camera + MediaPipe and emits `LandmarkFrame` objects (see SPEC data model).
- `src/ui/` renders screens; `src/data/` holds exercise data, program JSON, and Dexie DB.
- Exercise-specific rules (which joint angle, thresholds) are data in
  `src/core/exercises/*.ts`, not `if (exercise === ...)` branches scattered around.

## Hard rules

- **Privacy:** all video and inference stays on the device. Never upload frames, never record
  video in the app, never add analytics. Other people use this gym.
- **Fixtures:** raw videos in `fixtures/videos/` are gitignored (they show me). Only the
  extracted landmark JSON in `fixtures/landmarks/` is committed.
- **Readable at 2 m:** main numbers ≥ 64px, body text ≥ 20px, high contrast, dark theme,
  tap targets ≥ 56px. I'm sweaty and holding dumbbells.
- **Voice over screen:** anything I must react to mid-set is spoken, not just shown.
- **Anatomy art is original:** draw our own SVG body map. Don't copy anatomy images from the web.
- **No medical claims.** Form cues are coaching hints ("go deeper", "slow the lowering"),
  never injury/diagnosis language.
