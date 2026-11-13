# FocusRep — Progress Log

Claude Code updates this file at the end of every task. A fresh session resumes from here.

## Status

- **Current milestone:** M1 — Guided workout flow (not started). M0 done 2026-11-13.
- **Branch:** main (m0-scaffold merged)
- **Remote:** https://github.com/wongsatonk/gym-clean (Pages URL will be https://wongsatonk.github.io/gym-clean/)
- **Next step:** Write the M1 task plan below, create branch `m1-guided-flow`, then implement.
- **Waiting on human:** no

## Milestone checklist

- [x] M0 Scaffold
- [ ] M1 Guided workout flow → 🧍 Checkpoint A (gym test)
- [ ] M2 Anatomy map + focus cues
- [ ] M3 Pose pipeline → 🧍 Checkpoint B (record fixtures)
- [ ] M4 Rep counter
- [ ] M5 Focus & form cues → 🧍 Checkpoint C (gym test with camera)
- [ ] M6 Polish & install

## Current milestone plan

### M0 — Scaffold

- [x] 1. Vite + TS strict app (`index.html`, `src/main.ts`) rendering a "FocusRep" title, dark theme
- [x] 2. ESLint (flat config, typescript-eslint) + Prettier
- [x] 3. Vitest with a trivial unit test (`src/core/`)
- [x] 4. Playwright with a mobile 390×844 project + trivial e2e test (title renders)
- [x] 5. Scripts: `dev`, `check`, `e2e`, `build`, `landmarks` (stub)
- [x] 6. HTTPS dev server on LAN (`@vitejs/plugin-basic-ssl`, `host: true`)
- [x] 7. GitHub Actions (written, **not yet run**: no remote): `check` + `e2e` on push; deploy `main` to GitHub Pages
- [x] 8. `.gitignore` covers `fixtures/videos/`
- [x] 9. Verify (check, e2e, build, 390×844 screenshot, console) and record evidence

## Decisions

- 2026-11-13 — Vite 8, TS 6, Vitest 5, ESLint 10 (flat config + typescript-eslint strict), Playwright 1.65 — latest stable at scaffold time.
- 2026-11-13 — Two tsconfigs: `tsconfig.json` (src, DOM only, no Node types) and `tsconfig.node.json` (configs + e2e). Keeps Node globals out of app code.
- 2026-11-13 — ESLint `no-restricted-imports` on `src/core/**` blocks `@mediapipe/*`, `dexie`, `../ui`, `../pose`. Enforces the "pure core" architecture rule.
- 2026-11-13 — Pages base path comes from the `BASE_PATH` env var, which CI sets to `/<repo-name>/`. Locally it is `/`.
- 2026-11-13 — The Playwright e2e project uses chromium only (390×844, isMobile, hasTouch) and runs against the HTTPS dev server with `ignoreHTTPSErrors`.
- 2026-11-13 — The Playwright **MCP** browser rejects the self-signed dev cert (ERR_CERT_AUTHORITY_INVALID), so phone-size screenshots are taken with a Playwright script using `ignoreHTTPSErrors` instead.
- 2026-11-13 — The repo is public (Wongsaton's choice) so GitHub Pages works on the free plan. Raw videos stay gitignored. Landmark JSON (M3+) will be public.
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

## Blockers / questions for Wongsaton

