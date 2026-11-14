# Gym Clean — Product Spec (v1)

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

**Coaching principle (Wongsaton, 2026-11-13): the app works like a personal trainer and recommends
what it sees.** Mid-set (camera): every hint is about something the camera actually measures, said like
a trainer: short, spoken, actionable, one at a time, never over the rep count, never medical ("Curl
higher.", "Slow the lowering.", "Straighten your arm at the bottom.", "Both arms together."). If the
camera can't judge something reliably from the view used, the app doesn't pretend to. After a set and
for the next session: plain, explainable recommendations from the logged data ("12 clean reps at full
range: add 2.5 kg next time"). These are shown and spoken, never applied automatically. Everything stays
on the phone.

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
- **Accept:** blank app with a "Gym Clean" title renders; CI green; a trivial unit + e2e test pass.

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

### M1b — Lists, notes, units (Wongsaton's feedback, 2026-11-13)
- **Day preview:** tapping a day shows its exercise list (sets × target reps, weight, last time) with a
  "Start workout" button, before anything starts.
- **Exercise list during the workout:** opened from the top bar. Each exercise shows sets done / planned,
  and done, current and skipped states. Tap an unfinished exercise to jump to it. After an exercise
  finishes, the workout continues with the next unfinished one, wrapping around to any that were jumped over.
- **On the Exercise screen:** "Today" (sets already logged for this exercise) and "Last time" (that
  exercise's sets from the most recent previous session). The default weight is last time's weight.
- **Notes:** per exercise, a lasting **machine setting** (e.g. "Seat 4, pad 2") and a lasting **exercise
  note**, both shown again every time. Per workout, an optional **today's note** for each exercise,
  shown on the Summary. Typing only happens in the notes sheet, never mid-set.
- **Units:** Settings on the Today screen: kg or lb. Weights are stored in kg and converted for display.
  Steps are 2.5 kg / 5 lb. Default weights snap to the step in the chosen unit.
- **Accept:** reducer tests for jump / wrap-around / last-time defaults / unit steps; DB tests for notes
  and last-time queries; e2e for preview → list jump → notes persist → lb display.
- Later (requested): a **history view of the last week**. This is folded into the M6 History screen
  unless it's wanted sooner.

### M2 — Anatomy map + focus cues
- Original SVG body map, front and back views, each muscle group its own `<path>` with an id
  matching free-exercise-db muscle names (e.g. `chest`, `lats`, `middle back`, `biceps`,
  `triceps`, `shoulders`, `quadriceps`…; take the full list from the dataset schema).
- On the Exercise screen: primary muscles strongly highlighted, secondary muscles lightly.
  Auto-pick front/back view based on where the primary muscle is.
- Each exercise has a short focus cue (≤ 8 words) in `src/data/cues.json`, e.g.
  "Squeeze your chest, slow on the way down." Spoken at set start.
- **3D muscle body (added 2026-11-13, Wongsaton's request):** an original 3D body built from our own
  shapes with Three.js (no downloaded models), target muscles lit (primary strong, secondary light).
  It turns automatically to face the working muscles, can be dragged to rotate, and a tap opens a
  full-screen viewer. Three.js is lazy-loaded. The 2D SVG map is the fallback when WebGL is missing
  (and shows while 3D loads). Under `prefers-reduced-motion` the body snaps instead of easing. Render on demand only (no idle loop).
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
- **3D live skeleton (added 2026-11-13):** draw the pose landmarker's `world` landmarks as a 3D
  skeleton next to the camera view, rotatable, with a side-view preset to check form even when the phone
  faces you.
- **Accept:** pipeline runs in the browser at phone size; extraction tool works on a sample
  public-domain/synthetic clip or on my fixtures once provided.
- 🧍 **Checkpoint B:** stop and ask me to record fixture videos (guide in §5).

### M4 — Rep counter
- `src/core/repCounter.ts`: angle-based state machine per exercise (see §3), with smoothing
  (EMA), hysteresis, minimum phase duration, and a visibility gate.
- Supported v1 exercises and the joint angle each uses — thresholds are starting values,
  tune them against fixtures (tuned 2026-11-13 on synthetic fixtures; retune on real clips at Checkpoint B):

| Exercise | View | Angle (landmarks) | "Extended" | "Contracted" |
|---|---|---|---|---|
| Dumbbell curl | side | elbow (shoulder–elbow–wrist) | > 150° | < 70° |
| Push-up | side | elbow | > 150° | < 95° |
| Push-up, filmed head-on (front-view variant, both arms) | front | elbow | > 150° | < 125° |
| Seated DB shoulder press | front | elbow, **image-space** + wrist above shoulder | > 143° | < 80° |
| One-arm DB row | side | elbow | > 145° | < 90° |
| Goblet squat | side | knee (hip–knee–ankle) | > 160° | < 100° |
| Lateral raise | front | shoulder (hip–shoulder–elbow) + posture gate (torso ≤ 35° from settle) | < 25° | > 75° |

  Press, push-up front variant and lateral-raise posture gate: tuned on Wongsaton's real session
  2026-11-13 (Push A log; see PROGRESS Decisions). The press lockout line (143°) sits midway between
  the synthetic partials (136–139°) and his real lockouts (≥ 148°). Side-on stays the recommended push-up placement; the front variant is picked
  automatically while settling (§3).

  Lying exercises (bench press, flyes) are **experimental**: implement only if fixtures show
  the landmarks are stable; otherwise keep them manual-count.
- Live: big rep number, spoken count ("one… two…") optional toggle; auto-fill reps into the set log.
- **Accept:** on every committed landmark fixture, counted reps == the count in the filename,
  partial reps detected == the partial count. A fixture test suite runs in `npm run check`.
  Met on synthetic fixtures first; the real fixtures from Checkpoint B must also pass before M5.

### M4b — 3D exercise demo (added 2026-11-13; pulled forward 2026-11-13 after the phone test, built together with M4c)
Wongsaton's feedback: "the 3D model should SHOW HOW THE EXERCISE IS DONE: animated, like a GIF or an
example video, easy to understand, e.g. what a One-Arm Dumbbell Row is and which part of my body to focus on."
- A simple original 3D mannequin (our own capsules, same look as the synthetic-fixture mannequin and the
  M2 body colours; no downloaded models or art) loops the exercise's movement, driven by our own
  joint-angle keyframes (ported from `tools/synthetic.ts` into `src/ui/demo3d/`).
- **Tempo:** lift ~1 s, short hold at the top/far end, lowering ~2 s, short pause at the start. The
  demo shows the controlled lowering that M5 coaches. Shown as text too ("Lift 1 s · Lower 2 s").
- **Muscles:** the mannequin's body parts that carry the exercise's primary muscles are lit strongly and
  secondary ones lightly (same colours as M2), from the M2 muscle data via a muscle → body-part map.
- **"How to" sheet** (opened from the Exercise screen with a ≥ 56px "How to" button): the looping demo,
  2–3 short how-to lines, and the focus line (the M2 cue). Drag rotates the demo, with Front/Side presets.
  It renders only while the sheet is open. Under `prefers-reduced-motion` it doesn't autoplay: it shows
  the start pose with a Play button.
- **Scope (re-prioritised 2026-11-13 for the Push A gym test):** animated demos now for the **six Push A
  exercises**: Dumbbell Bench Press, Incline Dumbbell Press, Standing Dumbbell Triceps Extension (manual
  count; a demo doesn't need tracking), Pushups, Seated Dumbbell Press, Side Lateral Raise (pose-tracked).
  Written how-to lines now for **all 30 program exercises**. Exercises without a demo show the how-to
  lines plus the M2 muscle body in the same sheet. Demos for every other exercise (including the
  pose-tracked curl, row and goblet squat) come in **M4d**, after Wongsaton's Push A gym report.
- **Demo/Info badges** (Wongsaton, 2026-11-13: "mark the exercises that have a 3D example, and which ones
  need information"): the day preview list, the in-session exercise list sheet and the Exercise screen
  header show a small badge on each exercise. It says **"3D demo"** when an animated demo exists and
  **"Info"** otherwise (written how-to + muscle map only). Pose-tracked exercises also show **"Camera"**.
  Badges are computed from data (`hasDemo(exerciseId)`, `tracking`), never from a hard-coded list, so they
  update as M4d adds demos. Badge text ≥ 20px, high contrast.
- **Accept:** a demo for each of the six Push A exercises. Unit test, measured on the demo's own joint
  positions: a pose-tracked demo's full rep goes past both of that exercise's thresholds (extended and
  contracted) by ≥ 10°; a manual exercise's demo reaches the start and end angles declared in its demo
  data; bone lengths stay constant through the loop; the lowering takes longer than the lift. Every
  program exercise has 2–3 how-to lines. Every primary/secondary muscle of a demo exercise maps to at
  least one mannequin part. E2E: the How to sheet opens with a running demo for a Push A exercise and
  with text + muscle map for an exercise without a demo (e.g. a Pull day exercise); on Push A, Pushups
  shows "3D demo" + "Camera" and Dumbbell Bench Press shows "3D demo" only; a Pull exercise without a
  demo shows "Info" — in the preview, the list sheet and the header. 390×844 screenshots of all 6 demos.

### M4c — Coaching on the camera page + developer log (added 2026-11-13, phone-test feedback)
**Push A slice (2026-11-13):** Wongsaton's next gym session is Push A. The first shippable slice is
(1) the developer log and the set correction below, (2) this camera page for Push A's pose exercises
(push-up, seated DB press, lateral raise; the code is generic, so all six rules get it), and (3) the M4b
demos for the six Push A exercises plus the badges. Deploy, then 🧍 Push A gym session, then he exports
the log and we analyse it. Everything else (M4d, M5, M5b, other days) waits for that report.
Feedback from the first live phone test (iPhone, 30 fps, side label right, every counted rep spoken):
**"It counts only sometimes."** Likely cause (until real clips exist): world-landmark angles compress the
bent end, and the row/push-up start positions sit only ~5–10° past the extended threshold. A lifter who
doesn't straighten fully never re-enters the start band, so nothing is counted, not even a partial.
- **Range-of-motion gauge:** a vertical bar on the video that shows the live smoothed joint angle between
  the start end and the far end, with a **start line** (start threshold) and a **target line** (far
  threshold). The fill turns green once the current rep reaches the target, and the line for the end the
  last rep missed is marked in amber. The current angle in degrees is shown next to it (≥ 20px), so a
  miscount can be diagnosed on the phone without video. The gauge is pure math in `src/core/` (angle →
  0–1 position, both marks).
- **Why a partial, spoken:** every partial carries a reason:
  - `far`: turned around before the far threshold (didn't curl high / sit deep enough).
  - `start`: came back from the far end but turned toward it again without reaching the start band
    (didn't straighten). This is new: until now such reps vanished silently.
  Each exercise rule has a short coaching hint per reason, as data (≤ 6 words), e.g. curl: "Curl higher."
  / "Straighten your arm at the bottom."; row: "Pull your elbow higher." / "Let the arm hang straight.";
  squat: "Sit deeper." / "Stand all the way up.". The hint is **spoken** and shown for a few seconds. It is
  never spoken over a count word: a count interrupts a hint, and a hint waits until the count has finished
  (it's dropped if it would start more than 1.5 s late). At most one hint every 6 s. Coaching language
  only, never medical.
- **Target on the camera page:** "3 / 12" next to the big rep number (the target is the top of the
  planned range, like the default reps), plus "Set 2 of 3 · 8–12 reps". The count turns green when the
  target is reached.
- **Camera-first layout:** the video fills the space between a slim top band (title, Close) and a slim
  bottom band (big Set done, ≥ 56px). It's shown full width with `object-fit: cover`: only the display is
  cropped, inference still sees the whole frame, and the skeleton overlay uses the same crop. The rep
  count, target, gauge and hint sit on the video on dark, high-contrast backings. The 3D live skeleton and
  the Front/Side presets are collapsed behind a "3D" button (loaded only when opened). Switch camera is a
  ≥ 56px icon button. CLAUDE.md readability rules hold (count ≥ 64px, text ≥ 20px).
- **Correct the last set (ground truth):** the camera's Set done logs the counted numbers and goes to
  Rest. The Rest screen then shows "Last set: 10 reps · 1 partial" with ± steppers (≥ 56px) for reps
  and partials. A change updates that set's log row. This fixes miscounts and gives the developer log
  its true labels.
- **Developer log (Wongsaton's request, 2026-11-13: "log everything helpful for developing the app"):**
  - **On the phone only, numbers only:** no video or image ever, never uploaded; exported only when
    Wongsaton taps Export. Stored in IndexedDB.
  - **Per session:** app version (git sha + build time), user agent, settings (unit, spoken count),
    program day, and every session event with a timestamp (set done, start set, skip, jump, pause,
    adjust, correction).
  - **Per set (manual and camera):** exerciseId, set index, target range, counted reps/partials, logged
    reps/partials (after correction = ground truth), weight, set start/end, rest taken.
  - **Camera sets also get:** delegate, fps samples (1/s), tracked side, every counter event (rep/partial
    with angles, leg times, partial reason, shortByDeg), every spoken count/hint (text + time, and
    whether it was dropped), the smoothed-angle trace, and the raw `LandmarkFrame` stream while the
    camera sheet is open (frames with no person are kept as time stamps).
  - **Size:** frames are stored quantised (int16, 1e-4 units): 33 × 4 + 33 × 3 = 231 numbers ≈ 0.46 kB
    per frame, ≈ 14 kB/s at 30 fps, ≈ 0.6 MB for a 45 s set, ≈ 5–8 MB for a Push A session (3 pose
    exercises × 3–4 sets). The log keeps the newest sessions up to 150 MB (default) and deletes the
    oldest beyond that; it asks the browser for persistent storage. The data is flushed to IndexedDB
    every 10 s and at Set done, so a killed tab loses at most 10 s.
  - **Settings → Developer log:** on by default for now; shows the stored size and session count;
    "Export last session", "Export all" (a gzip-compressed JSON file via the share sheet on iOS, else a
    download), and "Clear" (two taps). Recording only happens while the toggle is on.
  - **Converter:** `npm run devlog -- <export file>` turns each camera set into
    `fixtures/landmarks/<folder>/devlog-<date>-s<n>__reps-<logged>__partials-<logged>.json` plus a
    report (counted vs logged per set). Exported logs are never committed; landmark fixtures from them
    are committed only after Wongsaton's OK.
- This pulls M5's "Partial — finish the rep" cue forward; M5 no longer owns partial cues (see M5).
- **Accept:** unit tests, written first, for the developer-log codec (quantise round-trip within 1e-4,
  null frames), its rotation (oldest sessions dropped over the cap) and export shape, the
  last-set correction (reducer + DB row), the gauge math (every rule, both directions, contracted
  start), the partial reasons and `shortByDeg` (including the new `start` partial on an
  incomplete return, and no `start` partial from ±8° jitter at the far end), the hints as data (every rule
  has both, ≤ 6 words, no banned medical words), and the speech policy (rate limit, count priority,
  stale drop). The synthetic fixture suite still passes 12/12 with unchanged counts. E2E (fake camera,
  synthetic curl): stage ≥ 70% of the 844px viewport height, "/ 12" target shown, gauge marks present
  and the live angle changes, the partial in each loop speaks "Curl higher." without cutting off a count
  word, and the 3D skeleton is collapsed by default and opens on tap. E2E developer log: a camera set
  then a correction on Rest leaves a log with frames, events, spoken words and the corrected numbers;
  Export produces a file; Clear empties it; no request leaves the device. The converter turns an
  exported synthetic-curl session into a fixture JSON that the fixture suite counts correctly.
  390×844 screenshots.
- 🧍 **Checkpoint B2 (Push A gym session):** Wongsaton trains Push A with the deployed app, corrects any
  miscounted set on Rest, watches the gauge (does the fill reach both lines?), then exports the developer
  log and sends it. We analyse it (counted vs true per set, which line was missed, fps, spoken hints),
  turn the agreed sets into real fixtures (his OK first), and retune. These real sets also count toward
  Checkpoint B / M4 being fully done.

### M4d — 3D demos for the remaining exercises (planned 2026-11-13, follow-up to M4b)
- Demos (same mannequin, keyframes and muscle lighting as M4b) for the 24 exercises outside the Push A
  slice, in priority order: the pose-tracked curl, one-arm row and goblet squat first (their mannequin
  poses already exist in `tools/synthetic.ts`), then chest/arms/back (flyes, hammer curl, triceps
  pushdown, rows, pulldown, …), then legs. Machine/cable exercises get simple box props.
- Each new demo flips its badge from "Info" to "3D demo" automatically.
- Doesn't gate M5: can be built any time after M4b.
- **Accept:** as M4b, for every exercise that gets a demo (thresholds don't exist for manual exercises,
  so the range test uses each demo's own start/end angles from the exercise notes in the data).

### M4e — Visual redesign (added 2026-11-13, after the Push A slice)
Wongsaton: "Redesign the UX/UI to be user-friendly. The first impression should make the user want to go
to the gym and work out: clean, visual, sporty. Themes are OK if needed." Owner: ui-engineer (using the
`ui-ux-pro-max` skill); anatomy-3d-engineer aligns the 3D body/demo/skeleton colours with the tokens.
1. **Design direction:** 2–3 directions (palette, type, original imagery/illustration style, motion) as
   390×844 mockups. 🧍 **Wongsaton picks one** (his taste call; doesn't block other milestones).
2. **Design tokens + themes** in `src/styles.css` (CSS variables): dark sporty default, optional
   accent colours/themes in Settings, so screens restyle in one place.
3. **First impression:** Today/home redesign: a motivating hero (next workout, streak/consistency, last
   session), a clear Start button, visual day cards. Then Exercise, Rest, Summary, Settings, camera.
- Hard rules win: readable at 2 m (≥ 64px main numbers, ≥ 20px body, ≥ 56px targets, high contrast,
  dark default), self-hosted fonts only (CSP, no third-party requests), original art only,
  `prefers-reduced-motion` respected.
- **Picked (2026-11-13 night): the mix** in `docs/design/m4e-mix/README.md` is the contract for steps 2–3.
  - **Moods per screen:** Energy for Today (and the day preview) and Summary; Pro for Exercise, Camera,
    Settings and the overlays (Pause sheet, exercise list, notes, How-to); Track for Rest. Each screen
    root carries `.mood-energy` / `.mood-pro` / `.mood-track`; a mood only sets surface tokens, radius
    and line weight.
  - **One action colour app-wide.** A filled `--cta` shape is something to press; an outline/dot/bar/ring
    marks "now". Success = green, muscle = cyan, spoken cue = lavender, danger only in confirmations.
  - **Accent themes in Settings: Orange (default), Volt, Yellow**, persisted (`accent` setting). A theme
    swaps `--cta`/`--on-cta` only, **except Volt also turns success gold** (`#FFC94D` / `#221800`),
    because Volt sits close to success green.
  - **Type:** Barlow Condensed 700 (display, numbers) + Barlow 400/600/700 (body), self-hosted through
    `@fontsource` (latin subset, bundled same-origin). Scale per the mix README (rep count 120, timer 132).
  - **One original icon set** (24 grid, 2.25px round stroke), every icon button with a text label.
  - **Rest screen:** a ≥ 56px **"+30 s"** button extends the current rest's target by 30 s (the rest cues
    follow the new target; overrun is measured against it). **Skip exercise and End workout move off the
    Exercise and Rest screens into the Pause sheet**, so they can't be hit by accident; End keeps its
    two-tap confirmation. No separate "Skip rest" button (Start set already ends rest).
  - **Today data** comes from pure core selectors over the stored history: weekly streak, week dots,
    last session; **Summary**: session volume, volume vs the last session of the same day, new bests
    (more reps at the same or higher weight, or more weight). Summary's "Next time" line is the M5b coach
    line (no second hint source).
  - **Tab bar:** Today / Settings (History doesn't exist yet; it gets a tab when a milestone adds it).
  - 3D body, demos, skeleton and the 2D map take their colours from the same tokens.
- **Accept:** tokens are the only colour/size source in `styles.css` (lint/grep check), theme switch
  persists, every screen screenshotted at 390×844 in each theme, existing e2e green, Lighthouse
  accessibility ≥ 95 on Today.
  - The grep check is a unit test: no hex/rgb/hsl colour and no raw `font-size` outside the token blocks
    in any `src/**/*.css`, and no colour literal in `src/ui/**/*.ts` (canvas and 3D read tokens).
  - Selectors, the accent setting and `+30 s` have unit tests written first; e2e covers the accent
    persisting, Volt → gold success, `+30 s`, Skip/End only in the Pause sheet, fonts same-origin, and no
    third-party request.

### M4f — Camera for more exercises (added 2026-11-14)
Wongsaton approved it ("Yes, plan to do it"). Camera rep counting (the M4 counter, the M4c camera page,
M5c hands-free and the M5 timing cues) is extended beyond the six tracked exercises. No new counting
logic: each new exercise is one rule as data in `src/core/exercises/`, read by the same generic counter.
The groups and their order:
- **Wave 1, easy (first):** Hammer curls, Concentration curls, Incline dumbbell curl, Dumbbell shoulder
  press, Bent-over two-dumbbell row, Standing dumbbell triceps extension. These use the elbow, in the same
  views as the curl, row and press that already count. Wave 1 starts once the M4d 3D demo batch has merged.
- **Wave 2, doable (later):** lunges, step-ups, stiff-legged deadlift, standing calf raises, reverse flyes,
  face pull, triceps pushdown, lat pulldown, seated cable rows. They need new joints (hip, ankle, upper
  arm against the shoulder line), a machine in the way, or an unusual phone spot. Wave 2 starts after
  Wongsaton's wave 1 gym data (Checkpoint F1).
- **Stays manual:** bench press, incline press, flyes, bench dips, cable crossover, leg press, leg
  extensions, lying leg curls, seated one-leg calf raise. Reasons:
  - Lying exercises stay manual (M4 rule).
  - On the seated/lying machines the pads and frame hide the joints.
  - Bench dips and the crossover put the body side-on to a bench or between two stacks, which hides an arm.
  - The seated calf raise moves a small range under a weight on the knee.

**Rule status: `learning` or `tuned`.** Each rule has a required field `status: 'learning' | 'tuned'`.
- **The six existing rules are `tuned`** (grandfathered). They shipped through M4/M5, and their form rules
  keep the M5 guard.
- **Every M4f rule starts as `learning`.**
- **What a learning rule does:** it counts reps and partials, speaks the count words and the M4c partial
  hints, shows the gauge, and runs hands-free auto start/stop. Focus rules are limited to timing:
  `rushedLowering` and `stalled` are on. `outOfFrame` and `lowFps` are also on; they only report
  presence and light, never judge a rep. `shrinkingRange` and every form rule are off.
- **The limit is enforced twice:** a data test on the rule's flags, and `focusFlagsFor` masks a learning
  rule at run time.
- **The focus score** is computed as for any camera set.
- **Learning → tuned uses the M5 guard.** The folder must have committed real fixtures
  (`fixtures/landmarks/<folder>/real-*.json`) that pass these pre-registered criteria:
  1. ≥ 2 real sets with ≥ 16 reps in total;
  2. the fixture suite counts every real set exactly. The labels are his logged numbers after any
     "Fix last set" correction;
  3. any threshold change needed to get there is a Decision with the numbers, and every synthetic
     fixture still passes.
- **A test fails** if a non-grandfathered rule is `tuned` without real fixtures.
- **When a rule becomes tuned,** `shrinkingRange` turns on only if it fires ≤ 1 time per real clip (M5
  criterion). Form rules still need their own SPEC M5 rows and criteria; none exist for these
  exercises yet.

**What the user sees for a learning exercise.** All of it is computed from data (`ruleFor(id)?.status` +
`tracking`), never from a hard-coded list. None of it is spoken, because there is nothing to react to
mid-set.
- **Badge:** a fourth badge, **"Learning"** (`data-badge="learning"`), after "Camera". It shows in the
  day preview, the in-session list sheet and the Exercise header. Neutral pill, ≥ 20px, not amber, not
  the action colour.
- **Camera page:** a small **"Learning"** chip in the top band next to the title (`data-learning`,
  ≥ 20px, neutral). Its accessible name is "Learning: camera counting is new for this exercise". The
  "Set up your phone" card gets one extra line under the placement lines: **"Still learning: fix the
  count on Rest."**
- **Rest, the camera rest mode and Summary:** the "Last set" fix of a learning camera set shows one line:
  **"Camera still learning. Fix it if it's off."** Those corrected numbers are the labels that tune the
  rule.
- **Dev log:** each camera set records `ruleStatus`. The `npm run devlog` report marks learning sets, and
  its known folders include the new ones.

**Wave 1 rules** (all use world angles unless noted; thresholds are starting values, retuned on real sets):

| Exercise (id) | Folder | View (otherView) | Angle | Start → far, lowering | Extended / contracted | Gates |
|---|---|---|---|---|---|---|
| Hammer curls (`Hammer_Curls`) | `hammer-curl` | side, best side (none) | elbow (shoulder–elbow–wrist) | extended → contracted; lowering toward extended | > 150° / < 70° | visibility only |
| Concentration curls (`Concentration_Curls`) | `concentration-curl` | side, about 3/4 from the working arm's side, best side (none) | elbow | extended → contracted; lowering toward extended | > 145° / < 70° | visibility only (the arm braced on the thigh rarely locks out, hence 145) |
| Incline dumbbell curl (`Incline_Dumbbell_Curl`) | `incline-curl` | side, best side (none) | elbow | extended → contracted; lowering toward extended | > 150° / < 70° | visibility only |
| Dumbbell shoulder press (`Dumbbell_Shoulder_Press`) | `db-shoulder-press` | front, both arms (none) | elbow, **image plane** (as the seated press) | contracted → extended; lowering toward contracted | > 143° / < 80° | extended gate: wrist above shoulder |
| Bent-over two-dumbbell row (`Bent_Over_Two-Dumbbell_Row`) | `bent-over-row` | side, best side (none) | elbow | extended → contracted; lowering toward extended | > 145° / < 90° | visibility only (a posture gate is the fallback if standing up between reps makes phantom reps) |
| Standing DB triceps extension (`Standing_Dumbbell_Triceps_Extension`) | `triceps-extension` | side, best side (none) | elbow | extended (overhead) → contracted (behind the head); lowering toward contracted | > 150° / < 80° | extended gate: wrist above shoulder (lifting the dumbbell up from hanging arms isn't a rep) |

| Folder | Hint: far / start (≤ 6 words) | Placement lines (≤ 8 words each) | Spoken placement sentence |
|---|---|---|---|
| `hammer-curl` | "Curl to shoulder height." / "Straighten your arm at the bottom." | Phone at waist height, side-on · Curling arm faces the phone · Shoulder to hand in frame, 2–3 m | "Stand side-on, 2 to 3 metres from the phone, with your curling arm in view." |
| `concentration-curl` | "Curl up to your shoulder." / "Lower until your arm is straight." | Phone at seat height, 2–3 m · Working arm nearest the phone · Turn a little toward the phone | "Sit 2 to 3 metres from the phone, turned a little toward it, working arm nearest." |
| `incline-curl` | "Curl higher." / "Lower all the way down." | Phone at bench height, side-on · Curling arm faces the phone · Shoulder to hand in frame, 2–3 m | "Put the phone at bench height, 2 to 3 metres away, side-on, with your arm in view." |
| `db-shoulder-press` | "Press all the way up." / "Lower the weights to your shoulders." | Phone in front of you, chest height · Both arms and hips in frame · Leave room above your hands | "Face the phone at chest height, 2 to 3 metres away, with room above your hands." |
| `bent-over-row` | "Pull your elbows higher." / "Let the arms hang straight." | Phone at hip height, side-on · Hinge with your side to the phone · Shoulders to hands in frame, 2–3 m | "Stand side-on, 2 to 3 metres from the phone, with your hinged back and arms in view." |
| `triceps-extension` | "Lower it further behind your head." / "Straighten your arms overhead." | Phone at chest height, side-on · Arms overhead, room above the hands · Head to hips in frame, 2–3 m | "Stand side-on, 2 to 3 metres from the phone, with room above your hands." |

  Notes:
  - **Bilateral curls and the bent-over row:** both arms move together, and a side view counts the
    near arm (M4f-q1).
  - **Concentration curls:** the camera counts the arm nearest the phone. Reps are per arm, as in the
    plan (M4f-q2).
  - **Dumbbell shoulder press:** the seated-press counting convention applies; the first press from the
    shoulders counts (Decision 2026-11-13, answer 2).
  - **Triceps extension:** one dumbbell held overhead with both hands, as in the how-to (M4f-q9).

**Wave 2 rules** (same columns; planned after Checkpoint F1, values may change with the wave 1 data):

| Exercise (id) | Folder | View (otherView) | Angle | Start → far, lowering | Extended / contracted | Gates |
|---|---|---|---|---|---|---|
| Lunges (`Dumbbell_Lunges`) | `lunge` | side, best side, leg (none) | knee (hip–knee–ankle) of the near leg; it bends on every lunge, left or right | extended → contracted; lowering toward contracted | > 155° / < 110° | visibility only |
| Step-ups (`Dumbbell_Step_Ups`) | `step-up` | side, best side, leg (none) | knee of the working leg (nearest the phone) | contracted (foot on the box) → extended (standing on it); lowering toward contracted | > 160° / < 120° | visibility only |
| Stiff-legged deadlift (`Stiff-Legged_Dumbbell_Deadlift`) | `stiff-leg-deadlift` | side, best side, leg (none) | **hip** (shoulder–hip–knee), new triplet | extended → contracted; lowering toward contracted | > 155° / < 115° | visibility only. Back rounding and knee bend are not judged |
| Standing calf raises (`Standing_Calf_Raises`) | `calf-raise` | side, best side, leg (none) | **ankle** (knee–ankle–foot index), new triplet; angle **increases** as the heels rise | extended (heels down) → contracted (on the toes); lowering toward extended | < 90° / > 115° | visibility of the foot points; small range, foot landmarks are noisy |
| Reverse flyes (`Reverse_Flyes`) | `reverse-fly` | front (phone in front of the incline bench), both arms (none) | **upper arm vs shoulder line** (other shoulder–shoulder–elbow), new cross-body triplet (the bench hides the hips); increasing | extended (hanging) → contracted (level with the back); lowering toward extended | < 115° / > 145° | visibility only |
| Face pull (`Face_Pull`) | `face-pull` | side, best side (none) | elbow | extended → contracted; return toward extended | > 145° / < 100° | visibility only (the 1 s hold is dwell, not timed) |
| Triceps pushdown (`Triceps_Pushdown`) | `triceps-pushdown` | side, best side (none) | elbow | contracted (bar at chest) → extended; return toward contracted | > 155° / < 105° | visibility only (the stack may hide the far arm) |
| Lat pulldown (`Wide-Grip_Lat_Pulldown`) | `lat-pulldown` | front, **phone behind him** (the machine blocks the front), both arms (none) | shoulder (hip–shoulder–elbow) | extended (arms up) → contracted (elbows down); return toward extended | > 140° / < 70° | visibility only. Seen from behind, MediaPipe may swap left/right; the both-arm mean doesn't care |
| Seated cable rows (`Seated_Cable_Rows`) | `cable-row` | side, best side (none) | elbow | extended → contracted; return toward extended | > 145° / < 95° | visibility only |

| Folder | Hint: far / start | Placement lines | Spoken placement sentence |
|---|---|---|---|
| `lunge` | "Sink a little lower." / "Stand all the way up." | Phone at hip height, side-on · Room to step forward · Whole body in frame, 2.5–3 m | "Stand side-on, 2.5 to 3 metres from the phone, with room to step forward." |
| `step-up` | "Stand tall on the box." / "Step all the way down." | Phone at hip height, side-on · Working leg nearest the phone · Box and whole body in frame | "Stand side-on, 2.5 to 3 metres from the phone, working leg nearest, box in view." |
| `stiff-leg-deadlift` | "Hinge a little deeper." / "Stand tall at the top." | Phone at hip height, side-on · One side faces the phone · Whole body in frame, 2.5–3 m | "Stand side-on, 2.5 to 3 metres from the phone, with your whole body in view." |
| `calf-raise` | "Rise higher on your toes." / "Lower your heels all the way." | Phone on the floor, side-on · Feet and shins in frame · 2–3 m from the phone | "Put the phone on the floor, 2 to 3 metres away, side-on, feet in view." |
| `reverse-fly` | "Open up to shoulder level." / "Let your arms hang down." | Phone in front of the bench · Both arms and shoulders in frame · Leave room beside your hands | "Put the phone in front of the bench, 2 to 3 metres away, both arms in view." |
| `face-pull` | "Pull the rope to your face." / "Let your arms reach straight." | Phone at chest height, side-on · Pulling arm faces the phone · Head to hips in frame, 2–3 m | "Stand side-on, 2 to 3 metres from the phone, with your arms and the rope in view." |
| `triceps-pushdown` | "Push until your arms are straight." / "Let the bar rise to chest." | Phone at chest height, side-on · Near arm faces the phone · Head to hips in frame, 2–3 m | "Stand side-on, 2 to 3 metres from the phone, with your arm and the bar in view." |
| `lat-pulldown` | "Pull the bar to your chest." / "Let your arms go straight up." | Phone behind you, head height · Both arms and hips in frame · Leave room above the bar | "Put the phone 2 to 3 metres behind you at head height, both arms in view." |
| `cable-row` | "Pull to your stomach." / "Let your arms reach forward." | Phone at seat height, side-on · Rowing arm faces the phone · Shoulder to hand in frame, 2–3 m | "Put the phone at seat height, 2 to 3 metres away, side-on, arms in view." |

  Wave 2 open points:
  - **Lunges:** every lunge is counted, so the plan's target becomes the total (M4f-q6).
  - **Step-ups:** reps are per leg, like the concentration curl (M4f-q2).
  - **Cable stations:** is there room side-on or behind (M4f-q7)?

- **Fixtures:**
  - Every new folder gets two synthetic clips, `synthetic-01__reps-4__partials-0` and
    `synthetic-02__reps-3__partials-2`, rendered by our own mannequin (`npm run synthetic`) and
    counted by the fixture suite.
  - Real sets come from the dev log after each gym checkpoint. They are committed only with Wongsaton's
    OK, as landmarks only, never video.
  - SPEC §5 applies to the new folders.
- **Accept (per wave):**
  - **Rule tests, written first** for every new rule:
    - threshold order and hysteresis room;
    - SPEC values match the data;
    - hints and placement checked as data (word limits, no banned words, distance in the spoken sentence);
    - built angle curves: 4 clean reps → 4, a shallow turn → a `far` partial, ±8° jitter → nothing;
    - for the gated rules, hanging arms brought up → 0 reps.
  - **Status tests:**
    - every rule declares a status;
    - learning rules declare only the timing/presence flags and no form flag;
    - `focusFlagsFor` masks a forced `shrinkingRange` on a learning rule;
    - the tuned-without-real-fixtures guard fails on a fake promotion.
  - **Fixture suite:** each new folder's two synthetic clips count exactly, and the existing counts are
    unchanged.
  - **3D demos:** every demo of a newly tracked exercise passes the M4b "≥ 10° past both thresholds,
    starts where the rule starts" test.
  - **Unit test:** the Learning badge comes from data.
  - **E2E:**
    - badges ("Learning" on a learning exercise, not on the curl);
    - the camera page for a learning exercise with the fixture landmarker: chip, setup line, reps counted;
    - the Rest learning line next to Fix;
    - `ruleStatus` in the dev-log export;
    - no third-party request.
  - 390×844 screenshots.
- 🧍 **Checkpoint F1 (after wave 1) / F2 (after wave 2):**
  - Wongsaton trains the days with the new camera exercises: Pull A, Pull B, Push A and Push B for
    wave 1; Legs A, Legs B, Pull A, Pull B and Push B for wave 2.
  - He does ≥ 2 camera sets per new exercise, fixes every miscounted set on Rest, and notes placement
    trouble.
  - He exports the dev log. We convert it, commit the sets he OKs as `real-*` fixtures, retune, and
    promote each rule that meets the criteria to `tuned`.

### M5 — Live trainer: focus & form cues
- `src/core/focus.ts` consumes rep events (and per-frame landmarks where a rule needs them) and produces
  cues, following the coaching principle in §1. Baseline = first 2 reps of the set.
- **Partial-rep cues moved to M4c (2026-11-13).** M4c already speaks a per-reason hint for every partial
  ("Curl higher.", "Straighten your arm at the bottom."), with the speech policy (one hint per 6 s,
  count first, stale hints dropped). M5 reuses that policy and those events; it doesn't add a second
  partial cue. Partials still count toward the focus score.

| Signal | Rule (starting values) | Spoken cue | Reliable from |
|---|---|---|---|
| Rushed lowering | eccentric time < 50% of baseline, 2 reps in a row | "Slow the lowering." | all 6 (timing only) |
| Shrinking range | range of motion < 85% of baseline, 2 reps in a row | "Full range." | all 6 |
| Stalled mid-set | no phase change for 8 s, reps < target | "Stay with it. N to go." | all 6 |
| Out of frame | visibility < 0.5 for 2 s | "Step back into frame." | all 6 |
| Arms out of sync | 'both'-arm front views: left/right angle differ > 20° for 0.5 s mid-rep, 2 reps in a row | "Both arms together." | press, lateral raise (front view) |
| Raise too high | lateral raise: shoulder angle > 100° on 2 reps | "Stop at shoulder height." | lateral raise (front) |
| Elbow drifting | curl: upper arm swings forward > 25° from vertical during the lift, 2 reps | "Keep your elbow still." | curl (side) |
| Swinging the body | curl/row: torso angle changes > 15° during the lift, 2 reps | "Keep your body still." | curl, row (side) |
| Hips sagging | push-up: shoulder–hip–ankle line bends > 20°, 2 reps | "Keep your body straight." | push-up (side) |
| Low frame rate | fps < 15 for 3 s | "Move closer to the light." (shown + spoken once) | all |

  Candidates that need checking on real clips first: everything below "Arms out of sync" is a
  starting value and is only switched on for an exercise once real fixtures show it's stable.
  **Not judged from a phone camera** (the app never comments on these): grip and wrist position,
  back rounding or neck position from a front view, knee tracking over the toes from a side view,
  breathing, the weight on the bar, muscle "feel", and anything on lying exercises (manual count).
- Rate limit and priority: the M4c speech policy (max one cue per 6 s, never over the rep count).
- Per-set **focus score** (0–100) = simple, explainable: start 100, subtract per cue fired and per
  partial; show which cues fired on the Summary screen. Store it with the set.
- **Plan decisions (2026-11-13; details and reasons in PROGRESS Decisions):**
  - **Rule groups.** Focus rules (rushed lowering, shrinking range, stalled, out of frame, low fps)
    vs form rules (arms out of sync and every row below it). Every form rule, Arms out of sync
    included, is on for an exercise only when that exercise's **committed** real fixtures pass the
    pre-registered criteria. Uncommitted data can only switch a rule off. Per-exercise on/off is a data
    flag on the exercise rule (`focus`), including the push-up's front variant.
  - **Starting flags.** Shrinking range is off for the push-up front variant (real head-on ranges vary
    39–78°) and for the press (real data not committed; ranges ~83–111°). Arms out of sync and raise
    too high on the lateral raise depend on the replay of the 4 real clips. Elbow drift, body swing and
    hips sag are off (no real curl/row/side push-up fixtures). Hips sag is never judged from the front.
  - **Firing.** Each rule needs 2 reps in a row. It fires at most twice per set and its streak
    restarts after a fire. One cue per frame, by priority: out of frame > low fps > form > rushed
    lowering > shrinking range > stalled. Partials are excluded from streaks and get no second cue.
  - **Speech.** Cues use the M4c policy as hints (6 s gap shared with partial hints, a count wins,
    dropped if > 1.5 s late).
  - **Hands-free (M5c).**
    - No cues in rest mode, during the Undo window, or while paused.
    - Stalled, with hands-free on and ≥ 2 reps: in the start band, no cue (the 6 s still stop
      decides); outside it, "Stay with it. N to go." at half of `stalledSec` (5 s), then the 10 s
      stalled stop.
    - Stalled otherwise: 8 s, anywhere. Always once per set, after the first rep, and only while
      reps < the target.
  - **Out of frame** = a person is present but the joints fail the visibility gate for 2 s (posture /
    body-line gate failures never count). No person at all only cues when no auto stop follows.
    Never before the first rep.
  - **Low fps:** once per camera sheet, set mode only.
  - **Score.** −10 per tempo/range/form cue, −5 per stalled cue, −5 per partial; out of frame and low
    fps cost 0; clamped to 0–100. Only camera sets with ≥ 1 counted rep get a score. `SetLog.cues`
    stores cue ids. A "Last set" fix recomputes the score.
  - **Dev log.** `focusCue { id, t, reps, value, baseline, threshold }` per detection and
    `focusScore { score, cues, partials }` per camera set (enum + numbers only).
- **Accept:** unit tests for every rule using fixture landmark JSON + synthetic sequences; each new form
  rule is enabled only for the exercises whose real fixtures show it fires correctly.
- 🧍 **Checkpoint C:** I do a full camera session at the gym and report.

### M5b — Trainer recommendations after the set (added 2026-11-13)
- `src/core/advice.ts`: pure, explainable rules (tests first) over the logged sets (reps, partials,
  target range, weight, rest taken, M5 cues/focus score once they exist). Starting rules:

| Situation | Recommendation |
|---|---|
| Every set this exercise hit the top of the target range, 0 partials | "12 clean reps at full range: add 2.5 kg next time." (5 lb in lb mode) |
| Hit the top on this set, 0 partials, sets remain | "Strong set. Try +2.5 kg next set." |
| Below the bottom of the range, with partials | "Keep the weight. Focus on full range." |
| Below the bottom of the range two sessions running | "Drop 2.5 kg and own every rep." |
| Rest overran by > 60 s on 2+ sets | "Rest ran long. Start the next set when the timer says go." |
| Many "Slow the lowering." cues (M5) | "Lower for 2 seconds next time." |

- Shown on Rest (after the set just done) and on Summary / the next session's Exercise screen
  ("Last time: … → Coach: add 2.5 kg"). Spoken once at the start of Rest (short). Never applied
  automatically: Accept sets the weight stepper, Dismiss hides it.
- Every message says why (the numbers it's based on). Coaching language only, no medical words.
- **Accept:** unit tests for every rule, kg and lb steps, and that "no data" gives no advice; e2e:
  a set at the top of the range shows the "add" advice on Rest and Accept changes the next weight.
- Order: after M5 (uses its cues), but the reps/partials/rest rules only need M1–M4 data and may ship
  earlier if Wongsaton wants. Planned after the Push A gym report.

#### M5b round 1 rule table (2026-11-13, supersedes the starting table above where they differ)
Built ahead of M5 (reps/partials/rest/weight only; the tempo rule waits for M5 cues). Pure
`src/core/advice.ts`. **One recommendation per exercise per moment**: rules are checked in the order
listed and the first match wins. Nothing is ever applied automatically.

Definitions. `min`/`max` = the planned `targetReps`. `L` = today's logs of the exercise, in order.
`w` = the weight of the last log in `L` (kg). **Bodyweight** = `w === 0`: no weight advice, reps only.
`step` = 2.5 kg or 5 lb (display unit, `stepFor`). `w + step` / `w − step` are computed in the display
unit and snapped with `snapToStep`. **Too big a jump** = `step > 25%` of `w` in the display unit
(e.g. 5 lb on a 15 lb dumbbell): no weight increase is suggested. A set's rest **overran** when its
`restTakenSec` > (restSec of the exercise of the log before it) + 30 s (same as the M1 overrun rule;
the workout's first set never overran). "Clean" = no partials.

**(a) After a set, while sets of the same exercise remain** (shown on Rest, spoken once):

| # | When | Text (shown) |
|---|---|---|
| A1 | this set has partials ≥ 2 | "Keep the weight. Focus on full range." |
| A2 | this set reps < `min` | "Keep the weight. Aim for {min} reps." |
| A3 | `L` has ≥ 2 sets **at the current weight `w`** (display-unit rounding), every one of those reps ≥ `max` and clean (earlier sets at other weights are ignored), not bodyweight, not too big a jump | "Strong set. Try +{step} {unit} next set." + **Apply** (sets the next set's weight to `w + step`) |
| A4 | as A3 but bodyweight | "Strong set. Try {reps + 1} reps next set." (no Apply) |
| A5 | this set's rest overran and ≥ 2 sets in the workout overran (this one included) | "Rest ran long. Start when the timer says go." |
| — | otherwise | no advice |

**(b) Next time** (per exercise; shown on Rest after the exercise's final set instead of (a), and on
Summary for every exercise with ≥ 1 set today; `last` = `lastSessionSets` for the exercise):

| # | When | Text |
|---|---|---|
| N1 | some set in `L` reps < `min`, and `last` also had a set < `min` at a weight ≥ `w`, not bodyweight, `w − step` > 0 | "Next time on {Name}: drop to {w − step} {unit}." |
| N2 | some set in `L` reps < `min` | "Next time on {Name}: repeat {w} {unit}." (bodyweight: "… aim for {min} reps.") |
| T1 | (M5, added 2026-11-13) ≥ 2 sets in `L` have the M5 "Slow the lowering." cue (`rushedLowering` in `cues`) | "Next time on {Name}: lower for 2 seconds." (no Apply; checked after N2, before N3) |
| N3 | `L` has all planned sets, and the sets at the final weight `w` (≥ 2, or all of a 1-set plan) are all reps ≥ `max` and clean | "Next time on {Name}: +{step} {unit}." (bodyweight: "… +1 rep per set."; too big a jump: "… {w} {unit}, more reps.") |
| N4 | total partials in `L` ≥ 2 | "Next time on {Name}: same weight, full range." |
| N5 | some set in `L` reps < `max` | "Next time on {Name}: same weight, {max} reps." |
| N6 | otherwise (all at the top, but sets were skipped or only one set was done at the final weight) | "Next time on {Name}: repeat {w} {unit}." |

**Progress vs last time** (Summary only, positive only, nothing when there's no `last` or no gain;
weights compared in the display unit, a gain needs ≥ half a step):

| # | When | Text |
|---|---|---|
| P1 | max weight today > max weight in `last` | "{Name}: {w} {unit}, up from {prev} {unit}." |
| P2 | else, max weight today ≥ last max and total reps today > total reps in `last` | "{Name}: +{N} reps vs last time." |

Every advice also carries a short **why** shown under it, not spoken (e.g. "Sets: 8, 8 · no partials").
Each text is ≤ 12 words with the longest exercise name, uses no banned words (pain, injur*, hurt,
damage, safe, risk), and has a spoken form with units spelled out ("pounds", "kilos", "plus").
Speaking: once per logged set, when the rest clock crosses 2 s, only if that is ≤ 6 s into rest (a
throttled tab skips it) and the rest target leaves ≥ 15 s before the "Ten seconds" cue; it queues
behind speech already playing and never cancels anything. A "Last set" correction updates the shown
advice but doesn't speak it again. Summary is shown only, not spoken. A Settings switch "Coach tips"
(default on) turns the Rest advice and its speech off; the Summary Coach section always shows.
Deferred: the next session's Exercise-screen line and Dismiss (round 2), all-time bests (M6 history).
The tempo rule is T1 above, built in M5.

### M5c — Hands-free sets (added 2026-11-13, after the first real camera session)
Wongsaton: "Let's plan to do auto start and stop, that don't need to press button on the screen." The
phone sits on a stand or the floor and he doesn't want to walk back with dumbbells in hand to tap
"Set done" / "Start set". Applies to camera (`tracking: 'pose'`) exercises only; manual exercises are
unchanged. Builds on the M4 counter as it is; it doesn't wait for the press/push-up retune (a missed
auto start simply falls back to tapping Start set).
- **Camera stays open for the whole exercise:** with "Hands-free sets" on, the camera sheet no longer
  closes at Set done. It stays open through every set and rest of the current exercise and switches
  between a **set mode** (today's camera page) and a **rest mode** (rest panel over the dimmed video:
  rest clock ≥ 64px, "Next: Set 3 of 4 · 12 reps × 15 lb", the M5b coach tip with Apply, the "Last set"
  Fix, a ≥ 56px **Start set** and Close). It closes after the exercise's final set is saved (the next
  exercise needs a new phone position), on Summary, on Close, and after the idle limits below. The Rest
  screen gets a ≥ 56px **Camera** button when the upcoming exercise is pose-tracked, so the first set
  of an exercise can be hands-free too (the camera opens in rest mode).
- **Auto start:** in rest mode the rep counter keeps running silently (no count words, no hints). Once
  the rest has run ≥ `armAfterSec` (10 s), **2 counted reps** with the second completed ≤ 8 s after the
  first start the set. The set is backdated: `START_SET.now` = the moment the first rep left the start
  band, so rest taken and overrun stay exact (an early start is fine; overrun logic unchanged). The set
  starts with reps 2 and the partials seen in between; the count word "Two" is spoken (the first rep
  is silent). Partials alone never start a set.
- **Auto stop:** only after ≥ `stopMinReps` (2) reps in the set, when one of these holds:
  `still`: the counter sits in the start band (or setup) with no rep/partial and no phase change for
  `stillSec` (6 s; covers racking for curl, row, lateral raise, where "arms down" is the start
  position); `away`: no tracked person for `awaySec` (3 s); `stalled`: outside the start band with no
  event and no phase change for `stalledSec` (10 s; e.g. lying on the floor after push-ups, press arms
  dropped). The app then says **"Set done. 8 reps."** (kind `cue`, never cancels; spoken even with
  "Count reps out loud" off) and shows "Set done · 8 reps" with a big **Undo** (≥ 56px, full width) and
  a countdown of `undoSec` (5 s). No voice input.
- **Undo window = delayed save:** nothing is logged until the window ends. Then `SET_DONE` is dispatched
  with `now` = the end of the set's last rep/partial (backdated), so the rest clock starts when he
  actually stopped (it shows ≈ 11 s elapsed). Undo, or a new counted rep inside the window, cancels the
  stop: "Keep going." is spoken, counting continues from the same number, and that set's next auto stop
  waits 2 × `stillSec`. Tapping Set done during the window saves at once (same backdated time).
- **Speech order after a hands-free stop:** count word → "Set done. 8 reps." → (window) → save → the
  M5b coach tip (spoken at the save, instead of at 2 s, if it still ends ≥ 5 s before the "Ten seconds"
  cue; otherwise not spoken) → the normal rest cues. A manual Set done keeps the M5b 2 s timing.
- **Manual override:** every button still works: Set done (saves now; with hands-free on the camera
  stays open in rest mode unless the exercise is finished), Start set (in the rest panel and on the Rest
  screen), Close camera, Pause (auto start/stop do nothing while paused), Skip, Fix last set.
- **Idle close (battery/heat):** the camera stops (all tracks) and says "Camera off." after 3 min with
  no tracked person, or 10 min without a counted rep. A phone running camera + pose inference for a
  whole exercise (≈ 8–12 min instead of ≈ 45 s per set) gets warm; fps samples in the dev log show
  thermal throttling. Throttling inference during rest is a later option if the log shows a problem.
- **Settings → "Hands-free sets"** (key `handsFree`, default **on**, only an explicit false turns it
  off). Off = the M4/M4c behaviour exactly (camera per set, Set done closes it).
- **Thresholds are data:** `AutoSetConfig` defaults in `src/core/autoSet.ts` (`startReps` 2,
  `startWindowSec` 8, `armAfterSec` 10, `stopMinReps` 2, `stillSec` 6, `awaySec` 3, `stalledSec` 10,
  `undoSec` 5, `undoStillFactor` 2, `idleNoPersonSec` 180, `idleNoRepSec` 600), with an optional
  per-exercise `autoSet` override on the exercise rule. Retuned from the dev log, like the counter.
- **Pure core:** `src/core/autoSet.ts` is a state machine (`rest` → `set` → `pending` → saved, plus
  `off`/`closed`) fed per frame with `{ t, tracking, phase, events }` from the rep counter and told the
  session phase/paused/rest elapsed; it returns actions (`start`, `stopPending`, `stopCancelled`,
  `commit`, `close`) with reasons and times on the camera frame clock. No DOM, no MediaPipe.
- **Developer log:** every auto action is logged as an `autoSet` event (action, reason, reps, partials,
  times, counter phase and angle at that moment). The recorder keeps a 10 s in-memory pre-roll of frames
  while no set is open, and an auto-started set's frames begin 1.5 s before its backdated start, so the
  converter sees the starting reps. Rest frames otherwise aren't stored (log size unchanged).
- **Privacy:** unchanged: video and inference stay on the phone, nothing uploaded, no recording. The
  camera is simply open longer (the iOS camera indicator stays on); Close and the idle limits stop it.
- **Accept:** unit tests, written first, for `autoSet` with frame/rep-event sequences including
  real-data-like noise (±5° jitter in the start band, gated frames, 15–30 fps with gaps, a lone phantom
  rep in rest → no start, two reps 9 s apart → no start, start before `armAfterSec` → none, backdated
  start/end times, every stop reason, cancel by Undo and by a rep, doubled `stillSec` after a cancel,
  paused → nothing, idle close both ways); reducer tests that backdated `START_SET`/`SET_DONE` times are
  clamped (never before the set start or the rest start); `handsFree` setting default/read back; dev-log
  pre-roll; the commit-time coach-tip rule. E2E (deterministic fixture landmarker, real timers): auto
  stop after stillness with spoken confirmation + Undo, delayed save (no row during the window, row after
  with the backdated end), Undo and rep-cancel, auto start in rest mode after 10 s with the backdated rest
  taken, speech order (count → "Set done" → coach tip), camera closes after the exercise's last set,
  Rest's Camera button opens rest mode, setting off = M4 behaviour; live model on the synthetic curl
  loop: auto start from rest mode. No third-party request. 390×844 screenshots of the pending Undo, the
  rest mode, an auto-started set and the setting.
- **Breaks inside a set: "tap to continue"** (follow-up, Wongsaton 2026-11-13 night, option b). His real
  push-up set was 6 reps, a 16 s sit-down, then 5 reps: **one set** (rest-pause), which M5c saved as two.
  - **A break** is, inside a set with ≥ `stopMinReps` reps, either: the counter untracked for a
    **posture or body-line** reason (`counter.untracked` = `posture` / `bodyLine`, e.g. sitting down,
    bending over) continuously for `breakGateSec` (5 s) while a person is in frame; or no person in frame
    (`personInFrame` false) for `awaySec` (3 s). *In practice only body-line breaks (sitting down in a
    front-view push-up) and walk-aways hold: the posture gate re-locks after 3 s (`LEAN_RELOCK_MS`), so a
    long bend falls back to plain rest (still stop + Undo). See Decision 2026-11-14.* A visibility-gate failure (hands out of frame) is not a
    break. Fewer than `stopMinReps` reps: no break and no stop (unchanged).
  - **A break doesn't end the set.** It replaces the M5c `away` stop. Posture/body-line-gated frames don't
    count toward the `still` or `stalled` timers, so a sit-down can't turn into a still stop. The set is
    **on hold**: nothing is saved, the shown count freezes, and the camera shows "On hold · N reps", a
    break clock since the last rep (≥ 64px) and two ≥ 56px buttons: **Continue set** and **Start next
    set** (**Save set** on the exercise's last set). Spoken once, as a cue: "Set on hold. Tap to
    continue."
  - **While on hold, nothing starts from reps:** reps are not added and no set auto-starts. A rep seen
    during the hold re-speaks "Tap Continue to count." (at most once per 10 s). No focus cues on hold.
  - **Continue set:** counting continues from N in the same set; the normal stops apply again.
    **Start next set:** the held set is saved with `SET_DONE` backdated to the end of its last rep, then
    `START_SET` now (rest taken = the break). **Save set**, Set done, Close, and the idle limits also
    save the held set the same way.
  - **Plain rest in place is unchanged:** a `still` or `stalled` stop (no break) → Undo window → save →
    rest mode with the M5c auto start. A break during rest (after a save) doesn't disarm auto start.
  - Thresholds are data (`breakGateSec` on `AutoSetConfig`), retuned at Checkpoint B3.
  - **Accept:** autoSet unit tests written first (gate break at 5 s and not at 4.9 s, away break, a
    visibility gap isn't a break, gated frames never feed still/stalled, < 2 reps → nothing, Continue /
    Start next set / Save set / confirm / idle while held, reps while held don't count or start a set,
    plain rest unchanged); an acceptance replay through the real counter of the push-up timeline above
    (6 reps, 16 s seated, 5 reps → one saved set of 11 with Continue, never two sets); e2e for the hold
    panel, both buttons, the spoken prompt, backdated save, and plain rest unchanged; 390×844 screenshot
    of the hold panel.
- 🧍 **Checkpoint B3 (hands-free gym test):** Wongsaton trains a day with hands-free on, notes any
  wrong auto start/stop (and whether 6 s / 5 s feel right), then exports the developer log.

### M6 — Polish & install
- PWA (installable, offline after first load, model + wasm cached).
- History screen: last 4 weeks per exercise (weight × reps, focus score trend), including a
  "last 7 days" view of every session (requested at M1b).
- Lighthouse pass on accessibility; respect `prefers-reduced-motion`.
- **Accept:** installs on my phone home screen and works in airplane mode after first load.

### M7 — Fuel: food & nutrition (added 2026-11-13)
Goal: make eating enough for muscle gain as low-effort as the workouts. Most of my food is Thai
food I cook myself; sometimes restaurant food or takeout during work.

**Privacy:** all nutrition data (body stats, weigh-ins, food log) stays on the phone in
IndexedDB, like the workout data. The repo is public, so never put my personal numbers in
code, tests, fixtures or docs; use made-up example values.

**Two tracking modes** (Settings → Nutrition):
- **Quick (default):** calories, protein, body weight.
- **Full:** adds carbs and fat (grams) to targets, rings and entries.
- Entries always store every macro that's known; the mode only changes what's shown and asked.
  Switching modes never loses data. Quick-estimate entries may leave carbs/fat empty.

**Targets** (`src/core/nutrition/targets.ts`, pure, tests first):
- Setup asks height, birth year, sex and activity level; current weight comes from weigh-ins.
- Maintenance = Mifflin–St Jeor × activity factor. Calorie target = maintenance + surplus
  (default +300 kcal, editable 0–600).
- Protein = 1.8 g/kg by default (editable 1.6–2.2). Full mode: fat 25% of kcal (and at least
  0.6 g/kg), carbs = the rest.
- Every number can be overridden by hand; show "estimate" next to computed values.

**Weekly adjustment loop** (`src/core/nutrition/adjust.ts`, pure, tests first):
- Morning weigh-ins → 7-day average. Target gain rate default 0.25–0.5% of body weight/week.
- Once a week, compare this 7-day average with last week's. Needs ≥ 4 weigh-ins in each week,
  otherwise say "need more weigh-ins" and change nothing.
- Below range → suggest +150 kcal/day. Above 0.75%/week → suggest −100 kcal/day. In range →
  "on track". Never suggest a target below the maintenance estimate.
- Suggestions are never applied automatically: show it, I accept or dismiss. Log the history.

**Food sources, in the order the log sheet shows them:**
1. **Favorites & recent:** one tap to log again. Seed favorite: "Protein shake" (values
   editable from my product's label).
2. **My recipes (home-cooked Thai):** build a recipe once from ingredients in grams (from the
   food database or my own foods), set how many servings the pot/pan makes, then log
   "1 serving" or 0.5 / 1.5 / 2. Editing a recipe doesn't rewrite past log entries.
3. **Thai dishes (estimates):** a starter list of ~40 common dishes (e.g. pad kra pao with
   rice + fried egg, khao man gai, pad thai, pad see ew, khao pad, tom yum, green curry with
   rice, som tum, boat noodles, larb, moo ping with sticky rice) with kcal / protein / carbs /
   fat per typical plate, and Small / Regular / Large portions. Build values from USDA data
   (FNDDS dishes where they exist, otherwise a reference recipe computed from USDA
   ingredients). Every dish keeps its `source` + a note. Never copy values from commercial
   apps or copyrighted databases. Thai names shown alongside English.
4. **Quick estimate (restaurant / takeout):** type a name + kcal + protein (carbs/fat optional
   in Full mode) with Light / Regular / Big plate presets. "Save as favorite" for places I go
   back to (e.g. "Thai place near work — pad see ew").
5. **Search the food database:** vendored offline subset of USDA FoodData Central (public
   domain / CC0), Foundation + SR Legacy + common FNDDS foods, built by
   `scripts/build-foods.mjs` into a compressed JSON. Lazy-loaded on first search, budget
   ≤ 2 MB gzip, searchable offline.
6. **My foods:** custom foods per 100 g or per serving (for labels on Asian-market products).
7. **Barcode (optional, off by default):** scan with `BarcodeDetector` where supported, else a
   small on-device library, or type the digits. Lookup via Open Food Facts needs the internet
   and sends only the barcode number. Setting explains this before turning it on.
   Results are saved to My foods so the next scan works offline.

**Screens & UX** (same gym readability rules):
- **Fuel** tab: today's rings (kcal + protein; carbs + fat added in Full), remaining amounts in
  big numbers, today's entries grouped by meal slot (auto from time, editable), weigh-in button.
- **Log sheet:** sections in the order above; portion stepper; logging is ≤ 3 taps for a
  favorite or recent item. Edit/delete entries.
- **Weigh-in:** kg/lb (reuse the units setting), trend chart with the 7-day average, the
  weekly suggestion card.
- **Workout link:** the workout Summary shows today's protein vs target and a short post-workout
  hint ("45 g protein to go today"). Training days are marked in nutrition history.
- In-app nudges only for now (shown when the app is opened, e.g. evening protein gap). Push
  notifications wait for the PWA work in M6.

**Accept:**
- Unit tests: targets (incl. hand overrides and mode switch), weekly adjustment (all branches,
  missing weigh-ins, never below maintenance), recipe per-serving math, portion scaling, unit
  conversion. Fixtures use made-up numbers.
- Every Thai dish and seed food has kcal + protein, a source and a note; a test checks it.
- E2E (390×844): set up targets → log a favorite, a recipe serving, a Thai dish (Large), and a
  quick estimate → rings and remaining update → switch to Full mode → carbs/fat appear, no data
  lost → weigh-ins over 2 fake weeks → suggestion card → accept → new target.
- Works offline (airplane mode) except the optional barcode lookup. Food DB chunk within budget.

### M7b — Food photo recognition: local first, Claude as backup (planned 2026-11-13, after M7)
Take a photo of a meal → the app suggests the dish → I confirm the dish and pick a portion →
it's logged with the M7 nutrition values. **Target device: iPhone, Safari** (and the installed
PWA from M6).

**How it works**
1. **Capture:** `<input type="file" accept="image/*" capture="environment">` (opens the iPhone
   camera), or pick from Photos. Resize on the phone to ≤ 512 px for the classifier.
2. **On-device classifier (default, free, offline):** a small Thai food image classifier
   (≈ 5–25 MB, e.g. EfficientNet-Lite / MobileViT class) run with MediaPipe Image Classifier
   from `@mediapipe/tasks-vision` (already in the app for pose). Shows the **top 3** dishes with
   confidence; the top one is preselected.
3. **Confirm:** I tap the right dish (or search if none fits), pick Small / Regular / Large, and
   it's logged from the M7 Thai dish table (`source: 'photo-local'`, `estimate: true`).
   Every class the classifier knows must exist in the M7 Thai dish table.
4. **Claude backup (optional, off by default):** when top-1 confidence < 0.6, the dish isn't one
   the classifier knows, or I tap "Ask Claude": send the photo (≤ 1024 px) to Claude Haiku 5.5
   with the dish list, get structured JSON (dish, portion guess, kcal, protein, carbs, fat,
   confidence). I still confirm before logging (`source: 'photo-ai'`). Estimated cost ≈ $0.0004
   per photo. The setting explains that the photo leaves the phone. **Open decision before this
   part is built:** API key in a small proxy (e.g. Cloudflare Worker) vs. my own key pasted into
   the app and stored only on my phone. Never put a key in the repo or the built site.
5. **Photos are not kept** after logging, unless I turn on "Save photos to improve recognition"
   (stored only on the phone, labelled with the dish I confirmed, exportable as a zip to Files).
   Those labelled photos are the training data for the next model version.

**Training (outside the app, `ml/` folder)**
- Python training pipeline in `ml/` (README + scripts/notebook; runs on my Mac or Google Colab):
  start from a pretrained small image model, fine-tune on public Thai food datasets
  (THFOOD-50: 50 dishes, ~15.7k images; THFOOD-100: 100 dishes, ~53k images) plus my own
  exported photos. Export a model MediaPipe Image Classifier can load (`.tflite` with labels
  metadata). Check current tooling (MediaPipe Model Maker or a Keras/PyTorch fine-tune + export).
- **Licensing:** these datasets are for non-commercial research/education. Never commit the
  datasets, my photos, or the trained model to this public repo (`ml/data/`, `ml/runs/`,
  `ml/models/` are gitignored). The app gets the model by **importing the file once** in Settings
  (from Files), stored in IndexedDB on the phone. Without a model, the photo button only offers
  the Claude backup (if enabled) or manual logging.
- Report per-class accuracy and a confusion list (which dishes get mixed up).

**iPhone specifics**
- Test in Safari on a real iPhone; GPU delegate where it works, CPU/WASM fallback.
- Don't depend on WebGPU or on-device vision-language models (too large and slow on a phone;
  Chrome's built-in AI doesn't run on iOS). Revisit in a later milestone if that changes.

**Accept:**
- Unit tests: confidence → UI decision (show top 3 / suggest Claude), result → FoodEntry mapping,
  every classifier label maps to a Thai dish table entry, Claude JSON parsing + validation
  (rejects missing/negative numbers), "photo not kept" unless the setting is on.
- E2E with a stub classifier and a mocked Claude response: photo → top 3 → confirm → Large →
  entry logged with the right values; low confidence → "Ask Claude" offered only if enabled.
- Model on my held-out photos (≥ 100 of my own meals, never used for training):
  **top-3 ≥ 90%**, top-1 reported. Inference < 300 ms on my iPhone. Model file ≤ 25 MB.
- 🧍 **Checkpoint D:** I collect/label my meal photos (via the save-photos setting), run the
  training, import the model, and test a week of real meals.

### M9 — Native iOS shell (outline only, added 2026-11-14; not planned yet)
Referenced by the 2026-11-13 music-ducking Decision and by M10 phase B. A Capacitor iOS app that wraps the
same web build, adds AVAudioSession `.playback` + `.duckOthers` for spoken cues, and hosts native plugins
(M10's on-device brain). Scope, distribution (personal device / TestFlight) and owner are open questions
(PROGRESS Blockers, M10-q9). M10 phase A doesn't need it.

### M10 — AI trainer: plan actions, coach chat, on-device brain (added 2026-11-14)
Wongsaton: "same feature as real personal training such as suggest me the food, I can ask to postpone the
session when have another task to do on that day, ask to adjust the plan if today I hurt my arms, etc."
Free and local where possible. His phone is an iPhone 17 Pro (Apple Intelligence, iOS 26 Foundation Models).

**Three layers, built in this order:**
- **Phase A (web, ships before M9): trainer actions + coach chat.** Deterministic, pure core functions on an
  editable plan and schedule. A small rule-based intent matcher plus quick-action buttons. No AI.
- **Phase B (with M9): the on-device brain.** A Capacitor Swift plugin uses Apple's Foundation Models
  framework with tool calling. Each tool maps 1:1 to a phase A action. Data stays on the phone.
- **Phase C (optional, opt-in, off by default): a Claude API brain** with Wongsaton's own key, stored only on
  the phone. Needs a paid Anthropic account, so it waits for his explicit yes (CLAUDE.md rule 7).

**Core principle: the brain only proposes, the app decides.** Every action, whether it comes from a button,
the rule matcher, Apple's model or Claude, goes through the same pure `propose*` function. That function
validates it and returns a **Proposal**: a plain before → after list plus a why line. Nothing changes
until he taps **Apply**. Every applied change is **undoable**: an Undo button on the confirmation, and
Settings → Plan changes. A model's text never changes data by itself.

#### Goals
1. **Editable plan.** The program stops being read-only at runtime. On first run, `program.json` seeds a
   stored **user plan** (Dexie). There is also a **schedule**: the rotation order, plus which weekdays are rest
   days. **Day overrides** are dated, today-only changes. Today's workout = `effectiveDay(plan, schedule,
   overrides, date)`. "Up next" comes from a pure **calendar** projection: the next training weekday gets
   the next rotation day after the last finished session. This replaces today's "last session + 1".
2. **Trainer actions (phase A, pure, tests first)**, each returns a Proposal:

| Action | What it proposes | Scope |
|---|---|---|
| **Not today / move session** | Today becomes rest and the rotation continues on the next training day. Two modes: **use the rest day** (this week's next rest weekday becomes a training day, so the week still gets all its sessions) or **push the week** (everything slides one day; the last session spills into next week). Also "Move to <day>". A 7-day preview shows before → after. | dated override |
| **Go easy on a body area** (arms, shoulders, chest, back, legs, core; joint words map to areas as data) | For each of today's exercises: an exercise whose **primary** muscles are in the area is **swapped** for the best catalog candidate that hits the same other muscles and doesn't load the area, or **removed** if no candidate fits. An exercise with the area only in **secondary** muscles is **lightened** (default; see M10-q2). | today |
| **Lighter today** | Every exercise: −1 set (minimum 2), weight −10% snapped **down** to the unit step; bodyweight: the rep target −20%. | today |
| **Deload week** | 7 days from today: sets halved (rounded up), weight −10%. | dated overrides |
| **Swap an exercise** | The top 3 catalog candidates: same primary muscle group, equipment he has, not already in the day. Today only or from now on. | today or plan |
| **Stalled → adjust** | Builds on M5b. An exercise whose top set (weight, reps at that weight) hasn't improved for 3 finished sessions in a row (lighter/deload sessions excluded) gets two options: **−10% and build back up** (weight down, the rep range top +2), or **+1 set** (maximum 5). Shown on Summary under the M5b coach line and in the chat. | plan |
| **Food suggestion** | **Later, needs M7:** from today's remaining kcal/protein, pick 3 items from favorites, recipes and Thai dishes that fit, each with Log. Until M7 the chip says "Food tips come with Fuel." | — |

3. **Mid-workout.** From the Pause sheet, the coach can swap or remove exercises that have **no logged sets
   yet** (new session event `REPLACE_UPCOMING`). Logged sets are never rewritten. "Lighter" mid-workout only
   affects sets that haven't started.
4. **Coach chat (phase A).** A **Coach** sheet opens from Today, the day preview and the Pause sheet. It has:
   - **quick-action chips** (≥ 56px): Not today · Go easy on… (area chips) · Lighter today · Swap an exercise ·
     Adjust my plan · What should I eat? (later);
   - an optional text box for free text, matched by the rule-based intent matcher. Typing never happens
     mid-set (M1b rule): the sheet isn't reachable from the Exercise screen during a set or from the camera;
   - Proposal cards with a before → after list, a why line, **Apply** (the CTA) and **Not now**;
   - after Apply, a confirmation with **Undo** (≥ 56px, 10 s) and a line in Settings → Plan changes;
   - text it doesn't understand gets "I can help with:" plus the chips, never a guess.
5. **Voice.** Replies are shown, not spoken, on Today and the preview (he's holding the phone). When a change
   is applied during a workout, a short confirmation of ≤ 8 words is spoken as kind `cue`, for example
   "Done. Curls swapped for hammer curls." It never cancels speech and never plays during a set.
6. **Visible everywhere.** Today and the preview show "Adjusted today: <summary>" with Undo. The week strip
   follows the calendar (a postponed day moves). A rest weekday shows "Rest day" with **Train anyway**:
   Start is never disabled, per Decision.

#### Phase B — on-device brain (with M9)
- A **`GymBrain` Capacitor plugin** (Swift) with `availability()` and `respond({ instructions, context,
  messages })` → `{ text, toolCalls[] }`. It uses `LanguageModelSession` with tools. Each tool's arguments
  are `@Generable` structs **generated** from the TS tool definitions, which are the single source. A Swift
  tool's `call` only **records** the call and returns "Proposed; the app will ask the user to confirm." The
  app validates the call through the phase A `propose*` function and shows the Proposal. An invalid call
  gets "I couldn't do that" plus the chips.
- **Tools (1:1 with actions):** `postponeSession`, `avoidBodyArea`, `lighterToday`, `deloadWeek`,
  `swapExercise`, `adjustStalledExercise`, `suggestFood` (after M7). The read context (today's plan, the
  next 7 days, 4 weeks of per-exercise top sets, active overrides) is a compact serialized block. It fits a
  token budget well inside the on-device model's context window, and a test enforces the budget.
- **Fallback chain:** quick-action chips always use the rules directly. Free text goes to Apple's model when
  `availability` is `.available`. Otherwise it goes to Claude when phase C is on, otherwise to the rule
  matcher. The reason is shown once in Settings, e.g. "Apple Intelligence is off" / "not ready yet" / "this
  device can't run it". Model errors (guardrail, context too long, unsupported language, timeout) fall back
  to the rules with a one-line note. The PWA in Safari always uses rules (or Claude).
- **Check current docs before building** (CLAUDE.md rule 8): Foundation Models' API is new and changes.

#### Phase C — Claude brain (optional)
- Settings → **Cloud coach (Claude)**, off by default. Before it turns on, it explains plainly: "Your
  messages, your plan and your recent workout numbers (exercises, sets, reps, weights, dates) are sent to
  Anthropic to answer. Your notes, camera and developer log are never sent." It takes his own API key,
  pasted and stored only in IndexedDB on the phone. The key is never in the repo, the build, exports or the
  dev log. There's a model picker (default `claude-opus-5-5`; a cheaper model if he picks one), Test key and
  Remove key.
- It uses the same tool definitions, instructions and validation as phase B, through the Messages API with
  tool use, called from the browser. It falls back to rules on any error. CSP `connect-src` gains
  `https://api.anthropic.com`, and requests only happen while the setting is on.
- Food suggestions with phase C would also send today's nutrition totals. They're listed in the explainer
  once M7 exists.

#### Safety (all phases)
- **Coaching language only, no medical claims.** The coach never diagnoses or names conditions, never
  suggests treatment (ice, stretches, medication, "rest N days"), and never says training is "safe". The
  M5b banned words list applies, plus diagnosis terms as data (e.g. strain, sprain, tear, tendinitis,
  inflammation). All of these are checked on every reply: rule texts at test time, model replies at runtime
  by `sanitizeReply`, which swaps a failing reply for a fixed safe line.
- **Discomfort words** ("hurt", "sore", "pain", "เจ็บ", "ปวด" … as data) always add the fixed referral line:
  **"If something doesn't feel right, check with a doctor or physio."** Then the avoid-area proposal.
- **Red-flag phrases** (e.g. chest pain, dizzy, numb, can't move it, as data) get **"Stop the workout for
  today and get checked by a doctor."** The only buttons offered are End workout / Not today, and no
  training proposal is made.
- A guardrail **instructions** text shared by B and C: role (strength coach for one person), act only
  through tools, every change needs his confirmation, replies ≤ 3 short sentences, the referral line
  verbatim, no medical content, no promises about results, and "I can help with…" for anything else.

#### Privacy
- Phases A and B: everything stays on the phone, with no network request (the e2e test checks this).
- Chat text isn't stored beyond the open sheet, unless M10-q12 says keep a history. The dev log stores ids
  and numbers only: intent id, action id, proposal accepted/dismissed/undone, brain used, latency. It never
  stores message text.
- Phase C sends only what the explainer lists, and only while it's on. The repo is public: no personal
  numbers in tests, fixtures, evals or docs.

#### Non-goals
AI-generated programs (§6 still applies: the coach edits the plan, it doesn't write new ones), a full manual
plan editor, speech recognition in the app (iOS keyboard dictation is his choice), calendar sync, push
reminders, applying anything without a tap, medical or injury advice, and running Apple's model in the
Safari PWA.

#### Data model (adds to §4)
```ts
type BodyArea = 'arms' | 'shoulders' | 'chest' | 'back' | 'legs' | 'core';
type UserPlan = { days: ProgramDay[]; seededFrom: string /* program.json hash */; edited: boolean };
type Schedule = { rotation: string[] /* dayIds */; restWeekdays: number[] /* 0 = Sun */ };
type DayAdjust = {
  kind: 'avoidArea' | 'lighter' | 'deload' | 'swap';
  area?: BodyArea;
  exercises: PlannedExercise[];          // the day as it will run
};
type DayOverride = { date: string /* local YYYY-MM-DD */; rest?: true; dayId?: string; adjust?: DayAdjust };
type TrainerState = { version: number; plan: UserPlan; schedule: Schedule; overrides: DayOverride[] };
// PlannedExercise gains: weightKgToday?: number  (a lighter/deload default that wins over last time)
//                        adjusted?: 'lighter' | 'deload' | 'swap' | 'avoidArea'
type Proposal = {
  action: 'postpone' | 'avoidArea' | 'lighter' | 'deload' | 'swap' | 'stall' | 'food';
  scope: 'today' | 'dated' | 'plan';
  title: string; lines: { before: string; after: string }[]; why: string; say?: string;
  next: TrainerState;                    // the state after Apply (validated, pure)
  baseVersion: number;                   // stale if the state changed since
};
type PlanChange = {
  id?: number; createdAt: number; action: Proposal['action']; title: string;
  source: 'chip' | 'rules' | 'apple' | 'claude';
  before: TrainerState; after: TrainerState; undoneAt?: number;
};
// SessionRow gains: adjust?: Proposal['action'][]  (lighter/deload sessions are excluded from stall/bests)
```

#### Accept
- **Phase A:**
  - Unit tests, written first, for:
    - the calendar: rotation after the last finished session, rest weekdays, missed days, both postpone
      modes, postpone twice, postponing on a rest day, Monday/Sunday edges and DST;
    - every action, including: no candidate → remove; never swaps into an exercise that loads the area;
      lighter/deload stepping down in kg and lb; the stall rule excluding lighter sessions;
    - Apply/Undo round trip (LIFO), stale `baseVersion` rejected, and seeding/re-seeding;
    - `REPLACE_UPCOMING` rejecting exercises with logged sets, and `weightKgToday` beating last time;
    - the intent matcher on the eval set: ≥ 90% of the rule-supported items get the right intent and slots,
      and **100%** of discomfort and red-flag items get the safety flag;
    - every reply text: ≤ 12 words for spoken lines, no banned or diagnosis words, and the referral line
      present when discomfort is flagged.
  - Every catalog exercise (including the new swap pool) has muscles, a cue and 2–3 how-to lines, and every
    program exercise has ≥ 1 swap candidate.
  - E2E (390×844):
    - Not today → the preview shows the moved week → Apply → Today shows the next day → Undo restores it;
    - "my arms hurt" → referral line + avoid-arms proposal → Apply → the preview shows the swaps → the
      workout runs the swapped day;
    - Lighter today → Exercise shows −10% weights;
    - a mid-workout swap from the Pause sheet;
    - a stall proposal on Summary from seeded history;
    - a red-flag phrase → no training proposal;
    - no text box on the Exercise screen during a set, every button ≥ 56px, and no off-device request.
  - 390×844 screenshots of the coach sheet, a proposal, the confirmation with Undo, Today adjusted, the rest
    day, and Plan changes.
- **Phase B:**
  - A contract test: the generated Swift tool file and `tools.contract.json` are up to date with the TS
    tool definitions (a CI diff check), and every tool maps to exactly one action.
  - Validation tests: invalid tool arguments are rejected, a tool call never applies anything, and
    `sanitizeReply` replaces medical wording. The context serializer stays within budget on a heavy
    4-week history.
  - Fallback tests for every availability reason and error code.
  - An on-device eval run (dev-only screen in the native build) over the eval set: right action and
    arguments on ≥ 85% (threshold: M10-q10), 100% safe replies, 0 changes without a tap, p50 latency
    reported. The report holds ids and numbers only.
- **Phase C:** with a mocked API, the request body contains exactly the listed fields (no notes, no dev log,
  no key in the body); setting off → 0 requests to api.anthropic.com; errors fall back to rules. A local,
  never-in-CI eval run with his key reports the same metrics as phase B.
- 🧍 **Checkpoint E (after phase A):** Wongsaton uses the coach for a week: at least one "Not today", one
  "Go easy on…" and one swap. He reports what felt off. Phase B gets its own checkpoint with M9.

## 3. Rep counter design

States: `TOP → DOWN → BOTTOM → UP → TOP` (named by angle direction per exercise).
- Joint angles use the 3D `world` landmarks by default when the frame has them, else 2D x/y;
  visibility always comes from the normalized landmarks. A rule may say `angleSpace: 'image'`
  (seated press): then the angle is measured in the 2D image plane, aspect-corrected (normalized
  x scaled by the video aspect, which is estimated from the pose by fitting image vs world offsets
  when the frame doesn't carry it). Use it for front-view movements in the camera's plane, where
  the world model's depth guess compresses the angle.
- (Optional, per rule) Posture gate `maxTorsoLeanDeg` (lateral raise: 35°): once settled, frames
  where the torso (hip mid → shoulder mid, world) has turned more than N° from its direction at
  the settle are ignored like a visibility miss, and the rep in progress is dropped (back to
  setup, counts kept, no partial). Relative to the settle, so phone pitch doesn't matter.
- (Optional, per rule) View variants `otherView` (push-up: front variant): while settling, the
  counter judges the camera view from the world shoulder-line yaw (mean over recent frames;
  < 45° = front, else side) and uses that view's thresholds and side mode; switching restarts
  the settle. The choice has hysteresis so a borderline yaw doesn't flip it, and it is locked once
  settled. Hints and placement stay the rule's own; the gauge follows the active variant.
- Smooth the joint angle with an EMA (α ≈ 0.4) before thresholds.
- Hysteresis: enter BOTTOM only below the contracted threshold, leave only above
  threshold + 10°; same idea at TOP. Prevents double counts from jitter.
- Minimum time: the out-and-back legs together must take ≥ 2 × 250 ms and each leg
  ≥ 125 ms (dwell at the far end not counted; legs are timed on visible frames only, so
  time hidden from the camera never counts as movement); the initial settle needs
  ≥ 250 ms. Ignore frames where any used
  landmark has visibility < 0.5.
- A rep counts on return to TOP after reaching BOTTOM. Turning around before BOTTOM =
  partial rep event (counted separately, not as a rep), if it went at least 15° past the
  start threshold. Reason `far`.
- (M4c) After BOTTOM, if the limb turns back toward the far end (by more than the hysteresis) without
  re-entering the start band, that is a partial with reason `start` (didn't return to the start
  position); tracking continues from there as a new rep in progress. It needs the same minimum leg
  times as a rep.
- Emit events: `{type: 'rep' | 'partial', index, eccentricMs, concentricMs, minAngle, maxAngle, t,
  reason?: 'far' | 'start', shortByDeg?: number}`. `reason` and `shortByDeg` (how far the turnaround
  stopped short of the missed threshold, smoothed degrees) are set on partials only.
- (M4c) Gauge: `position = (startThreshold − angle) / (startThreshold − farThreshold)` on the
  oriented scale, so 0 = start line and 1 = target line, clamped to [−0.25, 1.25] for display.
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
// M4c — developer log (on device only; numbers, never images)
type DevLogSession = {
  id: string; startedAt: number; appVersion: string; userAgent: string;
  settings: Record<string, unknown>; dayId: string;
  events: { t: number; type: string; data?: unknown }[];        // session events, corrections
};
type DevLogSet = {
  sessionId: string; exerciseId: string; setIndex: number; targetReps: [number, number];
  counted?: { reps: number; partials: number }; logged: { reps: number; partials: number };
  weightKg: number; startedAt: number; endedAt: number; restTakenSec?: number;
  camera?: {
    folder: string;                                           // the rule's fixture folder
    delegate: string; side: string | null; fps: { t: number; fps: number }[];
    repEvents: RepEvent[]; speech: { t: number; text: string; kind: 'count' | 'hint'; dropped?: boolean }[];
    angles: { t: number; angle: number | null }[];
    frames: Blob;                                             // quantised LandmarkFrame stream (int16)
  };
};
// M7 — nutrition (all stored on device only)
type MacroSet = { kcal: number; proteinG: number; carbsG?: number; fatG?: number };
type Food = MacroSet & {
  id: string; name: string; nameTh?: string;
  source: 'usda' | 'thai-estimate' | 'custom' | 'openfoodfacts' | 'photo-local' | 'photo-ai';
  basis: { per100g: true } | { servingLabel: string; servingG?: number };
  portions?: { label: string; factor: number }[];   // e.g. Small 0.75 / Regular 1 / Large 1.4
  note?: string;
};
type Recipe = { id: string; name: string; ingredients: { foodId: string; grams: number }[]; servings: number };
type FoodEntry = MacroSet & {
  id: string; date: string /* local YYYY-MM-DD */; time: number;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'post-workout';
  label: string; ref?: { foodId?: string; recipeId?: string };
  amount: { servings: number } | { grams: number };
  estimate: boolean;                                 // quick estimates / photo guesses
  photoConfidence?: number;                          // M7b: top-1 confidence of the accepted guess
};
type WeighIn = { date: string; kg: number };
type NutritionSettings = {
  mode: 'quick' | 'full'; heightCm: number; birthYear: number; sex: 'male' | 'female';
  activity: 'sedentary' | 'light' | 'moderate' | 'very';
  surplusKcal: number; proteinGPerKg: number; fatPct: number;
  gainPctPerWeek: [min: number, max: number];
  overrides?: Partial<MacroSet>; barcodeLookup: boolean;
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

Accounts, cloud sync (Google Calendar sync parked for later, 2026-11-13), sharing, AI food photo recognition (M7b, later),
AI-generated programs, photoreal/medical 3D anatomy, multi-person
tracking, recording/saving video (the M4c developer log stores pose numbers only, never images),
Apple Watch / heart rate.
