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
| Concentration curls (`Concentration_Curls`) | `concentration-curl` | side, about 3/4 from the working arm's side, best side (none) | elbow | extended → contracted; lowering toward extended | > 145° / < 85° (retuned from 70 on the synthetic clips, PROGRESS Decision "M4f wave-1 retune from synthetic") | visibility only (the arm braced on the thigh rarely locks out, hence 145) |
| Incline dumbbell curl (`Incline_Dumbbell_Curl`) | `incline-curl` | side, best side (none) | elbow | extended → contracted; lowering toward extended | > 150° / < 70° | visibility only |
| Dumbbell shoulder press (`Dumbbell_Shoulder_Press`) | `db-shoulder-press` | front, both arms (none) | elbow, **image plane** (as the seated press) | contracted → extended; lowering toward contracted | > 143° / < 80° | extended gate: wrist above shoulder |
| Bent-over two-dumbbell row (`Bent_Over_Two-Dumbbell_Row`) | `bent-over-row` | side, best side (none) | elbow | extended → contracted; lowering toward extended | > 145° / < 90° | visibility only (a posture gate is the fallback if standing up between reps makes phantom reps) |
| Standing DB triceps extension (`Standing_Dumbbell_Triceps_Extension`) | `triceps-extension` | side, best side (none) | elbow | extended (overhead) → contracted (behind the head); lowering toward contracted | > 138° / < 95° (retuned from 150 / 80 on the synthetic clips, PROGRESS Decision "M4f wave-1 retune from synthetic") | extended gate: wrist above shoulder (lifting the dumbbell up from hanging arms isn't a rep); visibility gate 0.4, not 0.5 (the wrist behind the head reads 0.41–0.49 at the bottom) |

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
    plan (M4f-q2). **Superseded by M13b (2026-11-17):** right arm, then a Next arm tap, then left arm,
    both counted in one set.
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

**Local part first (scope added 2026-11-15, see PROGRESS Decision "M7b local part plan")**
- Steps 1–3 and 5 plus the `ml/` pipeline are built first. Step 4 (Claude backup) waits for the
  paid-key decision. Until then, low confidence shows the top 3 with nothing preselected, plus search.
- A dataset licence check comes before any training. A model may be **bundled** in the app
  (`public/food-vision/`, precached) only if every training set allows training and publishing the
  weights, and the model is ≤ 25 MB. Otherwise the import-from-Files rule above stands.
- Classifier labels map to `thai:*` dish ids in `src/food-vision/classMap.json` (one label may
  cover look-alike variants; the first is the default). `FoodEntry` gains
  `source?: 'photo-local' | 'photo-ai'`.
- Saved photos export as a zip: `<dishId>/<createdAt>.jpg` + `labels.csv`, which `ml/` reads. The
  held-out ≥ 100 personal photos are chosen by file hash and never used for training.

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

### M9 — Native iOS shell (specified 2026-11-15; planned, waiting on the M9-q answers)
Referenced by the 2026-11-13 music-ducking Decision and by M10 phase B. Wongsaton said yes to "Plan M9"
(2026-11-15); no code until he answers the M9-q questions (PROGRESS Blockers). Decision "M9 native shell
plan" (2026-11-15) holds the version/provisioning facts and the defaults.

**What it is:** a Capacitor iOS app for **his own iPhone only** (iPhone 17 Pro). It wraps the **same web
build** (bundled into the app, so it works offline from the first launch) and adds a few native pieces the
web can't do on iOS. It is not an App Store app.

#### Goals
1. **Same app, inside a shell.** Every screen, the camera + pose pipeline, Fuel, the coach and the data
   layer run unchanged in the WKWebView. No screen is rewritten in Swift.
2. **Voice ducks music** (the reason M9 exists): spoken cues lower his music (Spotify etc.) instead of
   pausing it, and play with the Silent switch on. AVAudioSession `.playback` + `.duckOthers`, active only
   while a cue is speaking, then released with `.notifyOthersOnDeactivation` so the music comes back up.
   The spike (plan task 6) decides the route: the app's audio session around the web `speechSynthesis`
   (keeps the persona voices), or a native `AVSpeechSynthesizer` plugin (voice list mapped).
3. **Screen stays on** for the whole session through the native idle timer (the web Wake Lock stays the
   PWA path).
4. **Haptics** (small): a light tap on Set done and Apply. Never the only signal (voice over screen).
5. **Moving data in:** Settings → **Back up** / **Restore** (one versioned JSON file through the share sheet
   / Files), in both the PWA and the app, because the app's IndexedDB is separate from Safari's.
6. **Ready for M10 phase B:** the `GymBrain` plugin (Apple Foundation Models) is built in M10 phase B, not
   here; M9 only proves a plugin round trip and shows a read-only "On-device AI: <status>" line in Settings.

**Later, not in M9 (each needs its own SPEC section first):** AirPods head motion
(`CMHeadphoneMotionManager`), local notifications, HealthKit / Apple Watch (still out of scope per §6;
reading Apple Health is proposed as M11, 2026-11-16), live-update services. **Changed 2026-11-17:** AirPods
head motion and the Apple Watch app are now M14 ("Wrist and ears").

#### What stays web
- The **PWA on GitHub Pages stays** the main, always-working app (unless M9-q6 says otherwise). Every
  native feature sits behind `isNative()` plus a plugin availability check, with the current web path as
  the fallback. The web build, `npm run check`, `npm run e2e` and the deploy must pass with no native code
  taken, and Capacitor code stays out of the web bundle's main chunk.
- All logic stays in `src/core/` (pure TS). Swift stays thin: it speaks, keeps the screen on, taps, and
  (later) answers a model call. No rules, thresholds or copy in Swift.

#### Privacy (same rules, nothing leaves the phone)
- Same hard rules as CLAUDE.md: video and inference stay on the device, no recording, no analytics.
- The app makes **no network request** of its own: bundled web build (no `server.url`), no remote config,
  no crash reporting, no push, no extra network entitlements. Capacitor CLI telemetry is turned off
  (`npx cap telemetry off`). The opt-in Open Food Facts lookup (M7) and phase C (M10) behave exactly as in
  the PWA, off by default.
- Apple's Foundation Models (M10 phase B) runs on the device; the plugin never calls a server model.
- Info.plist usage strings say plainly what each permission is for (camera: "Counts your reps on this
  phone. Video never leaves it."). Only the permissions a shipped feature needs.
- **Signing stays his:** Apple ID, team ID, bundle id and certificates live in a gitignored local Xcode
  config; the repo has a `.example` file only. The repo is public.
- Backup files hold his data: created only when he taps Back up, never committed, no API key inside.

#### Accept
- Web unchanged: `npm run check`, `npm run e2e`, `npm run build` pass; the web `dist/` keeps its service
  worker and file list; a test asserts the main chunk has no Capacitor plugin code.
- Native build: `npm run build:native` (base `/`, no service worker), `npx cap sync ios` and an
  `xcodebuild` simulator build succeed; the simulator launches to Today with no console errors (screenshot).
- Unit tests (tests first) for the native adapters with fake plugins: voice queue semantics unchanged
  (kinds, never cancels a cue mid-set), fallback to the web path on any plugin error, keep-awake on/off with
  the session, backup round trip (every table, newer schema rejected, no API key).
- An e2e with a fake `window.Capacitor` shows cues routed to the native speaker and the screen kept awake.
- On his iPhone (🧍, checklist in `docs/ios-setup.md`): launches in airplane mode; the camera counts a curl
  set; Spotify ducks under "Ten seconds" and comes back, with Silent on; the screen stays on through a 3-min
  rest; a PWA backup restores in the app; Safari Web Inspector shows no network request during a session.
- 🧍 **Checkpoint G:** a week of gym sessions in the native app with music playing. He reports ducking,
  screen-on, camera and anything that differs from the PWA.

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
| **Go easy on a body area** (arms, shoulders, chest, back, legs, core; joint words map to areas as data) | For each of today's exercises: an exercise whose **primary** muscles are in the area is **swapped** only for a catalog candidate that shares one of its **primary** muscles outside the area and doesn't load the area at all, otherwise **removed** (with today's catalog — one primary muscle per exercise — this means removed; Decision 2026-11-15). An exercise with the area only in **secondary** muscles is **lightened** (default; see M10-q2). | today |
| **Lighter today** | Every exercise: −1 set (minimum 2), weight −10% snapped **down** to the unit step; bodyweight: the rep target −20%. | today |
| **Deload week** | 7 days from today: sets halved (rounded up), weight −10%. | dated overrides |
| **Swap an exercise** | The top 3 catalog candidates: same primary muscle group, equipment he has (per-exercise kit needs vs his gym profile, see M10e), not already in the day. Today only or from now on. | today or plan |
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
**Changed 2026-11-18 by M12 "Claude brain (slice 3)":** the key lives in the iPhone Keychain (not
IndexedDB), the request is sent from a native plugin (not the browser; the CSP doesn't change), the PWA has
no Claude, the default model is a cheaper tier than `claude-opus-5-5` (M12-s3-q3), and the eval runs on the
phone. The rest of this section stands.
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
**Changed by M12 (approved 2026-11-16):** (1) the coach may propose a **focus block** (a dated plan for
2–6 weeks) — built deterministically by the app from rules as data; a brain only picks the parameters and
explains, never free-writes workouts; Apply/Undo as any proposal. (2) **Speech recognition in the app is in
scope** for M12 slice 2: iPhone app only, on-device only, English, hold-to-talk; never in the PWA, never
always-listening, audio never stored or sent. (3) **Reminders** are in scope for M12 slice 2 as local
notifications only, off by default (trainer kit item 6); server push stays out. The other non-goals stand.

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
  Extended by M10e: Legs B runs at the gym with the leg-press swap.

#### Follow-up: equipment-aware swaps (M10e, added 2026-11-15)
Wongsaton: his gym has no leg press, but Legs B has Leg Press. "That's why I want the coach to help me."
"Yes, build it." His equipment is the PROGRESS Decision "Gym equipment (M10-q6)". Open details: M10e-q1…q9.
- **Gym profile:** a list of equipment ids stored on the phone (settings key `'gym'`), defaulting to his
  gym: dumbbells 5–75 lb, kettlebell, adjustable bench, cable tower (lat pulldown, low row, adjustable
  pulleys), single D-handle, lat bar, leg extension / leg curl, smith machine, half rack + barbell + plates,
  plyo box. Not in it: leg press, chest press, pec deck, calf machine, rope (and the unconfirmed pull-up
  bar). Editable later in Settings → **My gym** (a checklist; can follow).
- **Kit needs are data:** each catalog exercise lists the kit it needs (any one of several lists), finer
  than free-exercise-db's `equipment` field ("machine" can't tell a leg press from a smith machine). Swap
  candidates ("Swap an exercise" and "Go easy on…") only use exercises the profile can do. A short data
  list of closest replacements per exercise ranks first (Leg Press → smith squat, barbell squat, split squat).
- **The coach asks, it never changes the plan by itself:** when a day has an exercise the gym can't do,
  Today and the preview show "Your gym has no kit for <exercise>." with **See a swap** / **Keep it**.
  See a swap opens the coach with the swap Proposal (scope plan by default, plus Just today), applied only
  on Apply, with Undo and a Plan changes line like any swap. Keep it isn't asked again until the profile
  changes. Typing "my gym has no leg press" reaches the same proposal. Nothing is offered unprompted
  mid-workout.
- **Swap pool:** extra free-exercise-db exercises (Unlicense; ids checked upstream) as replacements:
  smith machine squat, barbell squat, smith machine calf raise (and a split squat if the vendored one
  isn't rear-foot-elevated). They're manual and show the "Info" badge (no 3D demo).
- **Single handle:** face pull and pushdown cues and how-to are written for the single D-handle. Rope-only
  exercises are never suggested.
- **Data model:** `GymProfile = { equipment: string[]; kept: string[]; updatedAt: number }`;
  `src/data/equipment.json` = `{ items: { id, label, group }[]; defaultProfile: string[] }`;
  `src/data/exerciseKit.json` = `Record<exerciseId, { needs: string[][]; replaceWith?: string[] }>`. No
  new Proposal action and no Dexie version bump.
- **Accept:**
  - Unit tests, written first: every catalog exercise has kit needs with known ids; with the default
    profile Leg Press (and the other listed machine/rope moves) is not doable and every other program
    exercise is; Leg Press's top candidates follow the replacement list; a profile change reorders them;
    no candidate needs kit the profile lacks (avoid-area included); missing-kit detection on Legs B, after
    a swap, for a kept exercise and on a rest day; Apply → Undo restores Leg Press; profile storage round
    trip; all coach copy passes `checkCopy`; the intent eval stays ≥ 90%.
  - Every program exercise still has ≥ 1 swap candidate with the default profile.
  - E2E (390×844): Legs B shows the prompt and still lists Leg Press before any tap → See a swap → Apply →
    the preview shows the replacement with "Info" → reload keeps it → Undo restores Leg Press; Keep it hides
    the prompt after reload; buttons ≥ 56px; no off-device request.
  - 390×844 screenshots of the prompt, the proposal and the applied preview.

### M11 — Health data: Apple Health + WHOOP (APPROVED 2026-11-16: route A, read-only, defaults; built on `m11-build`)
Wongsaton (2026-11-16): "Can you get my information from Apple Health? … take that information to help me
improve my body by coach" and "I wear Whoop everyday. It might be good if you can sync the app, apple health,
and whoop together to share my health data to improve my health."

**Status: a proposal.** It changes §6 (which keeps "Apple Watch / heart rate" out of scope) and M9's "Later:
HealthKit" line. Nothing here is built until he approves it (M11-q1) and answers the other M11-q questions
(PROGRESS Blockers), or says "go with the defaults". The facts behind it are in the PROGRESS Decision "M11
health data plan" (2026-11-16); several are marked NOT VERIFIED and get checked first (plan task 1).

**Native app only.** HealthKit has no web API, so M11 lives in the M9 Capacitor app (branch `m9-native` until
it merges). The PWA is unchanged: Settings → Health says "Health data works in the iPhone app." Every health
path sits behind `isNative()` + a plugin check, like M9.

#### Goals
1. **Read, don't write (default).** The app reads a small, listed set of Apple Health types after he says yes
   to each one in iOS's Health permission sheet. It never writes to Health unless M11-q5 says so.
2. **One route for WHOOP (default, route A):** WHOOP → Apple Health → Gym Clean. The WHOOP app already shares
   its data into Apple Health on his phone; Gym Clean reads it from there. **No network, no account, no
   server.** Route B (the WHOOP Developer API, network) is only planned if he picks it (M11-q2).
3. **The coach uses the data in coaching words only** (below). Every suggestion is a card he can dismiss; it
   goes through the existing M10 `propose*` functions, so nothing changes until he taps **Apply**, and Undo
   works as for any proposal.
4. **He controls each type:** Settings → **Health** lists every type with its own switch and a one-line
   explainer of what the coach does with it. Turning one off stops reading it and deletes what the app kept
   of it.

#### Data read (read-only; default list, M11-q4)
| Apple Health type | Typical source on his phone | Used for |
|---|---|---|
| Body mass (`bodyMass`) | a scale app, manual Health entry, WHOOP if he types it there | weigh-in auto-fill |
| Workouts (`HKWorkout`: type, start, duration, active energy, average HR if present) from **other apps** | WHOOP activities, other apps | outside workouts in the weekly load |
| Active energy (`activeEnergyBurned`), daily total | WHOOP, iPhone | weekly load; M7 activity-level check |
| Sleep (`sleepAnalysis`: asleep stages summed per night) | WHOOP | "Lighter today?" |
| Resting heart rate (`restingHeartRate`) | WHOOP | "Lighter today?" |
| Heart rate variability (`heartRateVariabilitySDNN`) | WHOOP | "Lighter today?" (compared only with his own baseline from the same source) |

- Not read: live heart rate during sets, steps, SpO₂, temperature, respiratory rate, blood pressure, glucose,
  cycle tracking, clinical records, anything else. Adding a type needs a SPEC edit.
- **WHOOP recovery and strain are not Apple Health types**, so route A never sees them. With route A the coach
  uses sleep, HRV and resting HR (the inputs WHOOP itself leans on) plus active energy and workouts. Recovery %
  and day strain are only available with route B.
- Reads happen when the app opens or comes to the foreground (and on "Read now" in Settings): the last 35
  days on first connect, then since the last read. No background delivery. Health data is only readable while
  the phone is unlocked; a locked read is skipped quietly.

#### How the coach uses each signal (pure logic in `src/core/health/`, tests first)
- **Personal baselines, never population norms.** Each signal is compared with his own rolling median over the
  last 28 days (from the same source), and needs ≥ 7 days of data before it's used. No absolute "good/bad"
  thresholds, no scores of his health. Thresholds are data (`src/core/health/rules.ts`), not code branches.
- **Weigh-in auto-fill (M7), Health wins (changed 2026-11-16: "use data from Health because it syncs from my
  weight scale app"):** when Weight is on, each local date's pick is the earliest body-mass sample before 12:00,
  or, if that date has none before noon, the earliest sample that day (a scale app may sync later); kg rounded
  like a typed weigh-in. The pick becomes that date's weigh-in (source `health`) and **replaces a typed
  weigh-in** for that date. A later read updates the imported value when Health's pick for that date changed
  (e.g. a morning sample arrived late). A weigh-in he types on a date Health already filled stays until the next
  read brings a Health value for that date. Deleting an imported weigh-in in Fuel keeps that date as he left it
  (never re-imported). The first read after this change re-reads the full 35 days once, so recent Health
  weights replace older typed ones. The M7 weekly check uses them like typed ones; nothing else in M7 changes.
- **Outside workouts → weekly load:** Today's week strip and the coach context show "This week: 3 gym
  sessions, 2 other workouts (run 40 min, football 90 min)". Gym Clean's own sessions are never counted twice
  (workouts written by Gym Clean, if M11-q5 ever turns writing on, are skipped by source).
- **Active energy → activity level (M7, M11-q8):** at the weekly check, if his 14-day average active energy
  fits a different M7 activity level than the one set, the card adds "Health shows more activity than
  'light'. Switch to 'moderate'?" with Switch / Keep. Never applied by itself.
- **"Lighter today?" (the main use):** on a training day, before Start, the app counts today's signals:
  - sleep last night ≥ 60 min under his baseline;
  - HRV this morning ≥ 15% under his baseline;
  - resting HR this morning ≥ 5 bpm over his baseline;
  - a long or hard outside workout in the last 24 h (≥ 60 min, or active energy ≥ 1.5 × his median workout);
  - (route B only) WHOOP recovery in WHOOP's lowest band.
  With **2 or more**, Today shows one card: "Lighter today?" + the reasons as facts in plain words ("Sleep was
  about 1 h 20 m shorter than usual. Resting heart rate is higher than usual.") and three buttons (≥ 56px):
  **Lighter today** (opens the M10 Lighter Proposal → Apply / Undo), **Not today** (the M10 postpone
  Proposal), **Train as planned** (hides it for today). It is shown once per day, never during a workout,
  never spoken (he's holding the phone on Today, M10 rule 5), and never auto-applied. With 1 signal it says
  nothing.
- **Deload nudge:** if the card's 2-signal rule fired on ≥ 3 of the last 7 days, the next card offers
  **Deload week** (M10 action) instead of Lighter today, at most once per 14 days.
- **Copy:** coaching words only. Reasons state what changed versus his usual ("shorter than usual"), never what
  it means for his health. Banned on top of M10 `checkCopy`: sick, ill, illness, infection, overtraining,
  fatigue syndrome, stress (as a health state), recovery debt, risk, warning, unhealthy, abnormal. No promises
  ("you'll recover faster"). The M10 discomfort/red-flag rules are unchanged.
- **M10 brains:** phase B (on-device) may receive the computed card reasons only (no raw samples). Phase C
  (Claude) receives nothing from Health (M11-q7).

#### What stays out
Writing to Health (unless M11-q5), Apple Watch app, live HR during sets, background refresh, notifications,
any health score, diagnosis or medical wording, raw samples in the dev log, sending Health data anywhere
(route A), and the PWA.

#### Privacy
- Route A: **no network request** — the M9 rule holds. Health data goes HealthKit → plugin → the app's
  IndexedDB only. The app stores per-day summaries (`healthDays`), not raw samples; they are excluded from Back
  up files by default (M11-q7) and from the dev log; turning a type off deletes its stored values.
- Info.plist gets `NSHealthShareUsageDescription`: "Reads sleep, heart rate, workouts and weight so the coach
  can suggest a lighter day. Stays on this phone." `NSHealthUpdateUsageDescription` only if M11-q5 turns
  writing on. The HealthKit entitlement has no team id in it (the repo is public).
- The repo is public: fixtures and tests use made-up numbers only.
- Route B (only if chosen) changes this: WHOOP's cloud sends his data to the phone over the network; the
  explainer says so before he connects; CSP `connect-src` gains the WHOOP API host; tokens stay only on the
  phone; any server in the middle must be his and is planned separately.

#### Data model (adds to §4; final shape in `src/core/types.ts`)
```ts
type HealthType = 'bodyMass' | 'workouts' | 'activeEnergy' | 'sleep' | 'restingHr' | 'hrv';
type HealthSettings = { enabled: Record<HealthType, boolean>; lastReadAt?: number; route: 'apple' | 'whoop-api' };
type HealthWorkout = { start: number; minutes: number; kind: string; kcal?: number; avgHr?: number; source: string };
type HealthDay = {                        // one row per local date, derived, never raw samples
  date: string; sleepMin?: number; restingHr?: number; hrvMs?: number; hrvSource?: string;
  activeKcal?: number; workouts?: HealthWorkout[]; whoopRecoveryPct?: number /* route B */;
};
type ReadinessSignal = 'sleepShort' | 'hrvLow' | 'restingHrHigh' | 'hardOutsideWorkout' | 'whoopLow';
type ReadinessCard = { date: string; signals: ReadinessSignal[]; reasons: string[]; offer: 'lighter' | 'deload' };
// WeighIn gains: source?: 'manual' | 'health'
```

#### Accept
- Unit tests (tests first, fixtures with made-up numbers in `src/core/health/fixtures/`): baseline (median,
  < 7 days → no signal, source mix kept apart), each signal on/off at its edges, the 2-signal rule, the deload
  nudge and its 14-day spacing, once-per-day, sleep across midnight and DST, weigh-in pick (earliest before
  12:00, else earliest that day; Health replaces typed; deleted stays deleted), workout de-duplication, the activity-level check, and every reason
  string passing `checkCopy` + the M11 banned list.
- The plugin's TS side with a fake bridge: permission denied / partial / not available / locked phone all end
  in "no data", never an error screen. XCTest for the Swift mapping (units: kg, bpm, ms, kcal, minutes).
- E2E (390×844) with a fake `window.Capacitor` health plugin: connect → per-type switches → seeded data →
  Today shows "Lighter today?" with two reasons → Lighter today → the M10 proposal → Apply → Undo; a weigh-in
  appears in Fuel; Settings off → card gone, data deleted; no network request. The PWA shows the "iPhone app"
  line and makes no HealthKit call.
- 390×844 screenshots: Settings → Health, the card, Fuel with an imported weigh-in.
- 🧍 On his iPhone: the Health permission sheet shows only the listed types; WHOOP's data appears; Safari Web
  Inspector shows no network request.
- 🧍 **Checkpoint H:** a week with Health connected. He reports whether the card showed on the right days,
  whether the reasons matched how he felt, and any weigh-in that came in wrong.

### M12 — Coach tab: chat, focus blocks, calendar, motion (approved 2026-11-16)
Wongsaton: "Redesign the coach; move it to the middle of the tab. I need it interactive with me, can talk
everything on it like a chat with my personal trainer. Also, add animation to the app to make it best UX."
Later the same day: "…this month I need to build my chest, he will help me write a plan for each day" and
"Add the feature for the calendar to the app as well. I need the coach to follow my plan, help me prove I
finished the plan he made for each exercise, each day, week, month."
Approved design: `docs/superpowers/specs/2026-11-16-coach-tab-chat-design.md` (the source for detail; this
section is the contract). Answers: brain = both, **Apple's on-device model first, Claude optional**; input =
**typing + hold-to-talk mic**; language = **English** (Thai not supported in v1); start slice 1 now, alongside
his Checkpoint H week (his call, 2026-11-16). M12 also builds M10 phase B (slice 2) and phase C (slice 3);
the M10 phase B/C sections above stay the contract for those brains, with the changes listed here.

#### Goals
1. **Coach is the centre tab.** The tab bar becomes **Today · Fuel · Coach · Calendar · Settings**. The Coach
   tab is visually distinct (raised/filled centre button) and keeps the tab rules (≥ 56px, visible label,
   active state not by colour alone). The tab bar stays hidden during a set and on the camera (M1b rule).
2. **A chat screen** (the Coach tab): message bubbles (his on the right, coach on the left, text ≥ 20px), a
   text box, Send, quick-action chips above the input (the M10 chips stay as shortcuts), inline Proposal
   cards (before → after, why, Apply / Not now, then Undo — the M10 path), inline food and focus-block
   cards, a typing indicator, and starter chips on an empty thread ("How's my week?", "Swap today's squat",
   "What should I eat tonight?", "Go easy on shoulders"). The mic button arrives in slice 2.
3. **One home for the coach.** Today's Coach button, the day preview's Coach button, the "Lighter today?"
   card, the M10e missing-kit prompt and Summary's stall card open the **Coach tab** with their chip already
   sent. The Pause sheet (between sets) keeps a **compact sheet version of the same chat component** on the
   same thread; nothing new is reachable mid-set.
4. **Chat history** is kept on the phone (Dexie `chatMessages`), the last 30 days, with **Clear chat**. Not in
   backups, not in the dev log (the dev log keeps ids and numbers only, as M10). Resolves M10-q12 as "keep".
   A proposal in the thread keeps its live Apply only while the plan hasn't changed since (M10
   `baseVersion`); an old one shows its outcome (applied / not now / undone / expired + "Ask again").
5. **Brains, in order:** chips → rules directly; free text → Apple Foundation Models in the iPhone app when
   available (slice 2) → Claude if he turned it on (slice 3) → the rule matcher. A model error falls back to
   the next brain with a one-line note, never a dead end. Settings shows which brain answers and why.
   **Slice 1 has only the rule brain**, behind the same router so slices 2/3 plug in.
6. **Focus block: the coach writes a plan (reverses the §6 / M10 non-goal, deterministic only).** He says
   e.g. "This month I want to build my chest." The coach asks only what's missing (focus group, 2–6 weeks,
   training weekdays) and proposes a **focus block**: every day for the next N weeks.
   - **The app builds the block deterministically** (pure core, tests first) from his current plan, his gym
     kit (M10e `canDo`), the vendored exercise list and rules as data: the focus group gets about +30–50%
     weekly sets and appears on ≥ 2 days a week; other groups stay at their current (maintenance) sets; the
     last week is a lighter week; set/rep ranges and exercise picks follow the existing program's style.
     A brain (rules, Apple or Claude) only picks the parameters and explains; it never free-writes workouts.
   - Shown in the chat as a **week-by-week card** (expand a week → days → exercises). Edits ("swap
     Thursday's flyes", "only 4 days a week") give a revised block. **Apply** replaces the plan for those
     dates (dated, like overrides); **Undo** and Settings → Plan changes restore the previous plan; after the
     block's last date the calendar returns to his normal rotation (the recap offers "Keep going", which is a
     new block proposal).
   - Works with the rule brain (chips: Build a focus block → focus group → weeks → days), so it's in slice 1.
7. **Calendar replaces History** (the tab is renamed; the per-exercise history stays one tap deeper).
   - A **month grid**: each day shows planned vs done (done = filled ring; partly = a partial ring by sets
     done / sets planned; missed = hollow ring; rest = dim; focus-block days marked; today outlined). Never
     colour alone: each state also has a shape and an accessible label.
   - Tap a day → that day's plan with **each exercise done / partly / missed** (sets and reps done vs
     planned, from logged sessions) and actions: Start (today), **Move** (today or a later planned day) and
     **Do it today** (a missed day), each opening the coach with the matching M10 proposal.
   - **Week and month scores:** "This week: 4 of 5 sessions, 92% of planned sets"; the month the same, plus,
     during a focus block, the focus group's weekly sets vs the block's target. Streaks keep working.
   - Completion is **computed** (pure core, tests first) from the plan + blocks + overrides + logged
     sessions; no manual check-off (logging sets is the proof). A session on a rest date (**Train anyway**)
     counts as **extra**: shown, never in the denominator.
   - **Share month:** an image made on the phone (the month grid + scores, no body data, no weights, no
     Health data) that he saves or shares himself through the system share sheet / a download. The app
     uploads nothing.
8. **The coach follows the plan.** It reads the scores (rule answers for "How's my week?" and "How am I
   doing?"; a read-only `progressSummary` tool for the model brains in slices 2/3), mentions a **missed day
   once** on Today with an offer to move it, and at the end of a week and of a focus block posts a short
   **recap** in the chat.
9. **Motion across the app** (transform/opacity only; never slows a tap or hides state):
   - tokens `--dur-fast 120ms`, `--dur-base 220ms`, `--dur-slow 320ms`, one standard ease, one spring-ish ease;
   - tab switches: a short cross-fade + 8px slide in the direction of travel; the tab indicator slides;
   - sheets slide up with a backdrop fade (drag-to-dismiss only where a sheet already has it);
   - chat bubbles rise + fade in; typing-indicator dots; (slice 2) the mic pulses with a live level ring;
   - buttons/chips: press scale 0.97 + highlight; Apply → a check morph; the Undo toast slides up;
   - Today: cards stagger in on first load; streak/kcal numbers count up briefly; the readiness card slides
     in; Set done → a quick ring fill;
   - **no new motion on the Exercise/camera screen during a set**; the rep counter number is unchanged;
   - everything is **off under `prefers-reduced-motion: reduce`** (instant swaps, numbers shown final).

#### Slices
1. **Slice 1 (web + iPhone app, rule brain only):** Coach tab + chat screen + history, chips + rules, inline
   Proposals, focus blocks, Calendar + completion + scores + share month, missed-day prompt + recaps, motion.
   New rule answers: "How's my week?" (this week's sessions and planned sets from the calendar; gym sessions
   only, see Decision "M12 plan"), "How am I doing?" (week + month scores, streak, focus-block progress), and
   "What should I eat (tonight)?" in free text (the M7/M10 food suggestion from today's Fuel targets).
1c. **Slice 1c "What's New + To-dos" (web + iPhone app, no network; right after slice 1, before slice 1b;
   approved 2026-11-16):** a What's New tour once per release, step-by-step to-do guides for his open
   checkpoints and decisions, one in-app Copy report, and the app version + his copyright credit in
   Settings → About. Details in "What's New tour + To-do guides" below.
1b. **Slice 1b "Trainer kit" (web + iPhone app, rule brain only; after slice 1, before slice 2):** the gaps
   versus a human personal trainer that he picked (2026-11-16, all 12), items 1–5 and 7–12 below. Item 6
   (reminders + weekly check-in) needs native notifications and is in slice 2.
2. **Slice 2 (iPhone app):** the Apple brain (M10 phase B: `GymBrain` plugin, tools 1:1 with actions, plus
   read-only `weekSummary` / `progressSummary` / `exerciseInfo` / `foodIdeas` and `proposeFocusBlock`
   (parameters only)), the **hold-to-talk mic** (below), and **reminders + weekly check-in** (trainer kit
   item 6, below). Release 1.14.0 (1b is 1.13.0). Apple Intelligence is on and downloaded on his iPhone
   (2026-11-17), so Checkpoint J tests the real model; when it is unavailable on a phone (off, still
   downloading, not eligible) free text goes to the rules and the chat says so **once per reason**, plainly,
   with how to turn it on.
3. **Slice 3:** the Claude brain (M10 phase C). His "both" counts as the yes to build it (M10-q7);
   nothing calls Anthropic until he pastes his own key in Settings. Planned 2026-11-18 (his "plan Claude
   next"); details in "Claude brain (slice 3)" below, which changes the default model, where the key lives
   and how the request is sent.

#### What's New tour + To-do guides (slice 1c)
Wongsaton (2026-11-16): "Plan to add everything in the list to the app such as wizard that I need to do step
by step on the app to finish each topic" · "Go with A, copy report but keep it in the app since I export it
one time. I need it guide me as wizard same as when the other app publishes the new version." · "Yes, add it
to the plan". Source: design doc section "Slice 1c". Planner calls are in Decision "M12 slice 1c" and can be
corrected.

**Goals**
1. **What's New tour.** After an app update (a new **release key**, see below) the app opens once with a
   full-screen tour: one page per change (what changed + why, ≤ 2 short sentences each), a **Try it** button
   per page that closes the tour and deep-links to the feature, **Skip** always visible, Back / Next buttons
   ≥ 56px (swipe is a shortcut, never the only way), a page indicator that isn't colour alone. The last page
   is **"Added to your to-dos"** listing the topics new in this release, with **Open to-dos**. The tour shows
   only on app open on Today, never during a workout or on the camera. Replay any time from **Settings →
   What's new**. Pages are data per release; a release with no pages shows nothing.
   - **Version = release key:** `package.json` `version`, read at build time and exposed as
     `__APP_RELEASE__` (e.g. `1.12.0`), plus `__APP_BUILD__` = the short git sha. Shown as **"Version 1.12.0
     (build abc1234)"**. The tour's key is the semver part only (the build sha changes on every build). The
     dev-log `__APP_VERSION__` (sha + build time) is unchanged. The last version whose tour he finished or
     skipped is stored in `settings` key `'whatsNew'`.
   - **Version policy (planner call, correctable):** MAJOR stays `1` (the app is live); **MINOR +1 for each
     shipped milestone slice** (M12 slice 1 + 1c ship as `1.12.0`; the next shipped slice is `1.13.0`, and
     so on, whatever its milestone number); **PATCH +1 for a fix-only deploy** (no tour pages). Main bumps it
     in the merge commit; a version with tour pages must be a new MINOR.
   - The tour's **first page** shows "Version 1.12.0 (build abc1234)" under its title.
   - **Fresh install** (no sessions and no `'whatsNew'` row): the tour is marked seen without showing (nothing
     "changed" for a new install); the to-do list is still in Settings.
   - Several unseen releases → one tour with every unseen release's pages, newest first.
2. **To-do guides.** A **Today card** ("To-dos: 6 of 12 done", ≥ 56px, below the Start card so it never
   pushes Start down; hidden during a workout) → the **To-do list** (each topic: title, which checkpoint, done
   / n of m steps; native-only topics labelled "In the iPhone app" in the PWA and left out of its count) →
   each topic is a **step-by-step guide** (one step per screen, Back / Next, "Step 2 of 5", **Skip this
   topic**). The card hides when every topic for this platform is done or skipped; Settings → To-dos always
   opens the list.
   - **Auto steps:** the app ticks them from its own data (e.g. model imported, Health connected, N sessions
     logged, N days with photo meals, days left before the 7-day re-sign). Each is a **pure detector**
     (`src/core/todo/`) of a counts-only `TodoFacts` snapshot. Once ticked, the tick is stored with its time
     and stays ticked. An unticked auto step shows what's missing ("2 of 3 sessions") and its **Try it** link.
   - **Ask steps:** a question with tap answers (single or multi) + an optional note (≤ 500 characters).
     Changeable until copied; after copying, a change is a new answer (reported next time).
   - **Decision steps** are ask steps whose answer **sets a setting directly** (data maps option → setting).
     The Claude **key** is never asked for in a to-do or a report; the decision step only records whether he
     wants Claude, and the key gets its own Settings screen in slice 3.
   - A topic is **done** when every auto step is ticked and every ask step is answered, or when skipped
     (reported as skipped). **Recurring** topics (the 7-day re-sign) are done while their condition holds.
   - Topics, steps, options and pages are **data**; a future release adds to-dos and pages without new
     screens.
3. **One report.** Answers are kept in the app (IndexedDB table `todoAnswers`, backed up like settings). At
   the bottom of the to-do list, **Copy report** builds **one plain text** with every answer and auto tick
   since the last copy (grouped by topic, checkpoint name, date, app release, PWA or iPhone app), shows a
   **preview** first, then copies it with the system clipboard (fallback: a selectable text box) and marks
   those answers as sent. With nothing new it offers "Copy all again". **The app sends nothing**; he pastes
   it where he wants.
   - The report **never contains**: Health values (auto steps report counts / yes-no only, e.g. "Health
     data on 7 of 7 days"), photos or photo data, API keys or key-like strings (a note containing one has it
     replaced by "[key removed]"), chat message text, food or body numbers from the app's data. His own
     notes and taps are included as he typed them.

4. **About + credit.** A small **About** section at the bottom of Settings: "Gym Clean", "Version 1.12.0
   (build abc1234)", and the credit line **"© 2026 Wongsaton Kampusan"** (his request: "don't forget to put
   version number and my name as copyright credit"). Text ≥ 20px except the label-size rules already allowed
   (M4e `--fs-label`); no links, nothing sent. The copy report header includes the version and build, **not**
   his name.

**Initial topics (release 1.12.0, his current to-do list; exact copy is data, checked by `checkCopy`)**

| # | Topic (checkpoint) | Where | Auto steps | Ask steps |
|---|---|---|---|---|
| 1 | Coach tab + Calendar (🧍 Checkpoint I) | both | asked the coach ≥ 1 question; ≥ 1 proposal applied or undone; Calendar opened after a training day | what felt off (note); motion: just right / too much / too little; M12-q2 old Calendar days: keep as now / show what was planned then; M12-q3 focus-block size: right / too much / too little / didn't try; "How's my week?" gym-only OK / add outside workouts |
| 2 | Apple Health week (🧍 Checkpoint H) | iPhone | Health connected; Health data on 7 of the last 7 days | card on the right days (yes / mostly / no); reasons matched how you felt; any wrong weigh-in (no / yes + note); which types WHOOP writes (multi: weight, workouts, active calories, sleep, resting HR, HRV; M11 task 2) |
| 3 | iPhone app week (🧍 Checkpoint G) | iPhone | running in the iPhone app; 3 gym sessions logged in it | voice ducked the music; screen stayed on; camera OK; anything different from the web app (note) |
| 4 | Coach at the gym (🧍 Checkpoint E, extended) | both | ≥ 2 coach changes applied (Not today / Go easy / a swap); a Legs B session with the leg-press swap logged | weight you used on the replacement (note); the gym prompt felt right; coach answers helpful |
| 5 | Hands-free sets (🧍 Checkpoint B3) | both | a session with hands-free on (signal chosen by core-engineer; an ask step if no reliable one) | wrong auto starts (0 / 1–2 / 3+); wrong auto stops; 6 s still stop (right / too quick / too slow); 5 s Undo; push-up hold + tap felt right; dev log exported (yes / not yet; Try it → Settings) |
| 6 | Camera counting, form cues, learning exercises (🧍 Checkpoints C + F1) | both | one full camera session (≥ 6 camera-counted sets); camera sets on ≥ 3 learning exercises | counts right (all / off by 1–2 / often wrong + which); cues helpful; which learning exercises miscounted (multi, from data); OK to commit landmark JSON of the sets you OK (M4f-q8) |
| 7 | Food photos (🧍 Checkpoint D) | both | food model imported; meals logged from a photo on 7 days | top guess right (mostly / half / rarely); fast enough; anything it never gets (note) |
| 8 | VeSync types check | iPhone | — | in Health → Body Measurements, does VeSync write Body Fat % and Lean Body Mass? (both / body fat only / neither / not sure) |
| 9 | Decision: Apple's coach and the Health card (M12-q1) | both | — | Apple's on-device coach may read the card's reason sentences, never numbers, never Claude: yes (default) / no → sets `coach.appleCardReasons` |
| 10 | Decision: trainer-kit defaults (M12-q4) | both | — | keep the defaults / change something (note) → sets `trainerKit` (defaults confirmed or left for the planner) |
| 11 | Decision: Claude brain + your key | both | — | want Claude later: yes, I'll add my key in Settings / not now / no → sets `coach.claudeWanted`; the key itself only on its own screen (slice 3) |
| 12 | 7-day re-sign (recurring; M9-q1) | iPhone | ≥ 3 days left on this install (free Apple ID) | keep the free weekly re-sign / switch to the paid account → `signing` setting; "paid" stops the reminder |

The re-sign detector counts days since the app first saw the current build id (stored on first launch of
each build); the Today card shows "Re-sign in N days" when ≤ 2 days are left.

**Privacy:** no network request (clipboard only, on his tap); no answers, notes or report text in the dev
log; `todoAnswers` is in backups (his own words, no Health values); the report rules above are unit-tested.

**Data model (adds to §4; final shape in `src/core/types.ts`)**
```ts
type AppRoute = 'today' | 'fuel' | 'coach' | 'calendar' | 'settings' | 'settings/health' | 'settings/myGym'
  | 'settings/foodPhotos' | 'settings/devlog' | 'todos';               // deep links for Try it (as data)
type TodoPlatform = 'any' | 'native';                                  // native = iPhone app only
type TodoDetectorId = 'chatAsked' | 'proposalOutcome' | 'calendarAfterSession' | 'healthConnected'
  | 'healthDays' | 'nativeApp' | 'nativeSessions' | 'coachChanges' | 'legSwapSession' | 'handsFreeSession'
  | 'cameraSession' | 'learningCamera' | 'foodModel' | 'photoMealDays' | 'resignDaysLeft';
type TodoOption = { id: string; label: string };
type TodoStep = { id: string; title: string; why?: string; tryIt?: AppRoute } & (
  | { kind: 'auto'; detector: TodoDetectorId; params?: Record<string, number> }
  | { kind: 'ask'; options: TodoOption[]; multi?: boolean; note?: 'optional' | 'none';
      setting?: { key: string; path: string; values: Record<string, unknown> } }); // decision steps
type TodoTopic = { id: string; title: string; checkpoint?: string; since: string /* release */;
  platform: TodoPlatform; recurring?: boolean; steps: TodoStep[] };
type TodoAnswer = { id: string; topicId: string; stepId: string; kind: 'ask' | 'auto' | 'skip';
  optionIds?: string[]; note?: string; at: number; release: string; sentAt?: number };
type TodoFacts = { platform: 'web' | 'native'; now: number; counts: Record<string, number>;
  flags: Record<string, boolean>; buildFirstSeenAt?: number };        // counts/flags only, never values
type DetectorResult = { done: boolean; have?: number; need?: number };
type WhatsNewPage = { release: string; id: string; title: string; what: string; why: string;
  tryIt?: AppRoute; icon?: string };
// settings rows: 'whatsNew' = { seenRelease?: string; builds?: Record<string, number> /* id → first seen */ }
//                'todos' = { lastCopiedAt?: number }   'todoSignals' = { calendarAfterSessionAt?: number }
// Dexie v9: todoAnswers: 'id, topicId, at, sentAt' (backed up)
```

#### Trainer kit (slice 1b; item 6 in slice 2)
Research basis in the design doc (NASM OPT, ACSM 2026 resistance-training summary, app reviews). Every
number below is a default held as data and tuned at a checkpoint. Every change to the plan is a Proposal
(Apply / Undo); all copy passes `checkCopy` (no medical words, no promises).
1. **Effort after each set:** optional one tap **Easy / Good / Hard** (≈ 3+ / 2 / 0–1 reps left) on the rest
   screen; never blocks the flow, never asked mid-set; stored on the set log. The M5b next-set / next-session
   weight uses it (Easy → step up sooner, Hard → hold). (Effort by voice is not planned: the slice 2 mic is
   chat-only; Decision "M12 slices 1b + 2".)
2. **Warm-up sets:** before the day's first big lift (data per exercise), an automatic ramp ≈ 50% × 8 and
   70% × 4 of the working weight, snapped down to his kit's step, announced by voice; can be skipped; logged
   as warm-ups and **excluded from volume, bests, stall detection and completion %**.
3. **Intake + Goal + review:** a short intake on first run (re-runnable from Settings): goal, training days,
   experience, areas to go easy on. A **Goal card** with 1–2 measurable targets + a date (e.g. "Bench 60 kg
   × 8 by 2027-02-01", "Arms +1 cm"). A **standing "go easy on" list** (areas) that every proposal and
   focus block honours until he removes an area. A coach **review every 4–6 weeks** in the chat: progress
   on the goal, then an offer to adjust (a Proposal or a new focus block).
   **Second user (his wife, Decision 2026-11-16; detail in Decision "M12 slices 1b + 2"):** nothing is
   hard-coded to him. The intake asks goal kind (build muscle / lose fat / get stronger / general fitness, plus
   optional own words), training days (2–6), session length (30/45/60/75 min), experience and easy-on areas.
   A fresh install sees it before the first Today (skippable); an existing install is never forced (a "Set
   your goal" card). From the answers the app builds a **starter plan deterministically from templates as
   data** (kit-aware, fits the session length) and offers it as a Proposal; an existing plan is never replaced
   without Apply. **Fuel targets follow the goal and sex** (deficit for "lose fat", surplus for muscle /
   strength, maintenance for general; never below BMR), shown before → after and changed only on Apply.
   **Share my gym:** a file with the gym's equipment ids only (no personal data) that another phone imports
   in My gym with a preview. The standing easy-on list is a plan change (Proposal, Apply / Undo).
4. **Measurements + e1RM:** monthly tape measurements logged in Fuel next to weigh-ins (sites from the
   trainer-kit setting; default left/right arm, chest, waist, hips, left/right thigh), cm or in by his unit;
   an **estimated one-rep-max** chart per lift in the exercise history (Epley on each session's top set,
   warm-ups excluded, sets over 12 reps not charted). **Body fat % and lean body mass from Apple Health** (his
   VeSync scale writes them; added 2026-11-16): two more read-only M11 Health types (`bodyFat`, `leanMass`),
   each with its own switch (off by default; asked only when turned on), same per-day summary rules as weight
   (morning pick, Health wins), stored with the other Health days (not backed up; re-read after a restore);
   shown as trends next to weight in Fuel; out of every coach/Claude context like other Health data; not sent
   anywhere.
5. **Short on time:** "I have 20 / 30 / 45 min" (chip or text) → a Proposal for today that keeps the main
   lifts, **pairs accessories back to back with a short pair rest** (true alternating supersets deferred,
   Decision "M12 slices 1b + 2") and trims sets to fit the estimated time; Apply / Undo.
6. **Reminders + weekly check-in (slice 2, iPhone app):** **local notifications only** (no server, no push
   service), **off by default**, each switched on separately: a session reminder at a time he sets, a
   missed-day nudge, a Sunday recap. A weekly 3-question check-in in the chat (energy, sleep, soreness 1–5)
   whose answers feed the recap. Notification text has no body or Health data.
7. **Plan beyond a month:** at a block's end the coach proposes the next block plus a lighter week; it
   suggests a deload after ≈ 6 hard weeks in a row or several stalls (M10 stall rule). Proposals only.
8. **Progress photos (opt-in, off by default):** taken or picked in the app, **stored only on the phone**
   (IndexedDB), **never in backups, the dev log, the Apple model's context or Claude**, never sent anywhere;
   side-by-side compare of two dates; delete one or all at any time.
9. **How do you feel today:** an optional energy (1–5) + soreness-by-area tap before Start. Low energy
   (`feltLow`) and a sore area (`sore`) each count as one "Lighter today?" signal (M11 two-signal rule, so
   both together work without Health). Soreness only
   leads to coaching ("Go easy on shoulders today?"), never medical talk; the M10 discomfort/red-flag rules
   still apply to typed words.
10. **Setup cues:** 2–3 short spoken setup checks before lifts the camera can't judge (data per exercise,
    e.g. "Feet flat. Shoulder blades back."), said once before the first working set, ≤ 8 words each.
11. **Cardio minutes:** a weekly cardio line ("Cardio this week: 95 min") from Health outside workouts on
    the week strip and the Calendar's week score (iPhone app with Health on; hidden otherwise). Display only;
    it does not enter any coach context (M11 rule).
12. **Nutrition nudges + learn cards:** a protein-per-meal nudge in Fuel when a logged meal is low on
    protein versus his per-meal share; a post-workout meal idea on Summary (the M10 food suggestion); ~10
    short "why" cards (progressive overload, effort, warm-ups, protein, sleep, deloads, …) as data that the
    coach and screens can link to.

#### Mic (slice 2, iPhone app only)
- Hold to talk; **on-device** speech-to-text (Apple Speech with on-device recognition required, or the
  iOS 26 SpeechAnalyzer — check current docs first, CLAUDE.md rule 8), locale `en`. His words appear live in
  the text box; release sends. Audio is never stored or sent; if on-device recognition isn't available the
  mic says so and typing still works.
- New iOS permissions: Microphone + Speech Recognition, with usage strings, asked on first mic use only.
- Replies have `text` (shown) and `say` (≤ 12 words; ≤ 8 mid-workout). With **Speak replies** on (default on
  for mic-sent messages, off for typed) only `say` is spoken, in the chosen coach voice (Calm / Drill
  sergeant). Never listens or speaks during a set. The PWA has no mic in v1 (Safari's speech recognition may
  use Apple servers).

#### Brains (slices 2–3), on top of M10 phase B/C
- Free answers from the context block are allowed without a tool; read-only tools give facts; every change
  still goes through a `propose*` tool and his tap. Replies ≤ 4 short sentences. M10 safety unchanged.
- Context: today's plan, the next 7 days, 4 weeks of top sets, active overrides and focus block, week/month
  scores, today's Fuel totals vs targets, the last ~8 turns, within a test-enforced token budget; for Apple
  only, the M11 card **reason sentences** (never numbers; M12-q1 default taken 2026-11-17, switchable by
  `coach.appleCardReasons`).
- **Health never reaches Claude:** a message stores `usedHealth: true` when its context had Health card
  reasons; Claude requests drop those turns and never get Health context (a request-body test enforces it).
- A coach reply offers **Ask Claude instead** when Claude is on.
- Eval adds a "facts" set: numbers quoted must match the context (100%), plus the M10 bars (≥ 85% right
  action, 100% safe).

#### Claude brain (slice 3; planned 2026-11-18)
Wongsaton at Checkpoint J: the coach should "talk naturally, as human"; 2026-11-18: "plan Claude next".
Planner calls are in Decision "M12 slice 3 plan" and the open ones are M12-s3-q1…q8 (defaults below). This
section wins over M10 phase C where they differ.
- **Opt-in, off by default, every user.** Settings → Coach → **Claude coach**. Turning it on first shows a
  **"What is sent"** explainer with **I understand**. Each phone uses its own key (his wife can add hers).
- **iPhone app only** (M12-s3-q2). The PWA shows "Claude coach is in the iPhone app." and never contacts
  Anthropic.
- **The key:** pasted once into a password field, handed to a native `GymClaude` plugin and stored in the
  **iOS Keychain** (this device only, not synced to iCloud Keychain). It is **never read back into the web
  view**, never in IndexedDB, backups, the dev log, the copy report, tests or the repo. Test key (costs no
  tokens), Remove key (two taps).
- **The request:** built in TypeScript (pure, tested), sent **from Swift** to one fixed URL,
  `https://api.anthropic.com/v1/messages`, with the key added as a header in Swift. The web view's CSP is
  unchanged (`api.anthropic.com` is not added; a test checks). No streaming; one request per question;
  timeout 15 s; `max_tokens` 500.
- **Sent (one data source, `CLAUDE_SENDS`, used by the explainer, Settings, About and the landing page):** the
  new message and the last 8 turns (minus any turn that used Health), today's plan and the next 7 days,
  4 weeks of top sets (exercise, weight, reps, dates), plan changes and the focus block, week/month scores,
  today's food totals vs targets, goal kind and lift goals, the read-only tool results (week, progress,
  exercise info, food ideas). **Never:** Health data (including the "Lighter today?" reasons), body weight,
  body fat, lean mass, measurements, progress photos, check-in answers, how-you-feel-today, notes, the
  intake's own-words goal text (M12-s3-q5), the camera, the dev log.
- **Same tools and validation:** the `propose*` tools from `src/core/trainer/tools.ts` as Messages-API tools;
  a tool call becomes a Proposal through `runToolCall`; nothing changes without his tap; `sanitizeReply` on
  every reply; red flags never reach Claude. Instructions: the M10 safety lines verbatim plus a human-trainer
  persona (warm, plain, one clarifying question when something is missing, never promise a change in text).
- **Order (M12-s3-q1):** with Claude on, free text goes Claude → Apple → quick replies (setting: Apple first,
  with **Ask Claude instead** under Apple / quick-reply answers). Chips always use the rules.
- **Fallbacks, each with a one-line note:** no internet (no request is made), key not working (401/403),
  busy / rate-limited / server error / timeout, no key yet (once), daily limit used up (once a day).
- **Cost guard:** model picker (default the current Sonnet tier, M12-s3-q3; also Haiku and Opus 5.5), daily
  limit 10 / 30 / 60 questions (default 30, M12-s3-q4), and usage today and this month (questions, tokens,
  "about US$x" from a price table kept as data with its check date).
- **Model ids and prices are checked in the current Anthropic docs before building** (CLAUDE.md rule 8).
- **About + landing page:** the privacy promise lists two opt-in exceptions: the barcode lookup and the
  Claude coach, with what Claude gets and never gets.
- **Eval:** the owner eval screen runs the eval set against Claude on the phone after a cost confirm (the key
  never leaves the phone; no Mac script with the key).

#### Non-goals
Applying anything without his tap; the model writing data or free-writing workouts (focus blocks are built
by the app); medical advice, diagnosis or injury talk beyond the M10 lines; audio recording or upload;
always-listening; the mic in the PWA; Thai chat; the coach mid-set or from the camera; Health data to Claude;
calendar sync, server push (reminders are local notifications only, slice 2), manual day check-offs; uploading
or backing up progress photos; body-composition or health scores from measurements or photos; motion that
delays a tap or hides state.

#### Privacy
- Slices 1, 1c and 2: **no network request** (rules, Apple's model and speech run on the phone; the 1c
  report leaves only through the clipboard, on his tap). The chat
  thread, focus blocks and completion stay in IndexedDB. Share month makes the image on the phone and only
  the system share sheet / a download moves it, on his tap.
- Slice 3 sends only what the M10 phase C explainer lists (now: messages, plan, workout numbers, focus
  block, scores, Fuel totals), only while it's on, never Health data. Exact lists: "Claude brain (slice 3)"
  above. The key stays in the iPhone Keychain; the PWA never contacts Anthropic.
- Dev log: ids and numbers only (intent, action, card outcome, brain, latency); never message text.
- **Progress photos (slice 1b):** phone only (IndexedDB), on `LOCAL_ONLY_TABLES` (never in Back up files),
  never in the dev log, never in the Apple model's context, never sent to Claude, never uploaded; delete one
  or all at any time. Measurements are numbers like weigh-ins (backed up; not sent to Claude unless the
  phase C explainer is updated and he agrees).
- **Reminders (slice 2):** local notifications scheduled on the phone; no push service, no network.

#### Data model (adds to §4; final shape in `src/core/types.ts`)
```ts
type FocusGroup = BodyArea;                              // chest, back, arms, shoulders, legs, core
type FocusBlock = {
  id: string; group: FocusGroup; startDate: string; weeks: number /* 2–6 */; weekdays: number[];
  days: { date: string; day: ProgramDay | null /* null = rest */ }[];   // built, dated, deterministic
  targetSetsPerWeek: number; baseSetsPerWeek: number;  // focus group, for the scores
};
// TrainerState gains: blocks?: FocusBlock[]       ProposalAction gains: 'focusBlock'
type ChatCardStatus = 'pending' | 'applied' | 'dismissed' | 'undone' | 'expired';
type ChatCard =
  | { kind: 'proposal'; title: string; lines: { before: string; after: string }[]; why: string;
      status: ChatCardStatus; baseVersion: number; changeId?: number }
  | { kind: 'focusBlock'; blockId: string; status: ChatCardStatus }
  | { kind: 'food'; suggestions: FoodSuggestion[]; logged: number[] }
  | { kind: 'redFlag' } | { kind: 'recap'; period: 'week' | 'block'; from: string; to: string };
type ChatMessage = {
  id?: number; createdAt: number; role: 'user' | 'coach'; text: string; say?: string;
  source: 'chip' | 'rules' | 'apple' | 'claude'; phase: 'today' | 'preview' | 'workout';
  card?: ChatCard; chips?: { id: string; label: string; args?: Record<string, unknown> }[];
  usedHealth?: boolean; note?: string /* "Answered by quick replies: Apple Intelligence is off" */;
};
type DayStatus = 'done' | 'partial' | 'missed' | 'rest' | 'planned' | 'extra';
type DayCompletion = {
  date: string; status: DayStatus; dayId: string | null; blockId?: string;
  setsPlanned: number; setsDone: number;
  exercises: { exerciseId: string; setsPlanned: number; setsDone: number; repsTarget: [number, number];
               reps: number[]; status: 'done' | 'partial' | 'missed' }[];
};
type PeriodScore = { from: string; to: string; sessionsPlanned: number; sessionsDone: number;
  setsPlanned: number; setsDone: number; extra: number; focus?: { group: FocusGroup; sets: number; target: number } };
// Slice 1b (trainer kit; edited 2026-11-17 with the plan)
// SetLog gains: effort?: 'easy' | 'good' | 'hard';  warmup?: true   (warm-ups excluded from volume/bests/stalls/e1RM/completion)
type GoalKind = 'muscle' | 'fat' | 'strength' | 'general';
type Goal = { id: string; text: string; target: { kind: 'lift' | 'measurement' | 'weight';
  ref?: string; value: number; reps?: number }; due: string; createdAt: number; doneAt?: number };
type Intake = { goalKind: GoalKind; goalText?: string; days: number /* 2–6 */; sessionMin: 30 | 45 | 60 | 75;
  experience: 'new' | 'some' | 'years'; easyOn: BodyArea[]; at: number };   // settings key 'intake'
// TrainerState gains: easyOn?: BodyArea[]   (standing "go easy on" list, changed by Proposal, honoured by every proposal)
// ProposalAction gains: 'shortOnTime' | 'starterPlan' | 'easyOn'    PlannedExercise gains: pairWith?: string
// NutritionSettings gains: goalKind?: GoalKind   (targets per goal + sex; none = today's surplus behaviour)
type Measurement = { date: string; site: string /* 'leftArm', 'chest', 'waist', … from settings 'trainerKit' */; cm: number };
type ProgressPhoto = { id: string; date: string; createdAt: number; blob: Blob; pose?: 'front' | 'side' | 'back' };
type DayFeel = { date: string; energy?: 1 | 2 | 3 | 4 | 5; sore?: BodyArea[] };
// ReadinessSignal gains: 'feltLow' (energy ≤ 2) | 'sore' (any sore area)
// HealthType gains: 'bodyFat' (%) | 'leanMass' (kg), off by default; HealthDay gains bodyFatPct?, leanMassKg?
type LearnCard = { id: string; title: string; body: string };   // ChatMessage gains learnId?: string
type GymFile = { format: 'gym-clean-gym'; version: 1; equipment: string[] };   // "Share my gym", no personal data
// Dexie v10: measurements '[date+site], date', goals 'id, createdAt', dayFeels 'date' (backed up);
//            progressPhotos 'id, date, createdAt' (LOCAL_ONLY_TABLES)
// Slice 2
type BrainUnavailableReason = 'deviceNotEligible' | 'appleIntelligenceNotEnabled' | 'modelNotReady'
  | 'unsupported' | 'notNative';
type ReminderSettings = { session: { on: boolean; time: string }; missedDay: { on: boolean };
  sundayRecap: { on: boolean } };   // settings key 'reminders'; all off by default
type CheckIn = { weekStart: string; energy?: 1|2|3|4|5; sleep?: 1|2|3|4|5; soreness?: 1|2|3|4|5; at: number };
// Dexie v11: checkIns 'weekStart' (backed up; never in a brain context). ChatCard gains kind 'checkIn'.
// coach settings gain: speakReplies?: 'mic' | 'always' | 'off' (default 'mic'); brainNotes? (reason → shown at)
// Slice 3 (Claude; no Dexie change; no key field anywhere in JS data)
type ClaudeSettings = { on: boolean; model: ClaudeModelId; dailyCap: 10 | 30 | 60;
  order: 'claudeFirst' | 'appleFirst'; explainerOkAt?: number };          // coach settings gain: claude?
type ClaudeUsageDay = { requests: number; inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number };
type ClaudeUsage = { days: Record<string /* YYYY-MM-DD */, ClaudeUsageDay> }; // settings 'claudeUsage' (counts only)
type ClaudeUnavailableReason = 'off' | 'notNative' | 'noKey' | 'offline' | 'capReached';
// BrainErrorCode gains 'auth' | 'rateLimited' | 'busy' | 'offline'
// GymClaude plugin: hasKey() → { hasKey, savedAt? } (never the key), setKey, removeKey, testKey,
//   send(body, timeoutMs) → { status, body, requestId? }  (Swift adds the key header; fixed URL)
```

#### Accept
- **Slice 1:**
  - Unit tests, written first:
    - focus block: weekly sets of the focus group +30–50% over his current plan and on ≥ 2 days/week; other
      groups unchanged; last week lighter; every pick doable with the gym profile and from the catalog;
      2 and 6 weeks; 3–6 weekdays; a block starting mid-week; revisions (swap one exercise, fewer days);
      deterministic (same input → same block); Apply → the calendar shows block days → Undo restores; after
      the last block date the normal rotation resumes; overrides (lighter, not today) still work on block days;
    - completion: done / partial / missed / rest / extra per day and per exercise, week and month scores,
      focus sets vs target, a session spanning midnight, a lighter/deload day (planned = the adjusted day),
      DST weeks, an empty history;
    - chat store: Dexie v7 → v8 keeps every row, 30-day pruning, Clear chat, `chatMessages` left out of
      backups and the dev log;
    - rule answers: the new intents (week, progress, focus block + its edits) on the eval set (rule items
      ≥ 90% right, 100% safety flags), every reply passing `checkCopy`, numbers in a reply matching the
      computed scores;
    - the brain router: chips → rules; free text → rules when no other brain is registered; a failing
      brain → the next one with a note;
    - motion helpers: reduced motion → no animation and final values at once.
  - E2E (390×844): the tab bar has 5 tabs with Coach in the middle (each ≥ 56px, labelled); Coach tab → a
    starter → reply; Not today → Apply → Undo inside the thread; reload keeps the thread; Clear chat;
    Today's Coach button and the "Lighter today?" card open the Coach tab with the chip sent; the Pause
    sheet shows the compact chat; "This month I want to build my chest" → questions → focus-block card →
    expand a week → Apply → Calendar marks block days → Undo; Calendar month grid → a day → per-exercise
    done/partly/missed from seeded sessions → exercise history one tap deeper; week/month scores; Share
    month produces an image with no network request; a missed day shows once on Today; with
    `reducedMotion: 'reduce'` nothing animates; no off-device request anywhere; no text box during a set.
  - 390×844 screenshots: Coach tab (empty with starters, a thread with a proposal, after Apply with Undo),
    the focus-block card (collapsed and expanded), Calendar month, a day detail, the scores, the share image,
    Today with the missed-day prompt, the Pause-sheet chat.
  - Existing e2e specs updated for the new tab bar, the Coach tab and Calendar; the full e2e stays green.
  - 🧍 **Checkpoint I (after slice 1):** he uses the Coach tab and the Calendar for a few days (at least one
    question, one proposal applied or undone, and a look at the Calendar after training). He reports what
    felt off, including the motion.
- **Slice 1c (What's New + To-dos):**
  - Unit tests, written first (made-up data):
    - every detector at its boundary (not met / met / over; e.g. 2 vs 3 sessions, 6 vs 7 photo days,
      re-sign 3 vs 2 days left incl. a DST change), on `web` and `native` facts;
    - topic progress: auto + ask → done; skipped; recurring; native-only topics left out of the PWA count;
      the Today card count ("6 of 12") and hidden when all done;
    - tour selection: unseen release → its pages; seen → none; fresh install → marked seen, none; two unseen
      releases → both, newest first; a release with no pages → none; replay → all pages of the current one;
    - decision steps write exactly the mapped setting and nothing else;
    - report builder: only answers/ticks since the last copy; grouped by topic with checkpoint, date,
      release, platform; skipped topics listed; "Copy all again" includes sent ones; **never contains**
      Health values, photo data, key-like strings (a note with `sk-ant-…` → "[key removed]"), chat message
      text or food/body numbers, even when the facts and stores hold them (test seeds them and searches the
      output);
    - topic and page data: unique ids, every detector id known, every Try it a valid route, every string
      passes `checkCopy`, the 12 initial topics map to the checkpoints in the table;
    - storage: Dexie v8 → v9 keeps every row; answers round trip; mark sent; `todoAnswers` in backups and
      never in the dev log; build first-seen recorded once per build id.
  - E2E (390×844, no off-device request in any of them): a profile with a session and an older
    `seenRelease` → the tour on open → Next / Back → Try it lands on the feature → reload shows no tour;
    Skip ends it and it doesn't come back; Settings → What's new replays it; a fresh profile shows no tour;
    with `reducedMotion: 'reduce'` pages swap without animation; Today card → list → a topic → an auto step
    ticks after the seeded data appears (e.g. a chat question) → ask steps with a note → reload keeps them →
    a decision step changes its setting (seen in Settings); Copy report → preview → copy (clipboard read back
    in Chromium) → answers marked sent → the next report has only newer answers; native-only topics labelled
    in the PWA; the card hides when all done; nothing from the tour or to-dos appears during a set.
  - Version + credit: a unit test that the displayed string is "Version <package.json version> (build
    <short sha>)" and that the tour key equals the package.json version; e2e: Settings → About shows the
    version and "© 2026 Wongsaton Kampusan", the tour's first page shows the same version, the copied report
    header has the version and not the name; `npm run build` output contains the version.
  - 390×844 screenshots: a tour page (the first, with the version), the "Added to your to-dos" page, the Today
    card, the to-do list, an auto step (ticked and not), an ask step with a note, a decision step, the report
    preview, Settings → About.
  - Existing e2e stays green (helpers mark the tour seen by default).
  - No 🧍 checkpoint of its own: the to-dos are his open checkpoints; his first pasted report is handled with
    `/feedback`.
- **Slice 1b (trainer kit items 1–5, 7–12):**
  - Unit tests, written first (made-up data):
    - (1) effort stored on the set; the M5b recommendation changes with Easy / Good / Hard and is unchanged
      with no answer;
    - (2) warm-up ramp: 50% × 8 and 70% × 4 snapped down to the kit step in kg and lb, none for a bodyweight
      or light first lift (threshold as data), only before the day's first big lift; warm-ups excluded from
      volume, bests, stall detection, e1RM and completion %;
    - (3) intake → settings; goal progress from logged sets / measurements / weigh-ins; the standing easy-on
      list honoured by every action and the focus-block builder; the review due every 4–6 weeks, once;
    - (4) e1RM formula on known values, top set per session, warm-ups excluded; measurement storage round trip;
    - (5) short-on-time builder for 20 / 30 / 45 min: main lifts kept, accessories paired, the estimated time
      (sets × (work + rest), as data) ≤ the limit, Apply / Undo round trip;
    - (7) next-block proposal at a block's end; deload suggestion after 6 hard weeks or the stall rule, once;
    - (9) feel-today → the `feltLow` signal: one signal alone shows no card, with one Health signal it does
      (2-signal rule), and without Health energy ≤ 2 plus a sore area count as two (rule as data);
    - (10) every program exercise the camera can't judge has 2–3 setup cues ≤ 8 words that pass `checkCopy`;
    - (11) cardio minutes per week from `healthDays` outside workouts, no double count with gym sessions;
    - (12) protein-per-meal nudge thresholds; every learn card passes `checkCopy`;
    - storage: the Dexie bump keeps every row; `progressPhotos` on `LOCAL_ONLY_TABLES` and out of the dev log;
      measurements, goals, intake and effort in backups;
    - (3, second user) starter plan per goal × days × session length: fits the time, kit-aware,
      deterministic; Fuel targets per goal and sex (deficit for "lose fat", never below BMR; no goal = old
      behaviour); the gym file round trip has equipment ids only; a scan finds no personal name or numbers
      in data/copy outside the About credit;
    - (4) `bodyFat` / `leanMass` per-day pick, off by default (old Health settings read them as off);
    - trainer-kit settings read at runtime: the M12-q4 to-do decision step's value changes the sites, the
      warm-up rule and the review period;
    - follow-ups: the postpone reply never says a day moves twice; the iOS `MARKETING_VERSION` equals the
      package.json version.
  - E2E (390×844): Easy / Good / Hard on the rest screen and skip; warm-up sets announced and logged, Summary
    volume unchanged by them; intake → Goal card on Today; "I have 30 min" → Proposal → Apply → shorter day →
    Undo; a measurement in Fuel; e1RM chart in exercise history; feel-today → "Lighter today?" card; a setup
    cue spoken before the first set; progress photo on → add (a fixture image) → compare → delete, with no
    network request and absent from a Back up file; a learn card from a coach reply; no new text box or tap
    asked during a set; a fresh profile → intake → starter plan Apply → Goal card (an existing profile is
    not forced); Share my gym → import on a fresh profile; a tab switch scrolls the new tab to the top.
  - 390×844 screenshots: effort row, warm-up set, intake, Goal card, short-on-time proposal, measurements,
    e1RM chart, feel-today, progress photo compare (made-up image), a learn card, the cardio line.
  - Ends with reviewer + verifier like slice 1; his gym feedback on it folds into Checkpoint J.
- **Slice 2:** the M10 phase B Accept, plus: tool contract includes the read-only tools and
  `proposeFocusBlock`; the facts eval (100% numbers match); speech plugin XCTest with a fake recognizer;
  e2e with a fake `GymBrain` and a fake speech bridge (hold → live text → release sends → `say` spoken
  only when Speak replies is on; never during a set); no network request; Microphone / Speech Recognition
  asked only on first mic use. Reminders (trainer kit item 6): every notification off by default and
  scheduled locally (plugin test with a fake scheduler: times, missed-day nudge once, Sunday recap; turning
  one off cancels it; notification permission asked only when he turns the first one on; no body or Health
  data in the text); the weekly check-in asks 3 questions once a week and its answers show in the recap.
  Plus: every Apple unavailability reason → rules with its plain note shown once; the Apple context never
  contains Health numbers, body fat / lean mass, measurements, progress photos, check-in answers or notes,
  and contains the card reasons only while `coach.appleCardReasons` isn't false (unit test).
  🧍 **Checkpoint J (after slice 2):** on his iPhone he uses the mic and the
  Apple brain for a few days and reports wrong answers, wrong actions and how the voice felt.
- **Slice 3:** the M10 phase C Accept, plus: request-body test that turns with `usedHealth` are dropped and
  no Health context is sent; Ask Claude instead; setting off → 0 requests. Detail (2026-11-18):
  - Unit tests, written first (made-up data, fake keys only): the request body has exactly the allowed
    top-level fields and none of the seeded sentinels (Health values, card reasons, a `usedHealth` turn, body
    fat, lean mass, weigh-ins, measurements, a photo, a check-in, a day-feel, a note, the own-words goal, a
    key-like string); every emitted section maps to a `CLAUDE_SENDS` item; response parsing for every status;
    cost math, the daily limit and the local-day rollover; router order both ways, each reason's note policy,
    red flags never sent; no `fetch`/XHR/WebSocket/`sendBeacon` in the adapter; `index.html` CSP has no
    Anthropic host; About lists both exceptions.
  - XCTests (fake Keychain + fake session): the key round trip, never returned to JS, only the fixed URL
    requested, the key only in the header, every status / offline / timeout mapping, no request without a key.
  - E2E (390×844, fake `GymClaude`): off → no send; explainer before on; a pasted key is absent from
    IndexedDB, localStorage, the DOM, a Back up file and the dev-log export; a Claude reply with its badge; a
    tool call → Apply → Undo; 401 / 529 / timeout / offline / limit → answered on the phone with a note; Ask
    Claude instead; PWA: no Claude screen and 0 requests to api.anthropic.com.
  - 390×844 screenshots: Claude settings (off with What is sent, explainer, key saved + usage, PWA line), a
    Claude reply, a fallback note, Ask Claude instead, the eval cost confirm, About with both exceptions.
  - 🧍 **Checkpoint N (after slice 3):** with his own key on his iPhone for a few days (free questions, one
    proposal from free text, one question offline, the owner eval run once: ≥ 85% right action, 100% safe,
    0 changes without a tap, p50 latency, tokens and cost). He reports whether it talks like a person, wrong
    actions and whether the cost feels fine.

### M13 — Published look (approved 2026-11-17; builds after M12 slices 1b and 2; release 1.15.0)
Wongsaton (2026-11-17): "Help me think about the app, how to approve or make it ready to use as a public
app (not public right now but just need the app look like startup and published app on app store)".
Audience, his answer: "my friends seeing it on my instagram and my wife using it daily". Approval: "Yes, plan
it and give me options to turn on owner mode". Planner calls are in Decision "M13 Published look" and can be
corrected. The app is **not** being published; it only has to look and feel like a finished product to a
second user and to people who see it in a Story. Built on its own branch from the M12 result so it covers the
slice 1b and slice 2 screens. Hard rules in CLAUDE.md win everywhere (sizes, dark theme, original art, no
medical claims, privacy).

#### Goals
1. **First launch.** A fresh install opens with a short **welcome** (the mark, the name, the tagline, 2–3
   pages on what the app does, each ≤ 2 short sentences), then the slice 1b **intake** (goal, days, session
   length, gym kit), then **permission pages that say why** before anything is asked, then Today.
   - Every page has **Skip**; Back / Next ≥ 56px; the whole flow can be skipped in one tap and re-run from
     Settings. **An existing install is never put through it** (same "fresh" test as slice 1b: no sessions).
   - Permission pages, one per permission the platform has: **camera** (counts reps on the phone; no video is
     saved or sent), **Apple Health** (iPhone app; read-only; stays on the phone), **microphone** (iPhone app;
     hold to talk; audio is never stored), **notifications** (iPhone app; local reminders, off by default).
     Each has "Not now". The PWA shows the camera page only.
   - The earlier rules stand: the **mic** system prompt still appears only on first mic use (its page only
     explains); **notifications** are asked only when a reminder is switched on (the page's button switches
     the session reminder on); **Health** uses the existing connect flow; camera asks on its button.
2. **Works for anyone.** Nothing assumes him, his goal or a man. Slice 1b does most; M13 closes the rest:
   the drill-sergeant voice picker offers **any installed English voice** (not a fixed list of male names)
   with a reworded hint; a scan test keeps gendered or owner-specific wording out of copy and data.
3. **Owner mode** (off by default on a fresh install). Owner/tester material is hidden unless it is on: the
   To-dos Today card, list, guides and Copy report; the "Re-sign in N days" reminder; the **Developer log**
   section in Settings (and, while owner mode is off, the developer log records nothing); the **build hash**
   in About and in the tour; the tour's "Added to your to-dos" page; the slice 2 **dev eval screen**.
   - With owner mode off a user sees only **"Version 1.15"** (MAJOR.MINOR, plus .PATCH when it isn't 0).
     With it on everything works **exactly as before M13** ("Version 1.15.0 (build abc1234)", Copy report,
     dev log export, re-sign reminder).
   - The state is the `settings` row `'ownerMode'` (local, backed up like other settings). It is decided
     **once**, on the first launch that has no row: an install that already has sessions or to-do answers
     (i.e. from before 1.15.0) starts **on**, so his own phone keeps its to-dos; anything else starts **off**.
   - **How it is switched on (his pick, 2026-11-17: "Go with option A"):** tap the version line in
     Settings → About **7 times** → an "Owner tools" switch appears there (and stays visible while it is
     on). The mechanism is one small module.
   - With owner mode off, the to-do decision steps are unreachable; their settings keep their defaults.
4. **Brand.** One name constant and one tagline constant (`src/core/brand.ts`); every shown name reads it,
   so a rename is one edit plus the listed non-TS files (a test names them). Built with the current name
   "Gym Clean" (M13-q1 answered 2026-11-17: keep it).
   - **Launch screen:** the orange dumbbell-pulse mark on `#0d0f12` in the iPhone app (splash image and
     storyboard background; today a blank square on a white storyboard) and as a static pre-boot mark in
     the web app (no script, replaced when the app mounts).
   - **Favicon** = the real app icon (generated from the same logo path as the PWA icons).
   - Manifest and page **description** rewritten from the tagline.
5. **Polish** (from the 2026-11-17 UX review; token system, app icon, workout/rest screens, calendar rings +
   legend, "Stays on this phone" lines and Apply/Undo stay as they are):
   - **Today:** the hero with Start comes first; notices collapse into one compact row ("2 things to sort",
     opens them) or at most one card; secondary buttons are outline, so **the only filled orange button is
     Start**; nothing is cut by the tab bar; the duplicate Coach button in the header goes.
   - **Tab bar:** five labels fit without touching at 390px and 360px (condensed label font or shorter
     names), labels stay ≥ 18px, targets ≥ 56px.
   - **One look:** the pure-black track style with 8px cards is for in-workout screens (Exercise, Rest,
     camera) only; Calendar and its day view use the standard surface (`#0d0f12`, 20px cards).
   - **Back / done / forward** use one shared helper with icons; no typed "‹", "✓" or "→" as controls.
   - **Rest "Next" card:** the 2D body map shows at once as a placeholder and the 3D view fades in over it;
     never an empty grey box (checked on a real phone).
   - **Empty states** (Fuel day, Coach thread, and any other bare-text one found): one small **original**
     icon/illustration + one line + one action; "Set up targets" is the primary action until done.
   - **Wording:** no all-caps "STALLED" and no "fell short" line (a "Plateau: let's change something"
     style, passing `checkCopy`); each Calendar score card shows **one** clearly labelled score.
   - **Fuel entries:** no large always-visible Delete block; tap the row to edit/delete in the sheet (Undo
     stays). Re-check the current screen first; skip if already so.
6. **Trust.** Settings → **About** becomes a screen: the name, tagline, version line, a **privacy promise**
   ("Everything stays on this phone": video, body data, Health data, chat; the listed opt-in exceptions are
   the barcode lookup and, later, his own Claude key), **"Coaching, not medical advice."**, **Open-source
   credits** (a licenses screen generated from the dependency list plus the vendored data: free-exercise-db
   (Unlicense), USDA food data, the MediaPipe pose model, three.js, Dexie, fonts, …), and **"© 2026
   Wongsaton Kampusan"**. In-app screens only; no external links; nothing sent.
7. **Show it off.**
   - **Share month, Story size:** a second export, **1080×1920 (9:16)**, with the mark and name, **leading
     with one positive number** he picks in the preview (sessions done — the default; total kg/lb lifted;
     streak), the month grid with **missed days as quiet grey rings**, no red, no "missed" count. Made on the
     phone, handed to the system share sheet / a download on his tap; nothing is uploaded. No body data, no
     Health data, no per-lift weights (the total lifted appears only when he picks it).
   - **Store-style screenshot set:** phone-size captures with **made-up demo data** (a fictional profile,
     never his data) from `scripts/screenshots.mjs`, plain and with a headline caption, for his Instagram.
     The Story pack is made from them (`/story`); **nothing is posted** by any agent.
   - **Landing page:** one static page in the repo, served by GitHub Pages next to the app at
     `<site>/welcome/` (`public/welcome/index.html`): the mark, tagline, three screenshots, the privacy
     promise, "Open the app". **No script, no analytics, no trackers, no third-party request.** The
     service worker leaves that path alone.
8. **Her phone.** `docs/ios-setup.md` gains a short checklist: install on his wife's iPhone with the free
   Apple ID (counts toward 3 devices; re-sign every 7 days from his Mac) versus the PWA (no re-sign; no
   Apple Health, mic or reminders). No code beyond goals 1–2.
9. **What's New 1.15.0:** tour pages for the new look, About + privacy, Share to Story and owner tools
   (the last one only on a phone where owner mode is on).

#### Changes to earlier contracts
- Slice 1c: "Version x.y.z (build sha)" in About and on the tour's first page, the "Added to your to-dos"
  page, the Today to-do card and Settings → To-dos now show **only in owner mode**. About gains in-app
  links (Licenses); still nothing external.
- Slice 1 Share month ("no weights"): the Story variant may show **total** weight lifted when he picks it.
- Slice 1b: the fresh-install intake is now the middle of the first-launch flow (welcome before it,
  permission pages after it).

#### Non-goals
A paid Apple Developer account, TestFlight, App Review, store privacy labels; accounts or sync; analytics or
trackers anywhere (app or landing page); renaming the app without his say; posting to Instagram; light
theme; a second anatomy silhouette (later, anatomy-3d-engineer, only if asked); any change to the
workout/rest/camera screens beyond the Rest "Next" placeholder.

#### Privacy
No new network request in the app. The landing page loads only its own files. Share images are made on the
phone. Demo screenshots use made-up data. `'ownerMode'` and `'onboarding'` are plain settings rows (backed
up; no personal data). The licenses list is built at dev time and bundled.

#### Data model (adds to §4; final shape in `src/core/types.ts`)
```ts
// src/core/brand.ts: APP_NAME = 'Gym Clean'; APP_TAGLINE (one line)
type OwnerMode = { on: boolean; setAt: number; by: 'fresh' | 'existing' | 'user' };   // settings 'ownerMode'
type OwnerSurface = 'todos' | 'resign' | 'devlog' | 'buildHash' | 'tourTodos' | 'evalScreen' | 'copyReport';
type Onboarding = { doneAt?: number; skippedAt?: number };                            // settings 'onboarding'
type OnboardingStep = { kind: 'welcome'; id: string } | { kind: 'intake' }
  | { kind: 'permission'; permission: 'camera' | 'health' | 'mic' | 'notifications' };
type LicenseEntry = { name: string; version?: string; license: string; source: 'npm' | 'data' | 'model' | 'font';
  text?: string };
type ShareLead = 'sessions' | 'volume' | 'streak';
type ShareStats = { sessionsDone: number; volumeKg: number; streakWeeks: number };    // warm-ups excluded
// AppRoute gains: 'welcome' | 'settings/about' | 'settings/licenses'
// WhatsNewPage and TodoTopic gain: owner?: true   (shown only in owner mode)
// No Dexie change.
```

#### Accept
- Unit tests, written first (made-up data):
  - owner mode: first-launch decision (fresh → off; sessions or to-do answers → on; an existing row is
    never re-decided; a restored backup's row wins), the version line per mode, every `OwnerSurface` hidden
    when off and unchanged when on, the dev log records nothing while off, the row round-trips a backup;
  - the unlock mechanism: 7 taps inside the window show the switch, 6 don't, slow taps reset;
  - first-launch steps per platform (PWA: camera only; iPhone app: all that exist), skipped/finished stored,
    an install with sessions gets none;
  - share stats (sessions, total volume in kg and lb, streak; warm-ups excluded; empty month) and the 9:16
    layout (1080×1920, lead number first, missed days grey, no "missed" text, no body/Health data);
  - licenses: every runtime dependency in `package.json` has an entry with a licence; the vendored data,
    model and fonts are listed; the committed list matches a fresh generation;
  - brand: no shown "Gym Clean" literal outside `brand.ts` and the listed non-TS files; the tagline passes
    `checkCopy`;
  - voices: any installed English voice is offered (female and male names in the fixture), the saved voice
    still wins, the old default order still applies when those voices exist;
  - copy: no "STALLED" / "fell short"; every new string passes `checkCopy`; the anyone-scan finds no
    gendered or owner-specific wording.
- E2E (390×844; no off-device request in any of them):
  - a fresh profile → welcome → Skip or Next → intake → permission pages (camera granted with the fake
    device; "Not now" works) → Today; reload doesn't repeat it; a profile with sessions never sees it;
  - a fresh profile shows no To-dos card, no Settings → To-dos, no Developer log, "Version 1.15" without a
    build; 7 taps on the version line → Owner tools → on → all of them appear → off hides them again; a
    seeded pre-1.15 profile (sessions + to-do answers) starts with owner mode on and keeps its to-dos;
  - About: privacy promise, "Coaching, not medical advice.", credit, Licenses lists free-exercise-db;
  - Today: Start is inside the first viewport with two notices seeded, exactly one filled primary button,
    nothing overlapped by the tab bar; tab labels don't overlap at 390 and 360;
  - Share → Story size → an image 1080×1920 is produced with the picked lead number, no network request;
  - `/welcome/` loads with zero script tags and zero third-party requests (built preview, service worker on).
- 390×844 screenshots: welcome, a permission page, Today (fresh and with notices), tab bar, Calendar on the
  standard surface, About, Licenses, an empty Fuel day, an empty Coach thread, Rest with the placeholder,
  the Story image, Settings with owner mode off and on, the landing page (phone and desktop width).
- The **store set**: ≥ 6 captures with demo data (Today, a workout set, Rest, Coach, Calendar, Fuel), plain
  and captioned, in `docs/screenshots/store/`.
- iOS simulator build: the launch screen shows the mark on `#0d0f12` (no white flash); version 1.15.0.
- Existing e2e stays green (helpers default to onboarding done; owner mode on only where a spec needs it).
- 🧍 **Checkpoint K:** he and his wife each try a **fresh install** (her phone per the checklist), she uses
  it for a few days; he looks at the Story pack and posts it himself if he wants. They report what still
  looks home-made, anything that assumed him, and whether the first launch asked too much.

### M13b — One-arm sets + row camera fixes (added 2026-11-17, gym feedback; release 1.15.1; builds after M13, before M12 slice 3 and M14)
Wongsaton trained One-Arm Dumbbell Row (4 sets) with the web app in Safari and screen-recorded it. The
camera lost him while bent over the bench, overcounted (14/12, 13, ~5 false partials a set), flipped from
one arm to the other mid-set (and the count went back to 0), and the "Set up your phone" card stayed over
the lower half of the view. His decision: **"Right then left but should have button or anything to go next
arm avoid the error while lifting up".** Planner defaults are in PROGRESS Decision "One-arm sets"
(2026-11-17). This supersedes M4f-q2 (near side only, other side not counted).

#### Goals
1. **One-sided exercises are data.** A list in `src/core/exercises/` names each one-sided exercise and its
   limb: arms (One-Arm Dumbbell Row, Concentration Curls, Seated One-arm Cable Pulley Rows) and legs
   (Dumbbell Step-Ups, Split Squat with Dumbbells, Single-Leg Glute Bridge, Seated One-Leg Calf Raise).
   Alternating lunges stay one total (M4f-q6). No `if (exercise === …)` branches.
2. **Right, then left, in one set.** A one-sided set starts on the **right** arm (leg). The screen names the
   side ("Right arm", ≥ 20px) above the count (≥ 64px). The primary button on the first side is **Next arm**
   (or Next leg; ≥ 56px, full width); Set done appears only on the second side. Tapping Next arm is spoken
   ("Left arm. Turn so your left arm faces the phone."), cuts any count speech, and the count starts again
   at 0 for the left arm. Manual (non-camera) one-sided exercises get the same flow with per-side reps.
3. **The camera counts the set's arm only.** The rep counter takes the side from the session and locks it
   from the first frame; it never picks or switches sides itself, and nothing the camera sees resets the
   count mid-arm. If the locked arm isn't visible, the usual "Step into frame" applies.
4. **Hands-free.** On the first side hands-free never ends the set; after ~6 s idle with ≥ 1 rep it says
   "Tap Next arm when you're ready." once. On the second side the M5c auto Set done + Undo work as before.
   The rest clock starts when the second side ends.
5. **Per-arm records.** `SetLog.sides` holds `{ right, left }` (reps + partials); `SetLog.reps` is the lower
   of the two (what both arms reached), so targets, bests, e1RM, stalls and volume stay comparable with older
   sets. The set summary, Calendar day and History show both ("R 12 · L 11"); Fix corrects either side;
   backups round-trip `sides`; the developer log records the switch time and per-side counts.
6. **Row counting fixed on real data.** His recordings become landmark fixtures
   (`fixtures/landmarks/row/real-*`, landmarks only, never video); the row counts each clip exactly (reps and
   partials). The cause of each symptom is written down. Fixes go in the rule data (`row.ts`) first.
7. **He stays in view while bent over.** The pose settings (confidence thresholds, or the model, if the
   measurements justify it and the iPhone keeps ≥ 24 fps) are chosen from measured detection on his row
   clips; the row's placement lines/sentence change if the clips show a better phone spot.
8. **The set-up card gets out of the way.** The full "Set up your phone" card shows only before the set's
   first rep and closes itself once he is tracked (1.5 s) or after 10 s. After that, losing him shows a
   one-line "Step into frame" strip at the top of the view (and it is spoken), never the full card over the
   lower half. "Phone position" still opens the card.
9. **What's New** has a 1.15.1 page (Next arm); the To-dos gain the Checkpoint K2 guide.

#### Accept
- `npm run check` and `npm run e2e` green; `npm run build` contains 1.15.1; iOS version synced.
- Fixture suite: every `fixtures/landmarks/row/real-*` clip counts its labelled reps and partials exactly;
  all synthetic folders unchanged; new left-arm synthetic clips for row and concentration curl count with the
  side locked to left and count 0 with it locked to right.
- Unit: the counter never changes side or resets counts on its own (replay of the set-3 recording); session
  logs one SetLog per one-sided set with both sides; two-sided exercises behave exactly as before.
- Detection on the bent-over spans of his clips is reported (before/after) and does not get worse.
- e2e: a manual one-sided exercise goes Right → Next arm → Left → Set done → Rest, and summary + Calendar day
  show both arms; the fake-camera row counts 4 on the right and 4 on the left with one Next arm tap; after
  the first rep, being out of frame shows the top strip, not the card.
- 390×844 screenshots: right side, left side, camera view with the side label, the top strip, the summary
  and Calendar day with both arms.
- His iPhone: `npm run ios:install` passes the bundle check and Settings → Self-check is all ✓.
- 🧍 **Checkpoint K2:** a one-arm row session at the gym (iPhone app). He reports: does it keep him in view
  bent over, do the counts match each arm, is Next arm easy to hit with a dumbbell in hand, and does the
  set-up card stay out of the way.

### M14 — Wrist and ears: Apple Watch app + AirPods head motion (approved 2026-11-17; builds after M13; release 1.16.0)
Wongsaton (2026-11-17), after being told AirPods head motion and an Apple Watch app were parked / out of
scope: **"Add it and I need apple watch app too."** Both are in. Planner calls are in Decision "M14 Wrist and
ears" (2026-11-17) and can be corrected. Branch `m14-wrist-ears`, cut from the M13 result. **iPhone app only**
(the PWA shows "Apple Watch and AirPods work in the iPhone app."). Hard rules in CLAUDE.md win everywhere.

**Blocking for the watch part only (M14-q1):** whether a free Personal Team Apple ID can install and run a
watchOS companion (and with which limits) is checked first against current Apple docs and a blank-target test
on his devices. If it needs the paid Apple Developer Program (US$99/year), the watch tasks wait for his call;
the AirPods part runs on the free account either way. **Answered 2026-11-17:** "let's try the free version, and I
will decide the pay in the future" → build with the free Personal Team; if the spike shows it can't run the watch
app, the watch-only work pauses and he is asked again. **His devices** ("I got series 9 and pro 2"): **Apple Watch
Series 9** (current watchOS, workout-session heart rate) and **AirPods Pro 2** (head tracking supported).

**Second user:** his partner may use the app (M13), so every new string (phone, watch, Info.plist, What's New)
is gender-neutral and says "you", and passes M13's gendered/owner-wording scan.

**Platform facts (M14 task 1, 2026-11-17; Decision "M14 task 1 findings" wins where more specific):**
- Watch target: Xcode template **"Watch app for Existing iOS App"** (single target, embedded, not standalone,
  `WKCompanionAppBundleIdentifier` = the iOS bundle id), deployment target **watchOS 26.0**, HealthKit
  capability, `UIBackgroundModes` **workout-processing** (plus Audio only if task 2 shows haptics need it),
  Info.plist `NSHealthShareUsageDescription` **and** `NSHealthUpdateUsageDescription` (texts under Privacy).
- iPhone: `NSMotionUsageDescription` must be added before any motion code (without it the app crashes); the
  `WCSession` delegate implements `activationDidComplete`, `sessionDidBecomeInactive` and
  `sessionDidDeactivate` (re-activating), or iOS ends the app in the background after a watch switch.
- Free Personal Team: should work on paper; limits 10 App IDs per 7 days, 3 devices, 3 apps per device,
  7-day profiles (the watch app expires with the iPhone app). Task 2 proves it on his devices; its scratch apps
  are deleted afterwards and never use Gym Clean's bundle id.
- `transferUserInfo` does not deliver in the Simulator: the queued path is tested on his devices; simulator
  tests use `sendMessage` / `updateApplicationContext`.
- Headphone-motion update rate is not documented: measured in task 2; core logic works from frame timestamps,
  never an assumed rate.

#### Goals — Apple Watch app
1. **A remote on the wrist; the phone stays the brain.** A watchOS companion (SwiftUI, single-target watch
   app, WatchConnectivity) for the Capacitor iPhone app. The session reducer (`src/core/session.ts`) stays the
   only source of truth. The watch **sends events** and **receives state snapshots**; it never decides what
   the next set is beyond the one-step lookahead in the snapshot.
   - Watch events map onto existing reducer events, no new reducer event: **Set done** → `SET_DONE`;
     **Start now** (on rest) → `START_SET`; **+30 s** → `EXTEND_REST`; **Pause / Resume** → `PAUSE` /
     `RESUME`; **Skip exercise** (behind a confirm) → `SKIP_EXERCISE`.
   - Every event has an id, the snapshot `rev` it was based on, and the watch tap time. The phone applies an
     event once (dedupe by id) and drops a stale one (its rev's exercise/set/phase no longer matches, e.g. he
     already tapped Set done on the phone). The tap time is mapped to the phone clock with the offset measured
     from snapshots and clamped like the M5c backdates.
   - Workouts start on the phone (Today → Start). With no session the watch shows "Start on your iPhone" and
     the day's name. Starting from the watch is later.
2. **What the watch shows** (one primary action per screen; original glyphs only):
   - **Exercise:** exercise name, **Set x of y** (warm-ups labelled), the rep target and the weight in his
     unit, current heart rate (small), and a full-width **Set done** button.
   - **Rest:** the countdown (largest thing on screen), the next set (name, set x of y, target), heart rate,
     the recovery line when it fires, and **Start now**.
   - **Controls** (swipe): Pause / Resume, +30 s, Skip exercise (confirm). **Summary** at the end: sets done,
     duration, average heart rate.
   - **Haptics:** a tap at **10 s left** and a stronger one at **rest end**; a light tap confirming Set done.
     Voice on the phone is unchanged (the watch never replaces a spoken cue).
   - **Readable at a glance:** the hard sizes apply on the watch in points: the countdown and main numbers
     ≥ 64 pt (rounded monospaced digits), other text ≥ 20 pt, the primary button ≥ 56 pt tall, white or the
     brand orange on black, state never shown by colour alone.
3. **Works with the phone in the pocket or on the floor.** With the link up, the watch follows the phone
   within about a second. **If the link drops**, the watch keeps the rest countdown from the last snapshot
   (`rest.endsAt`), shows the one-step lookahead after an offline Set done, and **queues events** in its own
   storage until the phone acknowledges them; on reconnect the phone applies them in order and the next
   snapshot wins. A small "Not connected" line shows on the watch while offline (text, not only a colour).
   **The only supported setup is the phone unlocked with the screen kept on (M9)**, face down or in a pocket;
   a locked phone catches up on unlock. Task 1 found that a mirrored workout session only wakes the iPhone app
   now and then (minutes apart) and no Apple doc supports WKWebView JS running while locked, so M14 does not
   use session mirroring.
4. **Live heart rate** from an `HKWorkoutSession` (traditional strength training) on the watch, running from
   the first snapshot of a started session to Finish, paused with the app's Pause.
   - **Heart rate in the app** (switch, default **on**): the watch sends heart-rate samples to the phone;
     the phone shows the current value on the **Rest screen** and stores **per-set average and maximum** on
     `SetLog.hr` (warm-ups too, marked as such by the existing `warmup` flag). Raw samples live in memory only
     and are dropped once reduced. Samples that arrive late (link was down) are attached to the saved set.
   - **Recovery hint** (switch, default on; "Say it" switch, default off): during rest, when heart rate has
     come back down (rule below), the watch and the Rest screen show **"Heart rate back down. Ready when you
     are."** Coaching only: no zones, no age-based maximum, no "safe/unsafe", no warning about a high value,
     never spoken as a number.
   - **Health access (first watch workout):** a workout session needs permission to **write workouts**, so the
     **first time a session starts on the watch**, the watch shows one short explain screen and then the
     Health sheet (read heart rate + active energy, write workouts + the samples the session records). This
     happens **whether or not Save to Apple Health is on** (Decision "M14 task 1 findings"). Explain screen:
     "To show your heart rate, Gym Clean runs a workout on your watch. Health will ask for access. The workout
     is saved to Health only if you turn on Save to Apple Health." If access is denied, the watch still works
     as a remote without heart rate (task 2 checks whether a session can start at all), and Settings → Apple
     Watch says so.
   - **Save to Apple Health** (switch, **default off**; saving a workout record is new): it decides only what
     happens at Finish: on → `finishWorkout` (a Strength Training workout appears in Health); off →
     `discardWorkout` (**no workout record**). Turning it on shows what it does, no permission sheet (access was
     already asked at the first watch workout): "Saves each gym session as a Strength Training workout in
     Apple Health." Both states show the line: **"Either way, the heart rate and calories your watch measures
     during the session stay in Health, like your other Apple Watch readings."** (`discardWorkout` keeps
     samples already added; M11 reads them like any Apple Watch data.) M11's reads skip workouts written by
     this app (by source), so a saved one is never counted twice in the weekly load.

#### Goals — AirPods head motion (iPhone app, AirPods models with head tracking)
5. **Head frames from `CMHeadphoneMotionManager`** at the rate the AirPods deliver (not documented; measured
   in task 2; logic uses each frame's timestamp, never an assumed rate), only **during a set** of an
   exercise that has a head rule and only while the matching switch is on. Pure logic in
   `src/core/headmotion/` takes `HeadFrame`s and returns events, tested from recorded JSON like the pose rep
   counter. Rules and thresholds are **data** (`src/core/exercises/headRules.ts` plus a `head` field per rule).
6. **Three uses (each with its own switch in Settings → AirPods; all default off until he turns AirPods on):**
   - **Head still** (curls, rows, presses, lateral raise, triceps extension): yaw or roll moving away from the
     set's starting head position (median of the first second) beyond the rule's limit for longer than its
     hold time → the hint **"Keep your head still."** spoken **between reps** (after the next counted rep from
     the camera or the head counter; on a set nothing counts, once the drift has lasted the hold time), at most
     once per set, sharing the camera hints' cooldown and the voice queue (never cuts a count).
   - **Neck neutral** (push-up, rows, bent-over row, goblet squat): pitch beyond the rule's band from the
     set's start → **"Keep your neck long, eyes ahead."** Same timing rules. Coaching words only.
   - **Head-counted reps** for moves the camera can't see well: standing calf raises (the three catalog
     variants) and **dumbbell shrugs** (vendored into `exercises.json` from free-exercise-db if absent). The
     counter follows §3's ideas (smoothing, hysteresis, minimum leg times) on a vertical-movement signal. They
     start as **`learning`** (count shown and spoken, pre-fills the set via `SET_COUNTED`, corrected on Rest
     like the camera) and become `ready` only when real fixtures count ≥ 90% of sets exactly. The camera wins
     when an exercise has both.
7. **Permission:** the motion permission is asked **on first use** (turning on AirPods in Settings), after a
   **why page** ("Uses your AirPods' head movement to remind you to keep your head still and to count some
   reps. Stays on this phone."). AirPods missing, unsupported or disconnected mid-set → nothing happens and no
   error screen; Settings says which.
8. **Per-set numbers only.** Head frames are never stored or sent. A set keeps `SetLog.head` (share of the set
   the head stayed inside its limits, the number of head hints, the head-counted reps). The only way raw frames
   leave memory is the **owner-mode clip recorder** (below), on his tap, as a file through the share sheet.

#### Head-motion fixture recording guide (for Checkpoint L)
- Settings → About → Owner tools on → **Record head-motion clip**: pick the exercise and a label, type the
  reps you will do, Start, do the set with AirPods in, Stop, **Save file** (share sheet → AirDrop to the Mac).
  The clip stays in memory until saved; nothing is kept in the app.
- Per exercise: one **clean** clip (head still, full range) and one with **deliberate mistakes** (2–3 looks to
  the side, 2 chin-up / chin-down moments, and for calf raises / shrugs 2 half reps). 10–30 s each.
- Filename: `fixtures/headmotion/<exercise>/<label>__reps-<n>__drifts-<m>.json`, e.g.
  `shrug/clean-01__reps-12__drifts-0.json`. The JSON holds numbers only (time, attitude, acceleration); it is
  committed like pose landmarks. Phone on the bench, the same AirPods each time, nobody's voice is recorded.

#### Changes to earlier contracts
- **§6** listed "Apple Watch / heart rate" as out of scope: an Apple Watch companion app, live heart rate
  during a workout and opt-in workout writing to Apple Health are now in scope (M14 only).
- **M9 "Later"**: AirPods head motion and the Apple Watch move from "later" into M14.
- **M11** ("What stays out": writing to Health, Apple Watch app, live HR during sets): all three are now in
  M14, writing only as the off-by-default switch above. M11's reads, types and rules are unchanged; its
  workout de-duplication by source now matters (tested).
- **M13 first launch:** no new pages. The motion permission is asked from Settings on first use; the watch's
  Health access is asked on the watch at its first workout session; neither is in the first-launch flow.
  `OwnerSurface` gains the clip recorder.

#### Non-goals
Starting or editing a workout on the watch; a watch complication or Smart Stack widget; the watch working
without the iPhone app installed; standalone watch use; Wi-Fi/cellular watch features; heart-rate zones,
calorie targets from heart rate or any health score; writing anything to Health other than the gym-session
workout (opt-in) and the heart-rate/energy samples a watch workout session records; mirrored workout sessions
or any locked-phone mode; reading new Health types; head motion in the PWA; Android, Wear OS or other earbuds; spatial audio;
using head motion during rest; the paid Apple Developer account unless M14-q1 needs it and he says yes.

#### Privacy
- No network request by the app or the watch app. Phone ↔ watch messages use WatchConnectivity (Apple's
  paired-device link); there is no server of ours. No analytics, no crash reporting.
- Heart rate: samples in memory only; per-set average/max on `SetLog.hr` (local, backed up like sets). Kept
  out of **every coach/brain context** (rules, Apple, Claude), the dev log, the copy report and share images.
- Head motion: frames in memory only; per-set numbers on `SetLog.head` (local, backed up like sets; the dev log
  may hold the per-set numbers, never frames); out of every brain context and Claude.
- Health: a **workout record** is saved only with Save to Apple Health on. The heart-rate and energy samples
  the watch records during any watch session stay in Health even with it off (normal Apple Watch data, never
  sent anywhere by Gym Clean); the copy says so plainly and never says "nothing is saved". Info.plist strings:
  - iPhone `NSMotionUsageDescription`: the why text above.
  - Watch `NSHealthShareUsageDescription`: "Shows your heart rate during your gym session. Gym Clean doesn't
    send it anywhere."
  - Watch `NSHealthUpdateUsageDescription` (true with Save off): "Runs a workout on your watch so it can read
    your heart rate. Heart rate and calories from the session are added to Health. The workout itself is saved
    only if you turn on Save to Apple Health." The iPhone target carries the same update string if Xcode needs it.
- Signing data stays in the gitignored local config; the repo stays public.

#### Data model (adds to §4; final shape in `src/core/types.ts`)
```ts
// SetLog gains (optional, backed up like the rest of the set):
//   hr?: { avgBpm: number; maxBpm: number; samples: number };
//   head?: { stillPct?: number; hints?: number; counted?: number };
type WatchPhase = 'idle' | 'exercise' | 'rest' | 'summary';
type WatchSetView = { name: string; setNo: number; setCount: number; warmup?: true;
  repsText: string; weightText: string };                       // texts made on the phone, in his unit
type WatchSnapshot = { v: 1; rev: number; sentAt: number; sessionId: string | null; phase: WatchPhase;
  paused: boolean; dayName?: string; current?: WatchSetView;
  rest?: { endsAt: number; targetSec: number };
  next?: WatchSetView & { restSec: number };                   // one-step lookahead for offline Set done
  summary?: { sets: number; minutes: number; avgBpm?: number };
  settings: { hrInApp: boolean; recoveryHint: boolean; saveToHealth: boolean } };
type WatchEventType = 'SET_DONE' | 'START_SET' | 'EXTEND_REST' | 'PAUSE' | 'RESUME' | 'SKIP_EXERCISE';
type WatchEvent = { id: string; type: WatchEventType; basedOnRev: number; watchT: number };
type HrSample = { t: number; bpm: number };                    // watch clock, mapped on the phone
type WatchMessage = { kind: 'event'; event: WatchEvent } | { kind: 'hr'; samples: HrSample[] }
  | { kind: 'hello'; watchNow: number; appVersion: string;
      healthAccess?: 'notAsked' | 'granted' | 'denied' }        // workout-write status on the watch
  | { kind: 'ack'; ids: string[] };
type WatchSettings = { hrInApp: boolean; recoveryHint: boolean; sayRecovery: boolean;
  saveToHealth: boolean };                                     // settings 'watch'
type HeadFrame = { t: number; q: [number, number, number, number];   // attitude quaternion x,y,z,w
  acc: [number, number, number]; grav: [number, number, number] };  // user acceleration + gravity, g
type HeadRule = { still?: { maxYawDeg: number; maxRollDeg: number; holdMs: number };
  neck?: { maxPitchDeg: number; holdMs: number };
  count?: { signal: 'vertical' | 'pitch'; status: 'learning' | 'ready'; /* thresholds as in §3 */ } };
type HeadMotionSettings = { on: boolean; still: boolean; neck: boolean; count: boolean }; // settings 'headMotion'
type HeadEvent = { type: 'drift' | 'neck'; t: number } | { type: 'rep'; t: number; index: number };
// AppRoute gains: 'settings/watch' | 'settings/airpods' | 'settings/headclip'
// OwnerSurface gains: 'headClip'
// No Dexie version change (optional fields on sets; settings rows).
```
Recovery rule (data, `src/core/watch/hrRules.ts`, tuned at Checkpoint L): after ≥ 45 s of rest and with
≥ 15 s left, the 5 s median heart rate is ≤ baseline + 30% of (the set's max − baseline); baseline = the lowest
5 s median in the minute before the session's first working set, else the set's max − 25 bpm. Once per rest.

#### Accept
- Facts task done first (done 2026-11-17, Decision "M14 task 1 findings"): free-account verdict, mirrored
  session / locked-phone behaviour (not used), HealthKit-on-watch authorisation needs, AirPods model support.
  Task 2 spike on his devices records the checklist in that Decision (firmware, Developer Mode, first Health
  sheet contents, session with write denied, wrist-down HR, haptics, Health afterwards with Save off, measured
  AirPods rate).
- Unit tests, written first (made-up data):
  - watch protocol: snapshot from every session phase (warm-up, last set of an exercise, last set of the day,
    paused, summary), lookahead correct, each event → its reducer event, dedupe by id, stale rev dropped, a
    phone + watch double Set done logs one set, clock offset + clamp, queued events replayed in order;
  - heart rate: per-set avg/max from samples inside the set window, late samples attached to the saved set,
    nothing when off, recovery rule at its edges (45 s, 15 s left, baseline missing), copy passes `checkCopy`
    plus the M11 banned list; HR and head numbers absent from every brain context, the dev log (HR) and the
    copy report; backup round-trips `SetLog.hr` / `head`; M11 skips own-source workouts;
  - head motion from fixtures (synthetic first, his recordings when they arrive): set reference, still and
    neck detectors fire on drift clips and stay quiet on clean clips, hint timing (between reps, once per set,
    shared cooldown), head-counted reps exact on the clean clips, `stillPct` / `hints` / `counted` per set.
- Swift: `GymWatchCore` XCTests (snapshot decode, offline countdown, haptic schedule 10 s / 0 s, persisted
  queue until ack, HR buffer) and `GymHeadMotionCore` XCTests (quaternion → frame mapping, rate limit,
  unavailable / denied / disconnected states).
- E2E (390×844, fake `GymWatch` and `GymHeadMotion` bridges, no off-device request): Start → a snapshot is
  sent; watch Set done → Rest; duplicate and stale events ignored; offline queue replays; the Rest screen shows
  heart rate and the recovery line; the stored set has `hr`; Save to Health on → the explain step, then
  `saveToHealth: true` in the next snapshot (no permission call from the phone), off → `false`; the "Either way…"
  line shows in both states; Health access denied (from `hello`) → the Settings line; AirPods why page before the permission call; a drift clip → "Keep your
  head still." spoken between reps; a calf-raise clip counted; AirPods disconnect → no error; the PWA shows the
  "iPhone app" line and calls neither bridge.
- Swift: watch `GymWatchCore` XCTest that Finish with Save off calls discard (no workout saved) and with Save on
  calls finish; iPhone `WCSession` delegate implements the three lifecycle methods.
- Simulator: iPhone + paired watch simulators build; a round trip (Start on the phone, Set done on the watch,
  rest on both, link off → queue → link on → replay over `sendMessage` / `updateApplicationContext`;
  `transferUserInfo` is device-only and checked at Checkpoint L); watch screenshots of exercise, rest, controls, summary,
  not-connected on a 41 mm and a 46 mm (or Ultra) watch.
- 390×844 screenshots: Rest with heart rate + recovery line, Settings → Apple Watch, Settings → AirPods, the why
  page, the clip recorder (owner mode on). Version 1.16.0 with What's New pages.
- 🧍 **Checkpoint L** (gym, watch + AirPods on, a few sessions): phone in the pocket for one session and on the
  floor for another; Set done / Start now / Pause from the watch; haptics at 10 s and rest end; behaviour when
  he walks away from the phone and back; heart rate on the Rest screen and the recovery line (too early? too
  late?); the Health sheet at the first watch workout; one session with Save off (Health shows no workout, the
  session's heart-rate samples are there) and one with Save on (the workout in Health, and whether WHOOP
  double-counts it); taps made with the watch out of reach arrive once the phone is back (queued
  `transferUserInfo` path, device only); head hints fire
  when he looks around and stay quiet when still; calf raise / shrug counts; head-motion clips recorded per the
  guide. He reports through the "Wrist and ears" to-do or `/feedback`.

### M15 — Best-rep clips (approved 2026-11-17; builds after M14; release 1.17.0)
Wongsaton (2026-11-17): **"Don't forget about social engineer job, it can record in the app while i'm working out,
randomize record of the perfect lift up weight or anything to be good of public via instagram"**, and on the
no-recording rule: **"you can change that but need to save only on my phone not on cloud"**. CLAUDE.md's Privacy
hard rule was changed the same day to allow exactly this feature. Planner calls are in Decision "M15 Best-rep
clips" (2026-11-17) and can be corrected. Branch `m15-best-rep-clips`, cut from the M14 result (default order:
after M14; M15-q1). Works in the PWA and the iPhone app; each phone keeps its own clips.

#### Goals
1. **Opt-in per workout.** A **"Record best reps"** switch on the camera preview / Start screen, **off at the
   start of every workout**. While armed, the camera screen shows a **red dot and the word "Clips"** (not colour
   alone). Clips are made only on sets where the camera is running. The recorder uses the **same camera stream**
   as the rep counter; no second camera, no extra permission (except Sound, goal 4).
2. **Rolling buffer, kept only on a trigger.** The last **~8 s** of video are held **in memory only** and dropped
   on disarm, leaving the camera, Finish or the app going to the background. A clip (**4–6 s: the rep plus a
   ~1.5 s lead-in**, cut around the counted rep, data) is kept only when a trigger fires:
   - **Clean rep** (`form`): no form/focus cue fired, full range (far threshold reached, no partial), tempo inside
     the exercise's tempo band; the best such rep of the set;
   - **New best** (`best`): the set beats his best weight or e1RM for that exercise (warm-ups excluded) → the
     set's last rep;
   - **Hard set** (`hard`): he marks the set's effort **Hard** on the Rest screen → the set's last rep;
   - **Save last rep** (`manual`): a button on the Rest screen keeps the last rep of the set just done.
   At most **one automatic clip per set** and **5 automatic clips per workout** (data); when full, `best` >
   `hard` > `form` replaces the lowest of this workout. Manual saves are always kept. Triggers and thresholds are
   data in `src/core/clips/rules.ts`, tuned after Checkpoint M. (A spoken "save that" is not in M15: the slice 2
   mic never listens during a workout.)
3. **Others blurred, always.** Everyone except the tracked person is blurred (person segmentation of the tracked
   pose; the rest of the frame blurred). Strength **Light / Medium (default) / Strong**; there is **no off**. A
   frame without a person mask is **blurred entirely**. Blur, overlay and encoding run on the kept clip during
   rest; **no unblurred frame is ever written to storage**.
4. **Silent by default.** No audio track. Settings → Clips → **Sound** (off) adds the microphone track; the
   microphone permission is asked on first switch-on.
5. **Story-ready export.** H.264 MP4, **1080×1920 (9:16)**, with an overlay inside Instagram's safe margins
   (top ~250 px and bottom ~340 px kept clear; data): exercise name, **weight × reps** in his unit ("Show weight",
   on by default, per clip and in Settings), **"New best"** / **"Clean rep"** / **"Hard set"** (nothing for a
   manual save), and the Gym Clean mark. No body, Health, heart-rate or food numbers.
6. **Clips screen** (every user; opt-in, so not owner-only): from the workout **Summary** ("2 clips saved") and
   **Settings → Clips**. List newest first with trigger, date and "Deletes in N days"; a clip opens to **play**
   (muted, looping), **star**, **delete**, **Share**. Settings → Clips: blur strength, Sound, Show weight, what is
   kept and for how long, **Delete all clips**.
7. **Sharing is his tap only.** Share hands the MP4 to the native share sheet (iPhone app) or Web Share with a
   file (PWA), download as the fallback, so he can pick Instagram (Story, Close Friends). The app **never saves
   to the Photos app** because iCloud Photos may sync it; the clip screen says so: "Clips stay on this phone.
   Share sends a copy only where you pick. Choosing Save Video puts it in Photos, which may sync to iCloud."
8. **Performance.** With the recorder armed the pose loop stays **≥ 24 fps**; if not, the buffer drops to 540p /
   24 fps (data). Encoder path (WebCodecs ring buffer, MediaRecorder, or a native encoder in the iPhone app if
   WKWebView has neither) is decided by the facts task against current docs.
9. **Story pack.** After Checkpoint M the `social-media` agent builds a Story pack template from clips he picks;
   nothing is posted, and no clip or frame of him is committed (the repo is public).
10. **What's New 1.17.0:** Best-rep clips, blur + silent, Clips screen + Share, "stays on this phone".

#### Changes to earlier contracts
- **§6** "recording/saving video": opt-in best-rep clips are in scope (see "Changed by M15" there).
- **CLAUDE.md Privacy** (changed by main 2026-11-17) allows this feature only, as described here.
- **M3 / pose-engineer rule** "never record, store or upload frames": the recorder in `src/pose/clips/` may hold
  frames in memory and write **blurred** clips to local storage; still never upload.
- **M13 share images** ("no per-lift weights"): a clip may show weight × reps because he asked for it and shares
  it himself; Share month is unchanged.
- **M12 slice 2 mic**: unchanged (chat only); no voice trigger in workouts.

#### Non-goals
Recording whole sets or workouts; any upload, sync or cloud storage; saving to Photos by the app; posting to
Instagram or any API integration; editing/trimming, music or multi-clip Reels in the app; clips of other people;
clips in backups, the dev log, the copy report or any coach/brain/Claude context; a voice "save that".

#### Privacy
- Off by default every workout; visible dot + "Clips" while armed; the ring buffer is memory only.
- Others blurred (fails closed); no audio unless he turns Sound on.
- PWA: IndexedDB tables `clips` + `clipBlobs`, both local-only (never in Back up files; a restore leaves them).
  iPhone app: the video file in **Application Support/Clips, excluded from iCloud backup**; metadata in IndexedDB.
- Never uploaded, synced or saved to Photos by the app; never in the dev log, copy report, share stats or any
  coach/brain/Claude context. **Auto-deleted after 7 days unless starred.** No network request.

#### Data model (adds to §4; final shape in `src/core/types.ts`)
```ts
type ClipTrigger = 'form' | 'best' | 'hard' | 'manual';
type ClipOverlay = { exerciseName: string; weightKg?: number; reps: number; label?: 'New best' | 'Clean rep' | 'Hard set' };
type ClipMeta = { id: string; sessionId: string; exerciseId: string; setIndex: number; createdAt: number;
  trigger: ClipTrigger; durationMs: number; width: 1080; height: 1920; hasAudio: boolean; starred: boolean;
  overlay: ClipOverlay; storage: { kind: 'idb' } | { kind: 'file'; ref: string } };   // Dexie 'clips'
// Dexie 'clipBlobs': { id: string; blob: Blob }  (PWA only). Both in LOCAL_ONLY_TABLES; next Dexie version.
type ClipSettings = { blur: 'light' | 'medium' | 'strong'; sound: boolean; showWeight: boolean }; // settings 'clips'
type RepWindow = { start: number; end: number; repIndex: number };   // stream ms, 4–6 s
type ClipCandidate = { window: RepWindow; kind: 'last' | 'bestForm'; score?: number };  // memory only
type ClipRules = { bufferMs: number; leadInMs: number; tailMs: number; minMs: number; maxMs: number;
  maxAutoPerWorkout: number; priority: ClipTrigger[]; retentionDays: number;
  blurPx: Record<ClipSettings['blur'], number>; safeMargins: { top: number; bottom: number; side: number };
  fallback: { height: number; fps: number } };
// AppRoute gains: 'clips' | 'clip' | 'settings/clips'
```

#### Accept
- Facts task first: encoder path in iOS Safari + WKWebView, muxer choice, mask source and its fps cost; iOS
  storage location and backup exclusion; share of an MP4 file to Instagram via the share sheet.
- Unit tests, written first (made-up data): rep window clamping; each trigger, none, two on one set (one clip,
  highest priority), cap + replacement, manual over the cap, Hard after the set, warm-ups never `best`; ring
  buffer eviction and keyframe-aligned snapshots, disarm clears, no storage API touched; blur fails closed;
  overlay boxes inside the safe margins (kg and lb, long names); retention (7 days, starred kept); clip tables
  absent from backups and untouched by restore; no clip field in any brain context, dev log, copy report or
  share stats; copy passes `checkCopy`.
- Swift (iPhone app): every written clip file has the backup-exclusion flag; delete removes the file.
- E2E (390×844, fake camera with the synthetic clip, no off-device request): the switch is off on a new workout
  and nothing is recorded; armed → dot + "Clips" visible; counted reps → after the set a clip appears on Clips
  and plays (1080×1920, no audio track); "Save last rep" keeps one; star, delete and Delete all work; Share calls
  the share path with an MP4 file; a backup file contains no clip; a clip older than 7 days is gone on launch
  and a starred one stays; the next workout starts with the switch off.
- Performance: pose loop ≥ 24 fps armed vs off on the fake-camera run and on his iPhone (or the fallback shown
  to restore it); export time per clip noted.
- 390×844 screenshots: preview with the switch, camera with the dot, Rest with "Save last rep", Clips list, clip
  detail, Settings → Clips, Summary card; one 1080×1920 export frame (synthetic figures, blur visible). Version
  1.17.0 with What's New pages.
- 🧍 **Checkpoint M** (gym): he records a workout with clips on, checks the blur on the people behind him, and
  shares one clip to a private Story or Close Friends. He reports how many clips were kept and whether they
  were the right reps, through the "Best-rep clips" to-do or `/feedback`.

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
- Use the side with higher average visibility (left vs right) for unilateral views. **Exception (M13b):**
  one-sided exercises lock the side the session names (right, then left after Next arm); the counter
  never picks or switches it.

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
  // M13b: one-sided exercises; `reps` is then the lower of the two sides
  sides?: { right?: { reps: number; partials: number }; left?: { reps: number; partials: number } };
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
  source?: 'photo-local' | 'photo-ai';               // M7b: set on entries logged from a photo
  photoConfidence?: number;                          // M7b: confidence of the accepted guess (if it was offered)
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

**Changed by M12 (approved 2026-11-16):** "AI-generated programs" now allows exactly one thing: the M12
**focus block**, a 2–6 week dated plan that the app builds deterministically from his plan, his gym kit, the
vendored catalog and rules as data; the brain only chooses parameters and explains, and nothing applies
without his tap. Free-written AI programs stay out. **Speech recognition in the app** (M12 slice 2: iPhone
app, on-device, English, hold-to-talk) is in scope. "Sharing" stays out as an app feature; M12's Share month
only hands an on-device image to the system share sheet on his tap.

**Changed by M13 (approved 2026-11-17):** still no accounts, sync or in-app sharing. M13 adds a second
on-device share image (Story size, system share sheet on his tap) and one static landing page on GitHub
Pages with no script and no trackers. The app is not submitted to the App Store.

**Changed by M14 (approved 2026-11-17: "Add it and I need apple watch app too"):** "Apple Watch / heart rate"
is no longer out of scope for the iPhone app: an **Apple Watch companion app** (a remote for the phone's
session, with live heart rate from a watch workout session), per-set heart-rate average/max, opt-in writing
of gym sessions to Apple Health (off by default), and **AirPods head motion** (head-still / neck cues and
head-counted reps) are in M14. Still out: a standalone watch app, heart-rate zones or any health score,
medical wording, other Health writes, and all of it in the PWA.

**Changed by M15 (approved 2026-11-17: "you can change that but need to save only on my phone not on cloud"):**
"recording/saving video" now allows exactly one thing: opt-in **best-rep clips** (M15), short, with other people
blurred, silent by default, stored only in the app's storage on the phone (excluded from iCloud backup), deleted
after 7 days unless starred, and shared only by him through the system share sheet. Still out: recording whole
sets or workouts, any upload or sync by the app, saving to the Photos app by the app, clips in backups, the dev
log or any coach context. The M4c developer log still stores pose numbers only.

**PROPOSED change (M11, 2026-11-16; applies only if Wongsaton approves M11-q1):** reading a listed set of
Apple Health types in the native app (body mass, workouts, active energy, sleep, resting HR, HRV — including
what WHOOP shares into Apple Health) moves into scope as M11. Still out: an Apple Watch app, live heart rate
during sets, writing to Health (unless M11-q5), and any health score or medical wording.
