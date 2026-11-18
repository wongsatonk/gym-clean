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
| Seated DB shoulder press | front | elbow + wrist above shoulder | > 155° | < 100° |
| One-arm DB row | side | elbow | > 145° | < 90° |
| Goblet squat | side | knee (hip–knee–ankle) | > 160° | < 100° |
| Lateral raise | front | shoulder (hip–shoulder–elbow) | < 25° | > 75° |

  Lying exercises (bench press, flyes) are **experimental**: implement only if fixtures show
  the landmarks are stable; otherwise keep them manual-count.
- Live: big rep number, spoken count ("one… two…") optional toggle; auto-fill reps into the set log.
- **Accept:** on every committed landmark fixture, counted reps == the count in the filename,
  partial reps detected == the partial count. A fixture test suite runs in `npm run check`.
  Met on synthetic fixtures first; the real fixtures from Checkpoint B must also pass before M5.

### M4b — 3D exercise demo (added 2026-11-13)
- A simple original 3D mannequin (same style as the M2 body) loops each supported exercise's movement,
  driven by our own joint-angle keyframes (reusing the M4 per-exercise angle data). Shown on the
  Exercise screen on demand, to show the full range of motion and tempo.
- **Accept:** a demo for every pose-tracked exercise; the angles in the demo stay within that exercise's
  extended and contracted thresholds.

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
- History screen: last 4 weeks per exercise (weight × reps, focus score trend), including a
  "last 7 days" view of every session (requested at M1b).
- Lighthouse pass on accessibility; respect `prefers-reduced-motion`.
- **Accept:** installs on my phone home screen and works in airplane mode after first load.

### M6c — Story clip recorder with adjustable background blur (added 2026-11-13)
Record short clips of myself training **inside the app** to share on Instagram Stories, with
everyone and everything except me blurred. Opt-in, on the phone only.

**Recording**
- A **Record** button on the camera screen (and on pose-tracked exercises). Before the first
  recording: a one-time notice ("Video stays on your phone. Make sure you're allowed to film
  here. Background blur is on.").
- Composited 9:16 video: camera view + optional overlays (each a toggle): skeleton, live rep
  counter, set/exercise label, small "Gym Clean" tag. Overlays stay inside Instagram's safe
  zones (top ~13%, bottom ~18% kept clear).
- `canvas.captureStream(30)` + `MediaRecorder` (MP4/H.264 on iPhone Safari; check the supported
  mime types at runtime). Resolution 1080×1920 if the phone keeps ≥ 24 fps while tracking,
  otherwise 720×1280 (chosen automatically, shown in the UI). Max 60 s per clip, with a visible
  timer and a 3-2-1 countdown (spoken).
- **Microphone off by default** (other people's voices); a toggle turns it on.
- After stopping: preview → **Save / Share** via the iOS share sheet (`navigator.share` with the
  file → "Save Video" to Photos or straight to Instagram) → the clip is discarded from the app.
  Fallback: download. Never stored in IndexedDB, never uploaded by the app.

**Background blur (adjustable)**
- Person mask from the Pose Landmarker (`outputSegmentationMasks: true`, 1 pose) — keep me
  sharp, process everything else. Done in a WebGL shader (don't rely on canvas `filter`;
  check Safari support), so it stays fast on the iPhone.
- **Modes:** Blur (default) · Pixelate · Solid colour · Dim only · Off.
- **Sliders / options:**
  - Strength: blur radius / pixel size, 0–100 (default 70).
  - Edge softness: feather of the mask edge, 0–100 (default 40) — so the cut-out doesn't look
    harsh.
  - Background brightness: −100 (darker) to +50 (default −20) — makes me stand out.
  - Solid colour picker (Solid colour mode), from the app's dark palette plus custom.
  - Mask expand/shrink: −10 to +10 px (fixes hair/edge halos).
- **Presets:** Subtle · Strong (default) · Anonymous gym (max blur, darker) · Studio (solid
  colour). Last-used settings remembered (in the `settings` table).
- **Live preview** of the blur before and during recording; a split view (original ↔ blurred)
  while adjusting.
- **Fail-safe:** if pose tracking is lost or the mask confidence drops, the **whole frame** is
  blurred at the current strength until I'm tracked again (never shows an unblurred background
  by accident). "Off" mode asks for a confirmation each session.
- If a **second person** is detected (run detection with 2 poses every ~1 s), show and speak
  "Someone else is in frame — they're blurred," and make sure the mask only keeps the person
  being tracked (the one closest to the centre / largest).

**Accept:**
- Unit tests (pure, in `src/core/capture/`): preset → shader parameters, slider ranges and
  clamping, fail-safe decision (mask confidence, tracking lost → full blur), recording
  resolution/fps choice, safe-zone layout math, second-person rule.
- E2E (Chromium, fake camera with a synthetic clip): open recorder → change preset and sliders
  → record 3 s → preview → share/download a playable video; settings persist after reload;
  tracking lost → full-frame blur screenshot.
- 🧍 On my iPhone: record at the gym in Strong and Anonymous gym presets; check fps, the edge
  look, that other people are unreadable, and that the clip saves to Photos and posts to Stories.

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

### M8 — Wearables: AirPods Pro + Apple Watch (planned 2026-11-13, after M7)
I train with **AirPods Pro + Apple Watch and play music** the whole time. The app is a Safari
web app / home-screen PWA, so it can't read HealthKit or drive the Watch directly; this
milestone uses what the web can reach.

**8.1 Voice over music (AirPods)**
- All spoken cues must work while my music plays through the AirPods: short phrases, music ducks
  or mixes, nothing gets cut off. Add a "Voice" setting: cue volume (rate/pitch where Safari
  allows) and a "Test voice" button.
- 🧍 checked at the next gym checkpoint: are cues clear over music? Do they interrupt the music?

**8.2 Push-to-talk voice commands (AirPods mic)**
- A large "Hold to talk" button on the Exercise and Rest screens (≥ 56 px, thumb-reachable).
  No always-on listening (gym noise, battery, music).
- Commands (English first): "done" / "set done", "<n> reps", "weight <n>" (in the display
  unit), "skip", "pause", "resume", "next", "how long" (speaks rest left). Unknown → spoken
  "Sorry, say again", nothing changes.
- Parsing is pure (`src/core/voiceCommands.ts`, tests first: number words and digits, "twelve
  reps", "twelve", "done twelve", noise words). Recognition uses Safari's `SpeechRecognition`
  (`webkitSpeechRecognition`); hide the button when unsupported.
- **Privacy note in Settings, off by default:** Safari may send the audio to Apple's speech
  service to transcribe it. Nothing is recorded or stored by the app.
- Every voice action has the same effect as the button and is confirmed by voice ("Set 3 done,
  twelve reps").
- ✗ **Dropped:** AirPods stem-squeeze controls (Media Session API). iOS sends them to the app
  that's playing audio, which is my music player.

**8.3 Apple Watch workout import (Apple Shortcut)**
- I keep using the Watch's Workout app (Traditional Strength Training). After the workout I
  run an Apple Shortcut that reads that workout from Apple Health (start, duration, average
  and max heart rate, active kcal) and opens:
  `https://<site>/#/import/watch?start=<ISO>&dur=<sec>&hrAvg=<bpm>&hrMax=<bpm>&kcal=<kcal>`
- **Data goes in the URL fragment (`#…`), never the query string**, so it isn't sent to the
  web server. The app reads it, clears it from the address bar, and shows a confirm card that
  matches the workout to the Gym Clean session with the most time overlap (or lets me pick).
- Parsing + matching are pure and tested (bad/missing/out-of-range values rejected, units).
  Stored as `WatchWorkout` (see §4) on the phone only. Session Summary and History show HR and
  active kcal.
- Fuel (M7) shows active kcal for the day as information only. It never changes calorie
  targets automatically (watch estimates are rough).
- `docs/watch-shortcut.md`: step-by-step for me to build the Shortcut in the Shortcuts app
  (Find Health Samples / workouts → get details → URL → Open URL), with screenshots described in
  words. Claude can't build it on my phone.

**8.4 Rest alerts on the Watch (needs M6 + a decision)**
- When the rest timer ends while the phone is locked, a notification mirrors to the Watch as a
  wrist tap. iOS only delivers this for home-screen web apps via Web Push, and a locked phone
  pauses the page, so it needs a tiny push sender: e.g. a Cloudflare Worker (free tier) that
  stores my push subscription and sends one push at the rest end time.
- Only the push subscription and the alert time/text leave the phone; opt-in.
- **Open decision before building 8.4:** OK to run that small server? Until then the
  in-app voice cue (through the AirPods) is the rest alert.

**Not in M8 (see M9):** a native iOS/watchOS app (Swift, or the web app
wrapped with Capacitor + HealthKit) for live heart rate during sets, heart-rate-based rest, and
Watch buttons/haptics. Needs Xcode; free on my own phone but re-signed every 7 days unless I pay
for the Apple Developer Program ($99/yr).

**Accept:**
- Unit tests: voice command parser, Shortcut URL parsing/validation, session matching.
- E2E: mocked `SpeechRecognition` drives "twelve reps" → "done" → set logged with 12 reps and a
  spoken confirmation; opening a fragment import URL shows the confirm card, saves the
  WatchWorkout and removes the data from the URL.
- 🧍 **Checkpoint E:** at the gym with music on: voice cues over music, push-to-talk works
  through the AirPods, and the Shortcut imports that day's Watch workout.

### M9 — Native iPhone shell + AirPods head motion (planned 2026-11-13, after M8)
Wrap the same web app in a native iOS shell (Capacitor) so it can use what Safari can't:
**AirPods Pro head motion** (`CMHeadphoneMotionManager`), Apple Health, local notifications
(mirrored to the Apple Watch) and haptics. The GitHub Pages web app keeps working; every native
feature is behind `isNative()` feature detection with the M8 web path as the fallback.
Distribution: my own iPhone only, built from Xcode on my Mac (free personal team, re-sign every
7 days; the paid Apple Developer Program is optional, my decision later). No App Store.

**9.0 Feasibility spike first (🧍 needs my iPhone + AirPods)**
A minimal shell + plugin that shows live head pitch/yaw/roll and logs the sample rate. Check on
device, write the results in PROGRESS.md Decisions, then plan the rest:
- Motion streams while **my music plays from another app**.
- Motion + the **AirPods mic** at the same time (developers report motion stopping when the
  AirPods mic is in use). If it conflicts: in the native shell, nod gestures replace
  push-to-talk for simple commands, and push-to-talk pauses motion while held.
- Motion while the app is in the foreground with the screen kept awake; what happens on lock.
- Camera + MediaPipe pose still work inside the shell's WKWebView.

**9.1 Shell**
- Capacitor iOS project in `ios/`, `capacitor.config.ts`, scripts `npm run ios:sync` /
  `ios:open`. Same Vite build, bundled offline in the app. Keep-awake natively during sessions.
- Info.plist usage strings for motion, camera, microphone, speech recognition and Health,
  written plainly. No analytics, no extra network access.
- `docs/ios-setup.md`: step by step for me (Xcode, sign in with my Apple ID, trust the
  developer profile on the iPhone, re-sign every 7 days, how to update).
- CI: web build + tests unchanged; the iOS project must at least compile in CI if a macOS
  runner is available, otherwise it's checked locally.

**9.2 HeadMotion plugin (Swift → JS)**
- Wraps `CMHeadphoneMotionManager`: start/stop, connect/disconnect events, availability check,
  permission state. Emits `HeadMotionFrame` (see §4) to `src/native/headMotion.ts`.
- **Recorder** (dev screen): record labelled head-motion sessions and export JSON to Files →
  `fixtures/headmotion/<exercise or gesture>/<label>__reps-N.json` (or `__nods-N__shakes-M`).
  Head-motion numbers don't show me, so these fixtures may be committed (no video, no audio).
- Pure processing (filtering, resampling to a fixed rate, calibration) lives in `src/core/`.

**9.3 Head gestures (pure: `src/core/headGestures.ts`, tests first)**
- **Nod** (pitch down→up) = yes / "set done". **Shake** (yaw left→right→left) = no / skip.
- Only listens when the app asks a yes/no question (e.g. "Set done?" after movement stops,
  "Start set 3?", "Skip?"), never all the time, to avoid false triggers from training.
- Every gesture action is confirmed by voice, with a 5 s undo (button, or shake right after).
- Tuned on fixtures: deliberate nods/shakes + "noise" (walking, re-racking, looking around,
  drinking water, music head-bobbing).

**9.4 Head-motion rep counting**
- For exercises where the head moves: **push-up, goblet squat, lunge, pull-up / assisted
  pull-up, dip**. Per-exercise signal + thresholds as data in `src/core/exercises/*.ts`, same
  state-machine approach as the camera counter (SPEC §3: smoothing, hysteresis, min phase time).
- Not for curls, presses, raises or rows (head stays still) — those stay camera/manual.
- Source priority: camera when it's tracking well, head motion otherwise; when both run,
  show which one counted and log disagreements for tuning.

**9.5 Neck position cue**
- Calibrate neutral head pitch at set start (standing, looking ahead). During squats, rows and
  hinges, if pitch stays > ±25° from neutral for > 1 s: "Keep your neck neutral." Same rate limit
  as M5 cues, counts toward the focus score. Coaching hint only, never injury language.

**9.6 Automatic set start / end**
- During rest, a movement pattern that matches the next exercise's start → "Starting set 3"
  (setting, default on in the shell). After reps stop and I'm still for ~4 s → asks "Set done?"
  → nod / shake.

**9.7 Native replacements for the M8 workarounds (only when running in the shell)**
- **Apple Health** read (workouts, heart rate, active energy) replaces the Shortcut import.
- **Local notifications** for rest end (mirrored to the Apple Watch with a tap) replace the
  push server (M8.4 is then not needed).
- **Haptics** on the phone for set start / rest end.
- Live heart rate during sets needs a watchOS app → still out of scope (possible M10).

**Accept:**
- 9.0 spike results recorded; the plan for 9.1–9.7 adjusted to them.
- Unit tests: gesture detector on fixtures (≥ 95% of deliberate nods/shakes detected, ≤ 1 false
  trigger per 30 min of noise fixtures), head-motion rep counts exact on every fixture
  (`__reps-N`), neck-cue timing, auto start/end decisions, `isNative()` fallbacks.
- The web app (GitHub Pages) still passes all checks with no native code paths taken.
- 🧍 **Checkpoint F:** a gym session in the shell with music on: nod to finish sets, head-motion
  reps on push-ups/squats, rest alert on the Watch, Health data in the Summary.

## 3. Rep counter design

States: `TOP → DOWN → BOTTOM → UP → TOP` (named by angle direction per exercise).
- Joint angles use the 3D `world` landmarks when the frame has them, else 2D x/y;
  visibility always comes from the normalized landmarks.
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
  start threshold.
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

// M8 — Apple Watch workout imported via an Apple Shortcut (stored on device only)
type WatchWorkout = {
  id: string; sessionId?: string; start: number; durationSec: number;
  hrAvg?: number; hrMax?: number; activeKcal?: number;
  source: 'apple-watch-shortcut' | 'healthkit'; importedAt: number;
};

// M9 — AirPods head motion from the native shell (CMHeadphoneMotionManager)
type HeadMotionFrame = {
  t: number;                                          // ms since stream start
  attitude: { pitch: number; roll: number; yaw: number }; // radians
  quaternion?: { x: number; y: number; z: number; w: number };
  userAccel: { x: number; y: number; z: number };     // g, gravity removed
  rotationRate: { x: number; y: number; z: number };  // rad/s
  sensor: 'left' | 'right' | 'unknown';               // data arrives from one bud at a time
};
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
tracking, recording/saving video except the opt-in M6c Story clip recorder, Apple Watch / heart rate (M8/M9).
