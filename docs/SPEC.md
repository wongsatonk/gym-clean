# FocusRep — Product Spec (v1)

## 1. Problem

I lose focus during workouts. It shows up in three ways, and v1 targets all three, in this order:

| Focus problem | What it looks like | v1 answer |
|---|---|---|
| **Between sets** | Rest stretches out, I drift to my phone, forget which set I'm on | Guided flow, auto rest timer with spoken count-in, rest-overrun nudge (M1) |
| **Mind wandering mid-set** | Reps on autopilot, no mind-muscle connection | Target muscles lit on an anatomy map + spoken focus cue at set start (M2) |
| **Form fading as I tire** | Shorter range, faster lowering, partial reps at the end of a set | Camera pose tracking: rep counting, tempo and range-of-motion cues by voice (M3–M5) |

**User:** me. One person, one phone propped on a stand, apartment gym (dumbbells, bench,
some machines/cables). Training split: 6 days/week push/pull/legs. Priority muscles: chest,
arms, back. Goal: build muscle and gain weight.

**Success for v1:** I can run a full session from my phone without touching it mid-set, the
app counts my reps on the supported exercises accurately, and it tells me (by voice) when my
reps start slipping or my rest runs long.

## 2. Milestones

Each milestone ends with: all acceptance criteria met, `npm run check` + `npm run e2e` green,
phone-size screenshot reviewed, PROGRESS.md updated, branch committed.
🧍 = human checkpoint — stop and wait for me.

### M0 — Scaffold
- Vite + TS strict, ESLint + Prettier, Vitest, Playwright (mobile viewport 390×844 project).
- Scripts from CLAUDE.md (`dev`, `check`, `e2e`, `build`; `landmarks` stub).
- HTTPS dev server reachable from phone on LAN (`@vitejs/plugin-basic-ssl`, `host: true`).
- GitHub Actions: run `check` + `e2e` on push; deploy `main` to GitHub Pages.
- `.gitignore` includes `fixtures/videos/`.
- **Accept:** blank app with a "FocusRep" title renders; CI green; a trivial unit + e2e test pass.

### M1 — Guided workout flow (no camera)
- Program loaded from `src/data/program.json` (see §4). Seed it with a push/pull/legs
  week prioritising chest, arms and back; I'll edit the exercises later.
- Screens: **Today** (pick day) → **Exercise** (name, set X of Y, target reps, weight, focus cue)
  → **Rest** (big countdown) → next set/exercise → **Summary**.
- Big "Set done" button; reps/weight editable with +/- steppers (no keyboard needed).
- Rest timer starts automatically; voice at 10 s left ("Ten seconds. Next: incline press, set 2")
  and at 0 ("Go"). If rest exceeds target + 30 s: spoken nudge, repeated every 30 s.
- Wake Lock held during a session; released on Summary.
- Every set logged to IndexedDB (Dexie): exercise, set #, reps, weight, rest taken, timestamps.
- Summary: sets done, total volume, rest overruns count.
- Workout state is a pure state machine in `src/core/session.ts`, fully unit-tested
  (including pause/resume and skipping an exercise).
- **Accept:** e2e test runs a full mini-session with fake timers; state machine tests cover
  all transitions; voice calls are verified via a mocked `speechSynthesis`.
- 🧍 **Checkpoint A:** I run one real session at the gym from the deployed URL and report back.

### M2 — Anatomy map + focus cues
- Original SVG body map, front and back views, each muscle group its own `<path>` with an id
  matching free-exercise-db muscle names (e.g. `chest`, `lats`, `middle back`, `biceps`,
  `triceps`, `shoulders`, `quadriceps`…; take the full list from the dataset schema).
- On the Exercise screen: primary muscles strongly highlighted, secondary muscles lightly.
  Auto-pick front/back view based on where the primary muscle is.
- Each exercise has a short focus cue (≤ 8 words) in `src/data/cues.json`, e.g.
  "Squeeze your chest, slow on the way down." Spoken at set start.
- Vendor the needed exercises from free-exercise-db into `src/data/exercises.json`
  (include instructions + muscles; images optional).
- **Accept:** every exercise in program.json has data + cue; unit test asserts every muscle
  name in the data maps to an SVG path id; screenshot of map for a push, pull and legs exercise.

### M3 — Pose pipeline
- Camera screen with getUserMedia (rear or front camera selectable), skeleton overlay on canvas.
- `src/pose/` wraps MediaPipe Pose Landmarker (lite model, GPU delegate with CPU fallback),
  emits `LandmarkFrame` (see §4). Show fps; move inference to a Web Worker if < 24 fps on phone.
- Landmark extraction tool: `npm run landmarks` uses Playwright to open a dev-only page that runs
  the landmarker over each video in `fixtures/videos/**` (`runningMode: "VIDEO"`) and writes
  `fixtures/landmarks/<same-name>.json` (array of LandmarkFrame).
- **Accept:** pipeline runs in the browser at phone size; extraction tool works on a sample
  public-domain/synthetic clip or on my fixtures once provided.
- 🧍 **Checkpoint B:** stop and ask me to record fixture videos (guide in §5).

### M4 — Rep counter
- `src/core/repCounter.ts`: angle-based state machine per exercise (see §3), with smoothing
  (EMA), hysteresis, minimum phase duration, and a visibility gate.
- Supported v1 exercises and the joint angle each uses — thresholds are starting values,
  tune them against fixtures:

| Exercise | View | Angle (landmarks) | "Extended" | "Contracted" |
|---|---|---|---|---|
| Dumbbell curl | side | elbow (shoulder–elbow–wrist) | > 150° | < 55° |
| Push-up | side | elbow | > 155° | < 95° |
| Seated DB shoulder press | front | elbow + wrist above shoulder | > 155° | < 95° |
| One-arm DB row | side | elbow | > 150° | < 90° |
| Goblet squat | side | knee (hip–knee–ankle) | > 160° | < 100° |
| Lateral raise | front | shoulder (hip–shoulder–elbow) | < 25° | > 75° |

  Lying exercises (bench press, flyes) are **experimental**: implement only if fixtures show
  the landmarks are stable; otherwise keep them manual-count.
- Live: big rep number, spoken count ("one… two…") optional toggle; auto-fill reps into the set log.
- **Accept:** on every committed landmark fixture, counted reps == the count in the filename,
  partial reps detected == the partial count. A fixture test suite runs in `npm run check`.

### M5 — Focus & form cues
- `src/core/focus.ts` consumes rep events and produces cues. Baseline = first 2 reps of the set.

| Signal | Rule (starting values) | Spoken cue |
|---|---|---|
| Rushed lowering | eccentric time < 50% of baseline, 2 reps in a row | "Slow the lowering." |
| Shrinking range | range of motion < 85% of baseline, 2 reps in a row | "Full range." |
| Partial rep | turnaround before reaching contracted threshold | "Partial — finish the rep." |
| Stalled mid-set | no phase change for 8 s, reps < target | "Stay with it. N to go." |
| Out of frame | visibility < 0.5 for 2 s | "Step back into frame." |

- Rate limit: max one cue per 6 s; never speak over the rep count.
- Per-set **focus score** (0–100) = simple, explainable: start 100, subtract per cue fired;
  show which cues fired on the Summary screen. Store it with the set.
- **Accept:** unit tests for every rule using fixture landmark JSON + synthetic sequences.
- 🧍 **Checkpoint C:** I do a full camera session at the gym and report.

### M6 — Polish & install
- PWA (installable, offline after first load, model + wasm cached).
- History screen: last 4 weeks per exercise (weight × reps, focus score trend).
- Lighthouse pass on accessibility; respect `prefers-reduced-motion`.
- **Accept:** installs on my phone home screen and works in airplane mode after first load.

## 3. Rep counter design

States: `TOP → DOWN → BOTTOM → UP → TOP` (named by angle direction per exercise).
- Smooth the joint angle with an EMA (α ≈ 0.4) before thresholds.
- Hysteresis: enter BOTTOM only below the contracted threshold, leave only above
  threshold + 10°; same idea at TOP. Prevents double counts from jitter.
- Minimum 250 ms per phase; ignore frames where any used landmark has visibility < 0.5.
- A rep counts on return to TOP after reaching BOTTOM. Turning around before BOTTOM =
  partial rep event (counted separately, not as a rep).
- Emit events: `{type: 'rep' | 'partial', index, eccentricMs, concentricMs, minAngle, maxAngle, t}`.
- Use the side with higher average visibility (left vs right) for unilateral views.

## 4. Data model

```ts
type LandmarkFrame = {
  t: number;                 // ms since stream start
  landmarks: { x: number; y: number; z: number; visibility: number }[]; // 33 points, normalized
  world?: { x: number; y: number; z: number }[];                          // meters, hip-centered
};

type ProgramDay = { id: string; name: string; exercises: PlannedExercise[] };
type PlannedExercise = {
  exerciseId: string;        // free-exercise-db id
  sets: number; targetReps: [min: number, max: number];
  restSec: number; startWeightKg?: number;
  tracking: 'pose' | 'manual';
};

type SetLog = {
  sessionId: string; exerciseId: string; setIndex: number;
  reps: number; partials?: number; weightKg: number;
  restTakenSec: number; focusScore?: number; cues?: string[];
  startedAt: number; endedAt: number;
};
```

## 5. Fixture recording guide (for me, at Checkpoint B)

- Phone on a stand at hip height, 2–3 m away, whole body in frame, good light, plain background
  if possible. Side view or front view per the table in M4.
- Per exercise: one clip of clean reps, one clip with deliberate mistakes (2–3 partial reps,
  some fast lowering). 10–30 s each.
- Filename: `fixtures/videos/<exercise>/<label>__reps-<n>__partials-<m>.mp4`
  e.g. `curl/clean-01__reps-10__partials-0.mp4`.
- Make sure nobody else is in the shot.

## 6. Out of scope for v1

Accounts, cloud sync, sharing, nutrition, AI-generated programs, 3D anatomy, multi-person
tracking, recording/saving video, Apple Watch / heart rate.
