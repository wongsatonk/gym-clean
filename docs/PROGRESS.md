# Gym Clean — Progress Log

Claude Code updates this file at the end of every task. A fresh session resumes from here.

## Status

- **Live:** c3c1f85, deployed 2026-11-13. It includes: the Push A slice (M4c + M4b), M5b round 1 (after-set coach), the S2 gauge, the M4d Pull A demos, the M4e step-1 mockups, the counter retune on the real Push A log (press image-plane angles, lateral-raise posture gate, push-up front variant + body-line gate), and **M5c Hands-free sets** (all 13 tasks done, verifier PASS recorded below).
- **In progress:** M5 Live trainer (focus & form cues) on branch `m5-live-trainer`, cut from c3c1f85. Plan below ("M5 — Live trainer").
- **Next step:** M5 wave 1 (see the plan's "Parallel waves"). M5 is planned around the real data we have: the 4 committed real lateral-raise clips, the 12 synthetic clips, and the press/push-up numbers in Decisions (that real data isn't committed).
- **Waiting on Wongsaton (none of these block M5 wave 1):**
  - 🧍 **Checkpoint B3**, the hands-free gym test: a training day with hands-free on, then the exported dev log (he'll report).
  - The **M4e design pick**: Energy / Pro / Track.
  - **Press "first press = positioning"?** He did 7 per set; the app counts 8. See the Decisions entry on the retune.
  - **Push-up set with a sit-down break:** is it one set or two? Hands-free currently saves it as two.
  - **The two older coach questions:** should the coach trust manually logged reps, and is the 25% jump guard right for light dumbbells?
  - New M5 questions are under "Blockers / questions".

## Milestone checklist

- [x] M0 Scaffold
- [x] M1 Guided workout flow
- [x] M1b Lists, notes, units → 🧍 Checkpoint A (gym test)
- [x] M2 Anatomy map (3D + 2D fallback) + focus cues
- [x] M3 Pose pipeline (+ 3D live skeleton) → 🧍 Checkpoint B (record fixtures)
- [~] M4 Rep counter: provisionally done on synthetic fixtures; real clips pending (Checkpoint B, or real sets from the M4c developer log)
- [x] M4c Coaching on the camera page + developer log (Push A slice; live). Checkpoint B2 is done: the Push A log was analysed and the counter retuned (Decisions)
- [x] M4b 3D exercise demos: the six Push A exercises + "3D demo"/"Info"/"Camera" badges (live)
- [~] M4d 3D demos for the other 24 exercises: Pull A done and live (curl, row, goblet squat, hammer curls, reverse flyes, lat pulldown); the rest are open. Doesn't gate M5
- [~] M4e Visual redesign: step 1 mockups live in docs/design/m4e-directions → 🧍 waiting for Wongsaton's pick (Energy / Pro / Track)
- [ ] M5 Live trainer: focus & form cues (partial cues moved to M4c) → 🧍 Checkpoint C (gym test with camera). **In progress, plan below**
- [~] M5b Trainer recommendations after the set: round 1 is live. The tempo rule (T1) is built in M5 (task 8)
- [~] M5c Hands-free sets: **built and live** (c3c1f85, verifier PASS) → waiting for 🧍 Checkpoint B3 (hands-free gym test)
- [ ] M6 Polish & install
- [ ] M7 Fuel: food & nutrition (independent of the camera; can be built while waiting on Checkpoint B with `/build M7`)
- [ ] M7b Food photo recognition: on-device Thai food classifier + optional Claude backup (after M7) → 🧍 Checkpoint D (my meal photos, train, test a week)

## Current milestone plan

### M5 — Live trainer: focus & form cues (planned 2026-11-13)
**Contract:** SPEC M5, including its "Plan decisions (2026-11-13)" block, and the M5b T1 row. Branch `m5-live-trainer`, cut from c3c1f85. Logic is **tests first**. Nothing is pushed or deployed without Wongsaton's OK.

**Real data available:**
- the 4 committed real lateral-raise clips: 80 reps, front view, both arms, `fixtures/landmarks/lateral-raise/real-2026-11-13-*`;
- the 12 synthetic clips (all six exercises);
- the real press and push-up numbers in Decisions. Their fixtures aren't committed, so those numbers can switch a rule **off** but never **on**.

**Shape:**
- `src/core/focus.ts` is a pure per-frame tracker, fed like `autoSet` (every camera tick, after the counter). It returns `FocusCue`s.
- Cues are spoken through the existing M4c `coachSpeech` policy as hints: they share its 6 s gap, a count word always wins, and stale cues are dropped. There is no second partial cue.
- Which rule is on for which exercise is **data on the exercise rule** (`focus` flags, including the push-up's `otherView` variant).
- The focus score is computed in core from the cue ids plus the partials. It is stored on the SetLog and recomputed when "Fix last set" corrects the partials.

**Ownership:** core-engineer: `src/core/**` and `src/data/db.ts`. ui-engineer: camera view, Summary component, e2e. pose-engineer: synthetic clips, converter. main: `types.ts`, `app.ts`, `playwright.config.ts`.

- [x] 1. [main] Shared types.
  - Files: src/core/types.ts.
  - Add `FocusCueId = 'rushedLowering' | 'shrinkingRange' | 'stalled' | 'outOfFrame' | 'lowFps' | 'armsOutOfSync' | 'raiseTooHigh' | 'elbowDrift' | 'bodySwing' | 'hipSag'`.
  - Change `SetLog.cues?: FocusCueId[]`: one entry per detection, ids not text. The field stays optional and isn't indexed, so there is no Dexie version bump and old rows still read.
  - Done when: `npm run typecheck` passes.
  - Deps: none.
- [x] 2. [core-engineer ∥A] Counter getters, **tests first**.
  - Files: src/core/repCounter.ts(+test).
  - `untracked: 'visibility' | 'posture' | 'bodyLine' | null`: why the last frame wasn't tracked; null when it was.
  - `sideAngles: { left: number | null; right: number | null } | null`: this frame's per-side joint angles in the rule's angle space (image plane for the press), before the EMA. Only for `sideMode: 'both'`.
  - Counting doesn't change.
  - Done when tests cover:
    - a hidden wrist → `visibility`;
    - a lean past `maxTorsoLeanDeg` → `posture`;
    - sitting on the push-up front variant → `bodyLine`;
    - per-side angles on a both-arms frame, in world space (lateral raise) and image space (press);
    - the fixture suite still has 17 cases with unchanged counts.
  - Deps: none.
- [x] 3. [core-engineer ∥B] `src/core/focus.ts`(+test) part 1: the tracker and the focus rules. **Tests first**, pure, no DOM.
  - Files: src/core/focus.ts(+test).
  - **Config:** `FocusConfig` + `FOCUS_DEFAULTS`: `baselineReps` 2, `rushedRatio` 0.5, `rangeRatio` 0.85, `streakReps` 2, `maxFiresPerRule` 2, `stalledSec` 8, `stalledHandsFreeFraction` 0.5, `outOfFrameSec` 2, `lowFps` 15, `lowFpsSec` 3, plus the geometry values used by task 5.
  - **Types:** `FocusRuleFlags = Partial<Record<FocusCueId, boolean>>`. `CUE_TEXT`: shown = spoken, ≤ 6 words, no banned words; the stalled cue is "Stay with it. {N} to go.".
  - **API:**
    - `createFocusTracker(rule, { config?, flags, targetReps, autoSet: AutoSetConfig | null })`.
    - `reset({ targetReps, seed?: RepEvent[] })`. The seed is the reps that auto-started a set and count toward the baseline. Reset keeps the once-per-camera low-fps flag.
    - `push({ t, present, tracking, untracked, phase, angle, sides, frame, events, fps, autoState, paused }): FocusCue[]`, where `FocusCue = { id, t, reps, value, baseline, threshold, text }`. Push returns at most one cue, by the priority in the SPEC.
    - `fired: FocusCueId[]`.
  - **Rules in this task:**
    - `rushedLowering` and `shrinkingRange`: reps only. A partial neither extends nor breaks a streak. Baseline = mean of the first 2 reps. After a fire the streak restarts. At most 2 fires per rule per set.
    - `stalled`, `outOfFrame` and `lowFps`: exactly as in SPEC M5 "Plan decisions".
    - Nothing fires while `paused`, or when autoState is `rest`, `pending` or `closed`.
    - A flag that is false never fires.
  - Done when tests cover:
    - the edges: eccentric at 49% / 51% of baseline, range at 84% / 86%;
    - 1 vs 2 reps in a row, and a partial between two rushed reps keeping the streak;
    - a seeded baseline;
    - ≤ 2 fires per rule, and the priority order;
    - the stalled matrix (below);
    - the out-of-frame cases (below);
    - low fps fires once per tracker, also across `reset`;
    - nothing in rest, pending or paused;
    - **real-data-like noise** gives no cue: ±5° jitter, 15–30 fps with dropped frames, a 450 ms gap;
    - the cue texts' word count and banned words.
  - Stalled matrix:
    - hands-free on, in the start band → no cue (the still stop wins);
    - hands-free on, out of the band → cue at 5 s, and the stop still comes at 10 s;
    - hands-free off → cue at 8 s, anywhere;
    - fewer than `stopMinReps` reps → the hands-free-off timing;
    - no cue once reps ≥ the target, and at most once per set.
  - Out-of-frame cases:
    - present but the visibility gate fails → cue;
    - a posture or body-line gate failure → never;
    - absent with hands-free on and ≥ 2 reps → none (the away stop speaks instead);
    - absent with hands-free off → cue after 2 s;
    - before the set's first rep → none.
  - Deps: 1. It uses task 2's getters only through the input shape, so it can start on stubs.
- [x] 4. [core-engineer ∥C] Focus score + reducer + DB, **tests first**.
  - Files: src/core/focusScore.ts(+test), src/core/session.ts(+test), src/data/db.ts(+test).
  - `focusScore(cues, partials)`: start at 100; −10 per tempo/range/form cue, −5 per `stalled`, −5 per partial; `outOfFrame` and `lowFps` cost 0; clamped to 0–100. Also `cueWeight(id)`.
  - Reducer:
    - new `SET_FOCUS { cues }`, accepted only in the `exercise` phase and only when not paused. It overwrites, like `SET_COUNTED`, and is cleared on the next set.
    - `SET_DONE` writes `cues` + `focusScore` only when the set got a `SET_FOCUS`, so manual sets have no score.
    - `CORRECT_LAST_SET` recomputes `focusScore` from the stored cues and the corrected partials.
  - db: `updateSet` takes an optional `focusScore`.
  - Done when tests cover: the weights and the clamp; a manual set → no score; a camera set with no cues → 100 − 5 × partials; recompute on correction (state and the DB row); reset on the next set; rest and paused ignored; every existing session and db test still passes.
  - Deps: 1.
- [x] 5. [core-engineer, after 2 + 3] `focus.ts` part 2: the geometry (form) rules, **tests first**. All rules use world landmarks, are visibility-gated (unknown = no fire) and need 2 reps in a row.
  - Files: src/core/focus.ts(+test).
  - `armsOutOfSync` (rules with `sideMode: 'both'`): |left − right| > 20° held ≥ 0.5 s while mid-rep (counter phase down/bottom/up). Uses `sideAngles`.
  - `raiseTooHigh`: rep `maxAngle` > 100°.
  - `elbowDrift`: during the lift, the upper arm (shoulder → elbow) swings > 25° forward of the torso line.
  - `bodySwing`: during the lift, the torso (hip mid → shoulder mid) direction changes > 15°.
  - `hipSag`: shoulder–hip–ankle angle < 160°. Only while the active view is `side`; never evaluated on the push-up front variant.
  - Done when:
    - tests built from synthetic landmark sequences (angle curves → landmarks, like repCounter.test) fire each rule at its edge and not 1° under it;
    - one bad rep doesn't fire;
    - every clean `synthetic-01` fixture (all six) fires none of the geometry rules with every flag forced on.
  - Deps: 2, 3.
- [x] 6. [core-engineer, after 3] Rule flags as data.
  - Files: src/core/exercises/types.ts (`focus?: FocusRuleFlags` on `ExerciseRule` and `ViewVariant`), the six rule files, src/core/exercises/index.ts (`focusFlagsFor(rule, active)`: the variant's flags override the rule's), index.test.ts.
  - Starting flags: the Decision table "M5 rule enablement". The lateral-raise geometry flags stay **false** until task 7.
  - Done when index.test asserts:
    - every flag key is a known `FocusCueId`;
    - each geometry rule is only set on the exercises SPEC M5 lists for it;
    - **a geometry flag can be true only if `fixtures/landmarks/<folder>/real-*` exists** (checked with `import.meta.glob`);
    - the push-up front variant has `shrinkingRange: false` and no `hipSag`;
    - the fixture suite is unchanged.
  - Deps: 3.
- [ ] 7. [core-engineer, after 5 + 6 + 9] Real-data replay + enable decision.
  - Files: src/core/focus.replay.test.ts, src/core/exercises/lateralRaise.ts (flags only).
  - Replay the 4 real lateral-raise clips through counter + focus tracker, with every lateral-raise rule forced on and autoState `set`. Also replay every synthetic fixture (01/02/03).
  - Pin the fire count per clip in the test, and report per rep: eccentric ratio, range ratio, `maxAngle`, the largest |L − R| held ≥ 0.5 s.
  - Apply the pre-registered criteria (Decision "M5 rule enablement") and flip `armsOutOfSync` / `raiseTooHigh` for the lateral raise only if they pass.
  - Write the numbers and the outcome as a Decision. A criterion that fails = the rule stays off, plus a question for Wongsaton. No silent threshold change: a retune is its own Decision, with the numbers.
  - Done when: the replay test is green, the flags match the criteria, and the Decision is written.
  - Deps: 5, 6, 9.
- [x] 8. [core-engineer ∥C, after 4] M5b tempo rule **T1**, **tests first**.
  - Files: src/core/advice.ts(+test).
  - Text: "Next time on {Name}: lower for 2 seconds." Spoken: "… lower for two seconds.". Why: "Slow the lowering: {k} of {n} sets". No Apply.
  - Fires when ≥ 2 of today's sets of the exercise have `rushedLowering` in `cues`.
  - Order: N1 > N2 > **T1** > N3 > N4 > N5 > N6.
  - Done when tests cover:
    - 1 set → no T1, 2 sets → T1;
    - N2 still wins;
    - T1 beats N3 (all top reps but rushed);
    - old rows without `cues` → never T1;
    - ≤ 12 words with the longest exercise name, no banned words;
    - `coachSummary` shows T1.
  - Deps: 1 (types only; sequenced after 4 to share one instance).
- [ ] 9. [pose-engineer ∥] Synthetic clips with form flaws (positive fixtures for the geometry and tempo rules).
  - Files: tools/synthetic.ts, tools/synthetic.html, scripts/synthetic.mjs, `fixtures/synthetic/<folder>/synthetic-03-<flaw>__reps-<n>__partials-<m>.webm`, `fixtures/landmarks/<folder>/synthetic-03-*.json`.
  - Clips, each 8 reps in the SPEC view:
    - lateral raise: left arm lags ~30° on reps 5–8, and reps 6–8 go to ~110°;
    - curl: elbow swings ~35° forward + torso swings ~20° on reps 5–8;
    - side push-up: hips sag ~30° on reps 5–8;
    - curl: lowering 2 s on reps 1–4, then 0.6 s on reps 5–8;
    - goblet squat: depth on reps 5–8 is ~75% of the baseline range, still past the 100° threshold.
  - The existing clips stay byte-identical. A clip under ~90% detection isn't committed (report it).
  - The pose-engineer doesn't touch thresholds: a clip the counter miscounts goes back to core-engineer.
  - Done when: the JSON files are committed with their detection rates, and the fixture suite counts each one by its filename.
  - Deps: none.
- [ ] 10. [pose-engineer, after 9] Converter report.
  - Files: scripts/devlog.mjs(+`scripts/devlog.test.mjs`).
  - The per-set report lists each `focusCue` event (id, rep, value / baseline) and the set's `focusScore` event.
  - Done when: a synthetic export with these events prints them, and the existing script tests pass.
  - Deps: none beyond the event shapes in tasks 11/13 (written in this plan).
- [ ] 11. [ui-engineer] Focus tracker in the camera view.
  - Files: src/ui/cameraView.ts, src/styles.css.
  - **Lifecycle:**
    - One tracker per camera sheet, only when the exercise has a rule (the Settings camera test has none).
    - Flags come from `focusFlagsFor(rule, counter.rule)`, so the push-up front variant gets its own.
    - Feed it every tick after the counter and `autoSet`, with no-pose ticks too.
    - `reset` at every set start (manual Start set, or the exercise phase), with the target = the top of the range.
    - On an auto start, seed it with the rest-mode rep events since the start action's `at`. Keep ≤ 8 s of those events.
    - Nothing is fed in rest mode, while paused, or during the Undo window.
  - **Each cue:**
    - show it in the coach line for 4 s (≥ 20px, `data-cue="<id>"`);
    - speak it with `policy.hint(text, now)`;
    - log it with `recorder.logEvent('focusCue', { id, t, reps, value, baseline, threshold })` (enum + numbers only).
  - **New option:** `onFocus(cues: FocusCueId[])`, called at a set's first counted rep and after every cue.
  - Done when:
    - typecheck + lint clean;
    - the existing camera e2e specs (camera-layout, rep-panel, rep-count, hands-free, devlog-camera) still pass;
    - by hand on the fixture landmarker, "Slow the lowering." is spoken after a count word, never over it.
  - Deps: 2, 3, 6. Task 5 lands behind the same interface.
- [x] 12. [ui-engineer, second instance ∥] Summary focus component.
  - Files: src/ui/focusSummary.ts(+test), src/styles.css.
  - `createFocusSummary(logs, name)`, per exercise with camera sets:
    - "Set 2 · Focus 80" (score ≥ 28px);
    - the fired cues with counts ("Slow the lowering ×2", "1 partial");
    - one explainer line ("Start 100 · −10 per cue · −5 per partial or stall");
    - attributes `data-focus-set`, `data-focus-score`, `data-focus-cue`.
  - Renders nothing when there are only manual sets. Text ≥ 20px. Cue labels come from `CUE_TEXT`; it can start from this plan's ids.
  - Done when: a unit test (render / omit), a 390×844 screenshot (harness), typecheck + lint clean.
  - Deps: 1.
- [ ] 13. [main] Wiring.
  - Files: src/ui/app.ts, playwright.config.ts.
  - `onFocus` → `SET_FOCUS`. Before a hands-free commit's `SET_DONE` the cues are already in state.
  - Summary mounts `createFocusSummary`, next to the Coach section.
  - Fix last set (Rest and Summary) passes the recomputed `focusScore` to `updateSet`.
  - Dev log: `logEvent('focusScore', { score, cues: n, partials })` when a camera set is saved.
  - T1 reaches Rest/Summary through the existing coach code.
  - Add `e2e/focus-cues.spec.ts` to the right Playwright project.
  - Done when, by hand on Pull A with the fixture landmarker:
    - a curl set with rushed lowering → "Slow the lowering." after a count word;
    - the set saves (manual and hands-free);
    - the DB row has `focusScore` + `cues`;
    - Fix partials changes the score;
    - a second rushed set → Summary shows Focus < 100 with the cue and the Coach line T1;
    - a manual exercise has no score.
  - Deps: 4, 8, 11, 12.
- [ ] 14. [ui-engineer] E2E `e2e/focus-cues.spec.ts`. Fixture landmarker as in hands-free.spec.ts, real timers, mocked speech that records order.
  - Cases:
    1. rushed lowering on reps 3–4 → "Slow the lowering." once, after the count word; never two cues within 6 s; a partial still speaks only its M4c hint;
    2. hands-free rest mode: rushed reps → no cue;
    3. no cue during the Undo window;
    4. hands-free, held outside the start band → "Stay with it. N to go." at ~5 s, then "Set done. N reps." at ~10 s; held in the band → only "Set done" at 6 s; hands-free off → the stalled cue at ~8 s;
    5. hidden wrists while present → "Step back into frame."; walking away with hands-free on after ≥ 2 reps → only "Set done";
    6. a disabled rule (`elbowDrift` on the curl) never fires;
    7. Summary shows "Focus" + the cue; the IndexedDB row has `focusScore` / `cues`; Fix on Rest recomputes the score;
    8. two rushed curl sets → Summary Coach T1;
    9. the dev-log export has `focusCue` events whose data holds only ids and numbers;
    10. no third-party request.
  - Done when: it passes with `--repeat-each=3` and the full `npm run e2e` is green.
  - Deps: 13.
- [ ] 15. [reviewer] Review the branch diff against CLAUDE.md:
  - pure core (focus.ts / focusScore.ts: no DOM, no MediaPipe);
  - every rule's thresholds and flags are data (no `if (exercise === …)`);
  - no geometry flag on without real fixtures (task 6's test);
  - voice over screen (every cue spoken through the policy, never over a count);
  - no second partial cue; no cues in rest mode or the Undo window;
  - no medical words; sizes (20 / 56 / 64px);
  - privacy: dev-log cue data = enum + numbers;
  - hands-free off and manual exercises unchanged apart from the score.
  - Deps: 7, 10, 14.
- [ ] 16. [verifier] Verify against SPEC M5 Accept.
  - `npm run check`: fixture suite counts unchanged, plus the synthetic-03 clips; the replay test green. Also `npm run e2e` and `npm run build`.
  - 390×844 screenshots, console clean: `docs/screenshots/m5-camera-cue.png`, `m5-camera-stalled.png`, `m5-summary-focus.png`, `m5-coach-tempo.png`, `m5-rest-fix-score.png`.
  - A dev-log export after the flow shows `focusCue` + `focusScore` events, and `npm run devlog -- --dry-run` lists them.
  - The task 7 Decision exists, and the flags in the code match its table.
  - Evidence into PROGRESS.
  - Deps: 15.
- [ ] 17. [main] Merge `m5-live-trainer`, then **ask Wongsaton before pushing** (push = deploy). Deps: 16.
- [ ] 18. 🧍 **Checkpoint C:** a full camera session at the gym with hands-free on.
  - Wongsaton notes every cue that felt wrong or missing, whether the Summary focus scores match how the sets felt, and anything spoken at a bad moment.
  - He exports the dev log → `npm run devlog` → retune `FOCUS_DEFAULTS` / flags (logged as Decisions).
  - A deliberate-mistake set per exercise (SPEC §5) would let the off rules be switched on (see questions).

**Parallel waves:**
- **Right away:** 1 [main] (minutes), 2 [core ∥A], 9 [pose], 12 [ui second instance, from this plan's ids]. Then, as soon as 1 lands: 3 [core ∥B] and 4 [core ∥C].
- **Wave 2:**
  - 5 [core ∥A, after 2 + 3];
  - 6 [core ∥B, after 3];
  - 8 [core ∥C, after 4];
  - 10 [pose, after 9];
  - 11 [ui, after 2 + 3 + 6].
- **Wave 3:** 7 [core, after 5 + 6 + 9], 13 [main, after 4 + 8 + 11 + 12].
- **Then:** 14 → 15 (also needs 7, 10) → 16 → 17 → 18.
- **Critical path:** 1 → 3 → 6 → 11 → 13 → 14 → 15. The three core instances never share a file: ∥A owns repCounter then focus part 2, ∥B owns focus.ts then the exercises, ∥C owns focusScore/session/db then advice. 5 and 3 are both focus.ts, so 5 starts only after 3 is in.

### M5c — Hands-free sets (planned 2026-11-13)
Wongsaton's request after his first real camera session: auto start and stop, no tapping. Contract: SPEC M5c (defaults, reasons, speech order, Accept). Branch `m5c-hands-free` off m4d-next, cut after the lateral-raise phantom-rep fix and the press/push-up retune are committed (only task 6 touches a file the retune touches). Logic is **tests first**. Nothing is pushed/deployed without Wongsaton's OK. Design choice that keeps it small: the Undo window **delays the save** instead of undoing it, so there is no "un-log" reducer event, no DB delete and no dev-log reversal; the save is backdated to the end of the last rep.

- [x] 1. [core-engineer ∥A] `src/core/autoSet.ts`(+test), **tests first**. Pure, no DOM. `AutoSetConfig` + `AUTO_SET_DEFAULTS` (SPEC M5c values), `createAutoSet(config)` with `setSession({ phase: 'exercise' | 'rest' | 'other', paused, restElapsedMs }, t)`, `push({ t, tracking, phase: RepPhase, events: RepEvent[], reps, partials }): AutoSetAction[]`, `undo(t)`, `confirm(t)`, `state`, `pendingUntil`. Actions: `start { at, reps, partials }` (at = when the first rep left the start band, tracked from phase transitions), `stopPending { reason: 'still' | 'away' | 'stalled', reps, partials, endedAt }`, `stopCancelled { reason: 'undo' | 'rep' }`, `commit { endedAt }`, `close { reason: 'noPerson' | 'noRep' }`. Times on the frame clock; the caller converts to wall time. Done when: tests cover clean set → still stop at 6 s → commit at +5 s with endedAt = last event t; away (3 s untracked) and stalled (10 s outside the start band); < 2 reps never stops; Undo and a rep inside the window cancel, after which the still stop needs 12 s; confirm() commits at once; rest: no start before 10 s of rest, a lone phantom rep → no start, two reps 9 s apart → no start, two reps ≤ 8 s → start backdated to the first departure with reps 2 + the partials in between; partials alone never start; paused / phase 'other' → no actions; idle close at 180 s untracked and 600 s without a rep (never during pending); **noise cases built like real data**: ±5° jitter inside the start band at 15–30 fps with dropped frames (no stop reset, no start), 1–2 gated frames mid-set (no away stop), a 450 ms tracking gap, and a slow 3 s lowering (no still stop mid-rep). Deps: none.
- [x] 2. [core-engineer ∥B] Backdated timestamps in `src/core/session.ts`(+test), **tests first**. `START_SET.now` is clamped to ≥ the current rest segment start (`restRunningSince`, so a backdate across a pause/resume can't make a negative segment) and `SET_DONE.now` to ≥ `setStartedAt`. No new event types. Done when: tests cover a backdated START_SET (rest taken = rest start → given time, overrun counted on that value), a too-early START_SET after a resume (clamped), a backdated SET_DONE (endedAt, restRunningSince = given time, rest elapsed at "now" includes the gap), a SET_DONE before setStartedAt (clamped), and every existing session test still passes. Deps: none.
- [x] 3. [core-engineer ∥B, after 2] "Hands-free sets" setting in `src/data/db.ts`(+test): `getHandsFree / setHandsFree`, key `handsFree`, default on (only an explicit false turns it off), like `getCoachTips`. Done when: db test covers default, set, read back. Deps: none (sequenced after 2 to share one instance).
- [x] 4. [core-engineer ∥C] Dev-log pre-roll in `src/data/devlog.ts`(+test), **tests first**. While no set is open, `frame()` / `angle()` keep the last 10 s in memory (never persisted on their own); `beginSet(info, { prerollFromT? })` moves the buffered frames/angles with t ≥ `prerollFromT` into the new set. Done when: tests cover the 10 s cap, nothing stored without a set, pre-roll frames in the exported set (frame order, round trip within 1e-4), no pre-roll when `prerollFromT` is omitted (M4c behaviour), and the size test still ≤ 0.47 kB per frame. Deps: none.
- [x] 5. [core-engineer ∥A, after 1] Commit-time coach tip in `src/core/advice.ts`(+test), **tests first**: `adviceSpeakOnCommit(restElapsedMs, restTargetSec): boolean` = the tip (≈ 4 s) still ends ≥ 5 s before the "Ten seconds" cue, i.e. `restTargetSec*1000 − 10000 − restElapsedMs ≥ 9000`. `adviceSpeakDue` unchanged. Done when: tests cover 60 s / 11 s elapsed (true), 30 s / 11 s (true, 9 s left exactly), 25 s / 11 s (false), and a rest already past target (false). Deps: none.
- [x] 6. [core-engineer, after the retune is committed] Optional per-exercise override: `autoSet?: Partial<AutoSetConfig>` on `ExerciseRule` in `src/core/exercises/types.ts`, and `autoSetConfigFor(rule)` in autoSet.ts (defaults ← override). No rule sets one yet. Done when: exercises/index.test asserts every override key is a known config key with a finite value > 0, and the fixture suite is unchanged. Deps: 1.
- [x] 7. [ui-engineer] Hands-free components, new files + CSS. `src/ui/autoStopBanner.ts`: `createAutoStopBanner({ reps, partials, undoSec, onUndo })` → "Set done · 8 reps" (≥ 64px number), full-width **Undo** ≥ 72px tall with a live countdown ("Undo · 4"), `data-auto-stop`, `data-reason`, `aria-live`. `src/ui/cameraRestPanel.ts`: `createCameraRestPanel({ nextLine, onStartSet, onClose })` with `setClock(remainingMs)` (≥ 64px, amber "+0:12" when over, `data-cam-rest-clock`, **not** `data-rest-clock`, which app.ts's tick already queries), and `slots` for the coach tip and the Last-set Fix elements app.ts passes in; Start set and Close ≥ 56px; a dark backing so the dimmed video behind stays visible above it. Files: src/ui/autoStopBanner.ts, src/ui/cameraRestPanel.ts, src/styles.css. Done when: 390×844 screenshots (harness or after 8) of the banner and of the rest panel with a coach tip + Fix, nothing overflowing, text ≥ 20px, typecheck + lint clean. Deps: none (shapes from this plan).
- [x] 8. [ui-engineer, after 7] Camera sheet lifecycle across sets. Files: src/ui/cameraView.ts (+ src/ui/voice.ts if needed). New option `handsFree?: { config, onAutoStart(atWall, counts), onCommit(endedAtWall), onStopPending?, onStopCancelled?, onIdleClose(reason) }`; methods `setSession({ phase, paused, restElapsedMs })` (rest → counter reset, rest mode: silent counter, no hints, no `onCount`; exercise via manual Start set → counter reset to 0, set mode), `setRest({ remainingMs, nextLine, slots })`, `setBegun()` (re-send camera meta to the recorder after each beginSet: delegate, side, folder, wallT0). Feed `createAutoSet` every frame after the counter; frame clock → wall via `wallT0`. Auto start: switch to set mode with the start counts, `onAutoStart` before the next `onCount`, then speak the count. Stop pending: mount the banner, speak "Set done. N reps." (`kind: 'cue'`, also with spoken count off); Undo / rep → unmount, "Keep going."; Set done tapped during pending → `confirm()`; commit → `onCommit` (the app decides close vs rest mode). Idle close → "Camera off." then stop tracks. Every action → `recorder.logEvent('autoSet', { action, reason, reps, partials, at, phase, angle })`. Without `handsFree` the view behaves exactly as today. Done when: typecheck + lint clean, the existing camera e2e specs still pass, and a manual run on the fixture landmarker shows stop → banner → rest mode → auto start. Deps: 1, 7.
- [x] 9. [main] Wiring. Files: src/ui/app.ts, playwright.config.ts. Load `handsFree` at start; Settings switch "Hands-free sets" (56px, persisted via 3). With it on and a pose exercise: pass `handsFree` into the camera; `onAutoStart` → `START_SET { now: at }` then `SET_COUNTED`; `onCommit` → `SET_DONE { now: endedAt }`; manual Set done no longer closes the sheet while sets of this exercise remain; on every dispatch call `camera.setSession(...)`; close the camera when the set saved was the exercise's last (phase rest with another exercise upcoming, or summary) or on idle close; `beginSet` for an auto-started set passes `prerollFromT` = start − 1.5 s, then `camera.setBegun()`; `tick()` → `camera.setRest(...)` with the coach tip + Fix elements as slots (same instances as the Rest screen's). Coach tip for a hands-free commit: speak at the save if `adviceSpeakOnCommit(elapsed, target)`, mark it spoken (`adviceSpokenKey`), and set `lastCueElapsedMs = elapsed` so no stale rest cue fires. Rest screen: a ≥ 56px "Camera" button when the upcoming exercise is pose-tracked and hands-free is on → open the camera in rest mode. Off = today's code path. Add the new e2e specs to the right Playwright projects. Done when: by hand on Pull A with the fixture landmarker: curl → camera → reps → stillness → "Set done" + Undo → saved → rest mode with clock + tip → reps → auto start with rest taken correct → last set → camera closes → Rest shows Camera for the next pose exercise; and with the switch off everything behaves as before. Deps: 2, 3, 4, 5, 8.
- [x] 10. [pose-engineer] Converter for hands-free sets: `scripts/devlog.mjs`(+`scripts/devlog.test.mjs`) handles pre-roll frames before the set's start and one camera frame clock spanning several sets (rebase per set), and the report lists each set's auto start/stop reason from the `autoSet` events. Done when: a synthetic-curl export built with pre-roll + two sets on one clock converts to two fixtures the suite counts correctly, and the existing script tests pass. Deps: 4.
- [x] 11. [ui-engineer] E2E. `e2e/hands-free.spec.ts` (fixture landmarker served in place of `src/pose/landmarker.ts`, like camera-layout.spec.ts, with `__freezeAt` = hold a start-position frame and `__noPerson` hooks; real timers; mocked speech records order): (i) reps → freeze → "Set done. N reps." spoken after ~6 s, Undo visible ≥ 56px with a countdown, **no** IndexedDB set row during the window, a row after it with `endedAt` ≈ the last rep and reps = N, rest clock already ≈ 11 s in; (ii) Undo → "Keep going.", no row, unfreeze → counting continues from N; (iii) unfreeze inside the window → cancelled without a tap; (iv) rest mode: unfreeze at 5 s of rest → no start; after 10 s → 2 reps → set 2 running, `restTakenSec` matches the backdated start, "Two" spoken; (v) speech order: last count word → "Set done…" → coach tip (A-rule set-up via steppers) → nothing cancelled; (vi) after the exercise's last set the camera closes and the Rest screen shows "Camera" for the next pose exercise, which opens in rest mode; (vii) "Hands-free sets" off (after reload) → freeze 15 s → no auto stop, Set done closes the sheet (M4 behaviour); (viii) no third-party request. `e2e/hands-free-live.spec.ts` (`mobile-person-camera`, synthetic curl loop, real model): Rest → Camera → auto start after the arming time; skips below 8 fps in CI like rep-count.spec.ts. Done when: both pass with `--repeat-each=3` and the full `npm run e2e` is green. Deps: 9.
  - Evidence 2026-11-13 (d06e9f6). Task 9's by-hand flow is covered by e2e/hands-free.spec.ts with the fixture landmarker. (vi) runs on Push A, with the press → lateral raise, not Pull A. Steps covered: reps → still → "Set done. 2 reps." + Undo → saved, backdated → rest mode with clock + tip → auto start with restTakenSec matching → last set auto-saved, next-time tip spoken at the save → camera closes → Rest shows Camera for the next pose exercise. (vii) is switch off = M4 behaviour. Results on E2E_PORT=5198:
    - `hands-free.spec.ts --repeat-each=3`: 21/21
    - `hands-free-live.spec.ts --repeat-each=3`: 3/3
    - full `npm run e2e`: 58 passed, 0 flaky
    - `npm run check`: vitest 824/824, script tests 13/13
  - rep-count and devlog-camera seed hands-free OFF (`e2e/hands-free.helpers.ts`), since they test the M4 tap flow.
  - Review fixes:
    - the coach tip is now spoken at the auto-save of an exercise's last set (before, the camera had already closed and the tip was dropped);
    - aria-hidden on the Undo description;
    - stop() during start() no longer leaks the stream or tracker;
    - auto start/stop wall times use `Date.now() - (frameNow() - t)` (iOS suspend).
  - Known limit: while the tab is hidden, a pending Undo window doesn't advance, so the set saves when the tab is visible again.
  - The Rest-screen Camera button is the existing top-bar one; it shows for pose exercises whether hands-free is on or off.
- [x] 12. [reviewer] Review the branch diff against CLAUDE.md: pure core (autoSet has no DOM/MediaPipe), privacy (no new storage of frames beyond the set + 1.5 s pre-roll, nothing uploaded), voice over screen (stop/undo/close are spoken), 56px/20px/64px, no medical words, off = unchanged behaviour. Deps: 10, 11.
  - Evidence 2026-11-13 (60b53ec): PASS, no blocking items. Checked: pure core, privacy (pre-roll in memory only, capped at 10 s), stop/undo/close spoken, sizes (Undo 88px, rest buttons 72px, numbers 88/72px), no medical words, off = unchanged, SPEC Accept unit list covered. Follow-ups:
    - Close during the Undo window drops the pending stop; it should commit it.
    - Capture the hands-free setting per camera.
- [x] 13. [verifier] Verify against SPEC M5c Accept: `npm run check` (fixture suite unchanged), `npm run e2e`, `npm run build`, 390×844 screenshots `docs/screenshots/m5c-pending-undo.png`, `m5c-camera-rest.png`, `m5c-auto-started.png`, `m5c-rest-camera-button.png`, `m5c-settings-hands-free.png`, console clean; a dev-log export after the flow shows `autoSet` events and an auto-started set whose frames start before its start; evidence into PROGRESS. Deps: 12.
  - Evidence 2026-11-13 (1d527ef). PASS on the second round.
  - Round 1 failed: the auto-started set had empty camera meta in the dev log. Cause: `rec()` queued `beginSet` a microtask after the camera's same-task `setBegun()`. Fix: once the recorder exists, `rec()` runs immediately.
  - Same round, also fixed:
    - Close during the Undo window now saves the set.
    - Hands-free confirmations are logged as speech kind 'cue'.
    - The hands-free setting is captured per camera.
    - The switch is now labelled "Hands-free sets".
  - Round 2 results:
    - `npm run check`: vitest 824/824, scripts 13/13; fixture suite unchanged (17 cases).
    - `npm run e2e`: 60 passed, 0 flaky.
    - `npm run build`: OK.
    - Dev-log export of the m5c flow: 5 `autoSet` events (stopPending → commit → start → stopPending → commit). Set 2 (auto start) has camera meta curl/CPU/right/wallT0, its first frame is 1492 ms before startedAt, and its speech is "Two", "Set done. 2 reps.". `scripts/devlog.mjs --dry-run`: 2 sets would be written, 0 skipped; set 2 shows `start:auto stop:still pre 1.5s`.
    - Screenshots in `docs/screenshots/`: m5c-pending-undo, m5c-camera-rest, m5c-auto-started, m5c-rest-camera-button, m5c-settings-hands-free. All 390 wide, console clean (headless GPU warnings only). Undo 88px, rest buttons 72px, numbers 88–96px, smallest text 20px.
  - Known gaps:
    - The two reps that start a set happen before the set opens, so they have no rep events; the converter re-counts them from the pre-roll frames.
    - While the tab is hidden, a pending Undo window pauses.
  - Cosmetic, not fixed:
    - The gauge shows faintly through the Undo banner.
    - The camera rest line shows the next set's reps value (the last set's count) while the tip says the target.
- [x] 14. [main] Merge `m5c-hands-free`, then **ask Wongsaton before pushing** (push = deploy). Deps: 13. Done: live as c3c1f85 (2026-11-13).
- [ ] 15. 🧍 **Checkpoint B3 (hands-free gym test):** a training day with hands-free on; note every wrong auto start/stop and whether 6 s stillness / 5 s Undo feel right; export the developer log and send it → retune `AutoSetConfig` (logged as Decisions).

**Parallel waves:** Wave 1: 1 [core ∥A], 2 → 3 [core ∥B], 4 [core ∥C], 7 [ui]. Wave 2: 5 [core ∥A], 6 [core, once the retune is in], 8 [ui, after 1 + 7], 10 [pose, after 4]. Then 9 → 11 → 12 → 13 → 14 → 15. The ui-engineer path (7 → 8 → 11) is the critical path; 7 can go to a second ui instance at the start since it only adds new files + CSS.

### M5b — After-set coach (built while Wongsaton trains)
Round 1 of M5b, ahead of M5 (reps/partials/rest/weight rules only). The exact rule table, texts, priorities, unit steps and speech timing are in SPEC M5b "round 1 rule table": that table is the contract for the tests. Branch `m5b-coach` (main picks the base: m4d-next or main). Nothing is pushed/deployed without Wongsaton's OK. Logic is **tests first**.

- [x] 1. [core-engineer ∥A] `src/core/advice.ts`(+test), **tests first**. Pure, no DOM. API: `afterSetAdvice(s: SessionState, name: (id) => string): Advice | null` (moment (a), or the exercise's next-time advice when the just-done set was its last planned set) and `coachSummary(s, last: Record<string, SetLog[]>, name): { exerciseId, next: Advice | null, progress: string | null }[]` (one entry per exercise with ≥ 1 set today, in day order). `Advice = { exerciseId, rule: 'A1'…'N6', text, say, why, apply?: { weightKg } }`. Also `adviceSpeakDue(prevMs, currMs, restTargetSec): boolean` (crosses 2000 ms, currMs ≤ 6000, target ≥ 17 s). Done when: tests cover every rule A1–A5, N1–N6, P1–P2 with its true/false edge; priority (A1 over A2 over A3; N1 over N2; final set → N rule, not A); kg 2.5 and lb 5 steps, including lb weights stored as odd kg (35 lb → "+5 lb", apply = 40 lb in kg); the 25% jump guard (5 lb on 15 lb → none/“more reps”, 5 lb on 20 lb → allowed); bodyweight → reps only, never an `apply`; A3 needs ≥ 2 sets; overrun uses the previous log's exercise restSec; no logs / no `last` → no advice / no progress; every text and `say` ≤ 12 words with the longest exercise name ("Dumbbell Seated One-Leg Calf Raise") and no banned word; `adviceSpeakDue` cases. Deps: none.
- [x] 2. [core-engineer ∥B] `APPLY_NEXT_WEIGHT { weightKg }` event, **tests first**. Files: src/core/session.ts(+test). Accepted only in `rest`, not paused, finite and ≥ 0; sets `weightKg` for the upcoming set (which then carries over as usual). Done when: tests cover rest (applied), exercise/summary/paused (ignored), NaN/negative (ignored), and carry-over to the set after. Deps: none.
- [x] 3. [core-engineer ∥B, after 2] "Coach tips" setting, **tests first**. Files: src/data/db.ts(+test). `getCoachTips / setCoachTips`, key `coachTips`, default on (only an explicit false turns it off), like `getSpokenCount`. Done when: db test covers default, set, read back. Deps: none (sequenced after 2 only to share one instance).
- [x] 4. [ui-engineer] Rest coach tip component. Files: src/ui/coachTip.ts, src/styles.css. `createCoachTip({ text, why, rule, applyLabel?, applied?, onApply? })`: one line ≥ 22px (why ≥ 20px, muted), a "Coach" label + icon so it isn't colour-only, `data-coach-tip`, `data-advice-rule`; an "Apply" button ≥ 56px only when `applyLabel` is set, turning into a non-button "Applied: 40 lb" state. Done when: 390×844 screenshots of a plain tip and an Apply tip (via a harness or the wired app after 6), typecheck + lint clean. Deps: 1 (Advice type only; can start from the plan's shape).
- [x] 5. [ui-engineer, after 4] Summary coach section. Files: src/ui/coachSummary.ts, src/styles.css. `createCoachSummary(entries, name)`: heading "Coach", per exercise the name, its next-time line (≥ 20px) + why, and the progress line with an "Up" label/icon (not colour-only); `data-coach-summary`, `data-coach-exercise`, `data-advice-rule`, `data-progress`. Renders nothing for an empty list. Done when: a 390×844 screenshot, typecheck + lint clean. Deps: 1.
- [x] 6. [main] Wiring. Files: src/ui/app.ts (and playwright.config.ts if the new spec needs a project). Rest: when tips are on, `afterSetAdvice(s, exerciseName)` → mount the coach tip under the rest clock; Apply (shown only while the upcoming set is the advice's exercise) → `APPLY_NEXT_WEIGHT` → "Next" line shows the new weight. `tick()`: `adviceSpeakDue(lastCueElapsedMs, elapsed, s.restTargetSec)` → `voice.speak(advice.say, { kind: 'cue' })` once per `sessionId:logs.length`. Rest cues stay unchanged (they queue; nothing cancels). Summary: mount `createCoachSummary(coachSummary(s, lastTime, exerciseName))` above the set list. Settings: "Coach tips" switch (persisted via task 3, loaded at start). Dev log: `logEvent('advice', { rule, shown | spoken | applied })`. Done when: by hand on Push A, the second clean Bench set shows "Strong set. Try +2.5 kg next set.", it's spoken once ~2 s into rest, Apply changes "Next" to the new weight, and Summary shows a Coach section. Deps: 1, 2, 3, 4, 5.
- [x] 7. [ui-engineer] E2E `e2e/coach.spec.ts` (fake clock, mocked speech, no camera). Cases: (i) two clean sets at the top → Rest tip A3 visible, spoken exactly once ~2 s in, never cancelling the rest cues (mock records order), Apply → next weight +2.5 kg on Rest and on the Exercise stepper after Start set; (ii) a set below `min` → "Keep the weight. Aim for N reps."; (iii) lb mode → "+5 lb"; (iv) "Coach tips" off (after reload) → no tip, nothing spoken; (v) Summary Coach section has one next-time line per logged exercise; a second session with more reps shows "+N reps vs last time"; (vi) no third-party request. Done when: passes with `--repeat-each=3` and the full `npm run e2e` is green. Deps: 6.
- [ ] 8. [reviewer] Review the branch diff against CLAUDE.md (pure core, no medical words, voice-over-screen, 56px/20px, never automatic). Deps: 7.
- [ ] 9. [verifier] Verify against SPEC M5b round-1 table + the M5b Accept line: `npm run check` (fixture suite still 12/12), `npm run e2e`, `npm run build`, 390×844 screenshots `docs/screenshots/m5b-rest-tip.png`, `m5b-rest-applied.png`, `m5b-summary-coach.png`, `m5b-settings-coach.png`, console clean; evidence into PROGRESS. Deps: 8.
- [ ] 10. [main] Merge `m5b-coach`, then **ask Wongsaton before pushing** (push = deploy). Deps: 9.
- [ ] 11. 🧍 (no SPEC checkpoint; informal) Wongsaton tries the coach tips at his next session and sends notes via `/feedback`.

**Parallel waves:** Wave 1: 1 [core ∥A], 2 → 3 [core ∥B], 4 [ui] (from the planned Advice shape). Wave 2: 5 [ui, after 4: shared styles.css]. Then 6 → 7 → 8 → 9 → 10.

### M4c + M4b — Push A slice (camera coaching, developer log, demos)
Target: deployed and verified by ~17:30 on 2026-11-13. Quality comes before the clock: nothing ships without a reviewer PASS and verifier sign-off. **MUST** ships today. **STRETCH** ships only if it's reviewed and verified by 17:15; otherwise it goes in the next round. Branch `m4c-coaching`. Two core-engineer instances can run at once when their files don't overlap (marked ∥).

**MUST**
- [x] 1. [main] Shared types + version. `RepEvent` gets `reason?: 'far' | 'start'` and `shortByDeg?: number` (SPEC §3). `vite.config.ts` defines `__APP_VERSION__` (git short sha + build time), declared in `src/vite-env.d.ts`. Files: src/core/types.ts, vite.config.ts, src/vite-env.d.ts. Done when: `npm run typecheck` passes and the built bundle contains the sha. No deps.
- [x] 2. [core-engineer ∥A] Developer log, **tests first**. Files: src/core/devlogCodec.ts(+test), src/data/devlog.ts(+test), src/data/db.ts (Dexie version bump: `devlogSessions`, `devlogSets`). Codec: LandmarkFrame stream ↔ int16 buffer (1e-4 units; null frames kept as time stamps; frames without `world`). Store: recorder API `startSession(meta) / logEvent / beginSet / frame / angle / repEvent / speech / fps / endSet / correctSet`, a buffered flush every 10 s and at endSet, `sizeBytes()`, rotation at a 150 MB cap (oldest sessions first), `exportSession(id) / exportAll()` → plain JSON per the SPEC §4 DevLog types (frames decoded, 4 decimals), `clear()`, and `getDevLogEnabled / setDevLogEnabled` (default on). Done when: tests cover the round trip within 1e-4, ≤ 0.47 kB per frame, flush, rotation, export shape, disabled → nothing stored, and the existing db tests still pass. Deps: 1.
- [x] 3. [core-engineer ∥A, after 2] Last-set correction, **tests first**. Files: src/core/session.ts(+test), src/data/db.ts(+test). `CORRECT_LAST_SET { reps, partials }` is accepted only in the rest phase and not when paused. It updates the just-logged set (values ≥ 0). `updateSet(...)` writes the DB row. Done when: tests cover the phases, clamping and the persisted row. Deps: 2 (same db.ts).
- [x] 4. [core-engineer ∥B] Partial reasons + hints + speech policy, **tests first**. Files: src/core/repCounter.ts(+test), src/core/exercises/{types,curl,pushUp,shoulderPress,row,gobletSquat,lateralRaise}.ts + index.test.ts, src/core/coachSpeech.ts(+test). Counter: `reason` and `shortByDeg` on partials; the new `start` partial (turned back toward the far end without re-entering the start band, by more than the hysteresis, same minimum leg times); getters `reachedFar` and `lastMiss`. Rules: `hints: { far, start }` (≤ 6 words, coaching only). coachSpeech: `hintFor(rule, ev)` plus a policy (one hint per 6 s; a count word interrupts a hint; a hint waits for the count to end; a hint more than 1.5 s late is dropped and reported as dropped). Done when: tests cover each reason, `shortByDeg`, no `start` partial from ±8° jitter at the far end, every rule has both hints with no banned words (pain, injur*, hurt, damage, safe, risk), all policy cases, and the **fixture suite is still 12/12 with unchanged counts**. Deps: 1.
- [x] 5. [ui-engineer] Camera-first layout + target. Files: src/ui/cameraView.ts, src/styles.css. Full-width `object-fit: cover` video with the overlay canvas mapped to the same crop (display only). Slim top band (title, Close) and bottom band (Set done ≥ 56px). Count overlaid on a dark backing with "/ 12" (top of the range) and "Set 2 of 3 · 8–12 reps" (≥ 20px); the count turns green at the target. The 3D skeleton and Front/Side presets are collapsed behind a "3D" button (lazy import on open). Switch camera is a ≥ 56px icon button. New option `target?: { setNumber, sets, targetReps }`. Done when: a 390×844 screenshot shows a stage ≥ 600px tall, the count ≥ 64px, nothing overflowing, and typecheck + lint clean. Deps: none (∥ with 2, 4).
- [x] 6. [pose-engineer] Update `e2e/camera.spec.ts` for the collapsed 3D (open "3D" before Front/Side; Switch camera by its new label). Done when: it passes. Deps: 5.
- [x] 7. [ui-engineer] Partial hint shown + spoken. Files: src/ui/cameraView.ts, src/ui/voice.ts, src/styles.css. Show the hint text for 4 s (≥ 20px, `data-hint-reason`). Speak it through the coachSpeech policy. `voice.speak(text, { kind: 'count' | 'hint' })`, where only a count cancels. Utterance end/error events go back to the policy. Done when: a manual check on the fake camera (synthetic curl) shows and speaks "Curl higher." once per loop and the counts still speak. Deps: 4, 5.
- [x] 8. [ui-engineer] Components for the dev log + correction. Files: src/ui/devLogPanel.ts, src/ui/lastSetCorrection.ts, src/styles.css. Panel: toggle, size + session count, Export last / Export all (gzip via `CompressionStream`; `navigator.share({ files })` when `canShare`, else a download), Clear (two taps within 3 s). Correction: "Last set: N reps · M partials" with ± steppers ≥ 56px and an `onChange`. Done when: 390×844 screenshots of both, typecheck + lint clean. Deps: 2 (API only; can start from the API in task 2).
- [x] 9. [ui-engineer] Recording hooks in the camera view. Files: src/ui/cameraView.ts. Optional `recorder` option: frames, smoothed angle per frame, rep events, speech (text, kind, dropped), fps 1/s, delegate, side, rule folder. Done when: typecheck + lint clean, and a unit-free manual run shows frames in IndexedDB. Deps: 2, 7.
- [x] 10. [main] Wiring. Files: src/ui/app.ts, playwright.config.ts. Start a dev-log session at workout start (if enabled). Log every dispatched session event. beginSet/endSet per set (manual sets too, counted vs logged). Pass `recorder` + `target` into the camera view. Rest shows lastSetCorrection → `CORRECT_LAST_SET` + `updateSet` + `devlog.correctSet`. Settings mounts devLogPanel. Call `navigator.storage.persist()` once. Add the new e2e specs to the right projects. Done when: by hand, Push A → Pushups → camera → Set done → correct on Rest → Settings shows a non-zero log size. Deps: 3, 7, 8, 9.
- [x] 11. [ui-engineer] E2E. Files: e2e/camera-coaching.spec.ts (mobile-person-camera), e2e/devlog.spec.ts. Coaching: stage ≥ 70% of 844, "/ 12" visible, "Curl higher." spoken and never cancelling a count word (mock speech records order), 3D collapsed by default and opens on tap. Devlog: camera set → correction → exported JSON has frames, rep events, speech and the corrected numbers; Clear empties it; no third-party request. Done when: both pass with `--repeat-each=3`, and the whole `npm run e2e` is green. Deps: 10, 6.
- [x] 12. [verifier] Verify the MUST scope against the SPEC M4c criteria (minus the gauge/converter if those are STRETCH-deferred): `npm run check` (fixture suite 12/12), `npm run e2e`, `npm run build`, 390×844 screenshots `docs/screenshots/m4c-camera.png`, `m4c-rest-correction.png`, `m4c-settings-devlog.png`, console clean. Evidence goes into PROGRESS. Deps: 11 (+ any STRETCH tasks that are done).
- [ ] 13. [main] Merge `m4c-coaching` → main, ask Wongsaton before pushing (push = deploy). Deps: 12.
- [ ] 14. 🧍 **Checkpoint B2:** Push A gym session → correct miscounts on Rest → Settings → Export last session → send. Then we analyse it (and convert sets to fixtures after his OK).

**STRETCH** (only if reviewed + verified by 17:15)
- [x] S1. [core-engineer ∥] Gauge math, **tests first**. Files: src/core/romGauge.ts(+test). Position per SPEC §3, both marks, every rule, both directions, contracted start. Deps: none.
- [x] S2. [ui-engineer] Gauge on the video (vertical bar, start/target lines, green when reached, amber line for `lastMiss`, angle in degrees ≥ 20px, `data-gauge` / `data-angle`). Files: src/ui/cameraView.ts, src/styles.css. Done when: a screenshot is taken and the e2e in 11 asserts the marks and a changing angle. Deps: S1, 7.
- [x] S3. [core-engineer ∥] How-to text for all 30 exercises. Files: src/data/howto.json, src/data/catalog.ts(+test). 2–3 lines, each ≤ 70 chars, no banned words. Deps: none.
- [x] S4. [anatomy-3d-engineer] Demo motion data, **tests first**, pose-tracked Push A first. Files: src/ui/demo3d/moves.ts(+test), src/ui/demo3d/highlight.ts(+test). Pure (no three import). Pushups, Seated DB Press and Side Lateral Raise are ported from tools/synthetic.ts. Tempo lift 1 s / hold 0.3 s / lower 2 s / pause 0.5 s. Exports `poseAt`, `hasDemo`, `DEMO_IDS`, plus a muscle → part map. Done when: the M4b unit criteria pass for these three. Deps: none.
- [x] S5. [anatomy-3d-engineer] Player. Files: src/ui/demo3d/player.ts. Lazy three, its own renderer created on open and disposed on close, loops only while open and visible, drag + Front/Side, highlights, reduced motion → start pose + Play. Returns null without WebGL. Attributes `data-demo-playing`. Done when: screenshots of each demo mid-rep have been looked at. Deps: S4.
- [x] S6. [anatomy-3d-engineer] New keyframes: Dumbbell Bench Press, Incline Dumbbell Press, Standing Dumbbell Triceps Extension (declared start/end angles). Files: src/ui/demo3d/moves.ts(+test). Done when: the M4b unit criteria pass for them. Deps: S4.
- [x] S7. [ui-engineer] How-to sheet + badges. Files: src/ui/howToSheet.ts, src/ui/badges.ts, src/styles.css. The sheet shows the demo (or the muscle map if there's no demo or no WebGL), how-to lines, focus line and tempo text. Badges: "3D demo" from `hasDemo`, "Info" otherwise, "Camera" for `tracking: 'pose'`, ≥ 20px. Deps: S3, S4 (S5 for the live demo).
- [x] S8. [main] Mount the "How to" button (Exercise screen) and the badges (day preview, list sheet, Exercise header) in src/ui/app.ts. Deps: S7.
- [x] S9. [ui-engineer] E2E `e2e/howto.spec.ts` per the SPEC M4b criteria (Pushups: "3D demo" + "Camera"; a Pull exercise without a demo: "Info"). Deps: S8.
- [x] S10. [pose-engineer] Converter `scripts/devlog.mjs` (+ [main] `"devlog"` in package.json). Reads a `.json` / `.json.gz` export and writes `fixtures/landmarks/<folder>/devlog-<date>-s<n>__reps-<logged>__partials-<logged>.json` plus a counted-vs-logged report. Done when: an export built from `curl/synthetic-01` converts back within 1e-4 and the fixture suite counts it 3/1. Deps: 2.

**Parallel waves (no shared files within a wave):** Wave 1: 1 [main], 2 [core ∥A], 4 [core ∥B], 5 [ui], S1/S3 [core, if a third instance is free], S4 [3d]. Wave 2: 3 [core ∥A], 6 [pose], 7 [ui], S5 [3d], S10 [pose]. Wave 3: 8 [ui], S6 [3d], S2 [ui after 7]. Then 9 → 10 → 11 → 12 → 13. The ui-engineer is the bottleneck (5 → 7 → 8 → 9 → 11, all touching cameraView.ts or shared CSS), so 8 can go to a second ui-engineer instance in wave 2 (it only touches new files + CSS appends).

**After the Push A report (not planned yet):** analyse the log → fixtures (with OK) → retune; then M4d, M4e (redesign), M5, M5b in the order Wongsaton picks.

### M4 — Rep counter
Scope: the six `tracking: "pose"` exercises in `program.json` (Dumbbell_Bicep_Curl, Pushups, Seated_Dumbbell_Press, One-Arm_Dumbbell_Row, Goblet_Squat, Side_Lateral_Raise) with the SPEC §2 M4 table as starting thresholds. Lying exercises (bench press, flyes) stay manual-count: there are no fixtures that show stable landmarks (SPEC M4 "experimental" clause). Fixture folder names, used by the synthetic renderer, the landmarks output and the fixture suite: `curl`, `push-up`, `shoulder-press`, `row`, `goblet-squat`, `lateral-raise`.

**Acceptance status:** the SPEC criterion ("every committed fixture: reps == filename, partials == filename") will be met on **synthetic** fixtures only. M4 is therefore **provisionally done** at task 14. It must be re-run, and thresholds re-tuned, when the real clips from Checkpoint B arrive (task 15).

- [x] 1. [main] Add `RepEvent = { type: 'rep' | 'partial'; index: number; eccentricMs: number; concentricMs: number; minAngle: number; maxAngle: number; t: number }` to `src/core/types.ts` (SPEC §3). `SetLog.partials` already exists, so no change there. Files: src/core/types.ts. Done when: `npm run typecheck` passes.
- [x] 2. [core-engineer] Angle math, tests first. Files: src/core/angles.ts(+test). Provides `jointAngle(a, b, c)` in degrees and `pickSide(frames, triplets)` (the side with the higher mean visibility over a window). It also chooses the angle source: 3D from `world` when present, else 2D from normalized `landmarks`. Normalized x/y are distorted by the video aspect ratio, and fixtures don't store the aspect. Record the choice as a Decision. Done when: tests cover right angle / straight / folded, missing `world` fallback, side choice when one side has visibility 0.13, and pass.
- [x] 3. [core-engineer] Per-exercise rules as data, tests first. Files: src/core/exercises/{types,curl,pushUp,shoulderPress,row,gobletSquat,lateralRaise,index}.ts(+index.test.ts). Each rule holds: exerciseId, fixture folder, view, landmark triplet per side (`LANDMARK` from poseTopology), `extended` / `contracted` thresholds, direction (lateral raise is inverted: extended < 25°, contracted > 75°), start position (shoulder press starts contracted, the rest start extended), which phase is eccentric (lowering = toward extended for curl/row/lateral raise, toward contracted for push-up/squat/press), side mode (best-visible for side views; for front views both arms, or the best arm if one is hidden), and an optional extra gate (press: wrist above shoulder, so arms hanging at the sides never read as "extended"). Index exports `ruleFor(exerciseId)` and `ruleForFolder(name)`. Done when: a test asserts every `tracking: "pose"` exercise in program.json has exactly one rule and every rule's exerciseId is a pose exercise, thresholds are ordered for each direction, and folder names are unique.
- [x] 4. [core-engineer] `src/core/repCounter.ts`(+test), state machine per SPEC §3, **tests first** using hand-built frame sequences (generate the landmark positions from a target angle curve). API sketch: `createRepCounter(rule)` → `push(frame): RepEvent[]`, plus `reps`, `partials`, `phase`, `side`, `reset()`. Behavior: EMA α 0.4, 10° hysteresis at both ends, ≥ 250 ms per phase, frames where any used landmark has visibility < 0.5 are ignored, nothing is counted until the first time the arm/leg settles at the start position (setup movement is ignored), and a partial = a turnaround after leaving the start band by more than the hysteresis but before reaching the far threshold. The minimum partial depth is a rule parameter, so jitter at the top never registers as a partial. Done when: tests cover clean reps (curl, inverted lateral raise, contracted-start press), ±8° jitter at both thresholds (no double counts), partials, fast reps under 250 ms per phase (rejected), slow reps, an occlusion gap mid-rep, a mid-rep start, and eccentricMs/concentricMs/minAngle/maxAngle/index/t on every event. Depends on: 1, 2, 3.
- [x] 5. [pose-engineer] Extend the synthetic renderer to all six exercises. Files: tools/synthetic.ts, tools/synthetic.html, scripts/synthetic.mjs. Each exercise is rendered in its SPEC view (side: curl, push-up, row, goblet squat; front: shoulder press, lateral raise), with the mannequin facing right in side views. Each exercise gets two clips: `synthetic-01` (clean reps) and `synthetic-02` (2 partials plus fast lowering). Joint-angle keyframes for full reps go at least 10° past both thresholds, and partials turn around near mid-range. Output goes to `fixtures/synthetic/<folder>/synthetic-0N__reps-<n>__partials-<m>.webm`. The existing `curl/synthetic-01__reps-3__partials-1.webm` stays byte-identical because the e2e fake camera uses it. Done when: `npm run synthetic` writes all 12 clips, each is seekable, and a contact-sheet frame per exercise has been looked at. No dependencies, so it can run in parallel with 2–4.
- [x] 6. [pose-engineer] Extract landmarks from the new clips: `npm run landmarks -- fixtures/synthetic` → `fixtures/landmarks/<folder>/*.json`. Report the detection rate for each clip. Any clip under about 90% detection, or where the tracked angle doesn't clearly cross both thresholds (push-up, with a horizontal body, is the likely one), is **not committed** and gets reported, so the fixture suite never asserts on a clip MediaPipe can't see. Files: fixtures/landmarks/**. Done when: the JSON for every usable clip is present and the detected/total frame counts for each clip are listed in the task report. Depends on: 5.
- [x] 7. [core-engineer] Fixture suite in `npm run check`. Files: src/core/repCounter.fixtures.test.ts. It loads every `fixtures/landmarks/**/*.json` with `import.meta.glob` (src has no Node types, so no `fs`), maps the folder to a rule with `ruleForFolder` (an unknown folder is a test failure), parses `__reps-<n>__partials-<m>` from the filename, and asserts both counts. Tune the thresholds or the partial depth in `src/core/exercises/*.ts` until every fixture passes. Every changed value is recorded as a Decision with the reason. Done when: `npm run check` is green with every committed fixture asserted. The existing curl fixture can be wired up as soon as task 4 is done. Depends on: 4, 6.
- [x] 8. [core-engineer] Session reducer: counted reps, tests first. Files: src/core/session.ts(+test). Adds `partials: number` to SessionState and a `SET_COUNTED { reps, partials }` event, accepted only in the `exercise` phase when not paused. It overwrites `reps` (the stepper still allows manual correction afterwards). `SET_DONE` writes `partials` into the SetLog when > 0, and the next set starts with partials 0. Done when: tests cover the event in the rest/paused phases (ignored), auto-fill then ADJUST, partials logged, and reset on the next set. Depends on: none (`SetLog.partials` already exists).
- [x] 9. [core-engineer] Persisted "count reps out loud" setting. Files: src/data/db.ts(+test). `getSpokenCount` / `setSpokenCount` use the `settings` table, default **on** (see the open question). Done when: a db test covers the default, set and read back. Depends on: none.
- [x] 10. [ui-engineer] Live counting on the camera sheet. Files: src/ui/cameraView.ts, src/ui/voice.ts (if needed), src/styles.css. `createCameraView` takes an optional `exerciseId` plus `onCount(reps, partials)` and `onSetDone()` callbacks. When `ruleFor(exerciseId)` exists, it feeds every frame to a rep counter and shows a big rep number (≥ 64px, `data-reps` attribute) with a smaller partials line, the tracked side ("Right arm"), and a "Step into frame" status while the visibility gate fails. Each rep is spoken by number ("One", "Two"…) when the setting is on, and a partial is not spoken (that cue belongs to M5). A big "Set done" button (≥ 56px) is added. Camera test from Settings shows no counter. The Settings screen gets a "Count reps out loud" toggle (persisted via task 9). Done when: a 390×844 screenshot shows the number legible and nothing overflowing, and typecheck and lint are clean. Depends on: 1, 4, 9.
- [x] 11. [main] Wiring and config. Files: src/ui/app.ts, playwright.config.ts. app.ts passes the current exerciseId and callbacks into the camera view: `onCount` → dispatch `SET_COUNTED`, `onSetDone` → dispatch `SET_DONE`, close the camera and go to Rest. It also loads the spoken-count setting. playwright.config.ts widens the `mobile-person-camera` project's `testMatch` (and the `mobile` project's `testIgnore`) to include `rep-count.spec.ts`. Done when: by hand, Pull day → Dumbbell Bicep Curl → camera → the count appears → Set done logs the counted reps. Depends on: 8, 10.
- [x] 12. [ui-engineer] E2E `e2e/rep-count.spec.ts` (fake camera = synthetic curl clip, which loops). Files: e2e/rep-count.spec.ts. Flow: start Pull day, go to Dumbbell Bicep Curl, open the camera, and wait until `data-reps` ≥ 3 and partials ≥ 1 (the clip has 3 reps + 1 partial per loop). Mocked speechSynthesis receives "One", "Two", "Three" with the toggle on and nothing with it off. Set done → the IndexedDB set row has reps == the on-screen count and partials ≥ 1. A manual exercise has no counter, and no third-party request is made. Done when: it passes 5× with `--repeat-each=5`. Depends on: 11.
- [x] 13. [verifier] Verify the milestone against the SPEC M4 acceptance criteria: `npm run check` (fixture suite listed by name, all synthetic fixtures green), `npm run e2e`, `npm run build`, and 390×844 screenshots (`docs/screenshots/m4-camera-counting.png`, `m4-settings-spoken-count.png`, `m4-rest-after-counted-set.png`) with the console clean. State explicitly in the evidence that acceptance holds on synthetic fixtures only. Depends on: 7, 12.
- [x] 14. [main] Mark M4 **provisionally done (synthetic fixtures)** in the checklist, merge `m4-rep-counter` into main locally, and ask Wongsaton before pushing. Depends on: 13.
- [ ] 15. 🧍 **Checkpoint B (still open):** Wongsaton records the real clips (SPEC §5). Then: `npm run landmarks`, commit the JSON, re-run task 7 on real plus synthetic fixtures, re-tune thresholds (logged as Decisions), and re-run task 13. M4 is fully done only after that, and it should happen before M5 relies on the counter's tempo and range numbers.

### M3 — Pose pipeline + 3D live skeleton
- [x] 1. Assets: `public/models/pose_landmarker_lite.task` (committed, with source/SHA in a README) and the wasm runtime copied from npm on postinstall (`public/mediapipe/`, gitignored). No CDN.
- [x] 2. `src/core/poseTopology.ts` (33 landmark names, skeleton connections, left/right) + `src/core/fps.ts` (rolling fps meter). Tests first.
- [x] 3. `src/pose/`: `camera.ts` (getUserMedia front/rear, stop tracks), `landmarker.ts` (Pose Landmarker lite, VIDEO mode, GPU with CPU fallback) → emits `LandmarkFrame`.
- [x] 4. Camera screen (from Settings → "Camera test" and from pose-tracked exercises): mirrored video, 2D skeleton overlay canvas, fps, camera switch, delegate shown. Stops the camera on leave.
- [x] 5. 3D live skeleton (`src/ui/skeleton3d.ts`) from `world` landmarks: joints + bones, drag to rotate, Front / Side presets.
- [x] 6. `npm run landmarks`: dev-only page `tools/landmarks.html` + Playwright runner, `fixtures/videos/**` → `fixtures/landmarks/<same>.json`. Prove it on a synthetic clip (our 3D mannequin rendered to video) if MediaPipe detects it; otherwise on Wongsaton's fixtures at Checkpoint B.
- [x] 7. Verify (check, e2e with a fake camera, build, screenshots), merge, push → 🧍 Checkpoint B.

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

- 2026-11-13: **Wongsaton's answers to the open questions.**
  - **(1) Lateral raise height.** He has no preference and left it to research. Coaching sources say shoulder height (arms parallel) is the usual cue. Going somewhat higher, up to ~45° above parallel, is described as shifting work to the traps rather than being harmful. No peer-reviewed limit was found.
    - **Decision:** `raiseTooHigh` threshold 100° → **120°** (clearly above shoulder height). Enable it for the lateral raise if the task 7 replay of his 4 real clips gives 0 fires (his peaks are 91–109°).
    - Coaching wording stays "Stop at shoulder height." with no injury language.
  - **(2) Press.** He doesn't want "first press = positioning". The counter stays as is (8 on his set), and the press synthetic fixtures and demo are unchanged.
  - **(3) Push-up rest-pause** (sit down, then more push-ups) is **one set**, and "the next set should be confirmed to go". The exact behaviour is still to be confirmed with him (see Blockers). The M5c defaults stay until then.
  - **(4) M5 enablement and score weights:** explained to him, decision pending after his gym test.
  - **(5) M4e design: mix all three directions, screen by screen.** A step 1b mockup of the mix is being made before tokens are written.

- 2026-11-13: **M5 form rules (task 5), departures from the SPEC wording.** No threshold values changed (20°, 100°, 25°, 15°, 160°).
  - **`formHoldSec: 0.2`.** A form measure must hold 0.2 s before it counts. On clean clips the raw left/right gap spikes to 28–42° for single frames.
  - **elbowDrift is measured relative to the lift start, not as an absolute angle to the torso line.** On the clean synthetic curl a hanging arm already reads 17–29° from the torso line, so an absolute 25° would nearly fire on clean reps.
    - Known gap: hip–shoulder–elbow is an unsigned 3D angle, so an elbow flaring out to the side also counts.
    - Project it onto the sagittal plane before this rule is enabled.
  - **bodySwing is measured against the frame just before the lift**, so a steady lean or a tilted phone never fires.
    - Both references are single frames (a glitch can shift a rep), and a swing that starts in the start band is missed.
    - Average a few start-band frames before enabling.
  - Both rules are off, so neither gap affects anyone yet.
- 2026-11-13: **Real lateral raise vs the form rules (task 5 replay, flags forced on).**
  - **armsOutOfSync:** the largest gap held 0.5 s is 10°, so 0 fires.
  - **raiseTooHigh:** rep peaks are 91–109°, so it would fire on 3 of 4 clips. It stays off, and the press-height question goes to Wongsaton.
- 2026-11-13: **Drill-sergeant coach voice** (Wongsaton's request; design in `docs/superpowers/specs/2026-11-13-drill-sergeant-voice-design.md`; approach A, built-in iPhone voice).
  - **Rewrite point.** The rewrite happens at `voice.speak`, the single choke point. Counts are never rewritten, and calm mode is byte-identical to before.
  - **Rudeness levels.** Three levels, tested by word lists: Tough (no swearing), Rude (mild words), Savage (all words).
  - **Hard limits at every level:** no slurs or identity insults, no jokes about body or looks, no pain or injury words, form cues keep their fix, at most 14 words.
  - **Settings stored** as `coachVoice` `{persona, rudeness, voiceName}`, default calm / 2 / null.
  - **Core→data import.** `personas.ts` imports `src/data/cues.json`, the first core→data import. It's accepted for now: plain JSON, no Dexie. `db.ts` imports the Rudeness type from core, so the dependency goes both ways.
  - **Follow-ups:**
    - inject the exercise cue lines instead of importing them;
    - drill next-time tips drop the exercise name (keep `{name}`);
    - the dev log records the calm line, not the spoken one;
    - Settings has two test-voice buttons;
    - `Rudeness` is declared twice (voiceNames.ts and personas.ts).
- 2026-11-13: The task 6 real-fixture guard globs files on disk, not git. A clean CI checkout enforces "committed".

- 2026-11-13 — **M5 rule enablement (planner).** Rules come in two groups:
  - **Focus rules** are computed from the counter's own rep events, relative to the set's own baseline, or from presence/fps: rushed lowering, shrinking range, stalled, out of frame, low fps.
  - **Form rules** need body geometry: arms out of sync, raise too high, elbow drift, body swing, hips sag.

  The SPEC M5 table marks the focus rules "reliable from all 6", and it only requires real-fixture checks for the rows below "Arms out of sync". This plan applies the stricter rule: every form rule, Arms out of sync included, needs real fixtures. A form rule is on for an exercise only when that exercise's committed real fixtures pass the criteria below. Otherwise it's built, tested on synthetic data, and **off** (data flag `focus` on the rule).

  Uncommitted real data (press, push-up: numbers in the retune Decision) can switch a rule **off**, never **on**. Starting flags:

  | Rule | Curl | Push-up (side) | Push-up (front variant) | Press | Row | Goblet squat | Lateral raise |
  |---|---|---|---|---|---|---|---|
  | Rushed lowering | on | on | on | on | on | on | on* |
  | Shrinking range | on | on | **off** (a) | **off** (b) | on | on | on* |
  | Stalled / Out of frame | on | on | on | on | on | on | on |
  | Low fps (not scored) | on | on | on | on | on | on | on |
  | Arms out of sync | — | — | — | **off** (c) | — | — | off → task 7 |
  | Raise too high | — | — | — | — | — | — | off → task 7 |
  | Elbow drift | **off** (d) | — | — | — | — | — | — |
  | Body swing | **off** (d) | — | — | — | **off** (d) | — | — |
  | Hips sag | — | **off** (d) | never (e) | — | — | — | — |

  **Notes:**
  - (a) The real head-on push-ups top out at 157–171° and bottom out at 93–118°, so a rep's range runs 39–78°. That spread alone crosses the 85%-of-baseline line, so "Full range." would misfire.
  - (b) The real press (image plane) tops out at 148–162° and bottoms out at 51–65°: rep ranges of ~83–111°, which straddles 85% of a typical baseline. Whether the spread is within a set or between sets **can't be settled** from the numbers we kept. Off until press fixtures are committed, which waits on the "7 vs 8" question. If the main session still has the converted press sets outside the repo, a local replay may inform the decision, but the flag stays off until the fixtures are committed.
  - (c) No committed real press data. The Decisions do show the image-plane arms "alike" while the world arms read 30° apart, so the rule must use `sideAngles` in the rule's angle space.
  - (d) No real fixtures for the curl, the row or a side-view push-up.
  - (e) A front view can't judge the body line (SPEC "not judged"). The front variant's body-line gate stays a tracking gate only.

  **Task 7 criteria for the lateral raise**, fixed before the replay so the result can't be tuned to fit:
  - **Arms out of sync** turns on only if all three hold: (1) 0 fires over the 80 real reps; (2) the largest |L − R| held ≥ 0.5 s mid-rep on a real rep is ≤ 15° (5° margin); (3) clip s1-0's pre-set one-arm swing (right arm to 67°, the one real asymmetry we have) reads > 20°, so the signal can see a real fault.
  - **Raise too high** turns on only if 0 fires and every real rep's `maxAngle` ≤ 95°.
  - Rushed lowering and shrinking range (*) stay on only if they fire ≤ 1 time per real clip.

  **What the real data can't settle:** we have no labelled real mistakes (his 80 real reps are clean by count, but nobody judged their tempo or height). So "fires correctly" on real data means: silent on his real sets, and the signal sees the one real asymmetry. True positives come only from the synthetic flaw clips (task 9). For rushed lowering and shrinking range, "≤ 1 fire per clip" only bounds nagging; it can't prove a fire was right, because fatigue at reps 15–20 can genuinely shrink the range.

  **Other limits:**
  - The curl, row and squat counters have never seen real data (M4 is still provisional), so their focus rules ride on synthetic-tuned timing. Checkpoint C covers them.
  - The press baseline (first 2 reps) includes the disputed first "positioning" press.
- 2026-11-13 — **M5 cue mechanics (planner).**
  1. **Firing:**
     - Baseline = mean of the first 2 reps. On an auto-started set these are the two starting reps, which happen in rest mode and are seeded into the tracker.
     - Partials neither extend nor break a streak, and they never get a second cue: the M4c hint is the only partial cue. They do count toward the score.
     - After a fire the rule's streak restarts. At most 2 fires per rule per set.
     - At most one cue per frame, by priority: out of frame > low fps > form rules > rushed lowering > shrinking range > stalled.
  2. **Speech:** every cue goes through `coachSpeech.hint()`. It shares the 6 s gap with partial hints, a count word always cancels it, and it's dropped if it would start > 1.5 s late. A cue dropped by the policy still counts as fired: the score counts detections, not speech, so it doesn't depend on speech timing. The dev log records both.
  3. **Hands-free consistency:**
     - No cues in rest mode, during the Undo window (`pending`), while paused, or after the camera is closed.
     - **Stalled:**
       - hands-free on with ≥ `stopMinReps` reps: in the start band there is no stalled cue, because the 6 s still stop decides ("Set done. N reps."). Outside the band, "Stay with it. N to go." fires at `stalledSec × 0.5` (5 s), then the 10 s stalled stop follows as before (the cue doesn't reset autoSet's timers);
       - hands-free off, or fewer reps: the SPEC rule, 8 s with no phase change or event, anywhere.
       - Either way: once per set, only after the first rep, and only while reps < the target (the top of the range).
     - **Out of frame:**
       - fires when a person is present but the rule's joints fail the visibility gate for 2 s (e.g. hands above the frame at the press lockout);
       - posture and body-line gate failures (bending for the dumbbells, sitting after push-ups) never fire it; that's why the counter gets an `untracked` reason getter;
       - no person at all for 2 s fires it only when no auto stop can follow (hands-free off, or fewer than `stopMinReps` reps); otherwise the 3 s away stop speaks instead;
       - never before the set's first rep (the camera page already shows "Step into frame").
     - **Low fps:** once per camera sheet, in set mode only.
  4. **Score:**
     - Start at 100. −10 per tempo, range or form cue; −5 per stalled cue; −5 per partial. Out of frame and low fps cost 0, because phone placement and light aren't his focus; they're still listed. Clamped to 0–100.
     - Only camera sets with ≥ 1 counted rep get a score; manual sets have none.
     - "Fix last set" recomputes the score from the stored cue ids and the corrected partials.
     - `SetLog.cues` stores ids, not text.
  5. **M5b T1** ("Next time on {Name}: lower for 2 seconds."): fires when ≥ 2 of today's sets of the exercise had rushed lowering. Priority N1 > N2 > T1 > N3: a trainer fixes control before adding weight, and below-range problems still come first. The mid-workout A rules are unchanged.
  6. **Dev log:**
     - `focusCue` event per detection: `{ id, t, reps, value, baseline, threshold }`;
     - `focusScore` event per saved camera set: `{ score, cues, partials }`.
     - Enum + numbers only. The spoken text is already in the speech log.
  7. There is no Settings switch for live cues. The SPEC doesn't ask for one, and the M4c rule stands: "Count reps out loud" mutes only the count words.
  8. M5 is built while M4 is still provisional. Only the lateral raise has committed real fixtures; the SPEC M4 line "real fixtures must pass before M5" is raised as a question. Building is low-risk because every unverified form rule ships off.
- 2026-11-13 — M5c tasks 5–6 (core). `adviceSpeakOnCommit(restElapsedMs, restTargetSec)` = target − 10 s − elapsed ≥ 9 s (a ~4 s tip ending ≥ 5 s before "Ten seconds"). `ExerciseRule.autoSet?: Partial<AutoSetConfig>` + `autoSetConfigFor(rule)` (in `src/core/exercises/index.ts`, not autoSet.ts, which another owner was editing) = AUTO_SET_DEFAULTS ← override. **No rule sets an override**: replaying the real Push A fixtures through counter + autoSet with defaults, the lateral raise and press sets never stop mid-set; the only push-up stop is a 16 s break where he sat down after 6 push-ups (still stop at 36 s, commit at 41 s, the other 5 would auto-start as a second set). No sane `stillSec` bridges a 16 s sit-down, and the longest in-plank pause between push-ups was 5.7 s (< 6 s, and a rep inside the 5 s Undo window cancels anyway). Open question for Wongsaton: is a rest-pause (sit, then more push-ups) one set or two?
- 2026-11-13 — **Counter retune on the first real Push A log** (camera sets converted outside the repo; no fixture committed). Replay of the old counter reproduced the live counts exactly. Changes, all rule data in `src/core/exercises/*.ts`:
  - **Seated press: image-plane angles, extended 155 → 142 → 143, contracted 100 → 80** (new `angleSpace: 'image'`; the video aspect is estimated from the pose by a least-squares fit of image vs world offsets, `src/core/aspect.ts`, 0.735–0.752 on the log, true 0.75). Why: every press was a `far` partial ("Press all the way up"), short by 18–31°: the world elbow angle topped out at 124–137° and bottomed at 84–99° (the world model's depth guess compresses a front-view press, and reads the two arms 30° apart). In the image plane the same reps top out at 148–162° and sit at 51–65° at the shoulders, both arms alike. The wrist-above-shoulder gate held on every rep and is unchanged. 143 is the midpoint between the real lockouts (≥ 148) and the synthetic partials (136–139), 5° from each (first set at 142, re-centred after review); 80 keeps the synthetic press's fast lowering above the 125 ms leg minimum. Result: 8 / 8 / 8 reps, 0–1 partial (a kick-up into position), was 0/11, 0/9, 0/8. **He logged 7 each**: the log shows 8 regular press cycles per set (~3.5 s apart, wrists above shoulders, both arms; the live run also heard 8 "Press all the way up"), so the counter is not tuned to 7. To confirm with Wongsaton.
  - **Lateral raise: posture gate `maxTorsoLeanDeg: 35`** (new rule field): once settled, frames where the torso (hip mid → shoulder mid, world) turns more than 35° from its direction at the settle are not tracked, and the attempt in progress is dropped (back to setup, counts kept). Relative to the settle, so phone pitch doesn't matter. If the gate keeps failing (phone knocked or re-seated), the reference is re-taken once the arms hold the start band for `minPhaseMs`, or after 3 s, so counting can't stay blocked. Why: the extra rep in sets 2–4 was him bending over to pick up the dumbbells (lean 82–131°, arms hanging read as a 79–111° shoulder angle) right after the counter settled; putting them down after the set leaned 50–68° and made the trailing partials. While raising, the torso stayed within 18° of the settle. Result: 20 / 20 / 20 / 20 reps (was 20, 21, 21, 21); partials 1 / 0 / 0 / 0 (the remaining one is a one-arm swing at the start of set 1).
  - **Push-up: `otherView` front variant (both arms, extended 150, contracted 125)** (new rule field, chosen while settling from the world shoulder line: mean yaw below `viewYawDeg.frontBelow` 40° = front, above `sideAbove` 50° = side, in between keep the current view; the view is locked at the settle, so turning mid-set keeps it; the log's front sets read 0–10°, the synthetic side clips 49–89°). Why: the phone was head-on; the world elbow angle still tracks each push-up (tops 157–171°, bottoms 93–118°), but never reached the side-view 95°. A second, independent signal (shoulder-to-wrist height) finds the same 11 clean push-ups; the rest of the ~70 s was standing up/resting at the top edge of the frame. Result: 11 reps / 2 partials, was 2 / 13. Side-on stays the recommended placement (depth is easier to judge); the gauge follows `counter.rule`, which is now the active variant.
  - Synthetic fixtures unchanged and all 12 still pass.
  - **Ground truth from Wongsaton (same day): press = 7 per set, push-ups "about 5".** Press: the 8 counted cycles per set are indistinguishable (each 3.3–3.6 s apart, press leg 0.36–0.67 s except a slower first press in sets 2–3 (1.07–1.23 s) but not set 1 (0.60 s), hold at the top 0.57–1.35 s, wrists above shoulders, same torso direction, same yaw). No signal marks one cycle as setup. 7 matches the **lockout-start convention** (the first press from the shoulders is getting into position, like un-racking; a rep = lower + press back to lockout): `start: 'extended'` gives 7/7/7 on the log, but 3/0 and 2/2 on the synthetic press clips (labelled for the shoulders-start convention in SPEC M4) and it contradicts the press demo's start. **Not changed; needs a decision** (SPEC + synthetic relabel by pose-engineer + demo start by anatomy-3d-engineer, plus handling of the racking at the end, which then reads as `start` partials). Press real fixtures are not committed until then.
  - **Push-up front variant: body-line gate `minHipAngleDeg: 140`** (front variant only; new rule field, frames with a mean shoulder–hip–knee world angle below it are not tracked and drop the attempt). All 11 counted push-ups were in a plank (hip 159–178°, hands planted at the same image height, 2–3 s rhythm, two runs of 6 and 5); the two stray partials were sitting (hip 37–47°) and getting up (hip ~114°). Only sides whose shoulder, hip and knee are visible (≥ `minVisibility`) count; with no usable side the body line is unknown and the gate passes (MediaPipe guesses hidden world points; head-on, the plank knees were at visibility 0.08–0.58, while both stray events had them at 0.84–0.96, so no relock/timeout is needed). A body-line failure reads as `tracking = false`, like the lean gate: **M5c task 1's out-of-frame stop must not treat sitting / bending as out of frame** (check the pose is present, not `tracking`). Result 11/2 → 11/0. Nothing in the log separates ~5 "real" push-ups from the 11, so the variant is not tuned to 5; the push-up fixture stays out of the repo.
  - **Real lateral-raise fixtures committed-ready** in `fixtures/landmarks/lateral-raise/real-2026-11-13-s1-<i>__reps-20__partials-<p>.json` (frames only: t, landmarks, world). Partials: set 1 = 1 (a real half raise before the first rep, smoothed 46°, right arm to 67°, no lean), sets 2–4 = 0 (the logged 2/1/1 were dumbbell pick-up / put-down bends).
- 2026-11-13 — **M5c Hands-free sets** (Wongsaton, after his first real camera session: "Let's plan to do auto start and stop, that don't need to press button on the screen"; the phone is on a stand/the floor and he doesn't want to walk back with dumbbells). New SPEC milestone M5c, planned after the m4d-next deploy and the counter fixes in flight. Defaults chosen (all data in `AutoSetConfig`, retuned from the dev log): (1) **camera open for the whole exercise**, not per set; it closes after the exercise's last set (the next exercise needs a new phone position), on Summary/Close/idle; the Rest screen gets a Camera button so an exercise's first set can be hands-free too. (2) **Auto start needs 2 reps** (second ≤ 8 s after the first) after ≥ 10 s of rest, backdated to the first rep's departure. Reason: the lateral raise produced a phantom rep while he stood still; one stray rep must not start a set and cut the rest. Cost: the first rep isn't spoken ("Two" is the first word). (3) **Auto stop** after ≥ 2 reps on 6 s still in the start band, 3 s out of frame, or 10 s stalled outside it; "racking" for curl/row/lateral raise looks like the start position, so stillness is the signal. (4) **Undo = delayed save**: "Set done. 8 reps." is spoken, a 5 s Undo window shows, and only then is SET_DONE dispatched, backdated to the last rep's end. A rep inside the window also cancels (so any rep within 11 s of the last keeps the set going), and after a cancel the next still stop waits 12 s. This needs no un-log event, no DB delete and no dev-log reversal. No voice input. (5) **Speech order**: count → "Set done. N reps." → save → M5b coach tip at the save (not at 2 s, since a backdated rest is already ~11 s in) if it ends ≥ 5 s before "Ten seconds" → rest cues. (6) **Setting "Hands-free sets" default ON**: it's his explicit request, and every failure degrades to today's flow (a missed start = tap Start set; a wrong stop = Undo or a rep). Off = exact M4/M4c behaviour. All buttons stay as overrides; Pause disables auto actions. (7) **Battery/heat**: idle close after 3 min with no person or 10 min without a rep ("Camera off."); no inference throttling in round 1 (decide from dev-log fps). (8) **Dev log**: `autoSet` events with reasons; a 10 s in-memory pre-roll so an auto-started set's frames start 1.5 s before its start; rest frames otherwise not stored (log size unchanged). (9) Privacy unchanged (on-device, no recording); the camera is just open longer.

- 2026-11-13 — **Phone test of M4 (iPhone):** 30 fps, "Right arm" correct, every counted rep spoken, but "it counts only sometimes". Asked for: (1) why a rep was partial and how to fix it, (2) target reps on the camera page, (3) a bigger camera view, (4) a 3D demo that shows how each exercise is done and what to focus on. Decisions: new **M4c** (camera coaching: partial reasons spoken as per-exercise hints, target "3 / 12", camera-first layout, ROM gauge to diagnose miscounts without video). **M4b pulled forward**. M5's partial cue moved to M4c. Likely miscount cause, kept as a hypothesis until real data: world-angle compression at the bent end, plus row/push-up start positions only ~5–10° past the extended threshold.
- 2026-11-13 — M4c counting: an incomplete return (back from the far end, then down again without reaching the start band) is now a **partial with reason `start`** instead of vanishing. Counting strictness (thresholds, whether such reps should count as reps) is only revisited with the Push A log data. Target shown = top of the planned range (same as the default reps). Hint speech: one per 6 s, the count always wins, a hint more than 1.5 s late is dropped. Camera video uses `object-fit: cover`. This is display-only cropping: inference still sees the full frame. 3D live skeleton collapsed by default.
- 2026-11-13 — M4c `start` partial details (task 4): (1) the return must come at least `minPartialDepthDeg` (15°) back from the far threshold, the same depth rule as `far` partials (SPEC only says the turn must be past the hysteresis); (2) the turn back toward the far end must hold past the hysteresis for ≥ `minPhaseMs` / 2 (125 ms) of movement. Without the hold, 1–2 frame pose glitches during a fast lowering made spurious `start` partials in lateral-raise-01 (smoothed 27.2° → 39.4° → 31.3°) and shoulder-press-02 (137.8° → 153.2° → 143.1°); the longest held counter-turn in any fixture is now 33 ms. A shallow or rushed turn is ignored (the rep keeps its timing); (3) one attempt gives at most one partial: after a `start` partial the new attempt departs from the turnaround, and if it returns to the start band without reaching far it just ends there (no second `far` partial / false "Curl higher."). Whether a sag-then-straighten should instead count as a rep is deferred to the Push A log data. Fixture suite stays 12/12 with unchanged counts; no thresholds changed.
- 2026-11-13 — M4b: demos live in `src/ui/demo3d/` (pure `moves.ts`, no three import, so `hasDemo()` is cheap for badges). The pose functions are **copied** from `tools/synthetic.ts`, which keeps its own copy so the committed synthetic fixtures stay reproducible (dedupe later). Each player has its own WebGL renderer, created on open and disposed on close (the skeleton3d precedent), and doesn't share the body3d context. How-to text is written for all 30 exercises. Badges ("3D demo" / "Info" / "Camera") come from `hasDemo` + `tracking`, never a hard-coded list (Wongsaton's request).
- 2026-11-13 — **Push A first** (Wongsaton: "Focus on Push A today … log everything helpful"). The slice is: developer log + last-set correction, then the camera page, then demos for all six Push A exercises (bench, incline, triceps extension included) + badges. Split into MUST/STRETCH for a ~17:30 deploy. Quality beats the clock: nothing ships unreviewed or unverified. Curl/row/squat demos and the other 21 move to M4d.
- 2026-11-13 — **Developer log privacy:** it stores body-pose landmark numbers, counter events, spoken words and set data. It never stores images or video and is never uploaded. It stays in IndexedDB on the phone until Wongsaton exports it himself. The repo is public, so raw exported logs are never committed; only landmark fixtures converted from them, and only after his OK. It's on by default for now (his request) with a Settings toggle, Export and Clear. This answers the earlier open idea of "save a set's landmarks" (yes). Size: int16-quantised frames ≈ 0.46 kB → ≈ 14 kB/s at 30 fps → ≈ 0.6 MB per 45 s set → ≈ 5–8 MB per Push A session. Cap 150 MB, oldest sessions dropped. Exports are gzip JSON. Ground truth: a "Last set" reps/partials correction on Rest, because the camera's Set done logs immediately.
- 2026-11-13 — **Coaching principle** (Wongsaton: "work as a personal trainer and recommend anything it sees"): added to SPEC §1. M5 becomes the live trainer, with a candidate cue table that says which views can judge each cue reliably and what a phone camera can't judge. The new **M5b** gives explainable after-set recommendations (add 2.5 kg, keep the weight, rest advice). These are never applied automatically. Both come after the Push A report; M4c stays focused.
- 2026-11-13 — **Visual redesign = M4e** (Wongsaton: "clean, visual, sporty; themes OK"). ui-engineer proposes 2–3 directions → 🧍 Wongsaton picks → tokens/themes in `styles.css` → Today first. It comes after the Push A slice. No token groundwork goes into the slice: the new camera/dev-log UI uses the existing styles, because restyling twice under a deadline adds risk for little gain.

- 2026-11-13 — M7b design (Wongsaton): photo recognition is local first: a small Thai food image classifier on the phone (MediaPipe Image Classifier, top 3 + confirm), with Claude Haiku as an optional, off-by-default backup for unsure/unknown dishes. Wongsaton uses an **iPhone** (Safari/PWA), so no WebGPU vision models or Chrome built-in AI. Datasets (THFOOD-50/100 are non-commercial), his photos and the trained model never go in the public repo; the model is imported into the app on the phone. Open: API key handling for the Claude backup (proxy vs key stored on the phone).
- 2026-11-13 — Wongsaton wants food & nutrition in the app → M7 "Fuel". Quick tracking (kcal + protein + weight) is the default, Full (carbs + fat) is an option. Main food is home-cooked Thai, sometimes restaurant/takeout at work → recipes, a Thai dish estimate list and quick estimates come first. AI photo recognition is later (M7b). All nutrition data stays on the phone; no personal numbers in the public repo.
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
- 2026-11-13 — M3 privacy: MediaPipe tasks-vision always sends usage logs to `odml.pa.googleapis.com/v1/log`, with no off switch. Blocked with a CSP meta tag `connect-src 'self' blob: data:` on the app and the tool pages. E2E asserts that no request reaches a third party.
- 2026-11-13 — M3: the camera screen opens from Settings → Camera test and from pose-tracked exercises. It's an overlay; Close stops every track. The stage takes the camera's aspect (portrait on an upright phone, nothing cropped). The front camera is mirrored, video + overlay + 3D alike. Inference runs on the main thread for now: headless Chrome gets 12–20 fps. Measure on the phone at Checkpoint B and move to a Web Worker if < 24 fps (SPEC M3).
- 2026-11-13 — M3: the landmarks tool runs in installed Google Chrome (`channel: 'chrome'`) so iPhone H.264/HEVC clips decode, with an ffmpeg → VP9 fallback. It uses the CPU delegate for reproducible output and rounds values to 4 decimals (~95 kB per second of video).
- 2026-11-13 — M3: synthetic fixture: `npm run synthetic` renders our own articulated mannequin doing 3 full + 1 partial curls (side view). MediaPipe detects it in 311/316 frames. The visible right elbow traces 3 dips to 40–57° and 1 to ~121°, so it's usable as an M4 test fixture alongside the real clips. The far-side elbow has 0.13 visibility, which confirms the "use the more visible side" rule.
- 2026-11-13 — M3: added the `ui-ux-pro-max` skill (MIT) as a project skill at Wongsaton's request, after review (offline scripts). Its suggestions never override CLAUDE.md (e.g. fonts must be self-hosted because of the CSP).
- 2026-11-13 — M3: Wongsaton chose to download the pose model into the repo (`public/models/`, 5.8 MB, Apache-2.0), served from our own site. The MediaPipe wasm is copied from npm on install.
- 2026-11-13 — M2: the 3D body is built from our own primitives (capsules/ellipsoids, muscles as ellipsoids), so no downloaded model or art. One WebGL context for the whole app: the canvas moves between slots on re-render. It renders on demand only (eased turn, drag), and reduced motion snaps the turn. The 2D SVG map shows until 3D loads, and stays when WebGL is missing.
- 2026-11-13 — M2: SVG ids can't contain spaces, so muscle paths use `data-muscle="middle back"` plus `id="muscle-<view>-middle-back"`.
- 2026-11-13 — M2: the focus cue is spoken at every set start (session start, Start set, skip/jump into an exercise), never on resume or stepper edits. Per spec; can drop to "first set only" if it gets repetitive.
- 2026-11-13 — M2: e2e broke because Vite discovered `three` (a dynamic import) mid-test, re-optimized and reloaded the page. Fixed with `optimizeDeps.include: ['three', 'dexie']`.
- 2026-11-13 — M2: stepper values of 5+ characters (e.g. "102.5") drop to 54px so the ± buttons stay in place. That's an exception to the 64px main-number rule.
- 2026-11-13 — Wongsaton wants 3D graphics in all three places: (1) a 3D muscle body in M2, (2) a 3D exercise demo, added as M4b, (3) a 3D live skeleton, added to M3. SPEC §6 now excludes only photoreal/medical 3D. Calendar sync parked: "focus on the app features for now".
- 2026-11-13 — Wongsaton: "go ahead" past Checkpoint A, with gym feedback to come during development. Started M2.
- 2026-11-13 — Asked whether the app syncs with Google Calendar / Claude Cowork: it doesn't. All data stays on the phone (SPEC §6 excludes cloud sync). Offered a later "Add to calendar" (.ics) option or real Google sync (needs sign-in). Waiting for a decision. Not in scope yet.
- 2026-11-13 — Checkpoint B (partial): Wongsaton's phone shows **30 fps** in Settings → Camera test. That's ≥ 24 fps, so inference stays on the main thread (no Web Worker needed for now). Fixture videos not recorded yet; next gym visit.
- 2026-11-13 — M4 starts before the real fixtures exist (Wongsaton's choice, no gym access right now). The fixture suite runs on synthetic mannequin clips for the six pose exercises. M4 counts as "provisionally done" when those pass, and becomes done only after the real Checkpoint B clips pass too. Fixture folders: `curl`, `push-up`, `shoulder-press`, `row`, `goblet-squat`, `lateral-raise`. Lying exercises stay manual-count.
- 2026-11-13 — Prettier ignores `*.md` so hand-written docs keep their formatting.
- 2026-11-13 — `npm audit`: 10 moderate advisories, all in the dev-only ESLint toolchain (minimatch / config-array). Nothing ships to the browser. Left as-is; recheck when ESLint updates.
- 2026-11-13 — M4: joint angles use the 3D `world` landmarks when a frame has them, and fall back to 2D normalized x/y (z dropped) otherwise. Normalized x/y are stretched by the video aspect ratio, which fixtures don't store, and 3D isn't skewed when the limb isn't square to the camera. Visibility (gate, side choice) always comes from `landmarks`. On the synthetic curl, 3D reads 160–167° at the top (2D: 150–160°) but bottoms out at 55–59° (2D: 35–45°), so the 55° curl threshold is a task 7 tuning candidate.
- 2026-11-13 — M4 rep counter: "≥ 250 ms per phase" is enforced on the two moving legs (out, back) and the initial settle, not on the dwell at the far end. Time going backwards (stream restart) sends the counter back to setup and keeps the counts. Deferred to M5 (before tempo cues use them): 'both'-arm mode doesn't reseed smoothing when one arm drops out. (Occlusions inside a leg: resolved in task 7, see the minimum phase time line below.)
- 2026-11-13 — M4 counting UI: a camera switch keeps the counted reps (the counter handles a restarting frame clock); only opening the sheet resets it. Each spoken count cancels the previous count word, so counts never lag. `speechSynthesis.cancel()` drops the whole queue, which is fine while count words are the only mid-set speech; M5 needs a small priority queue in `voice.ts` before coach cues speak mid-set.
- 2026-11-13 — M4 wiring: the camera's Set done closes the sheet and logs the set (→ Rest). With the sheet open, a count change re-renders only the screen underneath, so the sheet keeps focus and scroll. For the next gym test: check that fast reps are all spoken on iOS (Safari has dropped `speak()` right after `cancel()` before).
- 2026-11-13 — M4 minimum phase time, replacing the per-leg rule above. Leg times run on a movement clock that only advances between consecutive tracked frames, so hidden time (gated frames, or no frames for > 500 ms) is left out of the leg. This also fixes tempo (eccentric/concentric ms) across occlusions. A rep or partial needs each moving leg ≥ `minPhaseMs` / 2 (125 ms) and the two legs together ≥ 2 × `minPhaseMs` (500 ms), with the dwell at the far end excluded. The initial settle still needs ≥ 250 ms. Without both checks, a 100–150 ms visible glitch to the far band followed by 300–600 ms of occlusion counted as a rep, because the hidden time paid for the missing movement. Reason: a deliberate fast lowering (~0.45 s full range) crosses the threshold-to-threshold leg in 200–233 ms on lateral-raise-02 and curl-02, but it's a real rep. M5 should say "slow the lowering", not drop the rep. Jitter-fast reps (both legs ~120 ms), single legs under 125 ms, and a rushed rep with a long pause at the bottom are still rejected. Fixture time margins: the tightest pair is lateral-raise-02 at +100 ms over 500 ms, and the tightest single leg is row-02 at +42 ms over 125 ms. Changed tests in `repCounter.test.ts`: "lowering alone faster than 250 ms" → now counts (fast lowering ~0.45 s); "lifting alone faster than 250 ms" → now counts (120 ms keyframes still give a leg over 125 ms after smoothing). New tests: a 1 s pause doesn't rescue rushed legs; a glitch followed by 300/450/600 ms hidden → 0 reps (and the same without a gap → 0); an occlusion is left out of the eccentric leg; one leg under 125 ms is rejected even when the pair is long enough; the 500 ms pair boundary is pinned (360 ms keyframe legs → 534 ms, counted; 350 ms → rejected). SPEC §3's "Minimum 250 ms per phase" needs a wording update (main/planner).
- 2026-11-13 — M4 tuning (task 7, synthetic fixtures; world angles): curl contracted 55 → 70 (the M3 clip's full curls bottom out at 57–61° smoothed, and real lifters get margin too). Push-up extended 155 → 150 (the rest only cleared it by ~6–10°; now 11.5°). Row extended 150 → 145 (rest ~155 cleared it by ~5°, now ≥ 9.7°; possible since the re-rendered row-02 partials turn at 116–118°). Shoulder press contracted 95 → 100 (dumbbells-at-shoulders start band: a bottom wobble must now pass 110° to leave it). Default `minPartialDepthDeg` 20 → 15 (curl-01's real partial turns 19.4° past 150°; 15 is still 5° beyond the hysteresis exit, so ±8° jitter centred on the extended threshold can't make a partial (tested). Jitter centred 8–12° below the threshold, i.e. an arm resting outside the start band, can make one partial at a depth of 16–18°. That's acceptable: the arm isn't at the start position). Unchanged: goblet squat 160/100, lateral raise 25/75, press extended 155, row/push-up contracted. Fixture suite: before 9/12 on the original JSONs (10/12 after the row re-render; curl-01 counted 0/3, lateral-raise-02 counted 1/2), after 12/12. Closest calls (smoothed): press tops clear 155 by only 3.6°, push-up-02 partials clear the depth by 3.4°, and curl-01's partial by 4.4°. Re-check all three on real clips (task 15).
- 2026-11-13 — M4 e2e: live pose tests (`mobile-person-camera`) run one at a time (`workers: 1`). In parallel, headless camera pages drop to 3–6 fps and full curls read as partials. Below ~5 fps the counter misses the curl bottom; the phone measured 30 fps, so this only matters on slow devices. M5 could warn when fps is too low. "Manual exercise has no counter" is covered by camera.spec.ts, not repeated in rep-count.spec.ts.
- 2026-11-13 — CI: GitHub runners have no GPU, so live pose inference runs at ~2.5 fps and can't catch a curl's bottom. `rep-count.spec.ts` measures fps and skips itself in CI below 8 fps (2 skipped in CI, run 43512317915); it always runs locally. Counting is still covered in CI by the fixture suite (222 unit tests).
- 2026-11-13 — Wongsaton allows in-app video recording during development, with conditions: ask him per exercise before recording, keep it only for improving the app, and delete it afterwards (privacy). This is a dev-only exception to the CLAUDE.md "never record video" rule. Not in today's Push A slice: the developer log (pose numbers + his corrected counts) is the first source. Video is requested per exercise only when the log can't explain a miscount. When built: opt-in per set naming the exercise, stays on the phone, exported only by him, auto-deleted after export or 7 days, never committed (fixtures/videos stays gitignored), with an on-screen reminder to keep other gym users out of frame.
- 2026-11-13 — M4c correction: CORRECT_LAST_SET works on Rest and also on Summary (Push A ends with Pushups, a camera exercise, and its final set goes straight to Summary; we need its true count). app.ts re-saves the session row's totals after a Summary correction. The dev log's quota handling only ever deletes old dev-log sessions, never the current one or workout data; after a second quota error it stops logging for that workout.
- 2026-11-13 — M4c speech: "Count reps out loud" only mutes the count words. Coaching hints (partial reasons) and the phone-placement sentence are still spoken, because they're coaching you react to (voice over screen). The placement sentence is spoken only on the first camera open per exercise in a workout, not every set. Converter S10 writes `<label>-<HHMM>-s<n>-<setIndex>__reps-R__partials-P.json`; a converted synthetic-curl export passes the fixture suite 3/1.
- 2026-11-13 — M4c dev-log lifecycle: the log session starts at Start workout, is flushed (not finished) on Summary so a last-set fix there still reaches it, and is finished when leaving Summary (Done). Starting a new workout disposes any open log. Caught by e2e/devlog.spec.ts.
- 2026-11-13 — M4c dev-log clocks: set start/end, rest and session events use wall time (Date.now); camera frames, angles, rep events, fps and speech use the camera's frame clock from when that camera sheet opened, linked by `camera.wallT0`. Closing and reopening the camera within one set restarts the frame clock, so that set's frames hold two segments; the counter treats time going backwards as "back to setup, keep counts", and the converter rebases to the first person frame. A camera set that counted nothing logs counted {0, 0}. Known small gap: a camera opened within milliseconds of Start workout (before the log is ready) records no frames for that sheet; reopening fixes it.
- 2026-11-13 — CI: GitHub runners (2 cores, no GPU) starved the live camera tests once the 3D demo tests (software WebGL) ran beside them (camera 0 fps, 0 reps). Playwright now runs with 1 worker in CI (parallel locally), and devlog-camera.spec.ts uses the same "skip below 8 fps in CI" rule as rep-count.spec.ts. Counting stays covered in CI by the fixture suite.
- 2026-11-13 — Hotfix (Wongsaton heard no speech in iPhone Safari at the gym): the first-tap unlock now speaks a silent '.' (volume 0) instead of an empty utterance, which WebKit can ignore, and every speak() calls resume() first to clear a stuck paused synth. Settings → Voice has a "Test voice" button with a status line (start/end/error, voices) and the hint that Safari mutes spoken cues in Silent mode. Test speech mocks skip volume-0 utterances.
- 2026-11-13 — Push A plan set to Wongsaton's targets for today (he trains in lb; kg values chosen to land exactly on his lb weights): Bench 35 lb 4×8, 2 min; Incline 35 lb 4×6–7, 2 min; Seated press 30 lb 3×7–8, 90 s; Lateral raise 5 lb 5×20, 60 s, cue "Lower each rep over 3 seconds."; Triceps extension 20 lb 3×10–12, 90 s (upper end of 60–90 s); Pushups 3×20 (beat 58 total), 90 s. His last-time numbers (Nov 2–7) come from outside the app, so they don't show as "Last time".
- 2026-11-13 — S2 gauge: hidden while the phone set-up card is open (the card spans the video) and while not tracking; after a miss, reaching the target shows green while data-gauge-missed still reports the counter's lastMiss. Its e2e lives in camera-layout.spec.ts with a page.route fixture landmarker (deterministic); the real-model path stays covered by camera-person.spec.ts.
- 2026-11-13 — M4d (curl, one-arm row, goblet squat demos), built while Wongsaton trained: poses copied from tools/synthetic.ts with documented deviations — hand 4 cm past the wrist (no zero-length segment), squat hip width 0.14 (thigh in the knee's plane), row far angle 70° instead of the fixture's 45° (45 put the elbow ~20 cm above the back; 70 is the textbook top and still 20° past the rule), longer row bench, squat holds one two-handed dumbbell.
- 2026-11-13 — Confirmed at the gym: the missing speech was the iPhone's Silent mode (Safari mutes web speech in Silent mode). With Silent mode off, all speech plays. Idea for later: a one-line reminder on the Start screen ("Silent mode off for spoken cues"), since a page can't detect Silent mode.
- 2026-11-13 — **M5b round 1 pulled ahead of M5** (main session's request while Wongsaton trains; the SPEC already allowed the reps/partials/rest rules to ship early). The precise rule table now lives in SPEC M5b "round 1 rule table" and supersedes the starting table where they differ: "+2.5 kg" is unit-aware (5 lb in lb mode); the "two sessions below range → drop" rule is N1; the tempo rule waits for M5; the next session's Exercise-screen line, Dismiss, and all-time bests are deferred.
- 2026-11-13 — M5b defaults: one recommendation per exercise per moment, first matching rule wins (order in the SPEC table). Mid-workout "+step next set" (A3) needs **≥ 2 sets** at the top of the range, all clean, not just the first one. Reason: reps default to the top of the range (M1 Decision) and several Push A ranges are a single number (Bench 4×8), so hitting the top on set 1 is the plan, not over-performance. No weight increase is suggested when one step is > 25% of the weight in the display unit (5 lb on a 15 lb lateral raise dumbbell); 25% exactly (5 lb on 20 lb) is allowed. Bodyweight (logged weight 0) gets reps-only advice and never an Apply. The weight for next time is the last set's weight (the same as the next session's default), stepped and snapped in the display unit so lb-chosen kg values (35 lb = 15.88 kg) give "+5 lb" → 40 lb exactly.
- 2026-11-13 — M5b: "+step" counts only the sets **at the current weight** (verifier finding). A3/A4 need ≥ 2 sets at the last set's weight (display-unit rounding), all at the top and clean; earlier sets at other weights are ignored. Reason: after Apply, 8×35, 8×35, 8×40 lb suggested 45 lb after a single set at 40; now set 3 gives no tip and a second clean 8×40 earns "+5 lb". N3 (next time) likewise needs all planned sets logged and ≥ 2 clean top sets at the final weight (1 for a 1-set plan); one set after a mid-workout jump falls to N6 "repeat 40 lb".
- 2026-11-13 — M5b wording: texts ≤ 12 words including the longest exercise name, so next-time lines read "Next time on {Name}: +5 lb." (the name leads; it's needed on Rest, where the screen shows the *next* exercise). Each advice has a shown `text`, a spoken `say` (units spelled out: "pounds", "kilos", "plus"), and a short `why` with the numbers (shown, not spoken). Progress lines compare against **last time only** ("+3 reps vs last time", "35 lb, up from 30 lb"), not labelled "New best", because there's no all-time history yet (M6).
- 2026-11-13 — M5b speech: the Rest advice is spoken once per logged set when the rest clock crosses 2 s (so it follows Set done, not on top of it), skipped if the tab only notices after 6 s, and skipped when the rest target is < 17 s (it must finish before "Ten seconds"). It queues with `kind: 'cue'` and never cancels; rest cues and count words keep their existing behaviour. A "Last set" fix updates the shown advice without speaking again. Summary is shown, not spoken. Settings → "Coach tips" (key `coachTips`, default **on**) controls the Rest tip + its speech; the Summary Coach section always shows. Apply is the only way advice changes anything: a new `APPLY_NEXT_WEIGHT` reducer event (in `session.ts`, core-engineer, like `CORRECT_LAST_SET`), accepted only on Rest and only offered while the upcoming set is the same exercise. Advice shown/spoken/applied is written to the dev log.
- 2026-11-13 — M5b `APPLY_NEXT_WEIGHT { exerciseId, weightKg }` carries the advice's exercise and the reducer ignores it unless the upcoming set is that exercise (reviewer's recommendation). Reason: on Rest the upcoming exercise can change (Skip / jump to another exercise), so a stale Apply tap must not set another exercise's weight. Also ignored off Rest, while paused, and for non-finite or negative weights. The weight is stored exactly as given, logs are untouched, and it carries over to later sets of that exercise.
- 2026-11-13 — M5b wiring: the after-set tip is logged to the dev log when shown and when spoken (shown/spoken flags); Apply is logged once via the APPLY_NEXT_WEIGHT event. Summary now has a "Sets" heading after the Coach section. Small known race: "Coach tips" loads at startup with default on, so a workout started within milliseconds of opening could show tips once even if off.
- 2026-11-13 — Gauge column widened 72 → 88px (count panel's right inset 88 → 104px) and its Start/Target labels set to weight 700: on GitHub's Linux runner the fallback font made 20px bold "Target" wider than the 72px backing (CI failed on the label-fit check). Checked locally by forcing Verdana (a wide font) on the labels: all camera-layout tests pass at 390×844 and 375×667.
- 2026-11-13 — Music ducking research (Wongsaton: app speech pauses his music): on iOS 17/18 a web page cannot make speechSynthesis duck other apps' audio. WebKit's Audio Session API (`navigator.audioSession.type`) doesn't apply to speech, and no type maps to AVAudioSession .duckOthers ('ambient'/'transient' mix but are muted by Silent mode; 'playback'/'transient-solo' interrupt). WebKit fixed speech to use a separate mixable session on 2026-11-07 (326042@main), not yet in a shipped iOS. Options: (A) pre-rendered cue clips via Web Audio with audioSession 'ambient' → music keeps playing under the cue (mix, not duck; muted in Silent mode); (B) the M9 native shell with AVAudioSession .playback + .duckOthers → true ducking, works in Silent mode; (C) wait for iOS. First step: Settings → Audio test (speech / Web Audio beep / camera on-off per session type) for Wongsaton to try with Spotify, then decide.
- 2026-11-13 — Push-up body-line gate (front view, minHipAngleDeg 140): a side counts only if its shoulder, hip and knee are all visible (≥ minVisibility); with no usable side the gate passes as unknown. On the real log the head-on plank reps had knees barely visible (0.08–0.58), so the gate was unknown there; it only blocked the two well-seen sitting/getting-up events (0.84–0.96). Known limit: sitting head-on with knees out of frame isn't caught. A gate failure shows as tracking=false, so M5c's out-of-frame stop must check that a pose is present, not tracking.

- 2026-11-13 — autoSet: **no commit mid-rep.** When the Undo window expires and the counter left the start band during the window (an attempt in progress), the commit waits for that attempt: a counted rep cancels (reason 'rep', "Keep going."), a return to the start band without a rep commits then; an abandoned attempt commits after awaySec without a person or stalledSec without a phase change/event. A stalled stop (already outside the band at the proposal) still commits on time.
- 2026-11-13 — autoSet: **arming after an auto stop** = max(endedAt + armAfterSec, commit + `armAfterAutoStopSec` (5 s, new config key)), so walking to the rack / picking the dumbbells up right after "Set done" can't start a set. The floor survives later setSession(rest) refreshes; a manual Set done (session → rest) has no floor.
- 2026-11-13 — autoSet: rest rep candidates whose departure from the start band is **before rest began** (the commit / the setSession(rest) time) are ignored (e.g. a rep in progress when Set done was tapped).
- 2026-11-13 — autoSet: **frame clock going backwards** (stream restart, new t0): every stored time (pending window, endedAt, arming, last seen person, last rep, rest candidates) is rebased onto the new clock as if no time passed, the phase history is dropped, and the stop/idle timers restart at the first new frame. No stale pendingUntil/armAt/lastPresentT.
- 2026-11-13 — autoSet: **counts are frozen at stopPending**; a partial inside the window isn't in commit.partials. If the window is cancelled the set keeps everything seen in it.
- 2026-11-13 — autoSet caller contract (documented on AutoSetInput/push): push every camera tick including no-pose frames (tracking false, present: personInFrame(frame) false), otherwise away/idle/commit never fire; dispatch START_SET (now = at) synchronously after a 'start' action, before any setSession(rest…).
- 2026-11-13 — autoSet replay on the 4 real lateral-raise clips through the real counter (autoSet.replay.test.ts): 20 reps each, no action before rep 20. Every clip ends 4.3–6.0 s after rep 20, so no stop inside the recording. With the last frame held: still stop at rep20 + 6.0 / 10.0 / 8.8 / 8.9 s (clips 1–3 bend into the posture gate and back after the set, resetting the still timer), commit 5 s later with endedAt = rep 20. With an empty scene appended: away at +7.4 / +8.3 s (clips 1, 2), still first on clips 0 and 3. In rest (armed) over the pre-set part: no start (clip 0's pre-set partial included). In rest over the whole clip: start on rep 2, backdated 1.5–2.5 s before rep 1's event (its departure).

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

### M3 (2026-11-13)
- `npm run check`: typecheck + lint clean. Vitest **10 files / 76 tests passed** (+4: pose topology, mirror indices, fps meter).
- `npm run e2e`: **10 passed**, and 30/30 with `--repeat-each=3`. New:
  - `camera.spec.ts`: fake camera (test pattern). The model loads from our origin, inference runs (fps > 1), the delegate is reported, Front/Side presets and Switch camera work, Close stops all tracks, and **no third-party request completes**.
  - `camera-person.spec.ts` (project `mobile-person-camera`): the fake camera plays the synthetic clip. It asserts a person is detected, the 3D skeleton is live, Side turns it −90°, and the overlay draws.
  - A test that the camera button appears only on pose-tracked exercises.
- `npm run landmarks -- fixtures/synthetic`: 311/316 frames → `fixtures/landmarks/curl/synthetic-01__reps-3__partials-1.json` in 11 s.
- `npm run build`: main 168 kB / 52 kB gzip; lazy chunks: three 132 kB gzip, landmarker 46 kB gzip; model + wasm in `dist/` (21 MB total, loaded only when the camera opens).
- Screenshots 390×844: `docs/screenshots/m3-exercise-camera-btn.png`, `m3-camera-front.png`, `m3-camera-side.png`. scrollWidth 390. Page errors: none. 12–20 fps (GPU) in headless Chrome.

### M4 (2026-11-13) — provisional, synthetic fixtures
- **Acceptance holds on SYNTHETIC fixtures only** (our own mannequin clips). No real clip exists yet: Checkpoint B (task 15) is still open, and M4 is not fully done until the real clips pass too.
- Verified at e3c8bd9 on `m4-rep-counter`, clean tree.
- `npm run check`: typecheck (both projects) + lint clean. Vitest **14 files / 222 tests passed**: repCounter 51, exercises/index 47, session 42, angles 19, repCounter.fixtures 13, db 9, restCues 8, catalog 6, bodyMap 6, body3d/parts 5, focusCue 4, format 4, poseTopology 4, units 4.
- Fixture suite `src/core/repCounter.fixtures.test.ts` (13 tests: "finds the fixture folder" + 12 fixtures). Each asserts `{reps, partials}` equals the filename, and all passed:
  - curl/synthetic-01 (3 reps / 1 partial), curl/synthetic-02 (3/2)
  - goblet-squat/synthetic-01 (4/0), goblet-squat/synthetic-02 (3/2)
  - lateral-raise/synthetic-01 (4/0), lateral-raise/synthetic-02 (3/2)
  - push-up/synthetic-01 (4/0), push-up/synthetic-02 (3/2)
  - row/synthetic-01 (4/0), row/synthetic-02 (3/2)
  - shoulder-press/synthetic-01 (4/0), shoulder-press/synthetic-02 (3/2)
  - Every committed JSON frame has `landmarks` and `world` (311–431 frames per file).
- `E2E_PORT=5199 npm run e2e`: **17 passed** (1.1 min). `mobile-person-camera` runs with workers: 1 by design. `E2E_PORT=5199 npx playwright test e2e/rep-count.spec.ts --repeat-each=5`: **10/10 passed**, 0 flaky (3.8 min). Live annotation fps: 16.3–21.4 in 9 runs, and 10.2 in one "spoken count off" run, which still passed.
  - Non-blocking: in one passing run, partials were 4 by the time reps reached ≥ 3. The clip has 1 partial per loop, so at least one full curl was read as a partial in headless Chrome (fps 21.1). This is the headless-fps sensitivity noted in the Decisions. Watch it on the phone.
- `npm run build`: main `index` 176.19 kB / 54.87 kB gzip, CSS 9.23 kB / 2.69 kB gzip. Lazy chunks: three.module 534.80 kB / 132.32 kB gzip, landmarker 154.42 kB / 45.63 kB gzip, viewer 5.42 kB / 2.42 kB gzip, skeleton3d 2.31 kB / 1.23 kB gzip.
- Screenshots 390×844 (DPR 2, `node scripts/screenshots.mjs m4`, fake camera = synthetic curl clip):
  - `docs/screenshots/m4-camera-counting.png`: shows "3" reps (96px), "Right arm" and 21 fps GPU tracking. The sheet is scrollHeight 844 = clientHeight 844 (no scrolling), with the rep number at y 82–188 and Set done at y 728–816 (88px tall), so both are visible without scrolling. At capture time partials were 0, so the partials line was hidden.
  - `docs/screenshots/m4-settings-spoken-count.png`: the "Count reps out loud" switch is On by default and 56px tall.
  - `docs/screenshots/m4-rest-after-counted-set.png`: after Set done, the screen goes to Rest (1:00). "Today: 3×10 kg" matches the 3 counted reps, and the next set defaults to 3 reps.
  - scrollWidth 390 on all three. Page errors: none. Console errors: only the expected CSP block of `odml.pa.googleapis.com/v1/log` (2 lines). Console warnings: only headless GPU/MediaPipe internals ("GPU stall due to ReadPixels", "OpenGL error checking is disabled", "NORM_RECT without IMAGE_DIMENSIONS").

### M4c + M4b Push A slice (2026-11-13)
- Verified at afb6f52 on `m4c-coaching` (clean tree; the only local change is the verifier's `scripts/screenshots.mjs` `m4c` / `m4c-flow` sets). S2 (gauge on the video) is deliberately not built and not judged. Verdict: **PASS** for MUST 1–11 + S1, S3–S10.
- `npm run check`: typecheck (both projects) + lint clean. Vitest **23 files / 450 tests passed**: repCounter 68, exercises/index 68, demo3d/moves 57, session 50, rig 27, devlog 26, angles 19, coachSpeech 18, repCounter.fixtures 13, db 12, catalog 11, romGauge 11, devlogCodec 10, highlight 10, devlogUi 10, restCues 8, bodyMap 6, howto 5, body3d/parts 5, focusCue 4, format 4, poseTopology 4, units 4. Node script tests (`scripts/devlog.test.mjs`) **8/8**.
- Fixture suite **12/12 with unchanged counts** (curl 3/1, 3/2; goblet-squat 4/0, 3/2; lateral-raise 4/0, 3/2; push-up 4/0, 3/2; row 4/0, 3/2; shoulder-press 4/0, 3/2). `git diff main..HEAD` touches no file in `fixtures/landmarks/` and no threshold in `src/core/exercises/` (only hints + placement data added).
- `E2E_PORT=5191 npx playwright test`: **31 passed** (1.6 min). `--repeat-each=3` on `devlog-camera`, `rep-count`, `camera-layout`: **27/27 passed**, 0 flaky (3.3 min). The only server-side warning is the intentional "Developer log write failed … Error: boom" from the failing-recorder test.
- `npm run build`: main `index` 231.90 kB / 73.49 kB gzip (M4: 176 kB / 55 kB), CSS 15.99 kB / 3.96 kB gzip. Lazy: three.module 535.59 kB / 132.53 kB gzip, landmarker 154.39 kB / 45.61 kB gzip, demo `scene` 5.02 kB / 2.41 kB gzip, viewer 5.42 kB, skeleton3d 2.31 kB. The built main chunk contains the git sha (`afb6f52`). `dist/` has only `index.html` (no `harness.html`).
- Privacy: the only third-party URLs in `dist/` are MediaPipe's usage log (`odml.pa.googleapis.com`, blocked by the CSP `connect-src 'self' blob: data:`) and two Dexie error-message links (text only). The click-through made 0 off-device requests. A note and a machine setting with a sentinel string were typed before the set; the exported log contains neither (the only strings are ids, enums, app version, user agent, unit and the app's own spoken sentences).
- Screenshots 390×844 (DPR 2, `node scripts/screenshots.mjs m4c`, fake camera = synthetic curl clip), all **scrollWidth 390**, **0 page errors**, console = only headless GPU/MediaPipe warnings (plus the expected CSP block of `odml.pa.googleapis.com`):
  - `docs/screenshots/m4c-camera-setup-card.png`: "Set up your phone" card with pictogram + 3 lines, count "0 / 12", "Get into start position"; placement sentence spoken once.
  - `docs/screenshots/m4c-camera-counting.png`: "2 / 12 reps" (count 96px, target 44px), "Set 1 of 3 · 8–12 reps" (22px), stage 635px tall (75% of 844), sheet does not scroll, Set done 88px tall at y 748–836; set-up card auto-hidden once tracking.
  - `docs/screenshots/m4c-camera-hint.png`: "Curl higher." (22px, `data-hint-reason="far"`); spoken order `… Curl higher., One, Curl higher., Two` (a hint never over a count).
  - `docs/screenshots/m4c-rest-fix-last-set.png` (collapsed: "Last set: 2 reps · 3 partials", Fix 56px) and `m4c-rest-fix-last-set-open.png` (steppers 72×72, values 64px, Save/Cancel 64px).
  - `docs/screenshots/m4c-summary-fix.png`: Summary Fix open; the corrected 3 reps give 30 kg volume.
  - `docs/screenshots/m4c-settings-devlog.png`: toggle On, "141 kB · 1 session", Export last / Export all / Clear, privacy line; smallest text 20px, smallest button 56px.
  - `docs/screenshots/m4c-howto-pushups.png`: running 3D demo (`data-mode=3d`, playing), "3D demo" + "Camera", phase text, "Down 2 s · Up 1 s", 3 how-to lines. `m4b-demo-{bench-press,incline-press,seated-press,lateral-raise,triceps-extension}.png`: the other five demos mid-rep, all `3d`.
  - `docs/screenshots/m4c-howto-info.png`: Hammer Curls: "Info" badge, 2D muscle map (biceps lit), tempo, 3 lines, focus line.
  - `docs/screenshots/m4c-preview-badges.png`: Push A preview: six "3D demo" badges, "Camera" on Seated Press, Lateral Raise, Pushups only; badges 20px.
- Push A click-through (`node scripts/screenshots.mjs m4c-flow`): Seated press / Lateral raise / Pushups cameras each show their placement card and speak their sentence once ("Face the phone at chest height …", "… room beside your hands.", "Put the phone on the floor beside you …"); targets "/ 12", "/ 15", "/ 20" with set lines; reopening Pushups for set 2 does not repeat the sentence. Set done → Rest Fix 20 → 22 reps; Summary Fix → "22 reps · 1 partial"; Done → Settings → Export last saved `gym-clean-devlog-2026-11-13-1659-last.json.gz` (download path; 15 kB). `npm run devlog` on that export wrote two push-up fixtures to `test-results/` and reported the two closed-without-Set-done sets as "set never ended".
- Non-blocking observations: (1) in headless Chrome at 13–20 fps the live curl clip read some full curls as partials (2 reps / 3 partials at one point), so "Curl higher." was spoken for full reps. This is the known headless-fps sensitivity; watch it in the phone log. (2) A camera set that counted 0 logs the planned default reps (Pushups: "Last set: 20 reps"). This is M4 behaviour; the dev log keeps counted {0, 0}, and Fix corrects it. (3) Each camera reopen took ~4 s before inference ran (fps 0.0 at 4 s). (4) Doc drift: S3's checkbox is unticked although `howto.json` covers all 30 exercises (2–3 lines, ≤ 70 chars, no banned words), and task 11's coaching e2e lives in `camera-layout.spec.ts` + `rep-panel.spec.ts` instead of `camera-coaching.spec.ts`.

### m4d-next round (2026-11-13): S2 + M4d Pull A + M5b coach + silent hint
- Verified at 5891e82 on `m4d-next` (15 commits over origin/main ec91d2f; clean tree, the only local change is the verifier's `scripts/screenshots.mjs` `m5b` set). Verdict: **PASS** (non-blocking notes below).
- `npm run check`: typecheck (both projects) + lint clean. Vitest **26 files / 640 tests passed** (M4c slice: 23 / 450): demo3d/moves 133, advice 71 (new), repCounter 68, exercises/index 68, session 59, rig 42, devlog 26, angles 19, coachSpeech 18, db 16, highlight 16, repCounter.fixtures 13, romGauge 11, catalog 11, devlogCodec 10, devlogUi 10, restCues 8, bodyMap 6, coachSummary 5 (new), howto 5, body3d/parts 5, focusCue 4, format 4, poseTopology 4, units 4, coachTip 4 (new). Node script tests **8/8**.
- Fixture suite **12/12, unchanged counts** (curl 3/1, 3/2; goblet-squat 4/0, 3/2; lateral-raise 4/0, 3/2; push-up 4/0, 3/2; row 4/0, 3/2; shoulder-press 4/0, 3/2).
- M5b rules: advice.test covers A1–A5, N1–N6, P1–P2 with true/false edges, priorities (A1>A2>A3>A5, N1>N2>N4, final set → N rule), kg 2.5 / lb 5 steps incl. 35 lb stored as odd kg → "+5 lb" / Apply 40 lb, the 25% guard (5 on 15 lb none, 5 on 20 lb allowed, 2.5 on 7.5 kg none), bodyweight never gets an Apply, A3 needs ≥ 2 sets, overrun uses the previous log's restSec, no data → no advice/progress, ≤ 12 words + no banned words with the longest name, and `adviceSpeakDue` (2 s crossing, ≤ 6 s, target ≥ 17 s). Session reducer: APPLY_NEXT_WEIGHT only on Rest, same upcoming exercise, not paused, finite ≥ 0; db: coachTips default on.
- M4d: for each of the six new demos (curl, one-arm row, goblet squat, hammer curls, reverse flyes, wide-grip lat pulldown) moves.test asserts constant bone lengths, lowering longer than the lift, continuous loop, declared start/far angles reached, ≥ 10° past both thresholds (the three pose-tracked) or a real manual range from the demo's own angles (the three manual), plus a per-exercise posture test; highlight.test: every primary/secondary muscle lights a mannequin part.
- `E2E_PORT=5191 npx playwright test --trace=off`: **45 passed** (1.7 min). `--repeat-each=3` on coach, camera-layout, howto, silent-hint: **69/69 passed**, 0 flaky (32 s). `CI=1` on camera, camera-person, camera-layout, rep-count, devlog-camera: **18/18 passed** with 1 worker, no fps skips locally, no retries used (2.1 min). Server-side warnings: only headless GPU/MediaPipe internals and the intentional "Developer log write failed … boom".
- `npm run build`: main `index` **252.02 kB / 80.48 kB gzip** vs origin/main built the same way **233.25 kB / 74.03 kB gzip** → **+18.8 kB raw / +6.45 kB gzip (+8.7%)**. CSS 20.55 kB / 4.76 kB gzip (was 15.99 / 3.96). Lazy: demo `scene` 5.33 / 2.51 kB gzip (was 5.02 / 2.41), three.module 132.53, landmarker 45.61, viewer 2.43, skeleton3d 1.23 kB gzip (unchanged). `dist/` has only `index.html`, `assets/`, `mediapipe/`, `models/`: no `docs/design` file, no harness page, no "m4e"/"energy-sheet" string. CSP `connect-src 'self' blob: data:` present.
- M4e step 1: `docs/design/m4e-directions/` has README, 3 direction pages (energy/pro/track .html), 15 mockup PNGs + 3 sheets, `_src/` build/shoot scripts. `eslint.config.js` ignores `docs/design/**` (`npx eslint docs/design` → "File ignored"); tsconfig includes only `src`, `tools`; Vite builds only `index.html`.
- Privacy: 0 off-device requests in every screenshot flow and the click-through. Third-party URLs in `dist/` are unchanged: MediaPipe usage log (blocked by CSP), two Dexie error-message links, the SVG namespace. No banned medical words and no new network calls in the `src` diff. The dev-log export after the coach flow contains `advice` events with only `{rule: "A3", exerciseId, shown|spoken: true}` and `APPLY_NEXT_WEIGHT {exerciseId, weightKg: 18.14}`: rule ids, ids and numbers, no advice text. All strings in the export: format, session id, app version, user agent, unit, day id, event types, rule id, exercise id.
- Click-through (`node scripts/screenshots.mjs m5b coach`, real clock, speech spy): lb → Push A → Bench starts at 35 lb → set 1 (8) → no tip → set 2 (8) → A3 "Strong set. Try +5 lb next set." + why "Sets: 8, 8 · 35 lb · no partials · target 8" + "Apply 40 lb" (56px); not spoken before 2 s, spoken exactly once ("Strong set. Try plus 5 pounds next set.", still once at 9.5 s), queued after the set-start cue → Apply → "Applied: 40 lb next set", no button left, Next "8 reps × 40 lb" → Start set: "Set 3 of 4", stepper 40 lb → set 3 → End → Summary Coach "Dumbbell Bench Press · Next time: repeat 40 lb." (N6, 3 of 4 sets) → Settings → Coach tips off → after reload still off → new Push A, a 6-rep set (would be A2): no tip, only the set-start cue spoken.
- Screenshots 390×844 (DPR 2, `node scripts/screenshots.mjs m5b`), all **scrollWidth 390**, **0 page errors**; console only headless "GPU stall due to ReadPixels" / MediaPipe warnings; smallest text 20px, smallest button 56px in every measured region:
  - `docs/screenshots/m5b-rest-coach-tip.png` (A3, text 24px, why 20px, Apply 56px), `m5b-rest-coach-applied.png`, `m5b-summary-coach.png`, `m5b-settings-coach-switch.png` (switch 56px, On by default).
  - `docs/screenshots/s2-camera-gauge.png`: real model on the synthetic curl clip, gauge mid-rep (zone "moving", angle 85–95°), Target/Start labels 20px whole, angle 26px, gauge 72×547 at the right edge clear of the count, count 96px, Set done 88px, sheet does not scroll.
  - `docs/screenshots/m4d-howto-{dumbbell-bicep-curl,one-arm-dumbbell-row,goblet-squat,hammer-curls,reverse-flyes,wide-grip-lat-pulldown}.png`: all `data-mode=3d`, playing, muscles lit, tempo + 3 lines; badges "3D demo" (+ "Camera" on curl, row, squat). The lat pulldown shows the machine prop, the row a bench box, the reverse fly an incline pad.
  - `docs/screenshots/m4d-pull-a-badges.png`: all five Pull A rows "3D demo"; "Camera" on row and curl only.
  - `docs/screenshots/silent-hint-preview.png` (iPhone UA): "Spoken cues: turn Silent mode off." (20px, icon + words), Got it 56px, sits above Start workout, Start fully on screen. Default (non-iOS) UA: no hint.
- Non-blocking observations: (1) after Apply, set 3 at 40 lb (sets 8×35, 8×35, 8×40) gets A3 again, "+5 lb → 45 lb". That matches the rule table (A3 looks at reps only, all of today's sets), but it suggests a second jump after one set at the new weight; product call for Wongsaton (e.g. only count sets at the current weight). (2) The one-arm row demo has the hand on the bench but both feet on the floor, while how-to line 1 says "One knee and hand on the bench" (anatomy-3d-engineer or the how-to text). (3) In headless Chrome the gauge screenshot shows count "0 · Get into start position" while the gauge moves (counter still settling at 14 fps); expected.

## Blockers / questions for Wongsaton
- **🧍 Checkpoint B3 (hands-free gym test, waiting for his report):** train a day with hands-free on, note every wrong auto start/stop and whether 6 s stillness / the 5 s Undo feel right, then export the dev log.
- **🧍 M4e design pick:** Energy, Pro or Track (mockups in docs/design/m4e-directions).
- **Press, "first press = positioning"?** He logged 7 per set; the app counts 8 identical press cycles. If the first press from the shoulders is setup (lockout-start convention), the SPEC, the synthetic press labels and the press demo all change. Press real fixtures and the press M5 form rules wait on this.
- **Push-up set with a sit-down break: one set or two?** Today, with hands-free, a 16 s sit-down saves the first part (still stop) and auto-starts the rest as a second set.
- **Older coach questions:** (1) should the coach trust manually logged reps? (2) Is the 25% jump guard right for light dumbbells?
- **New (M5, not blocking; defaults in Decisions):**
  - (a) **M4 gate:** SPEC M4 says the real Checkpoint B fixtures must pass before M5, but only the lateral raise has committed real fixtures (press and push-up wait on the questions above; curl, row and squat have none). OK to build M5 now, with every unverified form rule shipped **off**?
  - (b) **"Fires correctly" on real data:** your real sets are clean by count, so the most the data can show is "silent on your sets + sees your one real asymmetry". Is that enough to switch a form rule on (the plan's default for the lateral raise), or do you want to record deliberate-mistake sets first (SPEC §5: a set with partials, fast lowering, one arm lagging, raising too high)? Those sets would also let us switch on the curl/row/push-up form rules.
  - (c) **Focus score weights:** −10 per cue, −5 per partial or stall; out of frame and low light cost nothing. OK?
  - (d) **Stalled cue with hands-free:** "Stay with it. N to go." at 5 s when you hold mid-rep, with the auto stop at 10 s. When you rest at the start position, the 6 s still stop says "Set done" without a nudge first. Right, or do you want a nudge before every auto stop?
- **Not blocking (M5c, defaults chosen, see Decisions):** (a) "Hands-free sets" on by default, OK? (b) Auto start waits for **2 reps** (the first rep isn't spoken) to avoid phantom starts; would you rather it start on the first rep and accept the odd false start? (c) Stop after **6 s** standing still + a **5 s** Undo window: too quick near failure (e.g. holding the push-up plank) or too slow? (d) A false auto start during rest (rare with 2 reps) logs a short extra set; round 1 has no "not a set" button, so you'd fix its reps on Rest. Want a "Discard set" button instead?
- ~~Checkpoint B2 (Push A log)~~: done; the log was analysed and the counter retuned (Decisions).
- **Not blocking (M5b, the "older coach questions" above):** the coach trusts the logged numbers. A manual set logged without touching the reps stepper reads as "top of the range", so it can earn "Strong set" / "+5 lb next time". Default: trust the log (that's what Fix is for). Alternative if it misleads him: only count a set as "top" when the reps were camera-counted or edited. Also: is the 25% jump guard right for light dumbbells (no "+5 lb" on a 15 lb lateral raise; "more reps" instead)?
- **Not blocking:** after the log analysis, should an incomplete return ("didn't straighten") count as a rep (lenient) or stay a partial (strict, current)? The default stays strict until the data says otherwise.
- **🧍 M4e (later):** pick one of the 2–3 visual directions when they're ready.
- **🧍 Checkpoint B: fixture videos still outstanding. Next gym visit.** Not blocking M4 day to day (it runs on synthetic fixtures), but M4 isn't fully done until these pass (M4 task 15). Record per SPEC §5 into `fixtures/videos/<folder>/<label>__reps-<n>__partials-<m>.mp4` (gitignored, never committed). Folders: `curl`, `push-up`, `shoulder-press`, `row`, `goblet-squat`, `lateral-raise`. For each: one clean clip, plus one with 2–3 partial reps and fast lowering, 10–30 s. Then tell me and I'll run `npm run landmarks`.
- **Question (not blocking): should "count reps out loud" default to on or off?** The plan defaults it to **on** ("voice over screen" rule). It's a toggle in Settings either way.
- ~~Camera test fps~~ — done: 30 fps on the phone, inference stays on the main thread.
- **Checkpoint A:** do one real session from https://wongsatonk.github.io/gym-clean/ and report what felt off, what annoyed you, and what you never used. Things worth checking: do the voice cues play with the screen on and the phone silent switch off? Does the screen stay awake? Are the starting weights in the program close?

