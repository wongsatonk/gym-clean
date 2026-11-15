# Cloud session briefs (prepared 2026-11-15 for Wongsaton's ~10 h flight)

Started by the main session when Wongsaton says "run on Cloud" (~04:30). Each session starts from
`main` **after the M7 deploy** (so it has Fuel), works on its own branch, and **never pushes to
`main`**. It ends with a pushed branch + a PR for review, and a PROGRESS.md entry. Nothing here needs
a paid account, an API key, the gym, or Wongsaton's photos/videos.

Read CLAUDE.md, docs/SPEC.md and docs/PROGRESS.md first (as every session does).

## Session 1: M7b food photo recognition, local part (branch `m7b-food-vision`)

- **Goal:** everything in SPEC M7b steps 1–3 and 5 that can be built without Wongsaton's own photos.
  Step 4 (Claude backup) is **out**: it needs a paid key and his open decision (proxy vs own key).
- **Plan first** with `planner`: a numbered M7b plan in PROGRESS ("Current milestone plan"), with the
  open questions written as M7b-q* with defaults (as M7 did).
- **ml-engineer, `ml/**`:** a reproducible Python pipeline: dataset download script → fine-tune a
  small image classifier → evaluate (top-1 / top-3, confusion per dish) → export a MediaPipe Image
  Classifier `.tflite` with metadata.
  - Use only a **public dataset whose licence allows it** (check and record the licence in a
    Decision; if none fits, build the pipeline and stop before training, and say so).
  - Classes must map 1:1 onto M7 Thai dish ids (`src/data/nutrition/thaiDishes.json`); write the
    mapping file and a test that every class has a dish.
  - Don't commit datasets or large binaries; commit the model only if it is ≤ 25 MB and the licence
    allows redistribution.
- **ml-engineer, `src/food-vision/**`:** classifier wrapper (lazy-loaded, model + wasm precached
  same-origin, nothing leaves the phone), the ≥ 0.6 confidence / top-3 logic as pure tested code.
- **ui-engineer:** photo capture (`<input type="file" accept="image/*" capture="environment">`),
  resize to ≤ 512 px on the phone, the top-3 confirm sheet (S/R/L, search if none fits), logging with
  `source: 'photo-local'`, `estimate: true`. "Save photos to improve recognition" stays **off** and
  only stores on the phone. Photos are not kept after logging.
- **Done:** `npm run check` + `npm run e2e` green, reviewer PASS, verifier evidence in PROGRESS,
  screenshots at 390×844. 🧍 **Checkpoint D** (his meal photos, a week of use) stays open.

## Session 2: Camera e2e reliability (branch `e2e-camera-stability`)

- **Goal:** the camera/live e2e specs pass reliably on a busy machine. On 2026-11-15 these failed in a
  full parallel run and passed alone: `camera-person` (overlay drew 0 pixels; once more alone, then 3/3),
  `hands-free:604`, `focus-cues:444`, `hands-free-live:90`. CI already skips live rep count on
  GPU-less runners (PROGRESS).
- **Owner:** pose-engineer (`e2e/camera.spec.ts`, fixtures) + ui-engineer for the other specs.
- **Rules:** fix the test's waiting, not the app's thresholds (no exercise threshold changes). If a
  failure shows a real app bug, write it up and fix it test-first.
- **Done:** each of those specs green with `--repeat-each=5` while the full `npm run e2e` runs
  alongside; reviewer PASS.

## Not for the cloud (needs Wongsaton)

Gym checkpoints B3, E, F1 (then M4f wave 2), Checkpoint D photos, M9 native shell (Xcode on his Mac),
M10 phase C and the M7b Claude backup (paid key), and the open A-q / B-q / M-q product questions.
