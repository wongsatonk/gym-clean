# Gym Clean — Progress Log

Claude Code updates this file at the end of every task. A fresh session resumes from here.

## Status

- **Live:** b2c532e on main, deployed 2026-11-15 (CI: 2582 unit, 135 e2e passed): everything above plus the polish batch and **M7 Fuel** (Fuel tab, targets + weekly check, weigh-ins, 47 Thai dishes, offline USDA search, recipes, coach food ideas, opt-in barcode scan). First CI run (e01600c) failed on the short-phone set-up card under Linux text rendering; fixed in b2c532e (reproduced in the Playwright Linux container).
- **In progress:** cloud sessions during Wongsaton's flight (2026-11-15), per `docs/cloud-briefs.md`. Open follow-up: the 10 s Undo toast covers a Fuel sheet's main button until you scroll (verifier note; in cloud session 2).
- **Now (2026-11-17, resumed in ~/Develop/gym-clean):** slice 1b verified (PASS). **Slice 2 builds on branch `m12-slice2`** in worktree `.claude/worktrees/resume-4f67e1` (cut from `m12-coach-tab` at 69fb2a1; that session cannot write into the agents-75bc3a worktree). Tasks 1–19 done (G1 reviewer PASS after one fix; G2 reviewer PASS, commits 90c30b4…ea9f8fc; GymBrainCore 30/30, GymHealthCore 21/21, GymSpeechCore 29/29 XCTests and the simulator build passed for ios-engineer, re-run in task 22). Version 1.14.0, iOS build 267. Tasks 1–22 done. Task 21: 4 new e2e specs (coach-apple, mic, reminders, check-in), each 3× green; full e2e 220 passed / 1 skipped / 1 failed (focus-cues.spec.ts:364, passes alone); two chat bugs fixed (mic button moved from under the finger while listening; unsent words lost on re-render). Task 22: simulator build + 80 XCTests; the simulator can't run Apple's model or on-device speech. Follow-ups committed: eval error count, GymBrain error-kind log, Settings Back keeps scroll, prewarm on focus, eval token line, mic in the Pause sheet. Coach tab layout fixed (thread 61% at 390×844). Task 23 reviewer: one blocking (stuck "Checking…" on a failed Apple check) fixed + 4 non-blocking fixed. Task 24 verifier **PASS** (check 5228; full e2e 224 passed/1 skipped on run 2, run 1 had one new load flake motion.spec.ts:39 that passes alone; slice 2 specs 105/105 at repeat-each 5; build contains 1.14.0; simulator build + XCTests 21/29/35; 19 verify screenshots `docs/screenshots/m12s2-verify-*.png`). On-device eval numbers, real Apple answers, token counts, mic and notifications are 🧍 Checkpoint J. Small polish follow-ups (not blocking): text box narrows to ~135px while listening; reminder time picker is 12-hour in Chromium next to 24-hour copy; after the "Apple Intelligence is off" note the rules reply reads "I can help with:" with chips only in the bottom row. **Next:** 25 merge (his call) + install on his iPhone → → 25 merge + ask → 26 🧍 Checkpoint J.
- **M13 started 2026-11-18** (his go: "Go with 1, 2 then M13") on branch **`m13-published-look`**, cut from `m12-slice2` at 3b69419 (slice 2 verified + polish; slice 2 iPhone install deferred by him: "Later"). Task 1 done (types + `src/core/brand.ts`; new routes open Settings until tasks 30–31). G1 dispatched: core 2→3, 4+5, 6+7, 8+9+34; ui 13+16+20, 17→18, 19+23+24; ios 28; main 26.
- **Task 20 wiring notes (from G1):** run stored `'reminders'` through core `mergeReminders` before the screen/plan; re-run `reminderPlan` on app open/foreground **and after a session finishes**; `pending` → string ids via `reminderIdFromNumber`; `answeredMissed` from coach UI state `missedAnswered`; `request()` only from a switch-on. Start GymSpeech only after `micDown`; a cancel from blur (iOS permission alert) is not an error. Post the check-in card on the Coach tab only (omit check-in callbacks in the Pause sheet). Use `updateChatMic` for the ~10/s partial/level events. `showSource` only in the native build. Brain request: turns live in the context text (last 8, 140 chars each), so `GymBrainRequest.messages` carries only the new message (≤ ~400 chars); red flags go to the rules brain. Pass `listCheckIns` to `recapDue`. (G2) Notes store: `coachNoteStore(db)`; GymBrain `prewarm(instructions)` on text-box focus / mic down with the same instructions string; eval UI shows `report.p50Ms`. Generated Swift lives at `ios/App/App/Plugins/GymBrain/GymBrainCore/Sources/GymBrainCore/TrainerTools.generated.swift` (inside the Core package so XCTests compile it).
- **Earlier next step:** build **M12 slice 1b "Trainer kit"** on `m12-coach-tab` (plan under "Current milestone plan → M12 — slice 1b"; first parallel group: 1b tasks 1 [main] ∥ 2 [core] ∥ 3 [ios] ∥ 4 [main], plus slice 2 tasks 1 and 10 [ios] early), then **slice 2** (Apple brain + mic + reminders + check-in; plan under "→ M12 — slice 2") → 🧍 Checkpoint J. His go-ahead 2026-11-17: "Go ahead slice 2 and 1b". Slices 1 + 1c are verified (745a143) and on his iPhone, not merged; merge/push stays his call. Older gym checkpoints (E, F1, …) are his to-dos in the app.
- **M12 slices 1b + 2: planned 2026-11-17** (Decision "M12 slices 1b + 2"). Defaults taken for M12-q1 and M12-q4 (planner calls he can correct in the to-do decision steps). Apple Intelligence is on and downloaded on his iPhone (his words 2026-11-17: "It finished"). Nothing blocks on him until Checkpoint J.
- **Build monitor (live dashboard):** https://claude.ai/artifact/RYCFcmrpxgDCtXd6Gts78i — Claude uploads new data as helpers start/finish and deploys complete.
- **M12 Coach tab, slice 1: planned 2026-11-16** on `m12-coach-tab` (design approved; he said "start slice 1" alongside his Checkpoint H week). Plan under "Current milestone plan → M12 — slice 1"; contract SPEC M12 + Decision "M12 plan". Nothing in it blocks on him.
- **M12 slice 1c (What's New tour + To-do guides + Copy report): planned 2026-11-16** (his yes), on `m12-coach-tab` after slice 1's verifier PASS; plan under "Current milestone plan → M12 — slice 1c"; Decision "M12 slice 1c". Not blocking on him (M12-q5 has a default).
- **M13 "Published look": planned 2026-11-17** (his yes; Decision "M13 Published look"; owner mode = option A). Starts only after M12 slices 1b and 2 are verified; plan under "Current milestone plan → M13" (below the M12 slice 1b plan). M13-q1 answered: keep the name "Gym Clean" (his words 2026-11-17: "Keep it Gym Clean").
- **M14 "Wrist and ears" (Apple Watch app + AirPods head motion): planned 2026-11-17** (his words: "Add it and I need apple watch app too"; Decision "M14 Wrist and ears"). Starts after M13 is verified; plan under "Current milestone plan → M14" (below M13). M14 tasks 1–2 (facts + a scratch watch spike on his devices) may run any time. **M14-q1 and M14-q2 answered 2026-11-17:** free Personal Team first ("let's try the free version, and I will decide the pay in the future"); his devices are an **Apple Watch Series 9** and **AirPods Pro 2** ("I got series 9 and pro 2"). If task 2 shows the free team can't run the watch app, the watch-only tasks pause and we ask him again.
- **M15 "Best-rep clips": planned 2026-11-17** (his words: "it can record in the app while i'm working out … to be good of public via instagram"; "you can change that but need to save only on my phone not on cloud"; Decision "M15 Best-rep clips"). Builds **after M14** on `m15-best-rep-clips` (release 1.17.0); plan under "Current milestone plan → M15" (below M14). M15 tasks 1–2 (facts, paper/scratch) may run any time → 🧍 Checkpoint M.
- **Waiting on Wongsaton:**
  - **M11 Health data (Apple Health + WHOOP): built 2026-11-16 on `m11-build`** (read-only, route A, defaults). Reviewer PASS (424cafd), verifier PASS on the Mac (check 3157, full e2e 159/1 skipped, simulator build + 19 XCTests). Next: 🧍 task 13 on his iPhone (`ios/` checklist in docs/ios-setup.md), then merge; 🧍 task 2: 2026-11-16 he says WHOOP writes "a lot of things" into Health (exact list not given); the iPhone test (task 13) confirms which of the six arrive.
  - Deploy OK for m4e-redesign.
  - ~~A-q6~~ (answered "keep it") and ~~A-q5~~ (answered "no") on 2026-11-15.
  - **M9 native iOS shell (answered 2026-11-15: defaults for all 9, iPhone 17 Pro):** tasks 1–2 done (facts re-checked, Capacitor 8.6.2 packages + `--mode native` build). Task 3 needs Xcode repaired on his Mac (M9-q9). Facts that changed are flagged in Decisions "M9 native shell plan" (Thai still not supported by Apple's on-device model; CLI telemetry is opt-out; iOS 27 adds an off-device Private Cloud Compute model we don't use).
  - **M10e equipment-aware swaps (planned 2026-11-15, branch `m10-equipment`):** the M10e-q questions under "Blockers / questions" are not blocking; their defaults get built.
  - **A-q7:** should Legs days show the front of the figure?
  - **Exercise first screen:** the notes row sits about 30px under the sticky Set done until you scroll. Shrinking the content would fix it.
  - The B-q and A-q questions under "Blockers / questions".
  - The 🧍 gym checkpoints.
  - **M4f Camera for more exercises (planned 2026-11-14):** the M4f-q questions under "Blockers / questions" are not blocking; their defaults get built.
  - **M10 AI trainer (planned 2026-11-14):** the M10-q questions under "Blockers / questions". Phase A can start once q1–q3 and q8 have answers, or on the defaults if he says so.
  - **M7b local food photos (planned 2026-11-15):** the M7b-q questions under "Blockers / questions" are not blocking; their defaults get built. M7b-q1 (dataset licence / who trains) matters most.
  - **M7 Fuel (planned 2026-11-15):** the M7-q questions under "Blockers / questions" are not blocking; their defaults get built. M7-q5 answered: barcode is built, off by default.

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
- [~] M4e Visual redesign: the mix (docs/design/m4e-mix) was picked 2026-11-13 night. Steps 2–3 planned below
- [ ] M4f Camera for more exercises: **planned 2026-11-14** (approved by Wongsaton). Wave 1 (6 easy exercises, `learning` status) starts when the M4d batch merges → 🧍 Checkpoint F1. Wave 2 (9 doable exercises) comes after F1 → 🧍 F2
- [ ] M5 Live trainer: focus & form cues (partial cues moved to M4c) → 🧍 Checkpoint C (gym test with camera). **In progress, plan below**
- [~] M5b Trainer recommendations after the set: round 1 is live. The tempo rule (T1) is built in M5 (task 8)
- [~] M5c Hands-free sets: **built and live** (c3c1f85, verifier PASS) → waiting for 🧍 Checkpoint B3 (hands-free gym test). Follow-up "Breaks inside a set: tap to continue" planned below
- [ ] M6 Polish & install
- [x] M7 Fuel: food & nutrition. Built 2026-11-15 on `m7-fuel` (Fuel tab, targets + weekly check, Thai dishes, USDA search offline, recipes, coach food ideas, opt-in barcode). Reviewer PASS, verifier PASS (Verification evidence → M7).
- [ ] M7b Food photo recognition: **local part planned 2026-11-15** (plan below; Claude backup out) → 🧍 Checkpoint D (my meal photos, train, test a week)
- [ ] M9 Native iOS shell (Capacitor). **Answered 2026-11-15 (defaults); tasks 1–2 done, task 3 waits on Xcode (M9-q9)** → 🧍 Checkpoint G
- [ ] M10 AI trainer: phase A (plan actions + coach chat, web) → 🧍 Checkpoint E; phase B (on-device Foundation Models brain) with M9; phase C (optional Claude brain). **Planned 2026-11-14, below; waiting on the M10-q questions**
- [ ] M10e Equipment-aware swaps (follow-up to M10 phase A): **planned 2026-11-15** on `m10-equipment` (gym profile, kit needs as data, the coach proposes a swap for kit his gym lacks, e.g. Leg Press) → extends 🧍 Checkpoint E
- [ ] M11 Health data (Apple Health + WHOOP, native app only): **built 2026-11-16 on `m11-build` (read-only, route A); reviewer PASS, verifier PASS on the Mac; waiting on the iPhone test (task 13)** → 🧍 Checkpoint H
- [ ] M12 Coach tab: chat, focus blocks, calendar, motion (approved 2026-11-16). **Slice 1 planned 2026-11-16** on `m12-coach-tab` (Coach centre tab + chat + history, rules brain behind a router, focus blocks, Calendar replaces History with completion + scores + Share month, motion) → 🧍 Checkpoint I; **slice 1c "What's New + To-dos" planned 2026-11-16** (tour per release, to-do guides for his open checkpoints + decisions, one Copy report; ships with slice 1 by default); **slice 1b "Trainer kit" planned 2026-11-17** (1.13.0: effort, warm-ups, intake/goal + starter plan for a second user, measurements + e1RM + body fat/lean mass, short on time, next block, progress photos, feel today, setup cues, cardio line, nudges + learn cards); **slice 2 planned 2026-11-17** (1.14.0: Apple brain + on-device mic + reminders + weekly check-in, iPhone) → 🧍 Checkpoint J; slice 3 (Claude brain, his key)
- [ ] M13 Published look (approved 2026-11-17; **planned 2026-11-17**, builds after M12 slices 1b and 2 on `m13-published-look`; release 1.15.0: first-launch welcome + permission pages, owner mode (off on fresh installs), brand + launch screen, polish from the UX review, About + privacy + licenses, Story-size share + store screenshots + landing page, "her phone" checklist) → 🧍 Checkpoint K
- [ ] M14 Wrist and ears (approved 2026-11-17: "Add it and I need apple watch app too"; **planned 2026-11-17**, builds after M13 on `m14-wrist-ears`; release 1.16.0: Apple Watch remote + live heart rate + opt-in Save to Health, AirPods head-still / neck hints + head-counted calf raises and shrugs). Free Personal Team first (M14-q1 answered 2026-11-17); if it can't run the watch app the watch track pauses and he is asked again. His devices: Apple Watch Series 9, AirPods Pro 2 → 🧍 Checkpoint L
- [ ] M15 Best-rep clips (approved 2026-11-17: "you can change that but need to save only on my phone not on cloud"; **planned 2026-11-17**, builds after M14 on `m15-best-rep-clips`; release 1.17.0: opt-in per workout, rolling in-memory buffer, auto-kept best reps (top form / new best / hard last rep) + "Save last rep", others blurred, no sound by default, phone-only storage excluded from iCloud backup, 7-day auto-delete unless starred, 9:16 Story export + Clips screen, share only via the share sheet) → 🧍 Checkpoint M

## Current milestone plan

### M12 — slice 2: Apple on-device brain + mic + reminders + weekly check-in (planned 2026-11-17; release 1.14.0)
**Contract:** SPEC M12 slice 2 (Goals 5, "Mic", "Brains", trainer-kit item 6, slice 2 Accept), M10 "Phase B" + its Accept, the design doc `docs/superpowers/specs/2026-11-16-coach-tab-chat-design.md`, and Decision "M12 slices 1b + 2" (2026-11-17), which wins where it is more specific. **No network request** (Apple's model, speech and notifications all run on the phone). All logic **tests first** (Vitest, made-up data only; the repo is public); Swift logic in a `…Core` Swift package with XCTests, like `ios/App/App/Plugins/GymHealth/GymHealthCore`. UI tasks: props in / callbacks out, render tests + 390×844 harness screenshots, tokens + motion helpers, text ≥ 20px, targets ≥ 56px, nothing new reachable during a set.

**Why this slice matters most to him:** at Checkpoint I he said the coach "still cannot help much": free text only hits the rules brain's keyword matcher. Slice 2's Apple brain answers free text. **Apple Intelligence is on and fully downloaded on his iPhone** (his words, 2026-11-17: "It finished"), so Checkpoint J tests the real model. The rules fallback stays for any phone where it's unavailable (e.g. his wife's).

**Branch:** `m12-coach-tab`, after slice 1b's verifier PASS (tasks 1 and 10 may start during 1b: docs + a separate Swift plugin, no shared files). Subagents never commit.

**Fit with the current code:**
- The router seam exists: `src/data/brain/router.ts` + `rules.ts`, interface `CoachBrain` / `BrainContext` / `BrainReply` in `src/core/types.ts`. Slice 2 adds `src/data/brain/apple.ts` and registers it in the native build only. M10 phase B tasks B1–B8 (plan under "M10 → Phase B") are re-planned here with today's owners: ios-engineer owns `ios/**`, `src/native/**` and `scripts/gen-trainer-tools.mjs`.
- Native plugins live in `ios/App/App/Plugins/<Name>/` with a `<Name>Core` Swift package for testable logic (GymHealth pattern); e2e fakes them through `window.Capacitor.Plugins.<Name>` (e2e/health.spec.ts pattern). Deployment target is iOS 26.0, so Foundation Models and SpeechAnalyzer are available at build time; runtime availability is checked.
- **Read-only tools without a JS round trip (planner call):** before each `respond`, the app computes `weekSummary`, `progressSummary`, `foodIdeas` and `exerciseInfo` (for today's + the next 7 days' exercises) and passes them in as `toolResults`; the Swift read-only tools return the matching text. `propose*` tools only record the call (M10 rule). If the docs (task 1) show a cheap JS round trip, ios-engineer notes it and main decides; the TS contract doesn't change.
- Dexie is at **v10** after 1b; slice 2 adds `checkIns` in **v11** (backed up). Reminder + mic + brain-note state live in `settings` keys `'reminders'` and `'coach'`.
- `coach.appleCardReasons` (set by the M12-q1 to-do decision step; default true) and `trainerKit` are read at runtime: changing the decision later changes the behaviour (test).

**Order / parallel groups:**
- **Early (during 1b):** 1 [ios] ∥ 10 [ios].
- **G0 (after 1b PASS):** 2 [main].
- **G1 (after 2):** 3 [core] → (4 ∥ 5) [core]; 9 ∥ 12 ∥ 13 [core]; 11 [ios]; 16 ∥ 18 [ui]; 17 [ui] after 16.
- **G2:** 6 [ios] after 3 → 7 [ios] after 6; 8 [core] after 3, 4, 5; 14 [core] after 8; 15 [core] after 13.
- **G3:** 19 [main] → 20 [main] wiring after 7–18.
- **G4:** 21 [ui] e2e ∥ 22 [ios] simulator + XCTests, after 20.
- **G5:** 23 reviewer → 24 verifier → 25 main merge + ask → 26 🧍 Checkpoint J.

- [x] 1. [ios-engineer] **Look up current Apple docs first** (CLAUDE.md rule 8; APIs may differ from memory).
  - Files: docs/ios-setup.md (new section "Slice 2 API notes").
  - Check and write down, with links and the iOS version each needs: FoundationModels `SystemLanguageModel.default.availability` (every unavailable reason case: device not eligible, Apple Intelligence not enabled, model not ready, …), `LanguageModelSession(tools:instructions:)`, `respond(to:)` / streaming, the `Tool` protocol (`name`, `description`, `Arguments: @Generable`, `call(arguments:)` return type), `@Generable` / `@Guide`, context-window size, error types (guardrail violation, exceeded context window, unsupported language), session prewarm; on-device speech: `SpeechAnalyzer` + `SpeechTranscriber` (iOS 26; locale `en`, asset install, volatile/partial results) vs `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`, which one guarantees no server use, permission APIs and Info.plist keys; local notifications: `@capacitor/local-notifications` for Capacitor 8 (version, schedule/cancel/permission API, pending list) vs `UNUserNotificationCenter` directly. Recommend one per area.
  - Done when: the section lists the exact signatures the plan uses, the availability → `BrainUnavailableReason` mapping, the speech choice that never uses Apple servers (or "none guaranteed" → the mic stays off and main is told), and the notifications choice; main reviews it before task 2 is finalised.
  - Deps: none (runs during slice 1b).
- [x] 2. [main] Shared types, dependency, no behaviour change.
  - Files: src/core/types.ts, package.json (`@capacitor/local-notifications` matching Capacitor 8.6.2, if task 1 picks it), `npx cap sync ios`.
  - Adds: `BrainUnavailableReason` (`'deviceNotEligible' | 'appleIntelligenceNotEnabled' | 'modelNotReady' | 'unsupported' | 'notNative'`), `BrainErrorCode` (`'guardrail' | 'contextTooLong' | 'unsupportedLanguage' | 'timeout' | 'other'`), `ToolCall = { name: string; args: Record<string, unknown> }`, `ReadToolName` (`'weekSummary' | 'progressSummary' | 'exerciseInfo' | 'foodIdeas'`), `GymBrainRequest` / `GymBrainResponse` (`{ text; toolCalls; latencyMs }`), `ChatMessage.viaMic?: true`, `CoachSettings` gains `speakReplies?: 'mic' | 'always' | 'off'` (default `'mic'`), `brainNotes?: Partial<Record<BrainUnavailableReason, number>>` (when each plain note was shown), `ReminderKind` (`'session' | 'missedDay' | 'sundayRecap'`), `ReminderSettings = { session: { on: boolean; time: string /* HH:MM */ }; missedDay: { on: boolean }; sundayRecap: { on: boolean }; askedPermission?: boolean }`, `CheckIn = { weekStart: string; energy?: 1|2|3|4|5; sleep?: 1|2|3|4|5; soreness?: 1|2|3|4|5; at: number }`, `ChatCard` kind `'checkIn'`, `TodoDetectorId` + `'appleAnswers' | 'micUses' | 'reminderOn' | 'checkInDone'`, `AppRoute` + `'settings/coach' | 'settings/reminders'`.
  - Done when: `npm run check` passes; no runtime change; iOS project still builds (`npx cap sync ios`).
  - Deps: slice 1b task 40 (verifier PASS; the 1b merge is his call and not needed) and task 1.
- [x] 3. [core-engineer] Tool definitions, the single source (M10 B1), **tests first**.
  - Files: src/core/trainer/tools.ts(+test), src/core/trainer/tools.contract.json.
  - One `propose*` tool per `ProposalAction` (postponeSession, avoidBodyArea, lighterToday, deloadWeek, swapExercise, adjustStalledExercise, suggestFood, proposeFocusBlock **params only** `{ group, weeks, weekdays }`, shortOnTime `{ minutes }` from 1b, setEasyOn `{ add?, remove? }` from 1b) with JSON-schema args (enums from data: areas, catalog ids, dates `YYYY-MM-DD`, 20/30/45) and `toProposal(args, ctx)`; an explicit, tested exception list (`starterPlan`: intake only). Read-only tools `weekSummary`, `progressSummary`, `exerciseInfo { exerciseId }`, `foodIdeas` (no args except exerciseId) flagged `readOnly: true`.
  - Done when tests cover: 1:1 with `ProposalAction` minus the exception list; invalid args rejected with a short reason (unknown exercise, past date, bad group, weeks out of 2–6); a tool call returns a Proposal, never a state; `proposeFocusBlock` goes through `buildFocusBlock` (the model never sends days); `tools.contract.json` regenerated by the test equals the committed file.
  - Deps: 2.
- [x] 4. [core-engineer] Instructions, context, output filter (M10 B2), **tests first**.
  - Files: src/core/trainer/brain/instructions.ts, context.ts, sanitize.ts (+tests).
  - Instructions: M10 Safety + M12 "Brains" (free answers from the context allowed, facts via read-only tools, every change via a `propose*` tool and his tap, ≤ 4 short sentences, `say` ≤ 12 words / ≤ 8 mid-workout, referral line verbatim, no medical content, no promises, English only; a Drill-sergeant style line for `say` when that voice is on).
  - `serializeContext(input, { brain: 'apple', appleCardReasons })`: today's plan, next 7 days, 4 weeks of top sets (warm-ups excluded), active overrides + focus block + easy-on list, week/month scores, today's Fuel totals vs targets, goal text + lift-goal progress, the last 8 turns; the "Lighter today?" **reason sentences only when `appleCardReasons !== false`** (sets `usedHealth: true`). **Never:** Health numbers, weekly load, cardio minutes, body fat / lean mass, measurements, weigh-in values, progress photos, check-in answers, notes, the dev log. Budget constant (from task 1's context size; provisional ≤ 6,000 chars).
  - `sanitizeReply(text, safety)`: banned/diagnosis words → the fixed safe line; referral line on discomfort; cap 4 sentences; `say` capped.
  - Done when tests cover: budget on a heavy made-up 4-week history; a never-contains test (seed Health values, body fat, measurements, a photo, a check-in, a note → none in the text); reasons present with `appleCardReasons` true/undefined and absent with false (the M12-q1 decision step's setting); sanitize on a list of bad replies.
  - Deps: 3.
- [x] 5. [core-engineer] Read-only tool results + facts eval, **tests first**.
  - Files: src/core/trainer/brain/readTools.ts(+test), src/core/trainer/evals/facts.json, src/core/trainer/evals/facts.test.ts.
  - `readToolResults(input)` → `Record<ReadToolName, string>` (+ `exerciseInfo` per id): week/progress text from the slice 1 scores (same numbers as the rule answers), how-to + cues + muscles from the catalog, food ideas from the M10 food suggestion. Same never-contains rules as task 4.
  - Done when: numbers equal `periodScore` / rule replies (test); facts eval set ≥ 20 made-up items, each with the numbers a correct answer must quote; a checker `factsMatch(reply, item)` used by task 14.
  - Deps: 3.
- [x] 6. [ios-engineer] Swift tool codegen + contract check (M10 B3).
  - Files: scripts/gen-trainer-tools.mjs(+test), ios/App/App/Plugins/GymBrain/TrainerTools.generated.swift.
  - Generates `@Generable` arg structs with `@Guide` descriptions (enums as Swift enums/`anyOf`) and `Tool` conformances per task 1's API notes: `propose*` tools record `{ name, args }` and return "Proposed; the app will ask the user to confirm."; read-only tools return the passed `toolResults` entry (unknown id → "Not in your plan this week.").
  - Done when: `npm run check` fails on a stale generated file (diff test); the script test covers each arg type; the Swift compiles in task 7's package.
  - Deps: 1, 3.
- [x] 7. [ios-engineer] `GymBrain` Capacitor plugin (M10 B4).
  - Files: ios/App/App/Plugins/GymBrain/GymBrainPlugin.swift, ios/App/App/Plugins/GymBrain/GymBrainCore/** (availability mapping, error mapping, tool-call recorder, session wrapper behind a protocol) + XCTests, ios/App/App.xcodeproj (plugin registration), src/native/gymBrain.ts(+test) (typed bridge, `createGymBrain(bridge)` with junk-reply guards, like src/native/health.ts).
  - `availability()` → `{ available: true } | { available: false; reason: BrainUnavailableReason }`; `respond({ instructions, context, messages, toolResults })` → `{ text, toolCalls, latencyMs }`; errors → `BrainErrorCode`; a timeout (data, provisional 15 s); prewarm on Coach-tab open if the docs recommend it. Nothing leaves the phone.
  - Done when: XCTests with a fake session cover every availability case, every error code, tool-call recording, read-only results; the TS bridge test covers junk replies → unavailable; a simulator build passes. (The real-model check is part of task 26 on his iPhone.)
  - Deps: 6.
- [x] 8. [core-engineer] Apple brain adapter + router note (M10 B5), **tests first**.
  - Files: src/data/brain/apple.ts(+test), src/data/brain/router.ts(+test), src/data/brain/notes.ts(+test).
  - `appleBrain(bridge, deps)`: `status()` from `availability()`; `ask()` builds instructions + context + read-tool results, calls `respond`, runs `sanitizeReply`, turns the first valid tool call into a Proposal via task 3 (an invalid one → "I couldn't do that." + chips; a second one → a chip), sets `source: 'apple'`, `usedHealth`. Router: an unavailable Apple brain → rules, and the chat gets **one plain note per reason, once** (stored in `coach.brainNotes`), e.g. "Apple Intelligence is off, so I'm using quick replies. Turn it on in Settings > Apple Intelligence & Siri." / "Apple Intelligence is still downloading. Quick replies until it's ready." / "This iPhone can't run Apple Intelligence. Quick replies still work."; errors → rules + a one-line note every time. Copy as data, `checkCopy`.
  - Done when tests cover: every availability reason → rules + its note once (second ask: no note); every error code → rules + note; tool call → Proposal; invalid → help + chips; two calls; chips bypass; sanitize always applied; `usedHealth` set only with reasons; no `fetch` anywhere (test stubs `fetch` to throw).
  - Deps: 3, 4, 5.
- [x] 9. [core-engineer] Speak-replies + mic rules, **tests first**.
  - Files: src/core/trainer/speakRules.ts(+test).
  - `shouldSpeak({ speakReplies, viaMic, phase, inSet })` (default `'mic'`: speak only replies to mic-sent messages; never in a set); `micAllowed({ native, inSet, screen })` (iPhone app only, Coach tab or Pause sheet, never in a set or on the camera); `sayFor(reply, phase)` caps (12 / 8 words).
  - Done when tests cover each combination and the caps.
  - Deps: 2.
- [x] 10. [ios-engineer] `GymSpeech` plugin (on-device only).
  - Files: ios/App/App/Plugins/GymSpeech/GymSpeechPlugin.swift, GymSpeechCore/** + XCTests (fake recognizer), ios/App/App/Info.plist (`NSMicrophoneUsageDescription` "Lets you talk to the coach. Audio stays on this phone.", `NSSpeechRecognitionUsageDescription` "Turns what you say to the coach into text on this phone."), src/native/speech.ts(+test).
  - API per task 1: `availability()` (on-device only; else `{ available: false, reason }`), `start({ locale: 'en' })` → events `partial { text }`, `level { rms }`, `final { text }`, `error { code }`; `stop()`. Permissions requested on the first `start` only. No audio file written; the engine stops on stop / app background / a 60 s cap.
  - Done when: XCTests cover partial → final, stop, permission denied, not-on-device → unavailable, background stop; TS bridge test with a fake; no permission prompt at launch (test that nothing calls request at init).
  - Deps: 1 (may start during 1b; Info.plist is ios-engineer's).
- [x] 11. [ios-engineer] Local-notification bridge.
  - Files: src/native/reminders.ts(+test) (wraps the task 1 choice: `permission()`, `request()`, `schedule(items)`, `cancel(ids)`, `pending()`; a fake for tests/e2e), ios/** only if task 1 picks a custom plugin.
  - Done when: bridge tests with a fake scheduler (schedule, cancel by id, permission asked only by `request()`); no network; simulator build passes.
  - Deps: 1, 2.
- [x] 12. [core-engineer] Reminder schedule rules, **tests first**.
  - Files: src/core/reminders/schedule.ts(+test), src/core/reminders/copy.ts(+test).
  - `reminderPlan(settings, state, sessions, now)` → notifications for the next 14 days with stable ids: session reminder at his time on projected training days (not on rest days, not once today's session is done), missed-day nudge the next day at 09:00 (data) once per missed planned day, Sunday recap at 19:00 (data); everything off by default; turning one off → its ids in `cancel`. Text as data, no body, Health, weight or food numbers (e.g. "Pull A today. Ready when you are.").
  - Done when tests cover: all off → nothing; each on; times across DST; rest days; done today; missed-day once; off → cancel list; copy passes `checkCopy` + a no-numbers rule.
  - Deps: 2.
- [x] 13. [core-engineer] Weekly check-in, Dexie **v11**, **tests first**.
  - Files: src/core/checkIn/checkIn.ts(+test), src/data/db.ts(+test), src/data/checkIn/store.ts(+test), src/data/backup.ts(+test), src/core/progress/recap.ts(+test).
  - `checkIns: 'weekStart'` (new table, no upgrade function, **backed up**). `checkInDue(today, checkIns)` → once per week (from Sunday, first Coach-tab open; skipped stays skipped for that week); 3 questions as data (energy, sleep, soreness, 1–5 chips); the week recap gains one line from it ("You rated energy 4, sleep 3, soreness 2."). Check-in answers stay out of every brain context (task 4 test).
  - Done when tests cover: v10 → v11 keeps every row; due once; skip; recap line; backup table list; not in the dev log.
  - Deps: 2.
- [x] 14. [core-engineer] On-device eval runner logic (M10 B8).
  - Files: src/data/brain/evalRunner.ts(+test).
  - Runs `evals/requests.json` + `evals/facts.json` through the Apple adapter with an injected bridge; report = ids, expected vs got action/args, pass/fail, safe yes/no, facts match, latency; **no message text**.
  - Done when tests (fake bridge) cover scoring, report shape (no strings from replies), p50 latency.
  - Deps: 8.
- [x] 15. [core-engineer] What's New 1.14.0 + Checkpoint J to-do.
  - Files: src/data/whatsNew/pages.ts(+test), src/data/todos/topics.ts(+test), src/core/todo/detectors.ts(+test), src/data/todos/facts.ts(+test).
  - Pages (`release: '1.14.0'`): chat freely (Apple's on-device coach), hold to talk, Speak replies, reminders (off until you turn them on), weekly check-in. New topic "Coach on your iPhone (Checkpoint J)", native, `since: '1.14.0'`: auto steps `appleAnswers` (≥ 5 replies with source apple), `micUses` (≥ 3 mic-sent messages), `reminderOn` (any reminder on), `checkInDone` (1); ask steps: wrong answers (note), a wrong action (note), the voice felt (right / too much / too little), the mic heard you (mostly / half / rarely), anything in the trainer kit that felt off (note; slice 1b feedback folds in here).
  - Done when: slice 1c data tests still pass (ids, routes, copy, detectors known) plus boundary tests for the 4 new detectors; facts are counts only.
  - Deps: 2, 13.
- [x] 16. [ui-engineer] Chat: mic, source badge, brain note, thinking.
  - Files: src/ui/coach/micButton.ts(+test), src/ui/coach/chat.ts(+test), src/ui/coach/chat.css.
  - Props add `mic: { state: 'hidden' | 'unavailable' | 'idle' | 'listening'; partial?: string; level?: number; reason?: string }`, callbacks `micDown`, `micUp`, `micCancel`. Hold-to-talk button ≥ 56px next to Send (pointer + keyboard: Space held); live partial text in the text box; level ring (transform/opacity, static under reduced motion); unavailable → a short line, typing still works; hidden in the PWA and during a set. Bubble source badge "On-device AI" / "Quick replies" (text, not colour alone); the brain note as a muted system line; "Thinking…" typing state.
  - Done when: render tests (each mic state, keyboard hold, reduced motion, badges, note) + 390×844 screenshots (listening with partial text, a reply with the badge, the "Apple Intelligence is off" note).
  - Deps: 2.
- [x] 17. [ui-engineer] Check-in card.
  - Files: src/ui/coach/checkInCard.ts(+test), src/ui/coach/chat.ts (register the card kind; after 16).
  - Three questions, 1–5 chips each (≥ 56px, labelled ends "Low" / "High", selection not colour alone), Skip this week, Done; then a summary state.
  - Done when: render tests (keyboard, partial answers, skip) + 390×844 screenshot.
  - Deps: 2, 16.
- [x] 18. [ui-engineer] Settings: Coach, Reminders, eval screen.
  - Files: src/ui/screens/coachSettings.ts(+test) (which brain answers + why + how to turn on Apple Intelligence; Speak replies: Mic only / Always / Off), src/ui/screens/reminders.ts(+test) (3 switches, all off by default, session time picker ≥ 56px, "We'll ask iPhone for permission the first time you turn one on", denied state with how to allow it), src/ui/screens/brainEval.ts(+test) (dev-only, native build, behind the existing developer settings: Run, progress, report summary + Export report), src/ui/screens/settings.ts (rows).
  - Done when: render tests + 390×844 screenshots (Coach status available / off, Reminders, eval report).
  - Deps: 2.
- [x] 19. [main] Version 1.14.0.
  - Files: package.json (`"version": "1.14.0"`), then the slice 1b version sync (task 3 of 1b) updates `MARKETING_VERSION`.
  - Done when: `npm run check` (incl. the iOS version test) passes; `npm run build` contains `1.14.0`.
  - Deps: 2.
- [x] 20. [main] Wiring.
  - Files: src/ui/app.ts, src/main.ts.
  - Native build only: register `appleBrain` before rules in the router; PWA unchanged (rules). Mic: `micAllowed` → `GymSpeech` start/stop → partials into the chat → release sends with `viaMic`; replies spoken via the existing voice when `shouldSpeak` (coach voice; never during a set, never over a count). Brain notes shown once. Reminders: on settings change and app open/foreground → `reminderPlan` → bridge schedule/cancel; permission requested on the first switch-on only. Check-in card when `checkInDue` on Coach-tab open. Routes `settings/coach`, `settings/reminders`, the eval screen. Dev log: brain id, intent/action ids, latency, mic used yes/no; never text.
  - Done when: `npm run check` passes; manual run at 390×844 in the PWA shows no mic and no change; a simulator run with the real plugins answers a typed question (or shows the plain note where the simulator has no model); no network request.
  - Deps: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19.
- [x] 21. [ui-engineer] E2E with fake bridges (390×844).
  - Files: e2e/coach-apple.spec.ts (fake `GymBrain` via `window.Capacitor.Plugins`: free text → Apple reply with badge; a tool call → proposal → Apply → Undo; read-only answer; each unavailable reason → rules + the note once; an error → rules + note; `appleCardReasons` false → the fake sees no reasons in its context), e2e/mic.spec.ts (fake `GymSpeech`: hold → live text → release sends → `say` spoken only per Speak replies (speech stubbed); no mic in the PWA, during a set or on the camera; permission asked only on first use), e2e/reminders.spec.ts (fake scheduler: all off by default; turn on → permission → scheduled; off → cancelled), e2e/check-in.spec.ts (due once a week; answers in the recap; survives reload). Every spec asserts no off-device request.
  - Done when: each passes 3× in a row; full `npm run e2e` green.
  - Deps: 20.
- [x] 22. [ios-engineer] Simulator build + XCTests + the Checkpoint J phone checklist.
  - Files: docs/ios-setup.md ("Checkpoint J" checklist: install, Apple Intelligence check, mic permission, 3 test questions, the dev eval run, reminders).
  - Done when: `xcodebuild` simulator build + all XCTests (GymHealth, GymBrain, GymSpeech) pass; checklist written.
  - Deps: 20.
- [x] 23. [reviewer] Review the slice 2 diff: no network; the context never-contains rules (Health numbers, body comp, measurements, photos, check-ins, notes); `appleCardReasons` honoured; the model only proposes (every change through `propose*` + his tap); sanitize on every model reply; mic never in a set / the PWA, no audio stored; notifications off by default, no body data in text; copy rules; ownership; tests-first evidence; generated Swift up to date.
  - Deps: 21, 22.
- [x] 24. [verifier] Verify milestone against SPEC acceptance criteria (M12 slice 2 + M10 phase B): `npm run check`, full `npm run e2e`, `npm run build` (contains `1.14.0`), simulator build + XCTests, contract/codegen diff; 390×844 screenshots (mic listening, Apple reply with badge, brain-off note, check-in card, Coach settings, Reminders, eval report) via `scripts/screenshots.mjs`; evidence into Verification evidence → M12 slice 2.
  - Deps: 23.
- [ ] 25. [main] merge + ask to push (his call; with slices 1, 1c, 1b if still unmerged). Install on his iPhone (push-notify him when the phone must be plugged in).
  - Deps: 24.
- [ ] 26. 🧍 **Checkpoint J (his iPhone, Apple Intelligence on):** a few days with the Apple brain and the mic (free questions, at least one proposal from free text, the mic between sets), the dev eval run once (report into PROGRESS: action + args ≥ 85%, 100% safe, 0 applied without a tap, p50 latency), a reminder on, a check-in, plus the slice 1b trainer kit at the gym. He reports wrong answers, wrong actions and how the voice felt (the Checkpoint J to-do + Copy report → `/feedback`).

### M12 — slice 1b: Trainer kit (planned 2026-11-17; release 1.13.0)
**Contract:** SPEC M12 "Trainer kit" items 1–5, 7–12 + slice 1b Accept, Decisions "M12 trainer kit (his picks, 2026-11-16)", "Second user: his wife", "Body fat + lean mass from Health" and "M12 slices 1b + 2" (2026-11-17; it wins where more specific). **Rule brain only, no network.** All logic **tests first** (Vitest, made-up data; the repo is public). UI tasks: props in / callbacks out, render tests + 390×844 harness screenshots, tokens + motion helpers, text ≥ 20px, targets ≥ 56px, **nothing new to tap or read during a set** (effort is on the rest screen, warm-ups are announced between sets).

**Keep it tight:** slice 2 (free chat) is what he wants most. Tasks are split by file so several core-engineer and ui-engineer instances can run at once; the "conflicts" notes say which ones share a file and must run in order.

**Branch:** `m12-coach-tab` (slices 1 + 1c verified at 745a143, on his iPhone, not merged). Subagents never commit.

**Fit with the current code:**
- Trainer-kit defaults exist as `TRAINER_KIT_DEFAULTS` in `src/data/todos/topics.ts` (site ids `leftArm`, `rightArm`, `chest`, `waist`, `hips`, `leftThigh`, `rightThigh`; `epley`; `firstHeavyLift`; `reviewWeeks: 5`) and the M12-q4 decision step writes `settings 'trainerKit'`. Task 5 moves the defaults to core and every 1b feature reads `getTrainerKit()` (defaults merged with the stored row), so a later change in the to-do changes the app.
- Session flow: `src/core/session.ts` (`next(state, event)`), M5b advice `src/core/advice.ts` (`nextTimeAdvice`, `afterSetAdvice`), volume/streak `src/core/stats.ts`, bests `src/core/history.ts`, stalls `src/core/trainer/actions/stall.ts`, completion `src/core/progress/completion.ts`. Voice lines are triggered in `src/ui/app.ts` (main) through `src/ui/voice.ts`.
- Readiness: `src/core/health/readiness.ts` (`readinessSignals`, `readinessCard`, two-signal rule), signals type `ReadinessSignal` in types.ts.
- Health: `HealthType` has 6 types; `healthDays` is on `LOCAL_ONLY_TABLES` (re-read from Health after a restore). Native side `ios/App/App/Plugins/GymHealth/**` + `src/native/health.ts` (ios-engineer).
- Nutrition: `src/core/nutrition/targets.ts` already does Mifflin per sex, but only a surplus (`SURPLUS_RANGE [0, 600]`); a "lose fat" goal needs a deficit and a loss band in the weekly check (`adjust.ts`).
- Starting plan: `src/data/plan.ts` seeds the user plan from `src/data/program.json` (his program). For a second user the intake builds a starter plan from templates (task 9); his plan stays his.
- Dexie is at **v9**; 1b adds **v10** (`measurements`, `goals`, `dayFeels`, `progressPhotos`). `SetLog.effort` / `warmup` are unindexed (no schema change).
- iOS `MARKETING_VERSION = 1.0` in `ios/App/App.xcodeproj/project.pbxproj`; package.json is `1.12.0`.

**Order / parallel groups:**
- **G0 (now):** 1 [main] ∥ 2 [core] ∥ 3 [ios] ∥ 4 [main] (4 after 1 if main does them one at a time). Slice 2 tasks 1 and 10 [ios] may also start now.
- **G1 (after 1), core in parallel by file:** 5, 6, 8, 10, 13, 14, 15, 17, 18, 19, 20 [core]; 16 [ios]. Then 7 after 6 (session.ts); 9 after 8; 11 after 10; 12 after 8 + 9 + 17; 21 after 12; 22 after 5 + 15.
- **G1 ui (after 1), in parallel by file:** 23, 24, 25, 27, 28, 29 [ui]; 26 after 25; 30 after 26; 31 after 25; 32 after 31; 33 after 27 + 29.
- **G2:** 34 [main] version → 35 [main] wiring A (workout) → 36 [main] wiring B (the rest).
- **G3:** 37 ∥ 38 [ui] e2e after 36.
- **G4:** 39 reviewer → 40 verifier → 41 main merge + ask → 42 (no checkpoint of its own; feedback folds into Checkpoint J).

- [x] 1. [main] Shared types (no behaviour change).
  - Files: src/core/types.ts.
  - Adds per SPEC "// Slice 1b" (as edited 2026-11-17): `SetLog.effort?: 'easy' | 'good' | 'hard'`, `SetLog.warmup?: true`; `GoalKind = 'muscle' | 'fat' | 'strength' | 'general'`; `Goal`; `Intake = { goalKind; goalText?; days; sessionMin: 30|45|60|75; experience: 'new'|'some'|'years'; easyOn: BodyArea[]; at }`; `TrainerState.easyOn?: BodyArea[]`; `Measurement = { date; site; cm }`; `ProgressPhoto`; `DayFeel`; `ReadinessSignal` + `'feltLow' | 'sore'`; `HealthType` + `'bodyFat' | 'leanMass'` (and `HEALTH_TYPES`, `HealthDay.bodyFatPct?`, `leanMassKg?`); `ProposalAction` + `'shortOnTime' | 'starterPlan' | 'easyOn'`; `PlannedExercise.pairWith?: string` (paired accessory, shorter rest) ; `LearnCard = { id; title; body; why? }`; `ChatMessage.learnId?: string`; `NutritionSettings.goalKind?: GoalKind`; `GymFile = { format: 'gym-clean-gym'; version: 1; equipment: string[] }`; `AppRoute` + `'intake' | 'settings/goal' | 'settings/progressPhotos' | 'fuel/measurements'`; `TodoDetectorId` + `'effortSets' | 'warmupSession' | 'intakeDone' | 'measurementLogged' | 'bodyCompDays'`. Placeholder cases for exhaustive switches, noted for the owning task.
  - Done when: `npm run check` passes; no runtime change.
  - Deps: none.
- [x] 2. [core-engineer] Follow-up: postpone wording, **tests first**.
  - Files: src/core/trainer/actions/postpone.ts(+test).
  - Bug (slice 1 verifier): "Push A moves to Saturday and the rest follow. Push A moves to next week." (line ~141: the spill list can name the moved day again when the rotation repeats it in the 7-day window). Fix so a day is never said to move twice: name a different spilled day, or "The next Push A moves to next week."
  - Done when: a test reproduces the old sentence from a made-up schedule and now gets one clear sentence per moved day; all postpone tests and `checkCopy` pass.
  - Deps: none.
- [x] 3. [ios-engineer] Follow-up: the iOS version follows package.json.
  - Files: scripts/sync-ios-version.mjs(+test) (planner call: ios-engineer owns it, like gen-trainer-tools.mjs), ios/App/App.xcodeproj/project.pbxproj (`MARKETING_VERSION` = package.json version, `CURRENT_PROJECT_VERSION` = a build number that only grows, e.g. git commit count), ios/App/App/Info.plist (`CFBundleShortVersionString` = `$(MARKETING_VERSION)`, `CFBundleVersion` = `$(CURRENT_PROJECT_VERSION)`), docs/ios-setup.md (one line). Main adds the npm script hook (e.g. run before `cap sync`) in task 34.
  - Done when: a Vitest test fails if `MARKETING_VERSION` ≠ package.json `version`; the script is idempotent; simulator build shows 1.12.0 now (1.13.0 after task 34).
  - Deps: none.
- [x] 4. [main] Follow-up: a tab switch resets scroll to the top.
  - Files: src/ui/app.ts.
  - Switching tabs (tab bar) scrolls the new screen to the top; Back inside a tab keeps its current behaviour. Test in task 38.
  - Done when: manual run at 390×844 (scroll Calendar, tap Coach, tap Calendar → top); e2e in task 38.
  - Deps: none.
- [x] 5. [core-engineer] Trainer-kit settings + Dexie **v10** + stores, **tests first**.
  - Files: src/core/trainerKit/defaults.ts(+test) (moved `TRAINER_KIT_DEFAULTS`, `mergeTrainerKit(row)`), src/data/todos/topics.ts (import only), src/data/db.ts(+test), src/data/trainerKit/store.ts(+test) (`getTrainerKit`, intake in `settings 'intake'`, goals, measurements, day feels), src/data/progressPhotos/store.ts(+test), src/data/backup.ts(+test).
  - v10: `measurements: '[date+site], date'`, `goals: 'id, createdAt'`, `dayFeels: 'date'`, `progressPhotos: 'id, date, createdAt'` (new tables, no upgrade function). `progressPhotos` on `LOCAL_ONLY_TABLES`; the others backed up; none in the dev log. Photo store: add (Blob already downscaled by the UI), list, get, delete one, delete all.
  - Done when tests cover: v9 → v10 keeps every row; round trips; `getTrainerKit` returns defaults without a row and the stored values after the M12-q4 decision step writes one; backup table lists (photos absent from a backup file, restore leaves photos alone); dev-log export has none.
  - Deps: 1.
- [x] 6. [core-engineer] Effort → M5b, **tests first** (item 1).
  - Files: src/core/session.ts(+test) (event `SET_EFFORT { setIndex, effort }`, only for the last logged set, during rest), src/core/trainer/effortRules.ts (data), src/core/advice.ts(+test).
  - Easy → step up sooner (the next-set / next-session suggestion steps up even if reps are at the bottom of the range, as data), Hard → hold (no step up), Good / none → today's rule unchanged.
  - Done when tests cover: effort stored on the set; each effort changes the recommendation as in the data; no answer = identical output to today (snapshot); effort never asked during a set (only valid in phase `rest`).
  - Deps: 1.
- [x] 7. [core-engineer] Warm-up sets, **tests first** (item 2).
  - Files: src/core/warmup.ts(+test), src/core/warmupRules.ts (data), src/core/session.ts(+test), src/core/stats.ts(+test), src/core/history.ts(+test), src/core/trainer/actions/stall.ts(+test), src/core/progress/completion.ts(+test).
  - Rule (M12-q4 default, `trainerKit.warmups`): only before the day's **first** barbell / smith / heavy-dumbbell lift (heavy = working weight ≥ 12 kg per dumbbell, data); ramp 50% × 8 then 70% × 4, snapped **down** to his kit step (gym profile dumbbell steps; barbell plate pairs; kg and lb); a step at or below the empty bar → bar × 8 once; none for bodyweight. `'off'` → none. Session: warm-up sets run before set 1 with `SKIP_WARMUPS`; logged with `warmup: true`; a voice line for each (text from core, e.g. "Warm-up: 20 kilos for 8.", ≤ 8 words). Excluded from volume, bests, stall detection, e1RM (task 10 uses the flag) and completion %.
  - Done when tests cover: kg + lb snapping, light and bodyweight first lifts → none, only the first heavy lift, skip, exclusions in each module, setting off.
  - Deps: 6 (both edit session.ts).
- [x] 8. [core-engineer] Time estimate + "short on time", **tests first** (item 5).
  - Files: src/core/trainer/timeRules.ts (data: seconds per rep, set-up per exercise, rest from the plan, pair rest 45 s), src/core/trainer/estimate.ts(+test) (`estimateMinutes(day)`), src/core/trainer/actions/shortOnTime.ts(+test), src/core/trainer/intents.ts(+test), src/core/trainer/phrases.json, src/core/trainer/coach.ts(+test), src/core/trainer/evals/requests.json.
  - `proposeShortOnTime(ctx, minutes)` (20 / 30 / 45; free text "I have 25 min" → nearest lower option): keeps the main lifts (first 1–2 compound exercises, data), **pairs accessories** (`pairWith`, back-to-back with the pair rest; planner call: true alternating supersets wait, see Decision), then trims accessory sets (min 2), then drops the last accessories until `estimateMinutes ≤ minutes`; today only, Apply / Undo. Intent `shortOnTime` + chip "Short on time".
  - Done when tests cover 20/30/45 on each program day (estimate ≤ limit, main lifts kept), a day already short enough → "Your day already fits.", Apply/Undo round trip, eval items ≥ 5 new, `checkCopy`.
  - Deps: 1.
- [x] 9. [core-engineer] Starter plan from templates (item 3, second user), **tests first**.
  - Files: src/data/templates/starterTemplates.json (as data: full body 2–3 days, upper/lower 4 days, push/pull/legs 5–6 days; slots by movement pattern and muscle; sets/reps/rest per `GoalKind` × experience), src/core/trainer/starterPlan.ts(+test), src/core/trainer/actions/starterPlan.ts(+test).
  - `buildStarterPlan(intake, catalog, gym)` → `UserPlan` + `Schedule`, deterministic: template by `days`, picks from the catalog doable with the gym profile (`canDo`), easy-on areas lightened like the avoid-area action, sets trimmed so `estimateMinutes ≤ sessionMin`. `proposeStarterPlan(ctx, intake)` → Proposal `starterPlan`, scope `plan`, Apply / Undo (his current plan is never replaced without Apply).
  - Done when tests cover: each goal × days 2–6 × 30/75 min fits the time; every pick doable with the default and a minimal gym profile; same input → same plan; easy-on honoured; Apply/Undo; no exercise name or text hard-coded to one person (copy from data).
  - Deps: 8 (estimate).
- [x] 10. [core-engineer] e1RM + measurement series (item 4), **tests first**.
  - Files: src/core/progress/e1rm.ts(+test), src/core/progress/measurements.ts(+test).
  - Epley (`w × (1 + r/30)`, r = 1 → w; sets above 12 reps not charted, data); per session the best e1RM of non-warm-up sets; lighter/deload sessions marked; series per lift. Measurements: per-site series, "measure again" due after 28 days (data), cm ↔ in by his unit, sites from `trainerKit.measurementSites`.
  - Done when tests cover known values, warm-ups excluded, top set per session, units, due rule, sites from settings.
  - Deps: 1.
- [x] 11. [core-engineer] Goals, intake mapping, review (item 3), **tests first**.
  - Files: src/core/trainerKit/goals.ts(+test), src/core/trainerKit/intake.ts(+test), src/core/trainerKit/review.ts(+test), src/core/trainerKit/goalRules.ts (data).
  - `suggestGoals(intake, history)` → 1–2 measurable targets + a date (lift: e1RM-based, e.g. "Bench 60 kg × 8 by 2027-02-01"; measurement; weight), all as data; `goalProgress(goal, sets, measurements, weighIns, today)` → % + on track / behind; `intakeToChanges(intake, current)` → which proposals to offer (starter plan for a fresh install or "Build a new plan from my answers", the easy-on proposal, Fuel goal targets); `reviewDue(goals, lastReviewAt, trainerKit.reviewWeeks, today)` → once per period, with a recap text + an offer (focus block or goal edit).
  - Done when tests cover each goal kind, progress from made-up data, review every 5 weeks once (and every 4/6 when the setting says so), `checkCopy` on every string.
  - Deps: 10.
- [x] 12. [core-engineer] Standing "go easy on" list, **tests first** (item 3).
  - Files: src/core/trainer/plan.ts(+test), src/core/trainer/actions/easyOn.ts(+test), src/core/trainer/actions/*.ts (swap, focusBlock, shortOnTime, stall, lighter checks), src/core/trainer/focusBlock.ts(+test), src/core/trainer/starterPlan.ts.
  - `TrainerState.easyOn` changed only by a Proposal (`easyOn`, scope `plan`, Apply / Undo, Plan changes). `effectiveDay` applies the avoid-area treatment for each listed area on every projected day (computed, so removing the area restores the plan). Every `propose*` and the focus-block builder never add or increase load on a listed area (swap candidates excluded; a focus block on a listed group → "Remove shoulders from your go-easy list first?" with that proposal).
  - Done when tests cover: add → every future day lightened/swapped; remove → restored; each action + the builder honour it; Undo; feel-today soreness (task 17) only offers today's avoid-area, never the standing list.
  - Deps: 8, 9 (same files), 17 (only for the last test).
- [x] 13. [core-engineer] Nutrition targets follow goal and sex (second user), **tests first**.
  - Files: src/core/nutrition/goalTargets.ts(+test) (data per `GoalKind`: muscle +300 kcal / protein 1.8 g/kg / weekly band +0.25–0.5%; strength +200 / 1.8 / +0.1–0.35%; general 0 / 1.6 / −0.25–+0.25%; fat −400 / 2.0 / −0.25–−0.75%), src/core/nutrition/targets.ts(+test) (signed delta, range −600…+600; kcal never below BMR, data), src/core/nutrition/adjust.ts(+test) (weekly check per goal band, loss direction).
  - Planner call: no goal set = today's behaviour (muscle); changing the goal shows "Fuel targets: 2,650 → 2,250 kcal" and changes nothing until he taps Apply.
  - Done when tests cover each goal × male/female (Mifflin) × made-up bodies, the BMR floor, the weekly check moving the delta in the right direction for loss and gain, no-goal = old snapshot.
  - Deps: 1.
- [x] 14. [core-engineer] "Share my gym" file + nothing hard-coded to him, **tests first**.
  - Files: src/data/gymFile.ts(+test) (`exportGymFile(profile)` → JSON with equipment ids only — no `kept`, no name, no dates; `parseGymFile(text)` validates format/version/known ids → `{ ok, equipment, unknown[] } | { ok: false, reason }`), src/core/noPersonal.test.ts (scans src/data/**/*.json and core copy for his name outside `CREDIT`, fixed personal goals or body numbers; voice default Calm; Health/WHOOP optional).
  - Done when tests cover round trip, unknown ids reported, junk rejected, file has no personal fields, the scan passes.
  - Deps: 1.
- [x] 15. [core-engineer] Body fat + lean mass (core side), **tests first**.
  - Files: src/core/health/days.ts(+test) (per-day pick like weight: morning reading, Health wins), src/core/health/sync.ts(+test), src/data/health/store.ts(+test), src/data/health/sync.ts(+test), src/core/health/bodyComp.ts(+test) (trends next to weight).
  - New types default **off**; an old `'health'` row without the keys reads them as off (no prompt on update). Stored in `healthDays` (local-only, re-read after a restore; planner call per the Decision's "main decides"), never in `weighIns`, never in any coach/brain context (slice 2 task 4 enforces), never in the dev log.
  - Done when tests cover the pick, sync with the switches off/on, old settings rows, trend math, no new backed-up field.
  - Deps: 1.
- [x] 16. [ios-engineer] GymHealth reads body fat % + lean body mass.
  - Files: ios/App/App/Plugins/GymHealth/GymHealthPlugin.swift, GymHealthCore/Sources/**/GymHealthMapping.swift + Tests, src/native/health.ts(+test).
  - `HKQuantityTypeIdentifier.bodyFatPercentage` (as %), `.leanBodyMass` (kg); read-only; requested **only when he turns that switch on** (the Health sheet then lists 8 types); source names kept for the per-day pick.
  - Done when: XCTests for the mapping (units, empty), TS bridge tests, simulator build.
  - Deps: 1.
- [x] 17. [core-engineer] Feel today → readiness, **tests first** (item 9).
  - Files: src/core/health/readiness.ts(+test), src/core/health/rules.ts (data), src/core/health/copy.ts(+test).
  - Signals `feltLow` (energy ≤ 2) and `sore` (any area) from `DayFeel`; the two-signal rule unchanged, so both together show the card without Health; one alone + one Health signal shows it. Reasons "You said your energy is low today." / "You said your shoulders are sore."; a sore area adds an offer "Go easy on shoulders today?" (today's avoid-area proposal), never medical wording.
  - Done when tests cover each combination with/without Health, reasons pass `checkCopy` + the M11 banned list.
  - Deps: 1.
- [x] 18. [core-engineer] Setup cues (item 10), **tests first**.
  - Files: src/data/setupCues.json, src/core/setupCues.ts(+test).
  - 2–3 cues per program exercise (and catalog swap pool) the camera can't judge, ≤ 8 words each; `setupCuesFor(exerciseId, session)` → lines once before the first working set (after warm-ups), none if already said this session.
  - Done when tests cover: every such exercise has 2–3 cues ≤ 8 words passing `checkCopy`; said once.
  - Deps: 1.
- [x] 19. [core-engineer] Cardio minutes (item 11), **tests first**.
  - Files: src/core/health/cardio.ts(+test).
  - `weeklyCardioMinutes(healthDays, sessions, weekStart)`: Health workouts outside gym sessions (reuse `overlapsGymSession`), activity kinds as data, Mon–Sun week (`weekStartOf`); null without Health.
  - Done when tests cover overlap (no double count), week edges, DST, no Health → null.
  - Deps: 1.
- [x] 20. [core-engineer] Next block + deload suggestion (item 7), **tests first**.
  - Files: src/core/trainer/nextBlock.ts(+test), src/core/progress/recap.ts(+test).
  - At a block's end: the recap offers a lighter week (7 days, the deload rule) then a next block (same group or the next in an order as data). `deloadSuggested(sessions, state, today, lastOfferAt)`: after 6 hard weeks in a row (all planned sessions done, no lighter/deload days) or ≥ 2 exercises stalled at once (M10 stall rule) → once, then not again for 4 weeks (data). Proposals only.
  - Done when tests cover both triggers, once, the recap offer, Apply/Undo.
  - Deps: 1.
- [x] 21. [core-engineer] Protein nudge, post-workout idea, learn cards (item 12), **tests first**.
  - Files: src/core/nutrition/nudges.ts(+test) (a logged meal ≥ 250 kcal with protein < 60% of his per-meal share (daily protein / 4 meals, data) → one nudge per meal), src/data/learnCards.ts(+test) (~10: progressive overload, effort, warm-ups, protein, sleep, deloads, focus blocks, short sessions, measurements, consistency), src/core/trainer/coach.ts (`learnId` on replies where a card fits; data map intent → card), src/core/trainer/replies.ts.
  - Done when tests cover nudge thresholds and once-per-meal, every card and link passing `checkCopy`, links point to existing ids. The post-workout idea reuses the M10 food suggestion (no new logic; a test that Summary's input gets it).
  - Deps: 12 (coach.ts after 8/12).
- [x] 22. [core-engineer] What's New 1.13.0 + trainer-kit to-dos.
  - Files: src/data/whatsNew/pages.ts(+test), src/data/todos/topics.ts(+test), src/core/todo/detectors.ts(+test), src/data/todos/facts.ts(+test).
  - Pages (`release: '1.13.0'`, ≈ 8): effort after a set, warm-ups, your goal + intake, short on time, measurements + e1RM (+ body fat / lean mass in the iPhone app), how you feel today, progress photos (off until you turn them on), learn cards. Topic "Trainer kit at the gym" (both, `since: '1.13.0'`; feeds Checkpoint J): auto `effortSets` (≥ 6 sets with effort), `warmupSession` (1), `intakeDone`, `measurementLogged`; asks: warm-up weights right (right / too light / too heavy), effort helped the next weight, short on time used + fit, setup cues (helpful / too many / not needed), anything off (note). VeSync topic gains a native auto step `bodyCompDays` (≥ 1 day with body fat or lean mass).
  - Done when: the 1c data tests still pass plus boundary tests for the new detectors; facts counts only.
  - Deps: 5, 15.
- [x] 23. [ui-engineer] Effort row on the rest screen (item 1).
  - Files: src/ui/screens/rest.ts(+test).
  - "How was that set?" Easy / Good / Hard (≥ 56px each, labels + "3+ left / 2 left / 0–1 left", selection not colour alone), optional, never blocks the timer or Next; a "Why?" link to the effort learn card.
  - Done when: render tests (select, change, keyboard, absent outside rest) + 390×844 screenshot.
  - Deps: 1.
- [x] 24. [ui-engineer] Warm-up set display (item 2).
  - Files: src/ui/screens/exercise.ts(+test), src/ui/screens/rest.ts (label only; after 23).
  - "Warm-up 1 of 2 · 20 kg × 8" label (text, ≥ 20px), Skip warm-ups (≥ 56px) before set 1; no new motion (`data-motion="off"` stays).
  - Done when: render tests + 390×844 screenshot.
  - Deps: 1, 23 (rest.ts).
- [x] 25. [ui-engineer] Intake flow + Goal card (item 3, second user).
  - Files: src/ui/intake/intake.ts(+test) (one question per screen: goal kind (build muscle / lose fat / get stronger / general fitness) + optional own words, training days 2–6, session length 30/45/60/75, experience, areas to go easy on; Back / Next / Skip for now; the last screen shows what will change: starter plan or "Build a new plan from my answers", easy-on list, Fuel targets before → after, each with Apply), src/ui/screens/goalCard.ts(+test) (1–2 goals with progress + due date; "Set your goal" prompt when none; ≥ 56px), src/ui/intake/intake.css.
  - Done when: render tests (each step, keyboard, skip, summary) + 390×844 screenshots (intake step, summary, Goal card, prompt).
  - Deps: 1.
- [x] 26. [ui-engineer] Settings rows + Share my gym.
  - Files: src/ui/screens/settings.ts(+test) (Your goal & intake → re-run; Go easy on list with Remove (each removal is a proposal via callback); Progress photos switch row, off by default), src/ui/screens/myGym.ts(+test) (Share my gym → file via share sheet / download; Import a gym file → preview "Adds 12 items, 1 unknown" → Apply).
  - Done when: render tests + 390×844 screenshots (Settings rows, My gym import preview).
  - Deps: 25 (intake props reused), 1.
- [x] 27. [ui-engineer] Measurements + body composition in Fuel; Health switches (item 4).
  - Files: src/ui/fuel/measurements.ts(+test) (log sheet: sites from settings, cm/in by unit, "Measure again" after 28 days), src/ui/fuel/weighIn.ts(+test) (body fat % + lean mass trends next to weight when present), src/ui/screens/fuel.ts(+test) (entry row), src/ui/screens/healthSettings.ts(+test) (two new switches, off, "iPhone app only").
  - Done when: render tests + 390×844 screenshots (measurements sheet, trends with body comp, Health settings with 8 switches).
  - Deps: 1.
- [x] 28. [ui-engineer] e1RM chart in exercise history (item 4).
  - Files: src/ui/screens/history.ts(+test), src/ui/charts/e1rmChart.ts(+test).
  - Simple SVG line (original art), points labelled, a text summary for screen readers ("Best estimate 72 kg on 12 Nov"), lighter sessions marked.
  - Done when: render tests (empty, one point, many) + 390×844 screenshot.
  - Deps: 1.
- [x] 29. [ui-engineer] Short-on-time chip + pair lines (item 5).
  - Files: src/ui/coach/proposalCard.ts(+test) (paired lines "Curl + Triceps: back to back, 45 s rest"), src/ui/screens/preview.ts(+test) (pair label on the day preview), src/ui/coach/chat.ts (chip registration only).
  - Done when: render tests + 390×844 screenshot of the proposal.
  - Deps: 1.
- [x] 30. [ui-engineer] Progress photos (item 8, opt-in).
  - Files: src/ui/photos/progressPhotos.ts(+test) (list by date, add via take/pick (`input type=file accept=image/*`), downscale to 1080 px long edge on a canvas (drops EXIF), compare two dates side by side, delete one (two taps) / delete all (two taps), privacy line "Stays on this phone. Not in backups."), src/ui/photos/photos.css.
  - Done when: render tests (off state, add, compare, delete confirm) + 390×844 screenshot with made-up images.
  - Deps: 26.
- [x] 31. [ui-engineer] Feel today on Today + readiness card offer (item 9).
  - Files: src/ui/screens/today.ts(+test) (collapsed "How do you feel today?" row below Start → energy 1–5 + sore-area chips, optional, once per day), src/ui/screens/readinessCard.ts(+test) ("Go easy on shoulders today?" button when a sore area is a reason).
  - Done when: render tests + 390×844 screenshots (feel-today open, card with the sore offer).
  - Deps: 25 (today.ts: Goal card slot).
- [x] 32. [ui-engineer] Cardio line (item 11).
  - Files: src/ui/screens/today.ts(+test) (week strip line "Cardio this week: 95 min", hidden when null), src/ui/screens/calendar.ts(+test) (week score line).
  - Done when: render tests (shown/hidden) + 390×844 screenshot.
  - Deps: 31 (today.ts).
- [x] 33. [ui-engineer] Protein nudge, post-workout idea, learn cards (item 12).
  - Files: src/ui/fuel/proteinNudge.ts(+test), src/ui/screens/fuel.ts (slot; after 27), src/ui/screens/summary.ts(+test) (post-workout meal idea with Log), src/ui/coach/learnCard.ts(+test) (sheet), src/ui/coach/chat.ts ("Why?" link on a bubble with `learnId`; after 29).
  - Done when: render tests + 390×844 screenshots (nudge, Summary idea, a learn card).
  - Deps: 27, 29.
- [x] 34. [main] Version 1.13.0.
  - Files: package.json (`"version": "1.13.0"` + the `sync-ios-version` hook from task 3).
  - Done when: `npm run check` (incl. the iOS version test) passes; `npm run build` contains `1.13.0`.
  - Deps: 3, 22.
- [x] 35. [main] Wiring A: the workout.
  - Files: src/ui/app.ts.
  - Effort → `SET_EFFORT` + saved on the set; warm-ups from `trainerKit` + gym profile → session; warm-up lines and setup cues spoken between sets through the existing voice (kind `cue`, never over a count, never during a set); Summary gets the post-workout idea and excludes warm-ups.
  - Done when: `npm run check`; manual run at 390×844 through a seeded Push A day (warm-ups, effort, Summary).
  - Deps: 6, 7, 18, 21, 23, 24.
- [x] 36. [main] Wiring B: the rest.
  - Files: src/ui/app.ts, src/main.ts.
  - First run: fresh install (no sessions) → intake before the first Today (Skip for now); existing installs are never forced (Today shows "Set your goal"; the 1.13.0 tour links to it). Intake → stores → proposals (starter plan / easy-on / Fuel targets) through changes.ts. Goal card props; review messages in the chat (once, like recaps); next block + deload offers; short-on-time chip; feel-today → readiness; measurements + body comp + e1RM screens; Health switches → sync; progress photos route (only when on); cardio line; nudges + learn-card sheet; Share/import gym file; routes `intake`, `settings/goal`, `settings/progressPhotos`, `fuel/measurements`. Dev log: ids/numbers only, nothing from photos, measurements or body comp.
  - Done when: `npm run check`; manual 390×844 run with seeded data shows each item; no network request.
  - Deps: 35 (same file), 4, 5, 8–22, 25–34.
- [x] 37. [ui-engineer] Update existing e2e specs + helpers.
  - Files: e2e/app.helpers.ts, e2e/workout.helpers.ts (seed option: intake done / skipped by default, like the tour; warm-ups off by default for specs that count sets unless they opt in), any spec whose selectors changed (rest, Today, Fuel, Settings, history).
  - Done when: each changed spec passes 3× in a row; full `npm run e2e` green.
  - Deps: 36.
- [x] 38. [ui-engineer] New e2e specs (390×844, slice 1b Accept).
  - Files: e2e/trainer-kit.spec.ts (effort row + skip; warm-ups announced (speech stubbed) and logged, Summary volume unchanged; "I have 30 min" → Proposal → Apply → shorter day → Undo; feel-today → "Lighter today?" card; setup cue spoken once before the first set; a learn card from a coach reply; nothing new during a set), e2e/intake.spec.ts (fresh profile → intake → starter plan Apply → Today + Goal card; existing profile not forced; re-run from Settings; goal "lose fat" shows the Fuel before → after and changes nothing until Apply; Share my gym file → import on a fresh profile), e2e/body.spec.ts (measurement in Fuel survives reload; e1RM chart in exercise history; progress photos on → add a fixture image → compare → delete; absent from a Back up file; no network request), e2e/tab-scroll.spec.ts (tab switch resets scroll). Every spec asserts no off-device request.
  - Done when: each passes 3× in a row; full e2e green.
  - Deps: 36.
- [x] 39. [reviewer] Review the slice 1b diff: no network; progress photos local-only (not in backups, dev log or any context); body comp in `healthDays` only; nothing hard-coded to him (the scan test); every plan change a Proposal with Undo; copy rules (`checkCopy`, no medical words; soreness only coaching); data-not-branches (templates, warm-up rules, time rules, goal targets, learn cards); nothing new mid-set; ownership; tests-first evidence; motion via helpers.
  - Deps: 37, 38.
- [x] 40. [verifier] Verify milestone against SPEC acceptance criteria (M12 slice 1b): `npm run check`, full `npm run e2e`, `npm run build` (contains `1.13.0`), iOS simulator build (shows 1.13.0); 390×844 screenshots listed in SPEC (effort row, warm-up set, intake, Goal card, short-on-time proposal, measurements, e1RM chart, feel-today, progress photo compare (made-up image), a learn card, the cardio line) + the 1.13.0 tour page via `scripts/screenshots.mjs`; evidence into Verification evidence → M12 slice 1b.
  - Deps: 39.
- [ ] 41. [main] merge + ask to push (his call; slices 1 + 1c + 1b may go together). Install the build on his iPhone if he wants it before slice 2.
  - Deps: 40.
- [ ] 42. No 🧍 checkpoint of its own: his gym feedback on the trainer kit folds into Checkpoint J (the "Trainer kit at the gym" to-do).

### M13 — Published look (planned 2026-11-17; release 1.15.0; builds AFTER M12 slices 1b and 2)
**Contract:** SPEC "M13 — Published look" (Goals 1–9, Changes to earlier contracts, Accept) and Decision "M13 Published look" (2026-11-17), which wins where it is more specific. **No new network request in the app; the landing page has no script and no tracker.** All logic **tests first** (Vitest, made-up data; the repo is public). UI tasks: props in / callbacks out, render tests + 390×844 harness screenshots, tokens + motion helpers, text ≥ 20px, targets ≥ 56px, original art only, nothing new during a set.

**Do not start before** M12 slice 1b task 40 and slice 2's verifier task have passed: M13 restyles and gates screens those slices are still adding (intake, Goal card, measurements, reminders, the dev eval screen).

**Branch:** `m13-published-look`, cut from the M12 result (`m12-coach-tab` after slice 2 is verified, or `main` if he has merged by then). Subagents never commit.

**Fit with the current code (skimmed 2026-11-17; re-check when M13 starts, 1b/2 are moving these files):**
- Version + credit: `src/core/version.ts` (`versionLabel()` → "Version 1.12.0 (build abc1234)", `CREDIT`). About is a section at the bottom of `src/ui/screens/settings.ts` (also `todosSection`, the `devlog` section). Tour: `src/core/todo/whatsNew.ts`, `src/data/whatsNew/pages.ts`, `src/ui/todo/whatsNewTour.ts`. To-dos: `src/data/todos/topics.ts`, `src/ui/todo/*`.
- Name: "Gym Clean" is a literal in ~27 files (core/health copy, todo report, backup, gymFile, native/health, ui screens, shareMonth, index.html ×2, vite.config.ts manifest ×2, capacitor.config.ts, Info.plist). `gymFile` format id `'gym-clean-gym'` and `shareFileName` `gym-clean-<month>.png` are ids, not shown names: they stay.
- Logo: `ICON_PATHS.logo` in `src/ui/icons.ts`; `scripts/icons.mjs` renders it to `public/icons/*.png`. `index.html` has an older inline-SVG favicon. iOS: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png` (blank), `Base.lproj/LaunchScreen.storyboard`.
- Voices: `src/ui/voiceNames.ts` (`MALE_VOICES`, `listMaleVoices`, `DEFAULT_DRILL_ORDER`, `pickDrillVoice` already falls back to any English voice), picker in `src/ui/coachVoiceSettings.ts`.
- Share month: `src/ui/shareMonth.ts` (`SHARE_W/H` 1080×1350, `shareMonthLayout`, `ShareScores`), pure layout + canvas draw.
- Pages: `.github/workflows/ci.yml` builds with `BASE_PATH=/<repo>/` and uploads `dist`; Vite copies `public/**` into `dist`, so `public/welcome/index.html` is served at `<site>/welcome/`. Workbox `navigateFallback: 'index.html'` would hijack it once the PWA is installed → main adds `navigateFallbackDenylist`. `public/` is also copied into the native bundle (main may strip `welcome/` there).
- "Stalled" label: `src/ui/coachSummary.ts:191-197` (+ `src/ui/coach.css`); the stall line text comes from core (`src/core/trainer/actions/stall.ts` / `src/core/advice.ts`); "fell short" was not found as a literal on 2026-11-17, so task 9 greps the built copy first.
- Not in the repo: a `social-media` agent or a `/story` command (`.claude/agents/`, `.claude/commands/`). Task 37 is tagged `[social-media]` as he uses it; if it is a user-level agent main dispatches it, otherwise main asks him.
- No Dexie change: `settings` rows `'ownerMode'` and `'onboarding'` (settings are backed up).

**Order / parallel groups:**
- **G0:** 1 [main].
- **G1 core (after 1), in parallel by file:** 2, 3, 4, 5, 6, 7, 8, 9.
- **G1 ui (after 1), in parallel by file:** 13, 16, 17, 19, 20, 23, 24 at once; 10 after 7; 11 after 26; 12 after 4 + 10; 14 after 6 + 10; 15 after 14; 18 after 17 (both edit `src/styles.css`); 21 after 8 + 9 + 18; 22 after 20 (icons.ts); 25 after 5 + 10. **styles.css rule:** new components bring their own css file (like `src/ui/fuel/weighIn.css`); only 17 and 18 edit `src/styles.css`, in that order.
- **G1 other (after 1):** 26 [main] icons script → 27 [ios]; 28 [ios] docs (no deps).
- **G2:** 29 [main] version/config → 30 [main] wiring A (owner mode, About) → 31 [main] wiring B (first launch, share, the rest).
- **G3:** 32 ∥ 33 [ui] e2e after 31; 34 [core] demo data may run from G1.
- **G4:** 35 [verifier] store set → 36 [ui] landing shots ∥ 37 [social-media] Story pack.
- **G5:** 38 reviewer → 39 verifier → 40 main merge + ask → 41 🧍 Checkpoint K.

- [x] 1. [main] Shared types + brand constants (no behaviour change).
  - Files: src/core/types.ts, src/core/brand.ts(+test).
  - Adds per SPEC M13 data model: `OwnerMode`, `OwnerSurface`, `Onboarding`, `OnboardingStep`, `LicenseEntry`, `ShareLead`, `ShareStats`; `AppRoute` + `'welcome' | 'settings/about' | 'settings/licenses'`; `WhatsNewPage.owner?`, `TodoTopic.owner?`. `brand.ts`: `APP_NAME = 'Gym Clean'`, `APP_TAGLINE` (default "Your pocket strength coach."; passes `checkCopy`).
  - Done when: `npm run check` passes; no runtime change.
  - Deps: none.
- [ ] 2. [core-engineer] Owner mode logic + store. Tests first.
  - Files: src/core/ownerMode.ts(+test), src/data/ownerMode.ts(+test), src/core/version.ts(+test).
  - Pure: `decideOwnerMode({ hasRow, sessions, todoAnswers })` (fresh → off / `by: 'fresh'`; sessions or to-do answers → on / `by: 'existing'`; an existing row is returned untouched); `isVisible(surface, owner)` for every `OwnerSurface`; `versionLine(owner)` → "Version 1.15" (MAJOR.MINOR, + .PATCH when not 0) or the unchanged `versionLabel()`; `devLogRecording(owner, savedSwitch)` → false when owner is off (saved value kept). Store: `resolveOwnerMode()` writes the row once on first launch, `setOwnerMode(on)` (`by: 'user'`).
  - Done when: tests cover fresh / sessions / to-do answers / existing row / restored backup row wins; the row round-trips `backup.ts`; version line both modes; `npm run check`.
  - Deps: 1.
- [ ] 3. [core-engineer] Owner-only tour pages and topics. Tests first.
  - Files: src/core/todo/whatsNew.ts(+test), src/core/todo/progress (the Today-card count file)(+test), src/data/todos/topics.ts, src/data/whatsNew/pages.ts.
  - Tour selection takes `owner`: pages with `owner: true` and the "Added to your to-dos" page are left out when off; the first page's version text comes from `versionLine(owner)`. 1.15.0 pages (new look, About + privacy, Share to Story; "Owner tools" with `owner: true`). 1.15.0 topic "Published look (Checkpoint K)" (ask steps: what still looks home-made; anything that assumed you; first launch asked too much / fine; her install: iPhone app / PWA).
  - Done when: tests: owner off → no owner pages, no to-dos page, no build hash; owner on → identical to 1.14.0 behaviour; data tests (unique ids, valid routes, `checkCopy`) pass.
  - Deps: 1, 2.
- [ ] 4. [core-engineer] First-launch steps. Tests first.
  - Files: src/core/onboarding.ts(+test), src/data/onboarding.ts(+test).
  - Pure `onboardingSteps({ platform, fresh, intakeDone, has: { health, mic, notifications } })` → welcome pages, intake (skipped if done), permission pages for what the platform has (PWA: camera only); `shouldOnboard` false for any install with sessions or an `'onboarding'` row. Page copy as data (≤ 2 short sentences each; the four "why" texts; all pass `checkCopy`; no "he/his", no goal assumed).
  - Done when: tests per platform, fresh vs existing, skip and finish stored once, copy checks; `npm run check`.
  - Deps: 1.
- [ ] 5. [core-engineer] Share stats for the Story image. Tests first.
  - Files: src/core/progress/shareStats.ts(+test).
  - `shareStats(month, sessions, …)` → `{ sessionsDone, volumeKg, streakWeeks }`; warm-ups excluded; lb conversion helper reuse; `pickLead(stats)` default `'sessions'`, never offers a lead whose number is 0.
  - Done when: tests: known month, empty month, warm-ups excluded, kg and lb text, streak from `stats.ts`.
  - Deps: 1.
- [ ] 6. [core-engineer] Open-source credits data. Tests first.
  - Files: scripts/gen-licenses.mjs(+test), src/data/licenses.json (generated, committed), src/data/licenses.extra.json (hand list: free-exercise-db Unlicense, USDA FoodData Central, MediaPipe pose model, bundled fonts), src/data/licenses.ts(+test).
  - The script reads `package.json` runtime dependencies + each package's licence field/file from `node_modules`; no network. (scripts/ is not in the ownership table for this file; main adds it to the core-engineer row or takes the script itself.)
  - Done when: test: every runtime dependency has an entry with a licence; the extras are present; a fresh generation equals the committed file; `npm run check`.
  - Deps: 1.
- [ ] 7. [core-engineer] Name constant in core + data. Tests first.
  - Files: src/core/health/{readiness,weeklyLoad,days,sync}.ts, src/core/todo/report.ts, src/data/backup.ts, src/data/gymFile.ts (shown text only), src/core/brand.test.ts.
  - Replace shown "Gym Clean" literals with `APP_NAME`. The scan test lists what may still hold the literal: `brand.ts`, `index.html`, `capacitor.config.ts`, `ios/App/App/Info.plist`, file-format ids. It starts with an allow-list for ui/native files that tasks 10 and 27 empty.
  - Done when: scan test green for src/core + src/data; existing copy tests unchanged.
  - Deps: 1.
- [ ] 8. [core-engineer] "Anyone" scan. Tests first.
  - Files: src/core/noPersonal.test.ts (extend the slice 1b scan).
  - Adds: no gendered wording ("he", "his", "man", "guys", "bro", male-only voice wording) in shown copy and data outside persona lines that are already neutral; lists each hit with file:line. Fix hits in core/data files; report ui hits to main for task 13/21.
  - Done when: the scan is green for src/core + src/data and prints the ui list (empty after 13 and 21).
  - Deps: 1.
- [ ] 9. [core-engineer] Wording in core: plateau, not "stalled / fell short". Tests first.
  - Files: src/core/trainer/actions/stall.ts(+test), src/core/advice.ts(+test) (whichever builds the stall-card line; grep first).
  - Shown text only ("Plateau: let's change something" style, `checkCopy`); ids, types and the rule stay `stall`.
  - Done when: copy tests assert no "STALLED" / "fell short" in any built line; eval set still 100% on stall items.
  - Deps: 1.
- [ ] 10. [ui-engineer] Name constant in ui + brand lockup.
  - Files: src/ui/brand.ts(+test, + brand.css) (mark + name + optional tagline, sizes sm/lg), src/ui/screens/{today,settings,weekLoad,healthSettings,backupPanel}.ts, src/ui/healthHost.ts, src/ui/shareMonth.ts, src/ui/todo/todoFixture.ts.
  - Done when: render test for the lockup; task 7's scan allow-list has no ui file left; `npm run check`.
  - Deps: 1, 7.
- [ ] 11. [ui-engineer] Web launch mark, favicon, title and description.
  - Files: index.html.
  - Favicon links to `icons/favicon.svg` + 32px PNG from task 26 (the real icon); a static pre-boot mark inside `#app` (inline SVG of the logo path on `#0d0f12`, no script, removed when the app mounts); `<meta name="description">` = the tagline. The CSP line is untouched.
  - Done when: screenshot of the page with the app script blocked shows the mark (not a blank page); the m4e-theme e2e still passes.
  - Deps: 26.
- [ ] 12. [ui-engineer] Welcome + permission pages.
  - Files: src/ui/onboarding/welcome.ts(+test), src/ui/onboarding/permissionPage.ts(+test), src/ui/onboarding/onboarding.css.
  - Props: the steps from task 4; callbacks `onNext`, `onBack`, `onSkipAll`, `onAllow(permission)`, `onNotNow`. Page 1 = the lockup + tagline. Skip always visible; Back/Next ≥ 56px; page indicator not colour alone; reduced motion → instant. The mic page has no Allow button (explains only).
  - Done when: render tests (each page kind, skip, PWA shows camera only); 390×844 harness screenshots.
  - Deps: 1, 4, 10.
- [ ] 13. [ui-engineer] Drill-sergeant voice picker: any installed English voice.
  - Files: src/ui/voiceNames.ts(+test), src/ui/coachVoiceSettings.ts(+test).
  - `listEnglishVoices` replaces `listMaleVoices` (known names keep their accent label and the default order first; others labelled by region); hint reworded (no "male"). `pickDrillVoice` unchanged.
  - Done when: tests with a fixture holding female and male names: all offered; saved voice wins; default order kept.
  - Deps: 1.
- [ ] 14. [ui-engineer] About screen + Licenses screen.
  - Files: src/ui/screens/about.ts(+test), src/ui/screens/licenses.ts(+test), src/ui/screens/about.css.
  - About: lockup, tagline, version line (prop), privacy promise, "Coaching, not medical advice.", "Open-source credits" row, `CREDIT`. Licenses: list from task 6 (name, version, licence; tap → full text when present). No external links.
  - Done when: render tests; 390×844 screenshots; text ≥ 20px.
  - Deps: 1, 6, 10.
- [ ] 15. [ui-engineer] Owner tools switch (option A, his pick 2026-11-17).
  - Files: src/ui/ownerUnlock.ts(+test).
  - Pure `tapUnlock(state, now)` (7 taps, each within 3 s of the last, else reset) + a small controller that makes the About version line tappable and shows the "Owner tools" switch (≥ 56px) once unlocked or while owner mode is on. A short status line after the 7th tap ("Owner tools unlocked"), not colour alone. This file is the whole mechanism.
  - Done when: tests: 6 taps → nothing, 7 → switch, slow taps reset, switch stays visible while on; render test inside the About screen.
  - Deps: 14.
- [ ] 16. [ui-engineer] Settings + tour honour owner mode.
  - Files: src/ui/screens/settings.ts(+test), src/ui/todo/whatsNewTour.ts(+test).
  - Settings takes `owner: boolean`: off → no To-dos section, no Developer log section, no dev eval row; the About section becomes one row opening the About screen. Tour takes the version text as a prop (no build hash of its own).
  - Done when: render tests both modes; owner on renders the same sections as before M13.
  - Deps: 1.
- [ ] 17. [ui-engineer] Polish: tab bar labels (S).
  - Files: src/ui/tabBar.ts(+test), src/styles.css (the tab block around :749-756).
  - Condensed display font for labels or shorter names so five labels never touch at 390 and 360px; labels ≥ 18px, targets ≥ 56px, active state not colour alone.
  - Done when: harness screenshots at 390 and 360 wide; a render/e2e check that label boxes don't overlap.
  - Deps: 1.
- [ ] 18. [ui-engineer] Polish: one look (S–M).
  - Files: src/styles.css (`.mood-track` :123-128 and users), src/ui/screens/calendar.ts, src/ui/screens/calendarDay.ts (+tests).
  - The black track + 8px cards stay on Exercise, Rest and camera only; Calendar and its day view move to the standard surface and 20px cards. Rings and legend unchanged.
  - Done when: tokens test asserts the mood class per screen; before/after screenshots of Calendar, day view, Rest.
  - Deps: 17 (same file).
- [ ] 19. [ui-engineer] Polish: Today, hero first (M).
  - Files: src/ui/screens/today.ts(+test), a today css file.
  - Hero + Start first; notices (readiness, missed day, program prompt, goal, adjusted) collapse into one compact row "N things to sort" that expands in place, or one card when N = 1; secondary actions outline; the header Coach button removed (the tab is the way in); bottom padding clears the tab bar.
  - Done when: render tests (0 / 1 / 3 notices; exactly one filled primary button); 390×844 screenshot with two notices shows Start in the first viewport.
  - Deps: 1.
- [ ] 20. [ui-engineer] Polish: shared back / done / forward controls (S).
  - Files: src/ui/backButton.ts(+test), src/ui/icons.ts(+test) (original chevron-left, check, arrow-right paths), src/ui/screens/{healthSettings,myGym,preview,planChanges}.ts, src/ui/todo/todoGuide.ts, src/ui/coach/proposalCard.ts.
  - Done when: no typed "‹", "✓ done" or "→" used as a control in src/ui (a scan test, app.ts excluded until task 30); each back button ≥ 56px with an accessible name.
  - Deps: 1 (icons.ts is also edited by 22; run 20 then 22).
- [ ] 21. [ui-engineer] Polish: wording + one score per Calendar card (S).
  - Files: src/ui/coachSummary.ts(+test), src/ui/coach.css, src/ui/screens/calendar.ts(+test) (after 18).
  - "Plateau" label, sentence case; each week/month card shows one headline score with its label (sessions "2 of 6"), the sets % as a quiet second line or dropped; fix ui hits from task 8.
  - Done when: render tests; no all-caps status words; task 8's ui list is empty.
  - Deps: 8, 9, 18.
- [ ] 22. [ui-engineer] Polish: empty states (M).
  - Files: src/ui/emptyState.ts(+test, + css), src/ui/icons.ts (2–3 original glyphs), src/ui/screens/fuel.ts, src/ui/coach/chat.ts (+tests), others found by a grep for bare "Nothing"/"No … yet" lines.
  - One icon + one line + one action each; Fuel shows "Set up targets" as the primary action until targets exist.
  - Done when: render tests per state; screenshots of an empty Fuel day and an empty Coach thread.
  - Deps: 20.
- [ ] 23. [ui-engineer] Polish: Rest "Next" card placeholder (S–M).
  - Files: src/ui/screens/rest.ts(+test).
  - The 2D body map (existing `src/ui/bodyMap.ts` API) renders at once; the 3D view fades in over it (motion helper; instant under reduced motion). If `bodyMap.ts` needs a change, main opens a small [anatomy-3d-engineer] task.
  - Done when: render test: the card is never empty before 3D resolves, or when 3D fails; noted for the real-phone check in task 41.
  - Deps: 1.
- [ ] 24. [ui-engineer] Polish: Fuel entry rows (M; check first).
  - Files: src/ui/fuel/* (the entry list + sheet)(+tests).
  - Re-check the current screen at 390×844. If a large Delete block is still always visible: tap the row → the sheet with Edit / Delete; Undo toast unchanged. If already so: tick with a screenshot, no code.
  - Done when: screenshot; render tests if changed.
  - Deps: 1.
- [ ] 25. [ui-engineer] Share month, Story size.
  - Files: src/ui/shareMonth.ts(+test).
  - `shareStoryLayout(month, stats, lead)` 1080×1920: lockup on top, the lead number large with its label, the month grid with missed days as grey rings (no red, no "missed" text), a quiet footer. Preview offers Post size / Story size and the lead picker (sessions default; total lifted; streak). File name `gym-clean-<month>-story.png`.
  - Done when: layout tests (size, lead first, no body/Health/per-lift data, grey missed rings); a rendered sample PNG screenshot.
  - Deps: 5, 10.
- [ ] 26. [main] Icon script: favicon + iOS splash output.
  - Files: scripts/icons.mjs, public/icons/favicon.svg, public/icons/favicon-32.png.
  - Same logo path as the PWA icons; `--splash <dir>` renders the 2732×2732 splash (mark centred on `#0d0f12`) ×3.
  - Done when: files generated; the favicon matches the app icon in a side-by-side screenshot.
  - Deps: 1.
- [ ] 27. [ios-engineer] iOS launch screen + name constant in native.
  - Files: ios/App/App/Assets.xcassets/Splash.imageset/*, ios/App/App/Base.lproj/LaunchScreen.storyboard (background `#0d0f12`, image aspect-fit), src/native/health.ts(+test) (`APP_NAME`).
  - Done when: simulator launch screenshot shows the mark with no white flash; XCTests and `npm run check` pass; task 7's allow-list has no native file left.
  - Deps: 7, 26.
- [ ] 28. [ios-engineer] "Her phone" checklist.
  - Files: docs/ios-setup.md.
  - Two short lists: iPhone app on her phone (free Apple ID: one of 3 devices, re-sign every 7 days from his Mac, gets Health / mic / reminders) vs PWA (Add to Home Screen, no re-sign, no Health / mic / reminders); which to pick; her data stays on her phone; "Share my gym" to copy the kit.
  - Done when: the section exists and matches the facts already in the file (3 devices, 7 days).
  - Deps: none.
- [ ] 29. [main] Version 1.15.0 + configs.
  - Files: package.json (`version`, `licenses` script), vite.config.ts (manifest `name`/`short_name`/`description` from `brand.ts`; `navigateFallbackDenylist: [/\/welcome\//]`; optional: leave `welcome/` out of the native build), CLAUDE.md ownership row for `scripts/gen-licenses.mjs` (ask him first: CLAUDE.md is his file).
  - Done when: `npm run build` output has `1.15.0`, the new description and `welcome/index.html`; `scripts/sync-ios-version.mjs` reports 1.15.0.
  - Deps: 6, 26.
- [ ] 30. [main] Wiring A: owner mode + About.
  - Files: src/ui/app.ts, src/main.ts.
  - Boot: `resolveOwnerMode()` **before** the What's New fresh-install marking. Gate by `isVisible`: Today to-do card + re-sign card, routes `todos` / `settings/devlog` / the eval screen (redirect to Settings when off), dev log recording, tour pages + version text, Copy report. Routes `settings/about`, `settings/licenses`; the Owner tools switch → `setOwnerMode` → re-render. app.ts:3352 "✓ done" → the shared control.
  - Done when: `npm run check`; manual 390×844 run: fresh profile shows none of it, seeded pre-1.15 profile shows all of it.
  - Deps: 2, 3, 14, 15, 16, 20.
- [ ] 31. [main] Wiring B: first launch + the rest.
  - Files: src/ui/app.ts, src/main.ts.
  - Fresh install: welcome → the 1b intake → permission pages (camera `getUserMedia` then stop; Health = the M11 connect flow; notifications = switch the session reminder on; mic explains only) → Today; stored in `'onboarding'`; "Run the welcome again" in Settings. Story share + lead picker; empty-state actions; Today notices row; removal of the pre-boot mark on mount.
  - Done when: `npm run check`; manual run fresh and existing; no network request.
  - Deps: 30 (same file), 4, 5, 11, 12, 13, 19, 22, 23, 25.
- [ ] 32. [ui-engineer] Update existing e2e specs + helpers.
  - Files: e2e/app.helpers.ts, e2e/workout.helpers.ts (defaults: onboarding done; owner mode on only for specs about to-dos, dev log, version + build), specs whose selectors changed (Today, tab bar, Calendar, Settings/About, todos, whats-new, devlog).
  - Done when: each changed spec passes 3× in a row; full `npm run e2e` green.
  - Deps: 31.
- [ ] 33. [ui-engineer] New e2e specs (390×844, SPEC M13 Accept).
  - Files: e2e/first-launch.spec.ts, e2e/owner-mode.spec.ts, e2e/about.spec.ts, e2e/share-story.spec.ts, e2e/polish.spec.ts (Today first viewport, one filled button, tab labels at 390/360, empty states), e2e/landing.spec.ts (built preview: zero script tags, zero third-party requests, service worker doesn't swallow `/welcome/`). Every spec asserts no off-device request.
  - Done when: each passes 3× in a row; full e2e green.
  - Deps: 31; landing.spec also needs 36.
- [ ] 34. [core-engineer] Demo profile for screenshots (made-up person). Tests first.
  - Files: src/data/demo/demoBackup.ts(+test).
  - `buildDemoBackup(now)` → a valid backup object (6 weeks of sessions, a goal, Fuel days, a focus block, a short chat is not in backups so the script sends two chips). Not imported by the app.
  - Done when: test: passes `validateBackup`; no personal name or real numbers (the noPersonal scan covers it); no non-test app file imports it.
  - Deps: 1.
- [ ] 35. [verifier] Store-style screenshot set.
  - Files: scripts/screenshots.mjs (`--store`), docs/screenshots/store/*.
  - Restores the demo backup, owner mode off, captures ≥ 6 screens (Today, a set, Rest, Coach, Calendar, Fuel) at 390×844 @3x, plain and with a headline caption on the brand background.
  - Done when: the files exist; none shows his data, a build hash, a to-do or the dev log.
  - Deps: 31, 34.
- [ ] 36. [ui-engineer] Landing page.
  - Files: public/welcome/index.html, public/welcome/welcome.css, public/welcome/shots/* (three copies from task 35).
  - Static: mark, name, tagline, three screenshots, the privacy promise, "Coaching, not medical advice.", "Open the app" (`../`). No script, system fonts or the bundled woff2, a strict CSP meta, relative paths only (works under `/<repo>/`). No personal name.
  - Done when: screenshots at phone and desktop width; e2e/landing.spec.ts passes.
  - Deps: 29, 35 (layout may start after 10 with placeholder frames).
- [ ] 37. [social-media] Story pack drafts (`/story`).
  - Files: docs/social/m13/* (drafts only).
  - From the store set + a Story-size share image with demo data: 3–5 Story frames with captions. **Nothing is posted**; he posts if he wants.
  - Done when: the drafts exist and main has shown them to him.
  - Deps: 35.
- [ ] 38. [reviewer] Review the M13 diff: no new network request; landing page has no script/tracker; owner mode off hides every `OwnerSurface` and on changes nothing; an existing install is never onboarded; permission rules from slice 2 intact (mic on first use, notifications on first switch-on); original art only; no medical claims; sizes; name only via `brand.ts`; demo data made-up; ownership; tests-first evidence; motion via helpers.
  - Deps: 32, 33, 36.
- [ ] 39. [verifier] Verify milestone against SPEC acceptance criteria (M13): `npm run check`, full `npm run e2e`, `npm run build` (contains `1.15.0`, `welcome/index.html`), iOS simulator build (launch screen, 1.15.0); the 390×844 screenshots listed in SPEC + the 1.15.0 tour page; evidence into Verification evidence → M13.
  - Deps: 38.
- [ ] 40. [main] merge + ask to push (his call). Install on his iPhone; her phone per docs/ios-setup.md "Her phone".
  - Deps: 39.
- [ ] 41. 🧍 **Checkpoint K:** he and his wife each try a fresh install; she uses it for a few days; he checks the Rest "Next" card on the real phone, looks at the Story pack and posts it himself if he wants. Feedback through the "Published look" to-do (his phone, owner mode on) or `/feedback`.
  - Deps: 40.

**Later, not in M13:** a second anatomy silhouette option ([anatomy-3d-engineer], only if he asks after Checkpoint K).

### M14 — Wrist and ears: Apple Watch app + AirPods head motion (planned 2026-11-17; release 1.16.0; builds AFTER M13)
**Contract:** SPEC "M14 — Wrist and ears" (Goals 1–8, head-motion fixture guide, Changes to earlier contracts, Privacy, Data model, Accept) and Decision "M14 Wrist and ears" (2026-11-17), which wins where it is more specific; Decision "M14 task 1 findings" (2026-11-17) wins over both where they differ (applied to this plan and SPEC 2026-11-17: Health access asked at the first watch workout whatever the Save switch says; Save off = no workout record but the session's samples stay in Health; no mirroring, phone unlocked + screen on is the only setup; no assumed AirPods rate; watch target/plist/WCSession facts). **Gender-neutral copy:** his partner may use the app, so every new string (phone, watch, Info.plist, What's New, to-do) says "you", never he/she, and passes M13's gendered/owner-wording scan. **No network request** by the app or the watch app (WatchConnectivity is the paired-device link). All logic **tests first** (Vitest, made-up data; the repo is public); Swift logic in `…Core` Swift packages with XCTests, like `ios/App/App/Plugins/GymHealth/GymHealthCore`; Swift stays thin (no rules, thresholds or copy in Swift except watch layout, the Info.plist strings and the watch's one Health explain screen, all worded exactly as in SPEC M14). UI tasks: props in / callbacks out, render tests + 390×844 harness screenshots, tokens + motion helpers, text ≥ 20px, targets ≥ 56px; nothing new shown during a set on the phone (head hints are spoken only).

**Do not start before** M13's verifier task (M13 task 39) has passed, except tasks 1 and 2 (paper / scratch project, no repo files), which may run any time.

**Branch:** `m14-wrist-ears`, cut from the M13 result (`m13-published-look` after verify, or `main` if he has merged by then). Subagents never commit.

**Blocking:** **M14-q1 answered 2026-11-17: "let's try the free version, and I will decide the pay in the future".** Build with the free Personal Team; task 2's spike decides. If the free team can't install/run the watch app, tasks 14–19, 27 and the watch half of 24 **pause** and main asks him again with the facts and the US$99/year cost; the AirPods track (4, 8–10, 12, 22, 25) and the core watch logic (5–7, 20, 21) proceed, and 1.16.0 ships the AirPods track plus 5–7 dormant. **M14-q2 answered 2026-11-17 ("I got series 9 and pro 2"):** target devices are an **Apple Watch Series 9** (current watchOS, `HKWorkoutSession` heart rate) and **AirPods Pro 2** (head tracking supported by `CMHeadphoneMotionManager`); no "unknown model" fallbacks are needed beyond the generic unsupported/disconnected states.

**Fit with the current code (skimmed 2026-11-17; re-check when M14 starts, M12/M13 are moving these files):**
- Session reducer `src/core/session.ts`: `SessionEvent` already has `SET_DONE` (backdatable `now`), `START_SET`, `EXTEND_REST`, `PAUSE`, `RESUME`, `SKIP_EXERCISE` → watch events map onto them; **no reducer change**. `SessionState` has `phase`, `exIndex`, `setIndex`, `restTargetSec`, `restAccumMs` / `restRunningSince`, `paused`, `warmups` → the snapshot is computed from it.
- `SetLog` in `src/core/types.ts` (has `effort?`, `warmup?`) gains `hr?` and `head?`; backup row shapes in `src/data/backup.ts` (`validateBackup`, optional fields typed when present).
- Native: `src/native/{health,speech}.ts` + `ios/App/App/Plugins/{GymHealth,GymSpeech}/` are the patterns (plugin + `…Core` package + TS bridge with a fake for e2e). `scripts/sync-ios-version.mjs` (ios-engineer) sets `MARKETING_VERSION`; it must also cover the watch target.
- Camera exercise rules live in `src/core/exercises/*.ts` (`index.ts` registry, `learning.ts`); calf raises (`Standing_Calf_Raises`, `Standing_Dumbbell_Calf_Raise`, `Smith_Machine_Calf_Raise`) are in `src/data/exercises.json`, **shrugs are not** (task 9 vendors one).
- M13 gives: owner mode (`isVisible(surface)`), the permission page component (`src/ui/onboarding/permissionPage.ts`), the What's New / to-do data files. M11 gives Health workout reads (dedupe by source).

**Order / parallel groups:**
- **Any time:** 1 [ios] facts (done) → 2 🧍 spike on his Series 9 + iPhone + AirPods → free-team verdict (works → go; fails → watch tasks pause, ask him again) + measured AirPods rate + Health-sheet facts for 17/21.
- **G0 (after M13 verify):** 3 [main] types; 13 [main] watch icon output.
- **G1 core (after 3), in parallel by file:** 5, 6, 7, 11; 4 [ios] fixtures; then 8 ∥ 9 (after 4), then 10.
- **G1 ios:** 12 (after 1, 3); watch track 14 (after 2 shows the free team works, 13) → 15 → 16 → 17 (17 needs 16's explain screen); 18 (after 14); 19 (after 14).
- **G1 ui (after 3):** 20 and 21 after 6 (copy); 22 after 12.
- **G2:** 23 [main] version → 24 [main] wiring A (watch) → 25 [main] wiring B (AirPods).
- **G3:** 26 [ui] e2e ∥ 27 [ios] simulator round trip; 28 🧍 clips (any time after 25 is on his phone) → 29 [core] tune (doesn't gate 30–32 if the clips aren't in yet).
- **G4:** 30 reviewer → 31 verifier → 32 main merge + ask → 33 🧍 Checkpoint L.

- [x] 1. [ios-engineer] Facts check against current Apple docs (paper; no repo files; findings to main for Decision "M14 Wrist and ears").
  - Check and link: (a) a **free Personal Team** building, installing and running a **watchOS companion** (single-target watch app embedded in the iOS app), the 7-day expiry for the watch app, App ID count per 7 days, the 3-device limit (does the watch count?), watch Developer Mode; capabilities a Personal Team can't use on watchOS (HealthKit, background mode `workout-processing`); (b) `HKWorkoutSession` + `HKLiveWorkoutBuilder` on watchOS: which authorisation is needed just to **run** a session and read heart rate vs to **save** it, and that `discardWorkout()` leaves nothing in Health; (c) **mirrored workout sessions** to the iPhone (iOS 17+ `startMirroringToCompanionDevice`): does the iPhone app get background time, and does a **WKWebView** keep running JS (events, speech) with the phone locked; (d) WatchConnectivity semantics: `sendMessage` (reachable only), `transferUserInfo` (queued FIFO), `updateApplicationContext` (latest only), delivery when the iPhone app is suspended; (e) `CMHeadphoneMotionManager`: supported AirPods models (Pro 1/2, 3, 4, Max), sample rate, `NSMotionUsageDescription`, authorisation states, foreground/background, iOS floor; (f) current Xcode / watchOS SDK, that the current watchOS runs on his **Apple Watch Series 9**, and the deployment target we set (current watchOS is fine: his is the only watch); confirm **AirPods Pro 2** in the `CMHeadphoneMotionManager` support list.
  - Done when: each item is marked VERIFIED (doc link or Xcode result) or NOT VERIFIED, with a one-line verdict for the free-team path (free works / needs paid / unknown until task 2). M14-q1 is answered (try free first); M14-q2 is answered (Series 9, AirPods Pro 2).
  - Deps: none (may run now).
  - **Done 2026-11-17:** Decision "M14 task 1 findings" (free team should work on paper; task 2 proves it). Its plan changes are applied to tasks 2, 4, 8, 9, 12, 14, 17, 18, 19, 21, 24, 26, 27, 30, 33 and SPEC M14.
- [ ] 2. 🧍 [ios-engineer + Wongsaton] Free-team watch spike on his devices (needs his iPhone plugged into the Mac; notify him).
  - A **scratch** Xcode project outside the repo, with its **own bundle id (never Gym Clean's)**: template "Watch app for Existing iOS App" (blank iOS app + single-target watch app, `WKCompanionAppBundleIdentifier`, watchOS 26.0), Personal Team signing, HealthKit + `UIBackgroundModes` workout-processing on the watch target, both Health usage strings, a button that starts an `HKWorkoutSession` + `HKLiveWorkoutBuilder` (strength training) and shows heart rate, Finish with a Save/Discard toggle; on the iPhone side a button that reads `CMHeadphoneMotionManager` (with `NSMotionUsageDescription`) and shows the update rate. Install on his iPhone + watch.
  - Record (into Decision "M14 task 1 findings" → task 2 results): watchOS / iOS / AirPods Pro 2 firmware; watch Developer Mode (Settings → Privacy & Security → Developer Mode, appears after Xcode pairing starts); the install result or the exact error; what the first watch Health sheet lists (and on which device it appears); whether a session starts with workout write **denied** (decides task 17's denied path); heart rate keeps updating wrist-down; haptics play with workout-processing only (else add Audio background mode); Health afterwards with Discard (no workout; samples remain); AirPods `isDeviceMotionAvailable`, the **measured Hz**, and whether updates continue while another app plays music. Free-team app slots: 3 apps per device, 10 App IDs per 7 days; note whether the watch app used its own slot.
  - **Delete the scratch apps from the iPhone and watch afterwards** (they hold app slots).
  - Done when: it installs and shows live heart rate on his Series 9 (→ free works, watch track goes ahead), or the exact Xcode/device error is recorded (→ watch-only tasks 14–19, 27 and the watch half of 24 pause; main asks him again with the facts and the US$99/year cost, per his 2026-11-17 answer "I will decide the pay in the future"); every checklist line above has an answer; scratch apps deleted.
  - Deps: 1.
- [ ] 3. [main] Shared types (no behaviour change).
  - Files: src/core/types.ts.
  - Per SPEC M14 data model: `SetLog.hr?`, `SetLog.head?`, `WatchPhase`, `WatchSetView`, `WatchSnapshot`, `WatchEventType`, `WatchEvent`, `HrSample`, `WatchMessage` (`hello` carries optional `healthAccess`), `WatchSettings`, `HeadFrame`, `HeadRule`, `HeadMotionSettings`, `HeadEvent`; `AppRoute` + `'settings/watch' | 'settings/airpods' | 'settings/headclip'`; `OwnerSurface` + `'headClip'`.
  - Done when: `npm run check` passes; no runtime change.
  - Deps: M13 verified.
- [ ] 4. [ios-engineer] Synthetic head-motion fixtures + format.
  - Files: fixtures/headmotion/README.md (format, filename rule, pointer to the SPEC guide), fixtures/headmotion/gen-synthetic.mjs, fixtures/headmotion/synthetic/** (made-up clips: still curl, curl with 3 side looks, push-up with chin drops, 12 calf raises clean + 2 half reps, 12 shrugs clean + 2 half, AirPods dropping out mid-set, and the still-curl + drift-curl + calf-raise clips again at a second rate with jittered timestamps). The AirPods rate is not documented: generate at 25 Hz as a placeholder and switch the main set to the rate task 2 measures; the rate is a generator parameter.
  - Done when: each clip is valid `HeadFrame[]` JSON with its rate and expected counts in the filename; regenerating gives the same files.
  - Deps: 3.
- [ ] 5. [core-engineer] Watch protocol. Tests first.
  - Files: src/core/watch/protocol.ts(+test).
  - `watchSnapshot(state, ctx, rev, now)` → `WatchSnapshot` (texts in his unit, warm-up label, `rest.endsAt` from the rest clock, one-step `next` lookahead incl. its rest seconds, summary); `watchEventToSession(ev, state, seen, clock)` → `SessionEvent | null` (dedupe by id, stale `basedOnRev` dropped by exercise/set/phase, watch time → phone time via the offset, clamped like M5c); `clockOffset(hello/snapshot pairs)`; replay of a queued list in order.
  - Done when: tests cover every phase (warm-up, last set of an exercise, last set of the day, paused, summary), each event type, duplicate, stale, phone + watch double Set done → one log, offline Set done then reconnect, offset + clamp; `npm run check`.
  - Deps: 3.
- [ ] 6. [core-engineer] Heart-rate summaries + recovery rule. Tests first.
  - Files: src/core/watch/heartRate.ts(+test), src/core/watch/hrRules.ts (data), src/core/watch/copy.ts(+test).
  - `setHr(samples, set)` → `{ avgBpm, maxBpm, samples }` inside `startedAt..endedAt` (none when < 3 samples); `attachLate(logs, samples)`; `recoveryReady(restState, samples, baseline, rules)` per SPEC (45 s, 15 s left, baseline + 30% of the rise, fallback max − 25, once per rest); `sessionBaseline`. Copy: "Heart rate back down. Ready when you are." and the Settings explainers, incl. SPEC M14's Save to Apple Health line ("Saves each gym session as a Strength Training workout in Apple Health."), the "Either way, the heart rate and calories your watch measures during the session stay in Health, like your other Apple Watch readings." line and the Health-access-denied line; a test that no Save-to-Health string says or implies nothing reaches Health when off ("Nothing else", "nothing is saved", "nothing in Health"); gender-neutral; pass `checkCopy` + the M11 banned list + no zone/max/safe words.
  - Done when: edge tests (44/45 s, 14/15 s left, missing baseline, sparse samples, warm-up sets), copy tests; `npm run check`.
  - Deps: 3.
- [ ] 7. [core-engineer] Data layer for the new set fields + exclusions. Tests first.
  - Files: src/data/backup.ts(+test) (row shapes for `sets.hr` / `sets.head`), the session-save module in src/data (grep for where SetLogs are written)(+test) (`attachSetHr(sessionId, exerciseId, setIndex, hr)` for late samples), the brain-context builders in src/core (rules, Apple, Claude) + src/core/todo/report.ts + the devlog writer (+tests), src/core/health (workout dedupe by own source)(+test), src/data/settings defaults for `'watch'` and `'headMotion'`.
  - Done when: backup round-trips both fields and rejects wrong types; late attach updates only the matching set; tests prove `hr` and `head` never reach any brain context, Claude, the copy report or share stats, and `hr` never reaches the dev log; an own-source Health workout is skipped in the weekly load; `npm run check`.
  - Deps: 3.
- [ ] 8. [core-engineer] Head attitude + still / neck detectors. Tests first.
  - Files: src/core/headmotion/attitude.ts(+test) (quaternion → yaw/pitch/roll relative to a set reference = median of the first second; vertical acceleration from `acc` · `grav`), src/core/headmotion/drift.ts(+test).
  - `detectDrift(frames, rule)` → `HeadEvent[]` for `still` (yaw/roll beyond limits for ≥ holdMs) and `neck` (pitch beyond band); gaps (AirPods out) reset without events. All durations (reference window, holdMs, gaps) from frame `t`, never frame counts.
  - Done when: fixture tests: drift clips fire the expected count, clean clips fire none, dropout clip is quiet; the same results on the second-rate / jittered clips; `npm run check`.
  - Deps: 3, 4.
- [ ] 9. [core-engineer] Head rep counter + head rules as data. Tests first.
  - Files: src/core/headmotion/headCounter.ts(+test), src/core/exercises/headRules.ts(+test) (still: curls, hammer, incline, concentration, rows, bent-over row, shoulder press, DB shoulder press, lateral raise, triceps extension; neck: push-up, rows, bent-over row, goblet squat; count: the three standing calf raises + shrug, all `learning`), src/core/exercises/index.ts (expose `headRuleFor(id)`), src/data/exercises.json (vendor `Dumbbell_Shrug` from free-exercise-db if absent; Unlicense, no images).
  - Counter mirrors §3 on the vertical signal: EMA (time-constant from `t` deltas, not a per-frame alpha), hysteresis, min leg times, partials not counted as reps; emits `HeadEvent` reps.
  - Done when: exact counts on the synthetic clean clips at both rates, half reps not counted, data test (every id exists in the catalog, no exercise has both a camera `count` and a head `count` without the camera winning); `npm run check`.
  - Deps: 3, 4.
- [ ] 10. [core-engineer] Head hint scheduler + per-set numbers. Tests first.
  - Files: src/core/headmotion/hints.ts(+test), src/core/headmotion/copy.ts(+test).
  - Hold a drift until the next counted rep (camera or head), or speak at holdMs when nothing counts; at most one head hint per set; shares the camera hint cooldown; never cuts a count (voice queue kind `hint`). `setHead(frames…)` → `{ stillPct, hints, counted }`. Copy "Keep your head still." / "Keep your neck long, eyes ahead." passes `checkCopy`.
  - Done when: timing tests (between reps, once per set, cooldown shared, nothing during rest); `npm run check`.
  - Deps: 8, 9.
- [ ] 11. [core-engineer] What's New 1.16.0 + to-do topic.
  - Files: src/data/whatsNew/pages.ts, src/data/todos/topics.ts (+ their data tests).
  - Pages: Apple Watch remote (phone unlocked, screen on; Health asks for access at the first watch workout), heart rate on Rest + recovery line, Save to Health (off by default; worded as in SPEC: saves a workout record when on, the session's heart rate and calories stay in Health either way), AirPods head hints + counting (iPhone-only pages labelled in the PWA). Topic "Wrist and ears (Checkpoint L)": ask steps per the SPEC checkpoint list (pocket vs floor, haptics, walking away, recovery line timing, Health save + WHOOP double count, head hints, counts, clips recorded), owner-only step "Record head clips".
  - Done when: data tests (unique ids, valid routes, `checkCopy`, owner flags) pass.
  - Deps: 3.
- [ ] 12. [ios-engineer] `GymHeadMotion` plugin + TS bridge.
  - Files: ios/App/App/Plugins/GymHeadMotion/** (plugin + `GymHeadMotionCore` package with XCTests), ios/App/App/Info.plist (`NSMotionUsageDescription` = the SPEC why text; **missing today, add it in this task's first step**: the app crashes on start of motion updates without it), ios project registration, src/native/headMotion.ts(+test).
  - `availability()` (no AirPods / unsupported / available), `authorization()`, `start()` / `stop()`, `onFrame(cb)` (every update forwarded with its own timestamp as `HeadFrame.t`, at the AirPods' rate measured in task 2; no fixed-rate assumption, batching to JS allowed), `onConnection(cb)`. Permission prompt only on first `start()`. TS side behind `isNative()` + plugin check; any error → no frames, never an error screen.
  - Done when: Info.plist has `NSMotionUsageDescription`; XCTests (quaternion/accel mapping, timestamp mapping, batching, states) and bridge tests with a fake (unavailable, denied, disconnect mid-stream, PWA) pass; simulator build OK.
  - Deps: 1, 3; soft dep 2 (the measured rate goes into the XCTest fixtures and README; nothing in code waits on it).
- [ ] 13. [main] Watch app icon output.
  - Files: scripts/icons.mjs (`--watch <dir>`: the same logo path, 1024×1024 single-size watch icon on `#0d0f12`).
  - Done when: the PNG renders and matches the iPhone icon side by side.
  - Deps: M13 task 26 (already done by then).
- [ ] 14. [ios-engineer] Watch target skeleton.
  - Files: ios/App/GymWatch Watch App/** (SwiftUI app, idle screen "Start on your iPhone" + day name; Info.plist; entitlements), ios/App/App.xcodeproj (target from the **"Watch app for Existing iOS App"** template, single target embedded in the iOS app, not standalone; `WKCompanionAppBundleIdentifier` = the iOS bundle id; deployment target **watchOS 26.0**; bundle id `<ios id>.watchkitapp` from the gitignored local signing config + `.example`), the icon from task 13, scripts/sync-ios-version.mjs(+test) (watch target follows package.json).
  - Watch capabilities set here: HealthKit; `UIBackgroundModes` = `workout-processing` (+ `audio` only if task 2 showed haptics need it); `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` with the exact SPEC M14 Privacy texts (gender-neutral, true with Save off).
  - Done when: paired iPhone + watch simulator build succeeds; a plist check (script or XCTest) finds `WKCompanionAppBundleIdentifier`, both Health strings, the background mode and watchOS 26.0; the idle screen screenshot; sync script test covers both targets; `npm run check` and existing XCTests pass.
  - Deps: 2 (free team works; else paused until he decides on paying), 13.
- [ ] 15. [ios-engineer] `GymWatchCore` package (watch-side logic). Tests first (XCTest).
  - Files: ios/App/GymWatch Watch App/GymWatchCore/**.
  - Snapshot decode (v1, unknown fields ignored), offline rest countdown from `rest.endsAt`, offline Set done → `next` lookahead + "will sync", **persisted** event queue until acked (survives app relaunch), haptic schedule (10 s left, 0 s, Set done confirm), HR sample buffer (batched every ~5 s when reachable, kept in memory for the session only), link state.
  - Done when: XCTests for each, incl. relaunch with a non-empty queue and a snapshot arriving after offline taps (snapshot wins).
  - Deps: 5 (protocol shape), 14.
- [ ] 16. [ios-engineer] Watch UI (SwiftUI).
  - Files: ios/App/GymWatch Watch App/Views/**.
  - Exercise, Rest, Controls (Pause/Resume, +30 s, Skip exercise with confirm), Summary, Not connected, idle, and the one-time **Health explain screen** shown before the first workout session's Health sheet (SPEC M14 Goal 4 text, one "Continue" button ≥ 56 pt). Sizes per SPEC (main numbers ≥ 64 pt, text ≥ 20 pt, primary button ≥ 56 pt, black background, state not by colour alone); recovery line text from the snapshot/phone, never composed in Swift beyond layout; SF Symbols or our own glyphs only (no art copied from the web).
  - Done when: watch simulator screenshots of every screen at 41 mm and 46 mm (or Ultra); VoiceOver labels on every control.
  - Deps: 15.
- [ ] 17. [ios-engineer] Watch workout session, heart rate, Save to Health.
  - Files: ios/App/GymWatch Watch App/Workout/** (+ Core tests where logic), ios/App/App/Info.plist (the same `NSHealthUpdateUsageDescription` text, only if Xcode/HealthKit needs it on the iPhone target; watch plist + entitlements are set in task 14).
  - **Authorisation (Decision "M14 task 1 findings" 1):** a workout session needs workout **write** permission, so at the **first session start** (whatever Save to Health says) the watch shows the explain screen from task 16, then requests read heart rate + active energy and share workouts + the sample types the builder writes. Never asked again from the phone; the Save switch never triggers a prompt. Report the write status in `hello.healthAccess`. **Denied:** follow task 2's result (session can't start → the watch stays a remote without heart rate; it can start → run it, no HR shown); never block the remote.
  - Start with the first snapshot of a started session, pause/resume with the app, end at Finish: `finishWorkout` when `saveToHealth`, else `discardWorkout` (no workout record; samples already added stay, as the copy says); HR samples into the buffer from task 15. **No mirroring** (`startMirroringToCompanionDevice` not used).
  - Done when: simulator run shows the session states and the explain → permission order; XCTests: Save off → discard called and finish never called; Save on → finish; the authorisation request asked once and the same whatever the Save switch says; denied → remote still works (per task 2's finding).
  - Deps: 1, 2 (denied-path and Health-sheet facts), 15, 16 (explain screen).
- [ ] 18. [ios-engineer] iPhone `GymWatch` plugin + TS bridge.
  - Files: ios/App/App/Plugins/GymWatch/** (WCSession on the phone: snapshot via `updateApplicationContext` + `sendMessage` when reachable; events/HR in via message and `transferUserInfo`; acks), src/native/watch.ts(+test).
  - **WCSession delegate implements `activationDidComplete`, `sessionDidBecomeInactive` and `sessionDidDeactivate` (calls `activate()` again)**, or iOS ends the app in the background after a watch switch. Activated once at app start.
  - Bridge: `status()` (no watch / app not installed / reachable / not reachable), `sendSnapshot(s)`, `onMessage(cb)` (incl. `hello` with `healthAccess`), `ack(ids)`. **No `requestHealthWrite()`**: Health access is asked on the watch (task 17). Behind `isNative()` + plugin check; errors → "no watch".
  - Done when: bridge tests with a fake (status changes, message order, ack, `hello.healthAccess` passed through, PWA no-op); the delegate has the three lifecycle methods (XCTest on the Core part or a compile-time protocol check); simulator build.
  - Deps: 3, 14.
- [ ] 19. [ios-engineer] docs/ios-setup.md: watch + AirPods.
  - Install the watch app (Watch app on iPhone; watch Developer Mode: Settings → Privacy & Security → Developer Mode, appears after Xcode pairing starts), re-sign every 7 days covers the watch too, free-team limits (3 apps per device, 10 App IDs per 7 days, 3 devices; remove unused dev apps if Xcode says "maximum number of apps"), the Health sheet at the first watch workout and what Save to Apple Health does / doesn't do, the supported setup (phone unlocked, screen on, pocket or face down), AirPods head-tracking check, the clip recorder steps, the Checkpoint L checklist. Gender-neutral (her phone uses the same steps).
  - Done when: the section exists and matches the task 1/2 facts.
  - Deps: 2, 14.
- [ ] 20. [ui-engineer] Rest screen heart rate + recovery line + watch chip.
  - Files: src/ui/watch/hrLine.ts(+test, + watch.css), src/ui/screens/rest.ts(+test).
  - Props: `bpm?`, `recovery?: string`, `watch?: 'connected' | 'offline'`. HR line ≥ 20px with a heart glyph (original) and the word "Heart rate"; the recovery line as text; a small "Watch" status chip (text, not colour alone) on the exercise/rest header. Nothing renders when props are absent (no watch = today's screen).
  - Done when: render tests (absent / present / offline); 390×844 harness screenshot of Rest with HR + recovery line.
  - Deps: 3, 6.
- [ ] 21. [ui-engineer] Settings → Apple Watch, Settings → AirPods, why page.
  - Files: src/ui/screens/watchSettings.ts(+test), src/ui/screens/headMotionSettings.ts(+test), src/ui/headmotion/whyPage.ts(+test) (reuses the M13 permission page), a css file.
  - Watch: status line, Health access line from `healthAccess` (not asked yet: "Your watch asks for Health access the first time you start a workout with it." / denied: heart rate is off, how to allow it in the Health app; wording from task 6's copy), "Heart rate in the app", "Recovery hint", "Say it", "Save to Apple Health" (off; switching on shows the explain step then `onChange`; **no permission callback**, the phone never prompts), the "Either way…" line under the switch in both states, and "Keep your iPhone unlocked with the screen on" in the help text. AirPods: availability line, master switch (first switch-on → why page → `onRequestMotion`), then Head still / Neck / Count reps switches. PWA: one "work in the iPhone app" line.
  - Done when: render tests for each state (incl. healthAccess notAsked / granted / denied, Save on / off both showing the "Either way…" line); 390×844 screenshots.
  - Deps: 3, 6 (copy).
- [ ] 22. [ui-engineer] Head-motion clip recorder (owner mode).
  - Files: src/ui/headmotion/recorder.ts(+test).
  - Pick exercise + label + reps/drifts typed, Start / Stop (frames in memory), preview line (duration, frames), **Save file** → share sheet / download with the guide's filename; Discard. Nothing written to IndexedDB.
  - Done when: render + unit tests (filename, JSON shape = `HeadFrame[]` + meta, nothing persisted); screenshot.
  - Deps: 3, 12.
- [ ] 23. [main] Version 1.16.0 + configs.
  - Files: package.json (`version`), anything the build needs for the watch target (via ios-engineer's sync script).
  - Done when: `npm run build` shows 1.16.0; `scripts/sync-ios-version.mjs` reports 1.16.0 for the iOS and watch targets.
  - Deps: 11, 14 (if the watch track is paused: 11 only).
- [ ] 24. [main] Wiring A: watch.
  - Files: src/ui/app.ts, src/main.ts.
  - On every session change (throttled ~1/s, plus immediately on phase change) send `watchSnapshot`; watch messages → `watchEventToSession` → the reducer; HR batches → current rest HR + recovery line + `setHr` on SET_DONE + `attachSetHr` for late ones; settings `'watch'` rows; Save to Health switch → `settings.saveToHealth` in the next snapshot (no phone permission call); `hello.healthAccess` → Settings line; routes `settings/watch`; PWA shows the line only.
  - Done when: `npm run check`; manual 390×844 run with the fake bridge (snapshot out, Set done in, HR line, stored `hr`).
  - Deps: 5, 6, 7, 18, 20, 21.
- [ ] 25. [main] Wiring B: AirPods.
  - Files: src/ui/app.ts, src/main.ts.
  - For an exercise with a head rule and the switches on: `start()` at START_SET, `stop()` at SET_DONE / pause / leave; frames → detectors → hints into the voice queue; head-counted reps → `SET_COUNTED` (camera wins when on); `setHead` on SET_DONE; routes `settings/airpods`, `settings/headclip` (owner mode only via `isVisible('headClip')`).
  - Done when: `npm run check`; manual run with the fake bridge (drift clip → spoken hint between reps; calf-raise clip counted); no frames kept after Stop.
  - Deps: 10, 12, 21, 22, 24 (same file).
- [ ] 26. [ui-engineer] E2E with fake bridges + existing specs.
  - Files: e2e/watch.spec.ts, e2e/headmotion.spec.ts, e2e helpers (fake `GymWatch` / `GymHeadMotion` on `window.Capacitor`), any existing spec whose Rest/Settings selectors moved.
  - Covers the SPEC M14 E2E list; every spec asserts no off-device request.
  - Done when: each new spec passes 3× in a row; full `npm run e2e` green.
  - Deps: 25.
- [ ] 27. [ios-engineer] Simulator round trip + watch evidence.
  - Paired iPhone + watch simulators running the native build: Start on the phone → watch shows the set → Set done on the watch → Rest on both → link off → two taps queued (watch's persisted queue) → link on → replayed over **`sendMessage`** (snapshot back via `updateApplicationContext`), one log each; screenshots into the PR notes for the verifier. **`transferUserInfo` does not deliver in the Simulator**, so the queued-transfer path is device-only: checked at task 32's install / Checkpoint L, not here.
  - Done when: the run is recorded (steps + screenshots); XCTests green.
  - Deps: 16, 17, 18, 24.
- [ ] 28. 🧍 Record head-motion clips (Wongsaton; any time after 25 is installed on his phone; notify him). Per the SPEC guide: clean + mistakes for a curl, a row, a press, push-ups, calf raises, shrugs. ios-engineer checks the files (numbers only) and adds them under `fixtures/headmotion/<exercise>/`.
  - Deps: 25 (installed by main on his phone).
- [ ] 29. [core-engineer] Tune head rules + counter on his clips. Tests first (the new clips become test cases).
  - Files: src/core/exercises/headRules.ts, src/core/headmotion/*(+tests).
  - A count rule moves to `ready` only at ≥ 90% exact sets; thresholds change as data only.
  - Done when: all fixture tests green; Decision line with before/after numbers. Doesn't gate 30–32 if the clips aren't in yet (then it runs after Checkpoint L).
  - Deps: 28.
- [ ] 30. [reviewer] Review the M14 diff: no network request (app or watch); the phone is the only brain (no rules in Swift); watch events map to existing reducer events, dedupe + stale handling tested; HR / head numbers out of every brain context, Claude, the copy report and (HR) the dev log; frames and samples never persisted by the app (except the owner-mode clip file on his tap); Save to Health off by default, Health access asked once on the watch at the first session (after the explain screen) whatever the switch says, discard when off, and no copy claiming nothing reaches Health when off; no mirroring; WCSession lifecycle methods present; `NSMotionUsageDescription` + both watch Health strings match SPEC; no fixed AirPods rate in logic; motion permission only after the why page; gender-neutral copy; no medical wording (no zones, maxima, safe/unsafe); sizes on phone and watch; original art; ownership; tests-first evidence.
  - Deps: 26, 27.
- [ ] 31. [verifier] Verify milestone against SPEC acceptance criteria (M14): `npm run check`, full `npm run e2e`, `npm run build` (1.16.0), iOS + watch simulator build, XCTests (GymWatchCore, GymHeadMotionCore, existing), task 27 evidence, the 390×844 screenshots and watch screenshots listed in SPEC, the 1.16.0 tour; evidence into Verification evidence → M14.
  - Deps: 30.
- [ ] 32. [main] merge + ask to push (his call). Install on his iPhone + watch (notify him when the phone must be plugged in).
  - Deps: 31.
- [ ] 33. 🧍 **Checkpoint L** (gym, watch + AirPods): per SPEC M14 Accept (incl. the first-workout Health sheet, a Save-off session = no workout but samples in Health, a Save-on session, and taps queued while out of range arriving via `transferUserInfo`); clips per the guide if task 28 hasn't happened. Feedback through the "Wrist and ears" to-do or `/feedback`.
  - Deps: 32.

**Later, not in M14:** starting a workout from the watch, a complication / Smart Stack widget, head-motion use during rest, more head-counted moves (after Checkpoint L data).

### M15 — Best-rep clips (planned 2026-11-17; release 1.17.0; builds AFTER M14)
**Contract:** SPEC "M15 — Best-rep clips" (Goals, Changes to earlier contracts, Privacy, Data model, Accept), CLAUDE.md Privacy hard rule (as updated 2026-11-17) and Decision "M15 Best-rep clips" (2026-11-17), which wins where it is more specific. **No network request.** Nothing unblurred is ever written to storage; the ring buffer is memory only. All logic **tests first** (Vitest, made-up data; the repo is public, so **no real clip or frame of him is ever committed**; e2e uses the synthetic fake-camera clip). UI tasks: props in / callbacks out, render tests + 390×844 harness screenshots, text ≥ 20px, targets ≥ 56px; nothing new spoken or shown mid-set except the recording dot.

**Do not start before** M14's verifier task (M14 task 31) has passed, except tasks 1 and 2 (paper / scratch page, no repo files), which may run any time. (M15-q1: he may ask for it in parallel with M14's watch track; then main re-plans the version numbers.)

**Branch:** `m15-best-rep-clips`, cut from the M14 result. Subagents never commit.

**Fit with the current code (skimmed 2026-11-17; re-check when M15 starts):** camera + MediaPipe in `src/pose/{camera,landmarker}.ts`; rep events from `src/core/repCounter.ts`, cues from the M5 focus/form modules (`src/core/focusScore.ts`, tempo T1); e1RM in `src/core/progress/e1rm.ts` (slice 1b); effort on `src/ui/screens/rest.ts`; camera switch on `src/ui/screens/preview.ts`; Summary `src/ui/screens/summary.ts`; local-only blobs precedent `src/data/progressPhotos/store.ts` + `LOCAL_ONLY_TABLES` in `src/data/backup.ts`; share precedent `src/ui/shareMonth.ts` (Web Share files / download) and M13's native share path; native bridge pattern `src/native/{health,speech}.ts` + `ios/App/App/Plugins/*`.

**Order / parallel groups:**
- **Any time:** 1 [pose] encoder/blur facts + spike ∥ 2 [ios] storage/share facts.
- **G0 (after M14 verify):** 3 [main] types; 4 [main] deps + gitignore + agent-file line (after 1, 2).
- **G1 (after 3), in parallel by owner:** core 5 → 6, 7 (∥ 5), 8; pose 9 → 10 → 11 (after 4, 5); ui 12, 13, 14, 15 (14 after 7); ios 16 (after 2, 3), 17 only if task 1 says so.
- **G2:** 18 [main] version 1.17.0 → 19 [main] wiring (after 6, 8, 11, 12–16).
- **G3:** 20 [ui] e2e ∥ 21 [ios] device/simulator evidence ∥ 22 [pose] fps evidence.
- **G4:** 23 reviewer → 24 verifier → 25 main merge + ask → 26 🧍 Checkpoint M → 27 [social-media] Story pack → 28 [core] tune triggers.

- [x] 1. [pose-engineer] Facts + scratch spike: encoder path and blur cost (paper + a scratch page outside the repo; findings to main for the Decision).
  - Check against current docs and measure: (a) **WebCodecs** `VideoEncoder`/`VideoDecoder` (H.264, keyframe control) and **MediaRecorder** (mp4/H.264, timeslices) in iOS Safari and in **WKWebView** (Capacitor app) on his iOS version; (b) a keyframe-aligned **ring buffer** of `EncodedVideoChunk`s (~8 s, keyframe every 1 s) vs MediaRecorder timeslices (can a slice be cut out and played on its own?); (c) an MP4 muxer library (licence, size, no network) for the export; (d) `PoseLandmarker` `outputSegmentationMasks` cost with `numPoses: 1` vs the separate selfie/multiclass `ImageSegmenter`, mask quality around arms and dumbbells; (e) pose-loop fps with the buffer armed, desktop Chromium + his iPhone (PWA) at 720p and 540p; (f) export time for a 6 s 1080×1920 clip with blur + overlay on his iPhone.
  - Done when: each item VERIFIED (doc link or measurement) or NOT VERIFIED, with a verdict: **path A** WebCodecs ring buffer / **path B** MediaRecorder / **path C** native encoder needed in the iPhone app (→ task 17), the chosen muxer, mask source, buffer resolution.
  - Deps: none (may run now).
- [x] 2. [ios-engineer] Facts: phone-only storage + share (paper; no repo files).
  - Check and link: where WKWebView keeps IndexedDB and whether it is in an iCloud device backup; `Application Support` + `URLResourceValues.isExcludedFromBackup`; `@capacitor/filesystem` vs a small `GymClips` plugin (exclusion flag, large-file writes without base64 round trips); sharing an MP4 file URL via `UIActivityViewController` (Instagram Stories / "Save Video" appear?); file protection class; storage-pressure behaviour.
  - Done when: each item VERIFIED / NOT VERIFIED with the chosen storage path for the iPhone app.
  - Deps: none (may run now).
- [ ] 3. [main] Shared types (no behaviour change).
  - Files: src/core/types.ts.
  - Per SPEC M15 data model: `ClipTrigger`, `ClipOverlay`, `ClipMeta`, `ClipSettings`, `ClipRules`, `RepWindow`, `ClipCandidate`; `AppRoute` + `'clips' | 'clip' | 'settings/clips'`.
  - Done when: `npm run check` passes; no runtime change.
  - Deps: M14 verified.
- [ ] 4. [main] Dependencies, gitignore, agent-file line.
  - Files: package.json (muxer per task 1; `@capacitor/filesystem` only if task 2 picks it), .gitignore (`story/clips/` for the Story pack's real clips), .claude/agents/pose-engineer.md ("Never record, store or upload frames" → the M15 exception, per CLAUDE.md Privacy).
  - Done when: `npm run check` + `npm run build` pass; `git check-ignore story/clips/x.mp4` matches.
  - Deps: 1, 2.
- [ ] 5. [core-engineer] Trigger rules as data + decider. Tests first.
  - Files: src/core/clips/rules.ts (data: lead-in ~1.5 s, tail ~0.5 s, clip 4–6 s, max 5 automatic per workout, priority `best` > `hard` > `form`, tempo bands from the M5 T1 numbers, buffer 8 s, fallback 540p/24 fps), src/core/clips/triggers.ts(+test).
  - `repWindow(repEvent)` → `RepWindow` clamped to 4–6 s; `isCleanRep(rep, cuesFired, rule)` (no cue, no partial, reached far threshold, tempo in band); `betterForm(a, b)`; `decideSet({ candidates, setLog, bests, effort?, manual? }, kept, rules)` → keep / replace / drop with trigger; cap + replacement; manual never counted toward the cap; warm-ups never trigger `best`.
  - Done when: tests cover each trigger, none firing, two triggers on one set (one clip, highest priority), cap full + higher priority replaces lowest, cap full + lower priority dropped, Hard tapped after the set, manual over cap, warm-up set; `npm run check`.
  - Deps: 3.
- [ ] 6. [core-engineer] Clip store + retention (Dexie). Tests first.
  - Files: src/data/db.ts (next version: `clips` meta + `clipBlobs`), src/data/backup.ts (both in `LOCAL_ONLY_TABLES`), src/data/clips/store.ts(+test) (`addClip(meta, blob | fileRef)`, `listClips`, `star`, `deleteClip`, `deleteAll`, `purgeExpired(now)` = 7 days unless starred, storage-backend interface so the iPhone app passes the native store from task 16).
  - Done when: round-trip tests (fake-indexeddb), purge edges (6 d 23 h kept, 7 d deleted, starred kept), backup export has no clip rows, restore leaves clips alone, delete removes blob/file via the backend; `npm run check`.
  - Deps: 3.
- [ ] 7. [core-engineer] Overlay layout + copy. Tests first.
  - Files: src/core/clips/overlay.ts(+test), src/core/clips/copy.ts(+test).
  - `overlayLayout(meta, unit, settings)` → text boxes for 1080×1920 inside the safe margins (data: top 250, bottom 340, sides 64); lines: exercise name, "40 kg × 8" (or none with Show weight off), "New best" / "Clean rep" / "Hard set" / nothing for manual, the mark. Copy for the Clips screen and Settings, incl. "Clips stay on this phone. Share sends a copy only where you pick. Choosing Save Video puts it in Photos, which may sync to iCloud." Every string passes `checkCopy`; no body/Health/HR/food numbers.
  - Done when: layout tests (all boxes inside the margins, long names wrap, lb unit) + copy tests; `npm run check`.
  - Deps: 3.
- [ ] 8. [core-engineer] Privacy exclusions + What's New 1.17.0 + to-do topic. Tests first.
  - Files: scan tests next to the brain-context builders (rules, Apple, Claude), src/core/todo/report.ts, the devlog writer, share stats (+tests) proving no clip field or id reaches them; src/data/whatsNew/pages.ts, src/data/todos/topics.ts (+ data tests).
  - Pages: Best-rep clips (opt-in, the dot), Blur + silent, Clips screen + Share to Story, "Stays on this phone". Topic "Best-rep clips (Checkpoint M)": ask steps per the SPEC checkpoint list.
  - Done when: exclusion tests + data tests (unique ids, valid routes, `checkCopy`) pass.
  - Deps: 3, 6.
- [ ] 9. [pose-engineer] Ring buffer + live encoder on the existing camera stream. Tests first where pure.
  - Files: src/pose/clips/ringBuffer.ts(+test), src/pose/clips/recorder.ts(+test with a fake encoder).
  - `arm(stream|video, rules)` / `disarm()`; encodes the camera frames the pose loop already gets (no second `getUserMedia`), keyframe every 1 s, keeps ~8 s; `snapshot(window)` → `ClipCandidate` (chunks from the keyframe before `start` to `end`, in memory); drop everything on disarm / hidden / leave; falls back to 540p/24 fps per rules when fps < 24.
  - Done when: unit tests (eviction at 8 s, keyframe-aligned snapshot, snapshot after eviction → null, disarm clears, nothing touches storage APIs) pass; `npm run check`.
  - Deps: 1, 3, 4, 5 (rules data).
- [ ] 10. [pose-engineer] Person blur (fail closed).
  - Files: src/pose/clips/blur.ts(+test), src/pose/landmarker.ts (mask option behind a flag, only while armed or exporting, per task 1).
  - `blurFrame(frame, mask | null, strength)` → canvas frame: tracked person sharp, rest blurred (Light/Medium/Strong radii as data from task 5's rules); **no mask → whole frame blurred**; mask edges feathered.
  - Done when: unit test for the fail-closed path; harness screenshot of a synthetic two-figure frame at each strength (second figure unreadable at Light); `npm run check`.
  - Deps: 1, 5, 9.
- [ ] 11. [pose-engineer] Export pipeline (runs during rest, off the pose loop).
  - Files: src/pose/clips/export.ts(+test).
  - `exportClip(candidate, { strength, sound, drawOverlay })` → MP4 `Blob` 1080×1920 H.264: decode → mask (re-run segmentation on the decoded frames or masks kept with the chunks, per task 1) → blur → `drawOverlay(ctx)` (from task 12) → encode → mux; cancellable when the next set starts; yields so the UI stays responsive.
  - Done when: a test exports a synthetic candidate to a playable 1080×1920 MP4 (duration within 4–6 s, no audio track by default); `npm run check`.
  - Deps: 9, 10.
- [ ] 12. [ui-engineer] Overlay painter.
  - Files: src/ui/clips/overlayPainter.ts(+test).
  - Draws task 7's layout on a 1080×1920 canvas: tokens, the brand mark (original, from M13), text with a dark scrim for legibility.
  - Done when: render test + a 1080×1920 PNG of the overlay on a grey frame (screenshot), boxes inside the margins.
  - Deps: 7.
- [ ] 13. [ui-engineer] Arm switch, recording dot, "Save last rep".
  - Files: src/ui/screens/preview.ts(+test) ("Record best reps" switch, off each workout, one line "Clips stay on this phone. Others are blurred."), the camera screen module under src/ui (dot + "Clips" text while armed, top corner, not over the count), src/ui/screens/rest.ts(+test) ("Save last rep" ≥ 56px, "Saved" state; shown only when armed and a candidate exists).
  - Done when: render tests (off by default, dot only when armed, Save last rep hidden when not armed); 390×844 screenshots of preview, camera with the dot, Rest with the button.
  - Deps: 3.
- [ ] 14. [ui-engineer] Clips screen + clip detail + Summary card.
  - Files: src/ui/screens/clips.ts(+test), src/ui/screens/clip.ts(+test), src/ui/screens/summary.ts(+test), a css file.
  - List newest first (thumbnail, exercise, date, trigger label, star, "Deletes in N days" unless starred); detail: player (muted, loop), Star, Delete (confirm), **Share**, the Save Video / iCloud Photos line; empty state; Summary card "2 clips saved" → Clips.
  - Done when: render tests (empty, list, starred, expiring); 390×844 screenshots of list, detail, Summary card.
  - Deps: 3, 7.
- [ ] 15. [ui-engineer] Settings → Clips.
  - Files: src/ui/screens/clipSettings.ts(+test).
  - Blur Light / Medium / Strong (no off), Sound (off; first on → `onRequestMic`), Show weight (on), what is kept and for how long, "Delete all clips" (confirm).
  - Done when: render tests per state; 390×844 screenshot.
  - Deps: 3.
- [ ] 16. [ios-engineer] Native clip storage + share.
  - Files: per task 2: ios/App/App/Plugins/GymClips/** (+ `GymClipsCore` XCTests) or `@capacitor/filesystem` use, src/native/clips.ts(+test) implementing task 6's backend (write to `Application Support/Clips` with `isExcludedFromBackup`, read URL for playback, delete, list, `share(fileRef)` via `UIActivityViewController`). Behind `isNative()` + plugin check; errors → "Couldn't save the clip." and nothing kept.
  - Done when: XCTests (exclusion flag set on every written file, delete removes the file) + bridge tests with a fake; simulator build.
  - Deps: 2, 3, 6.
- [ ] 17. [ios-engineer] (Only if task 1 says path C) Native encoder fed by the web view.
  - Files: ios/App/App/Plugins/GymClipEncoder/**, src/native/clipEncoder.ts(+test); same `recorder.ts` interface so wiring doesn't change.
  - Done when: XCTests + simulator run at ≥ 24 fps pose loop on the fake stream; else marked "not needed" with task 1's verdict.
  - Deps: 1, 9.
- [ ] 18. [main] Version 1.17.0.
  - Files: package.json (`version`), via `scripts/sync-ios-version.mjs` for iOS + watch targets.
  - Done when: `npm run build` shows 1.17.0; the sync script reports 1.17.0.
  - Deps: 8.
- [ ] 19. [main] Wiring.
  - Files: src/ui/app.ts, src/main.ts.
  - Arm switch → `recorder.arm` on the pose stream; rep events → `repWindow` → last-rep / best-form candidates; SET_DONE + bests → `decideSet`; effort Hard on Rest → re-decide; "Save last rep" → manual; kept → `exportClip` during rest → store (Dexie or native backend) → Summary count; next set / Finish / hidden → drop candidates + cancel export; `purgeExpired` on launch and on opening Clips; routes `clips`, `clip`, `settings/clips`; share via the M13 share helper with the MP4 file.
  - Done when: `npm run check`; manual 390×844 run with the fake camera: arm → reps → a clip appears on Clips and plays; disarmed run creates nothing.
  - Deps: 5, 6, 8, 11, 12, 13, 14, 15, 16 (17 if built).
- [ ] 20. [ui-engineer] E2E with the fake camera.
  - Files: e2e/clips.spec.ts, e2e helpers (fake native `GymClips`, stubbed `navigator.share`), any existing spec whose preview/Rest selectors moved.
  - Covers the SPEC M15 E2E list; every spec asserts no off-device request.
  - Done when: passes 3× in a row; full `npm run e2e` green.
  - Deps: 19.
- [ ] 21. [ios-engineer] Simulator / device evidence: a kept clip's file is in Application Support/Clips with the backup-exclusion flag, plays in the app, Share opens the share sheet with the MP4; nothing written to Photos. Notes + screenshots for the verifier.
  - Deps: 19.
- [ ] 22. [pose-engineer] fps evidence: pose-loop fps with the recorder armed vs off on the fake-camera run, and on his iPhone (PWA or app, installed by main; notify him if the phone must be plugged in); export time per clip. Numbers into the PR notes.
  - Done when: armed ≥ 24 fps on both, or the 540p fallback is shown to restore it.
  - Deps: 19.
- [ ] 23. [reviewer] Review the M15 diff: off by default every workout; dot + text while armed; one camera stream; ring buffer memory-only and dropped on disarm/hidden/leave; nothing unblurred written; blur fails closed, no zero strength; no audio unless switched on; clips only in `LOCAL_ONLY_TABLES` / excluded native files; absent from backup, dev log, copy report, brain/Claude contexts, share stats; no network request; no Photos write by the app; triggers + thresholds as data; ownership; tests-first evidence; no real clip or frame in the repo.
  - Deps: 20, 21, 22.
- [ ] 24. [verifier] Verify milestone against SPEC acceptance criteria (M15): `npm run check`, full `npm run e2e`, `npm run build` (1.17.0), iOS simulator build + XCTests, tasks 21–22 evidence, the 390×844 screenshots and the 1080×1920 export frame listed in SPEC, the 1.17.0 tour; evidence into Verification evidence → M15.
  - Deps: 23.
- [ ] 25. [main] merge + ask to push (his call). Install on his iPhone (notify him when the phone must be plugged in).
  - Deps: 24.
- [ ] 26. 🧍 **Checkpoint M** (gym): per SPEC M15 Accept: a workout with clips on, blur checked on the people behind him, one clip shared to a private Story or Close Friends. Feedback through the "Best-rep clips" to-do or `/feedback`.
  - Deps: 25.
- [ ] 27. [social-media] Story pack template from clips **he picks** (nothing posted).
  - Output: a Story sequence (order, captions, cover frame, text inside the safe margins) using his clips copied by him into the gitignored `story/clips/`; only the template/captions may be committed, never a clip or a frame of him. Main dispatches the user-level `social-media` agent.
  - Done when: he has the pack on his Mac and says whether he'd post it.
  - Deps: 26.
- [ ] 28. [core-engineer] Tune trigger rules from Checkpoint M feedback (too many / too few / wrong reps). Tests first (new cases from his dev-log numbers, never clips).
  - Files: src/core/clips/rules.ts(+tests). Thresholds change as data only; Decision line with before/after.
  - Deps: 26.

**Later, not in M15:** a spoken "save that" during sets (needs the mic in workouts, M15-q2), trimming/editing clips in the app, multi-clip Reels, music, saving to Photos by the app.

### M12 — slice 1c: What's New tour + To-do guides + one copy report (planned 2026-11-16)
**Contract:** SPEC "M12" → "What's New tour + To-do guides (slice 1c)" + slice 1c Accept, the approved section "Slice 1c" of `docs/superpowers/specs/2026-11-16-coach-tab-chat-design.md`, and Decision "M12 slice 1c (his yes, 2026-11-16)", which wins where it is more specific. **No network** (the report leaves only through the clipboard on his tap), no new plugin, no new permission. All logic is **tests first** (Vitest, made-up data only; the repo is public). UI tasks are props in / callbacks out with render tests + 390×844 harness screenshots, tokens + motion helpers from slice 1 task 8, text ≥ 20px, targets ≥ 56px, nothing shown or spoken during a set.

**Branch:** `m12-coach-tab`, starting after slice 1 task 20 (verifier PASS). Slice 1 task 21 (merge) waits for 1c so the first launch of the merged app shows the 1.12.0 tour describing slice 1 (main asks him; M12-q5). Subagents never commit.

**Fit with the current code:**
- `__APP_VERSION__` (vite.config.ts `appVersion()`) is git sha + build time, so it changes every build: fine as the per-build id for the re-sign clock, wrong as the tour key. The tour key is a new `__APP_RELEASE__` from `package.json` `version` (now `0.0.0` → `1.12.0`, version policy in Decision "M12 slice 1c"), and the shown build is a new `__APP_BUILD__` (short sha). Settings has no About section yet (task 2b adds it at the bottom).
- Dexie is at **version 8** (slice 1 `chatMessages`), so `todoAnswers` is **version 9**; slice 1b's new tables move to v10 (or fold into v9 if 1c hasn't shipped). `src/data/backup.ts` table-list test must list `todoAnswers` as backed up.
- Signals available today: `chatMessages` (role `user`), `planChanges` (action + undone), `healthDays` + `settings 'health'`, `foodModels` ('food'), `foodEntries.source` (`photo-local` / `photo-ai`), sessions + sets (`SetLog.focusScore` is set only on camera sets; core-engineer confirms), the M10e swap in `trainer` / `planChanges`. Not available yet: "Calendar opened after a training day" (main records `settings 'todoSignals'` on Calendar open) and a reliable hands-free marker (core-engineer looks in the devlog tables; if none, topic 5's auto step becomes an ask step and the Decision is updated).
- Routing: `View` union in `src/ui/app.ts` (screens `today`, `coach`, `calendar`, `settings`, `healthSettings`, `myGym`, `planChanges`, …); new screens `todos`, `todoTopic` and a tour overlay are main's wiring. Settings rows live in `src/ui/screens/settings.ts`; the Today card slot in `src/ui/screens/today.ts`.
- E2E fresh profiles have no sessions → no tour (fresh-install rule). Specs that seed sessions would see it, so the shared helpers mark the tour seen by default (task 13). Another agent is editing `e2e/app.helpers.ts` right now for slice 1 task 17: task 13 starts only after that lands.

**Order / parallel groups:**
- **G0:** 1 ∥ 2 [main].
- **G1 (after 1):** 3 ∥ 4 ∥ 5 ∥ 6 ∥ 7 [core-engineer] and 8 ∥ 9 ∥ 10 ∥ 11 [ui-engineer]. (3 also after 2 only for `release` strings; it may use the literal `'1.12.0'`.) **2b** [ui] after 2.
- **G2:** 12 [main] after 2–11 and 2b.
- **G3:** 13 [ui] after 12 (and after slice 1 task 17's helper edits) → 14 [ui] after 13.
- **G4:** 15 reviewer → 16 verifier → 17 main merge + ask to push → 18 (no 🧍 checkpoint of its own; his first pasted report goes through `/feedback`).

- [x] 1. [main] Shared types (no behaviour change).
  - Files: src/core/types.ts.
  - Adds per SPEC slice 1c data model: `AppRoute`, `TodoPlatform`, `TodoDetectorId`, `TodoOption`, `TodoStep`, `TodoTopic`, `TodoAnswer`, `TodoFacts`, `DetectorResult`, `WhatsNewPage`, and the settings shapes `WhatsNewState`, `TodoSettings`, `TodoSignals`, plus the decision-setting targets `coach.appleCardReasons?: boolean`, `coach.claudeWanted?: 'yes' | 'later' | 'no'`, `TrainerKitSettings` (measurement sites, e1RM formula, warm-up rule, review weeks; defaults from M12-q4), `signing?: 'free' | 'paid'`.
  - Done when: `npm run check` passes; no runtime change.
  - Deps: none.
- [x] 2. [main] Version in the build (= the tour key).
  - Files: package.json (`"version": "1.12.0"`), vite.config.ts (`define.__APP_RELEASE__` = package.json version read at build time, `define.__APP_BUILD__` = short git sha, `"unknown"` outside git; both also defined for Vitest), src/vite-env.d.ts, src/core/version.ts(+test) (`versionLabel(release, build)` → "Version 1.12.0 (build abc1234)", `CREDIT = '© 2026 Wongsaton Kampusan'`), **tests first** for `versionLabel`.
  - Done when: `npm run check` passes (incl. a test that `__APP_RELEASE__` equals package.json `version` and the label format); `npm run build` output contains `1.12.0`; `__APP_VERSION__` unchanged.
  - Deps: none.
- [x] 2b. [ui-engineer] Settings → About + version on the tour's first page.
  - Files: src/ui/screens/settings.ts(+test) (small About section at the very bottom: "Gym Clean", the version label, the credit line "© 2026 Wongsaton Kampusan"; no links), src/ui/todo/whatsNewTour.ts (first page shows the version label; coordinate with task 8, same owner).
  - Done when: render tests (About shows label + credit, it is the last section; tour page 1 shows the label) + 390×844 screenshot of Settings → About.
  - Deps: 2 (and 8 for the tour part).
- [x] 3. [core-engineer] Topic + What's New page data, **tests first**.
  - Files: src/data/todos/topics.ts(+test), src/data/whatsNew/pages.ts(+test).
  - The 12 initial topics exactly as the SPEC table (ids, checkpoint names, platform, auto detectors + params as data: 3 native sessions, 7 Health days, 2 coach changes, 6 camera sets, 3 learning exercises, 7 photo-meal days, re-sign warn at ≤ 2 days), ask options, decision `setting` maps (topics 9–12), `since: '1.12.0'`. Pages for `1.12.0`: Coach tab (centre, chat), focus blocks, Calendar + scores + Share month, missed-day + recaps, motion, To-dos (≈ 6 pages, each `what` + `why` ≤ 2 short sentences, Try it route).
  - Done when tests cover: unique ids; every detector id is in `TodoDetectorId` and the task 4 registry; every Try it is a known `AppRoute`; every string passes `checkCopy`; the 12 topics ↔ checkpoints I, H, G, E, B3, C+F1, D + VeSync + M12-q1, M12-q4, Claude, re-sign; decision maps only touch their own setting key.
  - Deps: 1.
- [x] 4. [core-engineer] Detectors + topic progress, **tests first**.
  - Files: src/core/todo/detectors.ts(+test), src/core/todo/progress.ts(+test).
  - `detectors: Record<TodoDetectorId, (facts: TodoFacts, params) => DetectorResult>` (pure, counts/flags only); `topicStatus(topic, answers, facts)` → `{ done, skipped, stepsDone, steps, nextStepId }` (stored auto ticks stay ticked; recurring topics follow their detector); `todoSummary(topics, answers, facts)` → `{ done, total, visible }` with native-only topics excluded on `web`; `pendingAutoTicks(…)` → steps newly met (for the store to record).
  - Done when tests cover every detector at its boundary on web and native facts (incl. re-sign 3 vs 2 days across a DST change), progress (auto + ask, skip, recurring, platform filter), the "6 of 12" summary and the all-done hide.
  - Deps: 1.
- [x] 5. [core-engineer] Tour selection + re-sign clock, **tests first**.
  - Files: src/core/todo/whatsNew.ts(+test).
  - `tourToShow(pages, state, current, hasData)` → pages (unseen releases, newest first) or `{ markSeen: true }` for a fresh install; `replayPages(pages, current)`; `addedTopics(topics, releases)` for the last page; `resignDaysLeft(buildFirstSeenAt, now)` (7-day window, local days).
  - Done when tests cover: unseen → pages; seen → none; fresh install → mark seen, none; two unseen releases → both newest first; release without pages → none; replay; re-sign math incl. DST.
  - Deps: 1.
- [x] 6. [core-engineer] Report builder, **tests first**.
  - Files: src/core/todo/report.ts(+test).
  - `buildReport({ topics, answers, facts, release, build, platform, now, all? })` → `{ text, answerIds }`: plain text, header (app, "Version 1.12.0 (build abc1234)", PWA / iPhone app, date; **not** his name), one block per topic with checkpoint name, ask answers as option labels + notes, auto ticks as "done (date)" or counts ("Health data on 7 of 7 days"), skipped topics; only unsent unless `all`. `redactNote(note)` replaces key-like strings (`sk-ant-…`, long base64/hex tokens) with "[key removed]".
  - Done when tests cover: since-last-copy filtering; `all`; grouping/format snapshot; skipped topics; and the **never-contains** test: seeded facts/answers holding Health values, a photo data URL, a key in a note, chat message text and food/body numbers → none appear in `text` (search the output).
  - Deps: 1.
- [x] 7. [core-engineer] Store, Dexie **version 9**, facts gatherer, **tests first**.
  - Files: src/data/db.ts(+test), src/data/todos/store.ts(+test), src/data/todos/facts.ts(+test), src/data/backup.ts(+test).
  - `todoAnswers: 'id, topicId, at, sentAt'` (new table, no upgrade function; backed up). Store: `saveAnswer`, `recordAutoTicks`, `skipTopic`, `listAnswers`, `markSent(ids, at)`, `applyDecision(step, optionId)` (writes only the mapped `settings` key/path), `getWhatsNew` / `markSeen(release)`, `noteBuildSeen(buildId, now)` (first time only), `noteSignal('calendarAfterSession', now)` (only when a finished session exists that day). `gatherFacts(db, platform, now)` → `TodoFacts` with counts/flags only (chat user messages, proposal outcomes, coach changes by action, Health connected + days with data in the last 7, sessions since the native first launch, camera sets per session, learning-exercise camera sets, Legs B swap session, food model present, photo-meal days, build first-seen); hands-free marker per "Fit" note.
  - Done when tests cover: v8 → v9 keeps every row; round trips; mark sent; `applyDecision` touches only its setting; `todoAnswers` in the backup table list and a restore round trip; nothing from it in the dev-log export; `noteBuildSeen` once per id; `gatherFacts` on a made-up db returns no raw values (shape test: numbers are counts, no strings from rows).
  - Deps: 1.
- [x] 8. [ui-engineer] What's New tour.
  - Files: src/ui/todo/whatsNewTour.ts(+test), src/ui/todo/todo.css.
  - Props: `pages`, `addedTopics`, callbacks `onTryIt(route)`, `onSkip`, `onDone`, `onOpenTodos`. Full-screen dialog (`role="dialog"`, focus trapped, Esc = Skip), Skip always visible, Back / Next ≥ 56px, swipe as a shortcut, page dots + "2 of 6" text, last page "Added to your to-dos" with the topic list + Open to-dos. Page change = transform/opacity slide via the motion helpers; instant under reduced motion. Original icons only.
  - Done when: render tests (keyboard Next/Back/Esc, Skip on every page, last page, Try it callback, reduced motion → no animation class) + 390×844 screenshots (a page, the last page) in the 3 accents.
  - Deps: 1.
- [x] 9. [ui-engineer] Today to-do card, to-do list, Settings rows.
  - Files: src/ui/todo/todoCard.ts(+test), src/ui/todo/todoList.ts(+test), src/ui/screens/today.ts(+test) (slot below the Start card), src/ui/screens/settings.ts(+test) ("What's new" + "To-dos" rows).
  - Card: "To-dos: 6 of 12 done" + the next topic title + a re-sign line when ≤ 2 days left; ≥ 56px; absent when `summary.visible` is false. List: rows per topic (title, checkpoint, "3 of 5" / Done / Skipped; native-only labelled "In the iPhone app" on web), the Copy report button at the bottom.
  - Done when: render tests (counts, hidden when all done, native label, re-sign line, Settings rows) + 390×844 screenshots (Today with the card, the list).
  - Deps: 1.
- [x] 10. [ui-engineer] Topic guide (one step per screen).
  - Files: src/ui/todo/todoGuide.ts(+test).
  - Props: topic, status, answers, detector results; callbacks answer(stepId, optionIds, note), tryIt(route), skipTopic, back/next/close. Auto step: ticked / "2 of 3 sessions" + Try it; ask step: option buttons (radio or checkbox semantics, ≥ 56px, selection not colour alone) + optional note (≤ 500 chars, counter); decision step shows what the setting will be; "Step 2 of 5"; Skip this topic (two taps).
  - Done when: render tests (each step kind, multi-select, note limit, decision preview, skip confirm, keyboard) + 390×844 screenshots (auto ticked and not, ask with a note, decision).
  - Deps: 1.
- [x] 11. [ui-engineer] Report preview + copy.
  - Files: src/ui/todo/reportSheet.ts(+test), src/ui/todo/clipboard.ts(+test).
  - Sheet with the report text (scrollable, ≥ 20px), Copy (≥ 56px), "Nothing new since your last copy" + Copy all again, success line "Copied. Paste it where you want."; `copyText` uses `navigator.clipboard.writeText`, fallback a selected read-only textarea + "Select all and copy". No network.
  - Done when: render tests (preview, empty state, success, fallback with a stubbed clipboard failure) + 390×844 screenshot of the preview.
  - Deps: 1.
- [x] 12. [main] Wiring.
  - Files: src/ui/app.ts, src/main.ts.
  - Screens `todos` and `todoTopic`; the tour overlay on app open/foreground on Today only (never in a session or on the camera) via `tourToShow` (fresh install → `markSeen`); Settings → What's new → replay; Try it → route (closing the tour/guide); facts gathered on open, foreground and on entering To-dos (`gatherFacts` → `pendingAutoTicks` → `recordAutoTicks`); ask/decision answers through the store (`applyDecision` then re-render); Copy report → `buildReport` → sheet → on success `markSent`; Calendar open records `noteSignal`; main.ts calls `noteBuildSeen(__APP_VERSION__)` in the native app; Today gets the card props. Dev log: nothing from to-dos.
  - Done when: `npm run check` passes; manual run at 390×844 with seeded data shows the tour once, the card, a guide and the report preview; no network request.
  - Deps: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11.
- [x] 13. [ui-engineer] E2E helpers: mark the tour seen by default.
  - Files: e2e/app.helpers.ts (+ e2e/workout.helpers.ts if it seeds separately). A `whatsNewSeen` seed option, default = current release; existing specs unchanged otherwise.
  - Done when: full `npm run e2e` green with the 1c build (the Today card below Start moves nothing the existing specs assert).
  - Deps: 12, and slice 1 task 17 landed (another agent is editing these helpers now).
- [x] 14. [ui-engineer] New e2e specs (390×844).
  - Files: e2e/whats-new.spec.ts (tour once per release with an older `seenRelease` + a session, Next/Back, Try it, reload → none, Skip → none, Settings replay, fresh profile → none, `reducedMotion: 'reduce'` → no animation, first page shows the package.json version; Settings → About shows the same version label and "© 2026 Wongsaton Kampusan"), e2e/todos.spec.ts (card → list → topic; auto tick after seeding a chat question; ask steps + note survive reload; a decision step changes its setting; Copy report → preview → copy with clipboard permissions, text read back has the answers and the version in its header, and no seeded Health value / key / his name; marked sent → next report only newer; native-only label on web; card hides when all done; nothing during a set). Every spec asserts no off-device request.
  - Done when: each passes 3× in a row; full e2e green.
  - Deps: 13.
- [x] 15. [reviewer] Review the slice 1c diff: privacy (no network; report never has Health values, photos, keys, chat text; nothing in the dev log; `todoAnswers` backed up, nothing local-only leaked), copy rules (`checkCopy`), data-not-branches (topics/pages/detector params as data), ownership, tests-first evidence, motion via helpers and off under reduced motion, nothing new mid-set.
  - Deps: 14.
- [x] 16. [verifier] Verify milestone against SPEC acceptance criteria (M12 slice 1c): `npm run check`, full `npm run e2e`, `npm run build` (contains `1.12.0`); 390×844 screenshots listed in SPEC (tour first page with the version, "Added to your to-dos", Today card, list, auto step ticked/not, ask with note, decision, report preview, Settings → About with version + "© 2026 Wongsaton Kampusan") via `scripts/screenshots.mjs`; evidence into Verification evidence → M12 slice 1c.
  - Deps: 15.
- [ ] 17. [main] merge + ask to push (slice 1 + 1c together if he agrees, M12-q5; after M11 per slice 1 task 21).
  - Deps: 16.
- [ ] 18. No 🧍 checkpoint of its own (SPEC): the to-dos are his open checkpoints. When he pastes his first report, main runs `/feedback` with it (planner records answers as Decisions).

### M12 — slice 1: Coach tab, chat, focus blocks, Calendar, motion (planned 2026-11-16)
**Contract:** SPEC "M12 — Coach tab" slice 1 Accept, the approved design `docs/superpowers/specs/2026-11-16-coach-tab-chat-design.md`, and the Decision "M12 plan" (2026-11-16), which wins where it is more specific. **Rule brain only** — no network, no new plugin, no new permission. All logic is **tests first** (Vitest, made-up data only; the repo is public). UI tasks are props in / callbacks out with render tests + 390×844 harness screenshots, tokens only, text ≥ 20px, targets ≥ 56px.

**Branch:** `m12-coach-tab` (already has M11, which isn't merged yet: M11 task 14 merges first, or both merge together — main asks him). Subagents never commit.

**Fit with the current code (why the plan looks like this):**
- The M10 coach lives in `src/ui/coach/coachSheet.ts` (sheet, `CoachItem[]` in memory) driven by `openCoach(phase, first?)` in `src/ui/app.ts`, with the pure controller `handle()` in `src/core/trainer/coach.ts` and phrases in `src/core/trainer/phrases.json`. Food answers (`suggestFood`) already exist, so slice 1 only adds free-text "tonight" phrasing and the week / progress / focus-block intents.
- The tab bar is `src/ui/tabBar.ts` (`TabId = 'today' | 'fuel' | 'history' | 'settings'`, class `tabbar-4`). History is `src/ui/screens/history.ts` (per-exercise); it stays as the deeper level under Calendar.
- The calendar projection is `project()` / `calendar()` / `effectiveDay()` / `upNext()` in `src/core/trainer/plan.ts`; a focus block plugs in there, so Today, the preview, the week strip and Calendar all agree. TrainerState is one row in the `trainer` table, so `blocks` needs no Dexie change.
- Dexie is at **version 7** (M11 `healthDays`), so `chatMessages` is **version 8**. `src/data/backup.ts` has `LOCAL_ONLY_TABLES`; the table-list test fails until `chatMessages` is listed.
- Week start = `weekStartOf` in `src/core/stats.ts` (same as the Today week strip and streak).
- Motion: only a few ad-hoc transitions exist (`styles.css`, `coach.css`, `undoToast.ts`), each with its own reduced-motion rule; slice 1 replaces them with tokens.

**Order / parallel groups:**
- **G0:** 1 [main] ∥ 8 [ui] (motion tokens need no types).
- **G1 (after 1):** 2 ∥ 5 ∥ 7 [core] and 9 ∥ 10 ∥ 11 ∥ 12 ∥ 14 [ui] (9–12, 14 also after 8).
- **G2:** 3 [core] after 2; 13 [ui] after 12.
- **G3:** 4 [core] after 3.
- **G4:** 6 [core] after 3 + 4.
- **G5:** 15 [main] after 5, 6, 7, 9, 10, 11 → 16 [main] after 4, 12, 13, 14, 15 (both edit app.ts, so serial).
- **G6:** 17 ∥ 18 [ui] after 16.
- **G7:** 19 reviewer → 20 verifier → 21 main merge + ask to push → 22 🧍 Checkpoint I.

- [x] 1. [main] Shared types and the brain interface (no behaviour change).
  - Files: src/core/types.ts.
  - Adds (shapes per SPEC M12 "Data model"): `FocusGroup`, `FocusBlock`, `FocusBlockParams` (`{ group; weeks; weekdays; startDate }`), `TrainerState.blocks?: FocusBlock[]`, `ProposalAction` + `'focusBlock'`, `ChatCardStatus`, `ChatCard`, `ChatMessage`, `DayStatus`, `DayCompletion`, `PeriodScore`, `BrainSource` (`'chip' | 'rules' | 'apple' | 'claude'`), and the seam `CoachBrain = { id: BrainSource; status(): Promise<{ available: boolean; reason?: string }>; ask(text: string, ctx: BrainContext): Promise<BrainReply> }` with `BrainReply` = the `handle()` result plus `source`, `note?`, `usedHealth?`. `BrainContext` wraps the existing `CoachContext` + the last 8 turns.
  - If adding `'focusBlock'` breaks an exhaustive switch (e.g. Plan changes labels), main adds a placeholder case and notes it for the owning task.
  - Done when: `npm run check` passes; no runtime change.
  - Deps: none.
- [x] 2. [core-engineer] Focus-block builder, **tests first**.
  - Files: src/core/trainer/focusRules.ts (data: weekly-set increase 1.3–1.5× with the default 1.4, min focus days/week 2, per-session set cap, lighter last week = the M10 lighter rule, weeks 2–6, weekday counts 3–6), src/core/trainer/focusBlock.ts(+test).
  - `buildFocusBlock(state, catalog: TrainerCatalog, params)` → `FocusBlock`: his rotation days cycled over the chosen weekdays; focus-group exercises +1 set (up to the cap) and, if the group trains on < 2 days/week, a focus exercise added to the lightest days (catalog pick, primary muscle in the group, doable with the gym profile via M10e `catalog.canDo`, not already in the day, sets/reps/rest copied from the most similar exercise in his plan); other groups unchanged; last week lighter. `reviseFocusBlock(block, edit, …)` for `{ swap: { date | weekday, exerciseId, toId? } }`, `{ daysPerWeek: n }`, `{ weeks: n }`.
  - Done when tests cover: focus weekly sets within +30–50% and on ≥ 2 days/week for chest, back, arms, legs; other groups' weekly sets unchanged; last week lighter; 2 and 6 weeks; 3–6 weekdays; a mid-week start; no exercise the default gym profile can't do; each revision; same input → identical block.
  - Deps: 1.
- [x] 3. [core-engineer] Focus blocks in the plan + the proposal, **tests first**.
  - Files: src/core/trainer/plan.ts(+test), src/core/trainer/actions/focusBlock.ts(+test), src/core/trainer/actions/postpone.ts(+test) (only if block days need it), src/core/trainer/changes.test.ts.
  - `project()` uses a block's dated day on its dates (rest on its non-training dates); dated overrides still win on a block date (lighter / not today / swap apply to the block day); the rotation pointer is frozen during the block and resumes after its last date from the last finished non-block session (Decision "M12 plan" call). `proposeFocusBlock(ctx, params | block)` → Proposal `action 'focusBlock'`, `scope 'dated'`, lines one per week ("Week 1: 5 days, chest 14 → 20 sets"), why, `say` ≤ 8 words; replaces an overlapping block. Not offered mid-workout.
  - Done when tests cover: Apply → `calendar()`/`effectiveDay()`/`upNext()` show block days → Undo (LIFO) restores; the rotation after the block; Not today and Lighter on a block day; a block starting today with today already done; stale `baseVersion` rejected; every reply passes `checkCopy`.
  - Deps: 2.
- [x] 4. [core-engineer] Completion, scores, missed day, recaps, **tests first**.
  - Files: src/core/progress/completion.ts(+test), src/core/progress/recap.ts(+test), src/core/progress/fixtures/*.json (made-up).
  - `dayCompletion(state, sessions, sets, date)` → `DayCompletion` (planned = the projected day for that date incl. block + adjust override; done = sets logged in finished sessions that started that local date; per exercise done / partial / missed against planned sets; a session on a rest date → `extra`; future → `planned`); `monthCompletion(…, month)`; `periodScore(…, from, to)` → `PeriodScore` incl. focus sets vs `targetSetsPerWeek`; `missedDay(…, today, answered)` → the most recent missed planned date in the last 7 days not yet answered, or null; `recapDue(…, today, lastRecap)` → a week recap (after the week ends) and a block recap (after a block's last date), each with text that passes `checkCopy`.
  - Done when tests cover the SPEC slice 1 completion bullets (done / partial / missed / rest / extra; week + month scores; focus sets; a session past midnight counts on its start date; lighter / deload days use the adjusted planned sets; DST weeks; empty history) and the recap/missed-day rules (once each).
  - Deps: 3.
- [x] 5. [core-engineer] Chat store, Dexie **version 8**, **tests first**.
  - Files: src/data/db.ts(+test), src/data/chat/store.ts(+test), src/data/backup.ts(+test).
  - `chatMessages: '++id, createdAt'` (new table, no upgrade function). `addMessage`, `updateCard(id, patch)`, `listThread(now)` (last 30 days, oldest first), `pruneChat(now)`, `clearChat()`. `chatMessages` goes on `LOCAL_ONLY_TABLES` (not in backups; a restore leaves it alone). Coach UI state (missed-day answered dates, last recap) lives in `settings` key `'coach'` (backed up; no message text).
  - Done when tests cover: v7 → v8 keeps every row; round trip; 30-day pruning; Clear chat; the backup table-list test; no `chatMessages` in the dev-log export.
  - Deps: 1.
- [x] 6. [core-engineer] Rule answers and intents, **tests first**.
  - Files: src/core/trainer/phrases.json, src/core/trainer/intents.ts(+test), src/core/trainer/coach.ts(+test), src/core/trainer/replies.ts(+test), src/core/trainer/evals/requests.json (+ the eval test).
  - New intents: `week` ("how's my week", "this week"), `progress` ("how am I doing", "am I on track"), `focusBlock` (slots: group from body-area words, weeks: number or "this month" = 4, weekdays count), `focusEdit` ("swap Thursday's flyes", "only 4 days a week"); food free text incl. "tonight". `handle()` answers: week → this week's sessions done / planned + % sets + the next training day (gym sessions only; no Health values, M11 Decision (8)); progress → week + month scores, streak, focus-block progress; focus block → asks only what's missing with chips (group → weeks 2–6 → "Keep my days" / 3 / 4 / 5 / 6 days) then the task 3 proposal; focus edits → a revised proposal. New quick chip `focusBlock` ("Build a focus block") and the starter ids.
  - Done when: eval set gains ≥ 20 made-up items for these intents; rule-supported items ≥ 90% right and 100% safety flags still; every new reply passes `checkCopy`; numbers in week/progress replies equal task 4's scores (test).
  - Deps: 3, 4.
- [x] 7. [core-engineer] The brain router (the seam slices 2/3 plug into), **tests first**.
  - Files: src/data/brain/router.ts(+test), src/data/brain/rules.ts(+test).
  - `rulesBrain` wraps `handle()`; `createRouter(brains: CoachBrain[])` → `ask(input, ctx)`: chips → rules always; free text → the first brain whose `status()` is available, falling to the next on error/timeout with a one-line `note`, ending at rules; `status()` lists each brain + reason for Settings. Slice 1 registers rules only. (Owner note: the router lives in `src/data/brain/**`, core-engineer's area and where M10 B5 put it; main owns the interface in task 1 and the wiring in task 15.)
  - Done when tests cover: chips bypass; rules-only free text; a fake failing brain → rules + note; a fake unavailable brain → skipped with reason; replies keep `source`.
  - Deps: 1.
- [x] 8. [ui-engineer] Motion tokens + helpers, app-wide.
  - Files: src/styles.css, src/ui/motion.ts(+test), src/ui/tokens.ts(+test) (if tokens are mirrored there), src/ui/coach/undoToast.ts, src/ui/coach/coach.css.
  - Tokens `--dur-fast 120ms`, `--dur-base 220ms`, `--dur-slow 320ms`, `--ease-standard`, `--ease-spring`; one global `@media (prefers-reduced-motion: reduce)` that zeroes durations/animations; press scale 0.97 + highlight on buttons/chips; sheets slide up + backdrop fade; Undo toast slides up. `motion.ts`: `reducedMotion()`, `enterScreen(el, dir)` (fade + 8px slide), `staggerIn(els)`, `countUp(el, to)`, `checkMorph(btn)`, `ringFill(el, pct)` — each a no-op / final value under reduced motion. Transform/opacity only. Screens marked `data-motion="off"` (Exercise, camera) get none of the new motion.
  - Done when: unit tests for each helper with reduced motion on/off (fake timers, stubbed `matchMedia`); render tests show no new animation class on the Exercise screen; existing reduced-motion rules folded into the global one.
  - Deps: none.
- [x] 9. [ui-engineer] Tab bar: 5 tabs with a centre Coach.
  - Files: src/ui/tabBar.ts(+test), src/ui/icons.ts(+test) (a chat icon, a calendar icon if missing; original art), src/styles.css.
  - `TabId = 'today' | 'fuel' | 'coach' | 'calendar' | 'settings'` in that order; Coach raised/filled, still ≥ 56px with a visible label; active = indicator + `aria-current` (not colour alone); the indicator slides with `--dur-base` (instant under reduced motion). At 390px every tab ≥ 56px wide.
  - Main applies the `'history'` → `'calendar'` rename in app.ts when integrating this task so `npm run check` stays green.
  - Done when: render tests (order, labels, aria-current, widths) + 390×844 screenshot in the 3 accents.
  - Deps: 1, 8.
- [x] 10. [ui-engineer] Chat component (tab + compact sheet variants).
  - Files: src/ui/coach/chat.ts(+test), src/ui/coach/chat.css; reuses proposalCard.ts / foodCard.ts (edit only to add the applied/undone/expired states and the check morph).
  - Props: `messages: ChatMessage[]`, `variant: 'tab' | 'sheet'`, `typing`, `chips`, `followUps`, `showAreas`, `allowTyping`, `inWorkout`; callbacks: send text, chip, area, apply / dismiss / undo / ask-again by message id, log food, clear chat (two taps), close (sheet). Renders bubbles (≥ 20px, his right / coach left, `sr-only` speaker), cards by `card.kind`, a status line per old proposal, the starters on an empty thread, a typing indicator (3 dots, static under reduced motion), quick chips above the input, text box "Ask the coach" + Send, the privacy line "Stays on this phone.", auto-scroll to the newest; bubbles rise + fade in. Red flag → no chips/text box except its buttons (M10 rule). The e2e hooks of the old sheet are kept (`data-coach-chip`, `data-coach-area`, `data-coach-followup`, "Ask the coach", "Send").
  - Done when: render tests (each card kind and status, starters, red flag, sheet variant has a Close and the same thread) + 390×844 screenshots (empty, thread with proposal, applied with Undo, sheet variant).
  - Deps: 1, 8.
- [x] 11. [ui-engineer] Focus-block card.
  - Files: src/ui/coach/focusBlockCard.ts(+test), src/ui/coach/chat.css (its section only, coordinate with 10).
  - Week-by-week list (each a ≥ 56px expandable row: "Week 2 · 5 days · chest 20 sets"), a week expands to days, a day to exercises (sets × reps; focus exercises marked with a label, not colour alone; the lighter week labelled); Apply / Not now; then Applied + Undo; outcome states as task 10.
  - Done when: render tests (expand/collapse with keyboard, aria-expanded, statuses) + 390×844 screenshots collapsed and expanded.
  - Deps: 1, 8.
- [x] 12. [ui-engineer] Calendar tab screen + day detail.
  - Files: src/ui/screens/calendar.ts(+test), src/ui/screens/calendarDay.ts(+test), src/ui/screens/calendar.css.
  - Month grid (7 columns, Monday first like the week strip; prev / next month ≥ 56px), each day a ring by status (filled / partial arc / hollow / dim / outlined today; focus-block days with a mark) plus an accessible label ("Tue 18: done, 18 of 18 sets"); week + month score cards ("This week: 4 of 5 sessions, 92% of planned sets", focus sets vs target during a block, streak); "Share month" button. Day detail: per-exercise rows done / partly / missed with sets × reps done vs planned, actions Start (today) / Move / Do it today, and "History" per exercise (opens the existing exercise history). Numbers count up on first show (motion helper).
  - Done when: render tests for every day status and score, keyboard reachability, ≥ 56px targets + 390×844 screenshots (month, a day, scores).
  - Deps: 1, 8.
- [x] 13. [ui-engineer] Share month image (made on the phone).
  - Files: src/ui/shareMonth.ts(+test).
  - `shareMonthLayout(month, completion, scores)` (pure: rects, rings, text; no weights, no body or Health data) + `renderShareMonth()` to a canvas → PNG Blob; `shareMonth()` uses `navigator.share({ files })` when `canShare` allows, else a download link. No `fetch`, no new origin.
  - Done when: layout tests (content list has no weight/body fields) + an exported PNG at 1080×1350 saved under the screenshots folder by the harness.
  - Deps: 12.
- [x] 14. [ui-engineer] Today + rest screen updates.
  - Files: src/ui/screens/today.ts(+test), src/ui/screens/readinessCard.ts, src/ui/screens/rest.ts(+test), src/styles.css.
  - Missed-day card ("You missed Push A on Tue." + **Move it** / **Skip it**, ≥ 56px; shown once; not on rest/exercise/camera); cards stagger in on first load; streak and kcal count up; readiness card slides in; Set done → a quick ring fill on the rest screen's set progress. The rep counter is unchanged.
  - Done when: render tests (missed card props in/out, reduced motion → final numbers) + 390×844 screenshot with the missed-day card.
  - Deps: 1, 8.
- [x] 15. [main] Wiring A: the Coach tab.
  - Files: src/ui/app.ts, src/main.ts (only if the router is created there).
  - The `coach` screen renders task 10 from `listThread`; text/chips go through the router (task 7) with the context; replies, cards and outcomes are saved (task 5); live Proposals are kept in memory by message id and Apply/Undo use changes.ts (Plan changes lines, `source` = chip/rules); a stored pending proposal whose `baseVersion` no longer matches shows "expired" + Ask again. `openCoach(phase, first?)` now switches to the Coach tab and sends `first` (Today Coach button, preview Coach button, readiness card, M10e gym prompt, Summary stall card). The Pause sheet renders the `sheet` variant on the same thread (workout chips only). Tab switches call `enterScreen` with the travel direction. Dev log: ids/numbers only.
  - Done when: `npm run check` + the existing coach/trainer e2e (with task 17's selector updates if already done, else run and list failures for 17) pass; no network request.
  - Deps: 5, 6, 7, 9, 10, 11.
- [x] 16. [main] Wiring B: Calendar, Today prompts, recaps.
  - Files: src/ui/app.ts.
  - The `calendar` tab replaces the `history` route (exercise history stays reachable from the day detail); data from task 4; day actions open the Coach tab with the matching chip (Move → notToday/move; Do it today → a dated override proposal through postpone "Move to"); Share month calls task 13. On app open/foreground: `missedDay` → Today's card once (answer stored in settings `'coach'`), `recapDue` → a coach message in the thread (once).
  - Done when: `npm run check` passes; manual run at 390×844 shows the Calendar and the missed-day card with seeded data.
  - Deps: 4, 12, 13, 14, 15.
- [x] 17. [ui-engineer] Update existing e2e specs for the new tab bar, Coach tab and Calendar.
  - Files: e2e/coach.spec.ts, e2e/trainer.spec.ts, e2e/equipment.spec.ts, e2e/health.spec.ts (coach dialog → Coach tab region; Pause sheet keeps the compact chat), e2e/history.spec.ts, e2e/history-flow.spec.ts, e2e/backup.spec.ts, e2e/fuel.spec.ts, e2e/food-photo.spec.ts, e2e/barcode.spec.ts, e2e/settings.spec.ts (History tab → Calendar → exercise history; tab count 4 → 5), e2e/layout-dock.spec.ts, e2e/m4e-theme.spec.ts (tab bar shape), e2e/workout.helpers.ts. Only selectors/flows change, never what a test proves.
  - Done when: each listed spec passes 3× in a row; full `npm run e2e` green.
  - Deps: 16.
- [x] 18. [ui-engineer] New e2e specs (390×844).
  - Files: e2e/coach-tab.spec.ts (5 tabs, centre Coach, starters → reply, Not today → Apply → Undo in thread, reload keeps thread, Clear chat, Today Coach button + readiness card open the tab with the chip sent, Pause-sheet chat, red flag, no text box during a set), e2e/focus-block.spec.ts ("This month I want to build my chest" → questions → card → expand → Apply → Calendar marks block days → Undo), e2e/calendar.spec.ts (seeded sessions → month rings → day detail per-exercise → exercise history; scores; missed-day card once; Share month makes a PNG via the download fallback), e2e/motion.spec.ts (`reducedMotion: 'reduce'` → no running animations/transitions on tab switch, sheet, chat; no new motion on the Exercise screen). Every spec asserts no off-device request.
  - Done when: each passes 3× in a row; full e2e green.
  - Deps: 16.
- [x] 19. [reviewer] Review the slice 1 diff: privacy (no network, no message text in dev log/backup, share image has no body data), copy rules (`checkCopy`, no medical words), ownership, tests-first evidence, motion only transform/opacity and off under reduced motion, nothing new mid-set.
  - Deps: 17, 18.
- [x] 20. [verifier] Verify milestone against SPEC acceptance criteria (M12 slice 1): `npm run check`, full `npm run e2e`, `npm run build`; 390×844 screenshots listed in SPEC (Coach empty / proposal / applied + Undo, focus card collapsed + expanded, Calendar month, day, scores, share image, Today missed-day card, Pause-sheet chat) via `scripts/screenshots.mjs`; evidence into Verification evidence → M12 slice 1.
  - Deps: 19.
- [ ] 21. [main] merge + ask to push (after M11 merges, or ask him to merge both).
  - Deps: 20.
- [ ] 22. 🧍 **Checkpoint I:** he uses the Coach tab and the Calendar for a few days (at least one question, one proposal applied or undone, a focus block looked at or applied, the Calendar after training). He reports what felt off, including the motion. Runs alongside / after Checkpoint H.

**Slices 1b and 2 are planned in detail above** ("M12 — slice 1b", "M12 — slice 2", 2026-11-17); the old K1–K12 outline is superseded and removed.

**Later slice (outline):**
- **Slice 3:** M10 phase C tasks C1–C4 plus the `usedHealth` drop and "Ask Claude instead" (needs his key; nothing calls Anthropic before).


### M11 — Health data: Apple Health + WHOOP (planned 2026-11-16; ANSWERED 2026-11-16, building on `m11-build`)
**Contract:** SPEC M11 (a PROPOSAL until M11-q1 is yes) and the Decision "M11 health data plan" (2026-11-16). Nothing below starts until he answers M11-q1–q8 (or says "go with the defaults"). Logic is **tests first** with made-up fixtures. 🧍 = needs his Mac / Xcode / iPhone / WHOOP app.

**Branch (when it starts):** `m11-health`, cut from `m9-native` (HealthKit needs the native shell; `m9-native` isn't on main yet). If M9 merges first, cut from main. Nothing is pushed without his OK.

**Fit with the current code (why the plan looks like this):**
- Weigh-ins are one row per date (`db.weighIns`, key `date`; `src/data/nutrition/store.ts` `putWeighIn` overwrites). So "typed wins" needs a `source` field and an import that skips dates with a manual row, plus a "deleted imports" list so a deleted import doesn't come back.
- M10 already has `proposeLighter`, `proposeDeload` (`src/core/trainer/actions/lighter.ts`) and `proposePostpone`. The card only **chooses** which proposal to open; no new Proposal action, no TrainerState change.
- `checkCopy` (`src/core/trainer/replies.ts`) is the copy gate; M11 adds its banned list as data next to it.
- Dexie is at version 5. `healthDays` is a new table → version 6. B1's test fails if a table isn't in `BACKUP_TABLES` or `DEVLOG_TABLES`, so backup.ts gains an explicit "not backed up" list (M11-q7 default).
- Native code lives on `m9-native` (`ios/**`, `src/native/**`, owner ios-engineer per M9-q2 = yes). The CLAUDE.md table on main doesn't list ios-engineer yet; it does once m9-native merges.
- Today already has two-button prompt cards (program prompt, M10e missing-kit prompt); the readiness card copies that pattern.

**Order:** 1 → 2 🧍 → (3 ∥ 4 ∥ 5 ∥ 6) → 7 → 8 → (9 ∥ 10) → 11 → 12 🧍 → 13 → 14 → 15 🧍. Route B (W1–W4) only if M11-q2 = B.

- [x] 1. [main] Re-check every NOT VERIFIED fact in the Decision "M11 health data plan" against official pages (the planning session had no web access), and record source + date for each.
  - Check: HealthKit capability with a free Personal Team (developer.apple.com "Supported capabilities (iOS)" and Xcode → Signing & Capabilities); current HealthKit read APIs for sleep stages, HRV SDNN, resting HR, workouts on iOS 26/27; Capacitor HealthKit plugins on npm (version, Capacitor 8 peer, licence, last publish, open issues); WHOOP's Apple Health help article (what it writes / reads); WHOOP Developer docs (OAuth flow, PKCE vs client secret, redirect URI rules, scopes, rate limits, API terms).
  - Files: docs/PROGRESS.md (Decision "M11 health data plan").
  - Done when: each fact has a source + date, and any change to a default (above all: "HealthKit works on a free team") is flagged to Wongsaton before task 3.
  - Deps: M11-q answers.
- [ ] 2. 🧍 [Wongsaton] On the iPhone: Health app → Profile → Apps (or Sharing → Apps) → WHOOP → write down which types are turned on for "Allow WHOOP to write" and "Allow WHOOP to read". In the WHOOP app → Settings → Integrations → Apple Health, confirm it's connected.
  - Done when: the list is in this file (types only, no values). It decides the final M11-q4 list.
  - Deps: none (can happen now).
- [x] 3. [main] Types and settings.
  - Files: src/core/types.ts (`HealthType`, `HealthSettings`, `HealthWorkout`, `HealthDay`, `ReadinessSignal`, `ReadinessCard`, `WeighIn.source?`).
  - Done when: `npm run check` passes; no behaviour change.
  - Deps: 1.
- [x] 4. [ios-engineer] `GymHealth` plugin, **read-only**, tests first for the TS side. Default: a thin custom Swift plugin (no third-party HealthKit plugin) unless task 1 finds a maintained, Capacitor-8, MIT/Apache plugin that covers sleep stages + HRV + workouts (then record the switch as a Decision).
  - API: `isAvailable()`, `requestRead(types)`, `read({ types, since })` → per-type arrays already in app units (kg, bpm, ms, kcal, minutes, ISO times, source bundle id/name); workouts exclude Gym Clean's own bundle id. No write methods.
  - Files: ios/App/App/Plugins/GymHealth/** (+XCTest for unit mapping and sleep-stage summing), ios/App/App/App.entitlements (`com.apple.developer.healthkit`; no team id), ios/App/App/Info.plist (`NSHealthShareUsageDescription` text from SPEC M11), src/native/health.ts(+test, fake bridge: unavailable, denied, partial, locked → empty result, never throws), docs/ios-setup.md (Health permission step).
  - Done when: TS tests pass; the simulator build with HealthKit succeeds; XCTest passes on the simulator with sample data.
  - Deps: 1, 3 (types only).
- [x] 5. [core-engineer] Health summaries, baselines and signals, **tests first**.
  - Files: src/core/health/days.ts(+test) (raw plugin result → `HealthDay` per local date: sleep night assigned to the wake-up date, across midnight and DST), src/core/health/baseline.ts(+test) (28-day median, ≥ 7 days, per source), src/core/health/rules.ts (thresholds as data), src/core/health/readiness.ts(+test) (signals, 2-signal rule, deload nudge ≥ 3 of 7 days and 14-day spacing, once per day, rest day → no card), src/core/health/copy.ts(+test) (reason strings; all pass `checkCopy` + the M11 banned list), src/core/health/fixtures/*.json (made-up weeks: normal, short sleep + high RHR, one signal only, sparse data, mixed HRV sources).
  - Done when: every SPEC M11 unit-test bullet for these is covered and green.
  - Deps: 3.
- [x] 6. [core-engineer] Weigh-in import, weekly load and activity-level check, **tests first**.
  - Files: src/core/health/weighIns.ts(+test) (earliest sample before 12:00 local, typed wins, deleted-import list respected, kg rounding), src/core/health/weeklyLoad.ts(+test) (gym sessions + outside workouts this week, no double count), src/core/nutrition/activityCheck.ts(+test) (14-day active-energy average → suggested M7 level or null; M11-q8).
  - Done when: tests green; existing M7 weekly-check tests unchanged.
  - Deps: 3.
- [x] 7. [core-engineer] Storage: Dexie version 6 with `healthDays` (key `date`), `settings` key `'health'`, `WeighIn.source` (old rows read as `manual`), `deletedHealthWeighIns` in the health settings; `clearHealthType(type)` deletes stored values; backup.ts puts `healthDays` on a new `NOT_BACKED_UP_TABLES` list (M11-q7 default) and imported weigh-ins stay in backups like any weigh-in.
  - Files: src/data/db.ts(+test), src/data/health/store.ts(+test), src/data/backup.ts(+test).
  - Done when: fake-indexeddb tests cover the v5 → v6 upgrade with data kept, the round trip, clear-per-type, and the backup table-list test.
  - Deps: 3.
- [x] 8. [core-engineer] Sync orchestration (pure, injected plugin + store): first read 35 days, then since `lastReadAt`; only enabled types; merges into `healthDays`; runs weigh-in import; returns today's `ReadinessCard | null`. **Tests first** with a fake plugin.
  - Files: src/core/health/sync.ts(+test).
  - Done when: tests cover first connect, incremental, a type turned off mid-way, plugin unavailable → no-op.
  - Deps: 5, 6, 7 (API).
- [x] 9. [ui-engineer] Settings → **Health** screen (props in, callbacks out): Connect, per-type switches (≥ 56px rows) each with a one-line explainer of what the coach does with it, "Read now", last read time, "Turn off and delete" per type, and the PWA line "Health data works in the iPhone app."
  - Files: src/ui/screens/healthSettings.ts(+test), src/styles.css (tokens only).
  - Done when: render tests + 390×844 harness screenshot; text ≥ 20px, all copy passes `checkCopy`.
  - Deps: 3.
- [x] 10. [ui-engineer] Today "Lighter today?" card (reasons + Lighter today / Not today / Train as planned, or Deload week), the weekly-load line in the week strip, the "from Health" tag on imported weigh-ins in Fuel, and the activity-level line in the weekly check card.
  - Files: src/ui/screens/today.ts(+test), src/ui/fuel/weighIn.ts(+test) (the weekly suggestion card lives here), src/ui/fuel/fuelController.ts(+test) (pass the source tag and activity line through), src/styles.css.
  - Done when: render tests + 390×844 screenshots; the card never renders on the Exercise or camera screens.
  - Deps: 3.
- [x] 11. [main] Wiring: `src/main.ts` injects `src/native/health.ts` when native; `src/ui/app.ts` runs sync on open/foreground, routes the card buttons to `proposeLighter` / `proposeDeload` / `proposePostpone` (existing Apply/Undo/Plan changes), Settings → Health route, M10 phase B context gets card reasons only.
  - Done when: `npm run check` + full `npm run e2e` pass; the web main chunk still has no Capacitor plugin code.
  - Deps: 4, 8, 9, 10.
- [x] 12. [ui-engineer] e2e/health.spec.ts with a fake `window.Capacitor` `GymHealth` plugin and seeded made-up data: connect → switches → card with two reasons → Lighter today → proposal → Apply → Undo; imported weigh-in in Fuel; type off → card gone and data deleted; no network request; PWA (no bridge) shows the "iPhone app" line.
  - Done when: the spec passes 3× in a row and the full e2e is green.
  - Deps: 11.
- [x] 13. 🧍 [Wongsaton + main] On his iPhone (`npm run ios:run`): the Health sheet lists only the chosen types; after allowing, Settings → Health shows WHOOP-sourced sleep/HRV/RHR; a weigh-in from Health shows in Fuel; Safari Web Inspector shows no network request. Add the lines to docs/ios-setup.md's checklist.
  - Done when: results in Verification evidence → M11.
  - Deps: 12.
- [ ] 14. [reviewer] Review the M11 diff (privacy: no network on route A, no raw samples stored, no Health data in dev log/backup/Claude context, no team id in entitlements; copy rules) → [verifier] Verify milestone against SPEC M11 acceptance criteria → [main] merge + ask to push.
  - Deps: 13.
- [ ] 15. 🧍 **Checkpoint H:** a week with Health connected. He reports whether the card showed on the right days, whether the reasons matched how he felt, and any wrong weigh-in. Thresholds in `rules.ts` get tuned from that (a Decision).

#### Route B — WHOOP Developer API (only if M11-q2 = B; outline, planned in detail after the answer)
- W1. 🧍 [Wongsaton] Create a WHOOP developer app (his WHOOP account), register the redirect URI, keep the client secret off the repo.
- W2. [main] Decide the token exchange per task 1's findings: if WHOOP requires a client secret, either his secret stored only on the phone (like the M10 phase C key) or a tiny server he owns (separate plan, needs his yes for any hosting).
- W3. [ios-engineer + core-engineer] OAuth in the app (ASWebAuthenticationSession), token storage on the phone only, read recovery / cycle (strain) / sleep / workout into `HealthDay.whoopRecoveryPct` etc., CSP `connect-src` + the explainer "Your WHOOP data comes from WHOOP's servers to this phone."
- W4. [ui-engineer] "Connect WHOOP" row with that explainer and Disconnect (deletes tokens and WHOOP values).

### M7b — Food photo recognition, local part (planned 2026-11-15)
**Contract:** SPEC M7b steps 1–3 and 5 plus the "Training" section, as limited by the Decision "M7b local part plan" (2026-11-15) and `docs/cloud-briefs.md` Session 1.
- All logic is **tests first**: decision logic, class map, entry builder, stores, zip writer, and the Python split/mapping code.
- **Privacy:** photos and inference stay on the phone. No new network call, and the CSP doesn't change (`connect-src` gets no new origin). The model and the MediaPipe wasm are loaded from our own origin or from IndexedDB. Photos never go into the dev log. Nothing is stored unless "Save photos to improve recognition" is on, and it's **off** by default.
- **Out of scope:** step 4, the Claude backup (paid key + the open proxy-vs-own-key decision). No Claude client, no "Ask Claude" button, no `api.anthropic.com`. The SPEC Accept items about Claude (JSON parsing, mocked Claude e2e) wait for that part. `decide()` takes a `claudeAvailable` input that is always `false` for now, so step 4 can plug in later.
- **Datasets, photos and models are never committed** unless the Decision allows it (bundled model: only if task 1 finds a dataset whose licence allows training **and** publishing the weights, and the model is ≤ 25 MB).
- **Copy:** coaching language only. No health or diet claims. Every new string passes `checkCopy`. Values carry the "estimate" tag.
- **No GPU on this Mac** (and none in the cloud session): training must be CPU-feasible. The plan uses a small pretrained backbone (EfficientNet-Lite0 or MobileNetV3, 224 px), mostly frozen, with features cached once. Budget: about 2 h of CPU for ≤ 50 classes and ~15k images. Anything bigger goes to Google Colab (free GPU) on public data only, never his photos, unless he says otherwise.
- **Order:** M6 is open and Checkpoints B3 / E / F1 are open. M7b proceeds on the cloud-brief Wongsaton prepared (as M7 did on his word). It touches neither the camera nor the workout.

**Branch:** `m7b-food-vision`, cut from main at c818def (M7 live). This plan was written on a worktree branch based on c818def.

**Fit with the current code (why the plan looks like this):**
- `FoodSource` already has `'photo-local'`, and `FoodEntry` has `photoConfidence?`, but **`FoodEntry` has no `source` field**. Main adds `source?: 'photo-local' | 'photo-ai'` (task 2) so the SPEC's `source: 'photo-local'` is stored on the entry. `isEstimateFood` already treats the photo sources as estimates.
- `entryFromFood(food, amount, { portion })` already does S/R/L for the 47 Thai dishes (`thai:*` ids, `THAI_PORTIONS` 0.75 / 1 / 1.4). The photo builder wraps it, so photo entries match a hand-logged dish exactly.
- **The MediaPipe vision wasm is already same-origin and precached:** `scripts/copy-mediapipe-wasm.mjs` copies it to `public/mediapipe/wasm` and Workbox globs `mediapipe/wasm/*`. `src/pose/landmarker.ts` builds `${BASE_URL}mediapipe/wasm`. The Image Classifier uses the same fileset, so food-vision builds the same URL itself and doesn't import the pose module. `@mediapipe/tasks-vision` is already a lazy chunk.
- `.gitignore` already ignores `ml/data/`, `ml/runs/`, `ml/models/` and `*.tflite`. A bundled model (verdict A only) needs one narrow exception. `public/models/**` belongs to pose-engineer, so a bundled food model would go to `public/food-vision/` (main).
- Dexie is at **version 5**. M7b adds **version 6** with new tables only (`foodModels`, `foodPhotos`).
- The M7 barcode loader (`src/ui/fuel/barcodeDecoder.ts`) is the pattern to copy: dynamic import, one shared instance, a failed load isn't cached.
- E2E can't load a real food model (it isn't committed, and none may exist), so the e2e uses a **fake classifier** through a test seam that exists only in dev builds (task 11). An opt-in smoke spec covers the real MediaPipe path (task 19).

**Ownership:**
- ml-engineer: `ml/**`, `src/food-vision/**`.
- core-engineer: `src/core/nutrition/photo.ts`, `src/core/zip.ts`, `src/data/db.ts`, `src/data/nutrition/photoStore.ts`.
- ui-engineer: `src/ui/fuel/{photoCapture,photoSheet,foodVisionSettings}.ts`, `logSheet.ts`, `fuelController.ts`, `src/ui/screens/settings.ts`, `src/styles.css`, `e2e/food-photo.spec.ts`, `e2e/food-vision-smoke.spec.ts`.
- main: `src/core/types.ts`, `src/ui/app.ts`, `vite.config.ts`, `.gitignore`, `public/food-vision/**` (verdict A only), `package.json`, git.

#### Data and licence (first)
- [x] 1. [ml-engineer] Dataset licence research. **Done 2026-11-15: verdict B** (ml/DATASETS.md). THFOOD-50/100 are non-commercial research/education only, with third-party images; Food-101 and UEC-256 are research only; the Kaggle image sets have unverifiable provenance; Commons and Open Images allow it but are too small or noisy per dish. Backbone EfficientNet-Lite0 is Apache 2.0. Main records the Decision. **No training data is downloaded before this is done.**
  - Files: ml/DATASETS.md.
  - Check, from the official pages (quote the licence text and link it):
    - THFOOD-50 and THFOOD-100 (the SPEC names them; believed non-commercial research only);
    - Food-101 (Thai classes such as pad thai; images from Foodspotting, no clear licence);
    - UEC-Food256 and other Asian food sets;
    - Kaggle "Thai food" sets (check each uploader's licence and where the images came from);
    - Wikimedia Commons Thai-food categories (per-file CC0 / CC BY / CC BY-SA; attribution needed);
    - Open Images.
  - Also check the pretrained backbone's licence (e.g. EfficientNet-Lite / MobileNet weights, Apache-2.0).
  - For each candidate record:
    - may we **train** on it, and may we **publish the trained weights** in a public repo / on the public site?
    - attribution needed?
    - image count, download size;
    - which classes overlap our 47 `thai:*` dishes.
  - End with a verdict:
    - **A:** one or more sets allow training and redistribution → train in task 6 and the model may be bundled (task 17);
    - **B:** none does → build the pipeline, **stop before real training**, and the model reaches the phone only through Settings → Import, trained by Wongsaton himself (M7b-q1).
  - A set put together from per-file-licensed Commons images counts only if the download script keeps each file's licence and author for attribution.
  - Done when: ml/DATASETS.md has the table with links and the verdict. Main records it as a Decision.
  - Deps: none.

#### Shared
- [x] 2. [main] Shared types. **Done 2026-11-15 (core-engineer, delegated):** `FoodEntry.source?`, `FoodPhoto`, `FoodModelRecord`, `FoodVisionSettings` in src/core/types.ts; tsc green, `npm run check` 101 files / 2736 tests green.
  - Files: src/core/types.ts.
  - `FoodEntry.source?: 'photo-local' | 'photo-ai'`.
  - `FoodPhoto = { id, dishId, createdAt, w, h, blob: Blob }`.
  - `FoodModelRecord = { id: 'food', name, sizeBytes, labels: string[], importedAt, blob: Blob }`.
  - `FoodVisionSettings = { savePhotos: boolean }` (default false).
  - Done when: typecheck passes and existing tests stay green.
  - Deps: none.

#### ML pipeline (`ml/**`, Python; tests in `ml/tests`, pure Python where possible)
- [x] 3. [ml-engineer] Class → dish map, **tests first**. **Done 2026-11-15:** 23 classes cover 31 of the 47 dishes. They are THFOOD-50 overlaps; each class lists its `datasets.thfood50` source names. 16 dishes have no public class yet (fried rice, pad see ew, …), and 27 THFOOD-50 classes have no dish; both lists are in ml/DATASETS.md. `npx vitest run src/food-vision` 15/15.
  - Files: src/food-vision/classMap.json, src/food-vision/classMap.ts(+test).
  - Map: classifier label (lower snake ASCII) → `{ dishes: ['thai:…', …] }`. The first dish is the default.
  - Look-alike dishes share one class (e.g. `pad_kra_pao` → pork / chicken / shrimp variants). The sheet then offers the variants (M7b-q2).
  - The Python pipeline reads this same JSON, so it's the single source of truth.
  - Start from the 47 dishes. Narrow to the dataset classes once task 1 lands. List dataset classes that have no dish in ml/DATASETS.md (M7b-q2).
  - Done when: tests check that every class has ≥ 1 dish, every dish id exists in `src/data/nutrition/thaiDishes.json`, no dish is in two classes, labels are unique and in the right format, and there are ≥ 2 classes.
  - Deps: 1 for the final class set. A draft can start now.
- [x] 4. [ml-engineer] Pipeline scaffold and environment. **Done 2026-11-16:** ml/README.md (Mac + Colab steps, THFOOD licence acceptance), pinned ml/requirements.txt (TF 2.21.0, mediapipe 1.2.3, Python 3.12) + requirements-colab.txt, ml/config.yaml, ml/gymfood/ package, ml/.gitignore (.venv). **Tooling:** Model Maker is stale (0.2.1.4, Apr 2024; pins tensorflow<2.16 + tensorflow-addons, no current Apple Silicon/py3.12 wheels), so TF TFLite converter + the mediapipe metadata writer (needs a 1-function shim: the mediapipe 1.2.3 wheel lacks `_pywrap_metadata_version`). Frozen EfficientNet-Lite0, cached embeddings, numpy softmax head. Fresh-venv `python -m pytest ml/tests --runslow` 49/49 green.
  - Files: ml/README.md, ml/requirements.txt (pinned), ml/config.yaml, ml/tests/.
  - Check the **current** tooling before choosing (Context7 / official docs):
    - MediaPipe Model Maker `image_classifier`. Check Python version limits and its Apple Silicon install status.
    - Or Keras + the TFLite converter + the MediaPipe metadata writer (`mediapipe.tasks.python.metadata.metadata_writers.image_classifier`).
  - Record the choice and the reason in the README.
  - CPU plan: a 224 px small backbone, frozen, with cached embeddings and a trained head. Optionally unfreeze the last block. Time estimates are written down.
  - README has steps for his Mac (CPU) and for Colab (public data only).
  - Done when: `python -m pytest ml/tests` passes in a fresh venv. Tests: the label list equals the classMap keys, and the config loads.
  - Deps: 3.
- [x] 5. [ml-engineer] Download and prepare, **tests first**. **Done 2026-11-16:** `download.py` (backbone + Commons allowed; THFOOD-50 pinned HF revision with sha256s and THFOOD-100 `--from-file` need `--accept-licence`; safe unpack; Commons CC0/PD/CC BY only with sha1 check + ATTRIBUTION.csv), `prepare.py` (classMap `datasets` mapping, unmapped dropped + reported, salted sha256 split, labels only from labels.csv, ≥ 100 / 30% personal held out as `personal_test`, never in train/val, duplicates removed). Fixture zip written by the app's own `buildPhotoExport` (ml/tests/fixtures/gen-photo-zip.ts). No dataset downloaded.
  - Files: ml/scripts/download.py, ml/scripts/prepare.py, ml/tests/test_prepare.py, ml/tests/fixtures/ (made-up generated images only).
  - `download.py`:
    - fetches only datasets marked allowed in DATASETS.md, with checksums, into gitignored `ml/data/`;
    - a non-allowed set needs `--accept-licence <name>`, which is for Wongsaton's private run on his Mac only;
    - keeps per-image licence and author when the source needs attribution.
  - `prepare.py`:
    - maps dataset classes → our labels through classMap and drops unmapped ones (and reports them);
    - makes a deterministic train/val/test split by file hash;
    - imports the photo zip from task 10 (`labels.csv` + `<dishId>/…jpg`; dishId → class through classMap);
    - holds out ≥ 100 personal photos by hash that **never** go into train or val (SPEC).
  - Done when: pytest on the fixture covers the mapping, unmapped classes dropped, a split that is the same on every run, no holdout leaking into training, and parsing a zip written by task 10's format (a checked-in tiny zip made from made-up images).
  - Deps: 4, 10 (the zip format; can use the documented layout first).
- [x] 6. [ml-engineer] Train, evaluate, export. **Smoke only (verdict B), 2026-11-16:** `train.py` (resumable embedding chunks + head checkpoint), `evaluate.py` (top-1/top-3/per-class/10 confused pairs → runs/<id>/report.md), `export.py` (float16 .tflite + metadata, ≤ 25 MB check, MediaPipe Python load + top-1 agreement on 20 images). Smoke: 2 made-up classes (`pad_thai`, `tom_yum_goong`), 1 epoch, M4 Pro CPU, 13 s → `ml/models/smoke.tflite` 6.76 MB, MediaPipe Python agreement 20/20, 3 ms/image (Mac CPU, not iPhone). **Real training waits on Wongsaton** (Mac with his photos, or `ml/train_colab.ipynb` on public THFOOD-50 only, per M7b-q1).
  - Files: ml/scripts/train.py, ml/scripts/evaluate.py, ml/scripts/export.py, ml/tests/test_export_smoke.py (opt-in, marked slow).
  - Evaluate:
    - top-1, top-3, per-class accuracy, the 10 most-confused dish pairs;
    - `ml/runs/<id>/report.md` (gitignored);
    - separate numbers for the public test split and for his held-out photos (when there are any).
  - Export:
    - `.tflite` (float16 or int8; choose by accuracy vs size) with image-classifier metadata (labels = classMap keys, normalization);
    - fails above 25 MB;
    - checks that the MediaPipe **Python** `ImageClassifier` loads it with the right labels and gives the same top-1 as the trained model on 20 test images.
  - Smoke run: 2 made-up classes named with **real classMap labels**, 1 epoch, CPU, < 5 min. It produces `ml/models/smoke.tflite` (gitignored), which task 19 uses.
  - **Real training only on verdict A:** record the CPU time and the public-split metrics in PROGRESS. **Verdict B:** stop after the smoke run. The README gives Wongsaton the exact commands.
  - Done when: the smoke test passes, and (A) a real model ≤ 25 MB with its report exists, or (B) the PROGRESS entry says training is waiting on M7b-q1.
  - Deps: 5.

#### Core (tests first)
- [x] 7. [ml-engineer] Decision logic, **tests first**. **Done 2026-11-16:** src/food-vision/decide.ts (+18 tests): `decide(categories, classMap, { threshold?, claudeAvailable })` → `{ kind, options ≤ 3 {label, dishIds, score}, preselect? (default dish id), offerClaude }`; assignable to photoSheet's `PhotoDecision` (checked in a test). Repeated labels keep the best score; dishes offered higher up aren't repeated.
  - Files: src/food-vision/decide.ts(+test).
  - `decide(categories, classMap, { threshold: 0.6, claudeAvailable })` → `{ kind: 'confident' | 'unsure' | 'noMatch', options (≤ 3: label, dishIds, score), preselect?, offerClaude: boolean }`.
  - Rules:
    - top-1 ≥ 0.6 → confident, top-1 default dish preselected;
    - below that → unsure, nothing preselected (M7b-q3);
    - no known label → noMatch (search);
    - unknown labels and NaN or out-of-range scores are ignored;
    - sort by score, ties keep a stable order;
    - `offerClaude` only when `claudeAvailable` and (unsure or noMatch). It is always false in this milestone.
  - No DOM, no MediaPipe import.
  - Done when tests cover: exactly 0.6 vs 0.59, fewer than 3 categories, unknown labels, two labels → the same dish deduplicated, empty input, and `claudeAvailable: false` never offering Claude.
  - Deps: 3.
- [x] 8. [core-engineer] Photo entry builder, **tests first**. **Done 2026-11-16:** `entryFromPhoto(dish, portion, confidence | undefined, opts)` in src/core/nutrition/photo.ts (8 tests). One plate via `entryFromFood` (identical macros/label/amount/ref), plus `source: 'photo-local'`, `estimate: true`, `photoConfidence` (2 dp, only when a confidence is passed). Null for a non-Thai dish (needs `thai:*` id and `thai-estimate` source), a portion not in the dish's list, or a confidence that isn't finite 0–1.
  - Files: src/core/nutrition/photo.ts(+test).
  - `entryFromPhoto(dish, portion, confidence | undefined, opts)` wraps `entryFromFood`, adding `source: 'photo-local'`, `estimate: true` and `photoConfidence` (2 dp).
  - `photoConfidence` is only set when the logged dish was one of the offered options. A dish picked through "search" keeps `source` but has no confidence.
  - Rejects confidence outside 0–1 and non-Thai/unknown portions.
  - Done when tests cover: Large values equal `entryFromFood(dish, …, { portion: 'Large' })`, Small/Regular, source + estimate, confidence rounding and rejection, and the search case.
  - Deps: 2.
- [x] 9. [core-engineer] Persistence, **tests first**. **Done 2026-11-16:** Dexie v6 (`foodModels: 'id'`, `foodPhotos: 'id, createdAt, dishId'`, no upgrade fn; v5 → v6 test keeps every row of all 16 old tables). src/data/nutrition/photoStore.ts (16 tests): `getFoodVisionSettings` / `setFoodVisionSettings` (key 'foodVision', default off, only explicit `true` is on), `maybeSavePhoto` (off → writes nothing, returns false), `listPhotos` (oldest first), `countPhotos`, `deletePhotos(ids?)` (none = all; returns rows for Undo), `restorePhotos`, `saveModel` / `getModel` / `removeModel` (returns the old record for Undo). Backup: new `LOCAL_ONLY_TABLES = ['foodPhotos', 'foodModels']` in src/data/backup.ts, not backed up; restore leaves them alone (tests). `npm run check` 104 files / 2785 tests green.
  - Files: src/data/db.ts(+test), src/data/nutrition/photoStore.ts(+test).
  - Dexie **version(6)**, new tables only: `foodModels: 'id'` and `foodPhotos: 'id, createdAt, dishId'`.
  - Settings key `'foodVision'` with `{ savePhotos: false }` by default.
  - Store:
    - `saveModel` / `getModel` / `removeModel`;
    - `maybeSavePhoto(settings, photo)`, which writes **nothing** when `savePhotos` is off (the SPEC "photo not kept" unit test);
    - `listPhotos`, `countPhotos`, `deletePhotos`, `restorePhotos` (for Undo).
  - Done when tests cover: v5 → v6 keeps every row, the off setting writes nothing, delete + restore, and every existing db test passing. Record the version bump as a Decision.
  - Deps: 2.
- [x] 10. [core-engineer ∥] Photo export zip, **tests first**. **Done 2026-11-15:** `zipStore` / `readZip` / `crc32` in src/core/zip.ts (18 tests: CRC vectors, headers, UTF-8 flag + names, deterministic, `unzip -t` and Python `zipfile` read it back), `buildPhotoExport` / `exportFoodPhotos` / `dishFolder` / `photoExportFilename` in src/core/nutrition/photoExport.ts (11 tests). Folder = dish id made safe (`thai:pad_thai` → `thai_pad_thai`); `labels.csv` (`file` relative to `gym-clean-food-photos/`, exact `dishId`, `createdAt` epoch ms) is the label source of truth. Same-ms duplicates get `-2`. DOS times use UTC fields.
  - Files: src/core/zip.ts(+test), src/core/nutrition/photoExport.ts(+test).
  - A pure store-only zip writer (JPEGs don't compress) with CRC-32. No new dependency.
  - Layout: `gym-clean-food-photos/<dishId>/<createdAt>.jpg` plus `labels.csv` (`file,dishId,createdAt`). Nothing else: no nutrition, no confidence, no device info.
  - Done when tests cover: CRC-32 known vectors, local/central headers parsed back, a file count of 0 → no zip, and the layout. Task 5 reads a zip from this writer in Python.
  - Deps: none.

#### App (`src/food-vision/**` + UI)
- [x] 11. [ml-engineer] Classifier wrapper. **Done 2026-11-16:** src/food-vision/classifier.ts (+ index.ts). `loadFoodClassifier({ blob, importedAt })` → shared `FoodClassifier { delegate, classify(image) → { categories (score desc), ms }, close() }`: lazy `import('@mediapipe/tasks-vision')`, same-origin `${BASE_URL}mediapipe/wasm`, `modelAssetBuffer` from the stored blob, `runningMode: 'IMAGE'`, `maxResults: 5`, GPU then CPU (also CPU when the GPU warm-up classify throws); a new `importedAt` closes the old one; a failed load isn't cached; `disposeFoodClassifier()` (closes a pending load when it lands). **Preprocessing contract** (= ml/gymfood/export.py docstring, added 2026-11-16 on main's request): `classify(image)` first stretches the photo (no crop) onto one reused 224×224 canvas with `imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'`; a side ≥ 448 px is halved step by step first (`resizePlan`, each step ≥ 2×), so the downscale is antialiased like Pillow's training resize. MediaPipe never sees the raw photo (its own downscale isn't antialiased, ~5% flipped answers); `ms` = resize + classify; the warm-up uses the same path. `validateModel(file)` → `{ ok: true, labels } | { ok: false, reason: 'mismatch' | 'unreadable' }` (= foodPhotos `ModelCheck`): labels read from the .tflite metadata zip (`readModelLabels`, pure, via core/zip `readZip`) must each be a known CLASS_MAP label, no repeats, ≥ 2 (`checkLabels`; **a subset is fine**, so a 23-class model keeps working after the class map grows to 30; changed from set equality on main's request 2026-11-16), returns the model's labels in model order (UI shows "N dishes"), then a trial MediaPipe load (closed again) → unreadable if it fails. No `{ url }` model (verdict B, nothing bundled). E2E seam `window.__gymCleanFakeFoodClassifier = { labels?, classify?: ScoredLabel[] | (img) => ScoredLabel[], unreadable?, failLoad? }`, read only under `import.meta.env.DEV`. Tests: `npx vitest run src/food-vision` 4 files / 72 tests (fake MediaPipe: 224×224 input for 4032×3024 / 512×384 / 224 / 100×80 / 300×1000, halving plan, natural size of img/video, canvas reuse, ms covers resize, single lazy load, GPU → CPU on load and on warm-up, retry after failure, model swap, dispose, validate ok / subset ok / unknown-label mismatch / unreadable; decide options only hold labels the model returned; real smoke.tflite labels read in Node when present; classifier.build.test.ts builds classifier.ts with Vite as production → no `__gymCleanFake`, tasks-vision still a dynamic import, no http URL; development build keeps it as the control). Real load (dev server, headless Chromium, M4 Pro, SwiftShader GL): smoke.tflite → validateModel `mismatch` under the old set rule (its 2 labels `pad_thai`, `tom_yum_goong` are known classes, so the subset rule now accepts it; the Node test asserts ok), loadFoodClassifier GPU delegate, load 3.0 s cold, classify 1024×768 canvas 67–79 ms (before the resize step); after it, validateModel ok (subset rule), GPU, 4032×3024 canvas resize + classify 101–108 ms (186 ms first), shared instance reused, closed after dispose; only request host 127.0.0.1 (MediaPipe's own `odml.pa.googleapis.com` log call blocked by the existing CSP, as in M3). **iPhone inference ms not measured yet** (needs a real model + the wired UI, task 19 / Checkpoint D). `npm run build`: no `__gymCleanFake` in dist/, no new host; classifier isn't in the app graph until task 16b, so main chunk Δ = 0.
  - Files: src/food-vision/classifier.ts(+test), src/food-vision/index.ts.
  - `loadFoodClassifier(model: { buffer: Uint8Array } | { url: string })`:
    - dynamic `import('@mediapipe/tasks-vision')`;
    - `FilesetResolver.forVisionTasks(`${BASE_URL}mediapipe/wasm`)` (same origin, already precached);
    - `ImageClassifier.createFromOptions` with `runningMode: 'IMAGE'`, `maxResults: 5`, GPU delegate first, CPU on error;
    - one shared instance; a failed load isn't cached.
  - `classify(canvas)` → `{ categories, ms }`.
  - `listLabels()` classifies a blank canvas with `maxResults: -1`. The pure `validateModel(labels, classMap)` checks that every label is in classMap and there are ≥ 2.
  - The model URL must be same-origin (assert). Nothing is fetched from anywhere else.
  - Test seam: `setFoodClassifierFactory()` for unit tests. The e2e fake `window.__gymCleanFakeFoodClassifier` is read **only under `import.meta.env.DEV`**, so it's dropped from the prod build.
  - Done when:
    - unit tests (fake factory) cover a single lazy load, GPU → CPU fallback, retry after a failed load, and validateModel;
    - `npm run build` shows tasks-vision still lazy, main chunk Δ < 3 kB gzip, and no `__gymCleanFake` string in `dist/`.
  - Deps: 2, 3, 7.
- [x] 12. [ui-engineer ∥] Capture and resize. **Done 2026-11-15:** src/ui/fuel/photoCapture.ts: `fitWithin`, `preparePhoto(file, { keepBlob, deps? })` → `{ canvas, w, h, blob? }` (createImageBitmap `from-image`, `<img>` + revoked object URL fallback, bitmap closed, JPEG q 0.85 only with `keepBlob`), `photoButton({ onFile })` (hidden `accept=image/*` `capture=environment` input, cleared after each pick). 14 tests (portrait / landscape / no upscale / URL revoked on success and failure / no fetch or IndexedDB / JPEG only when kept).
  - Files: src/ui/fuel/photoCapture.ts(+test).
  - A ≥ 56px "Photo" button over a hidden `<input type="file" accept="image/*" capture="environment">`. It opens the iPhone camera, and Photos is still offered.
  - Pure `fitWithin(w, h, 512)` (no upscaling).
  - Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, falling back to `<img>` + object URL (revoked). Draw to a canvas with a ≤ 512 px long edge.
  - Return the canvas. A JPEG blob (q 0.85) is made only when save-photos is on.
  - The `File` and bitmap are released after classify. Clear the input value so the same photo can be picked again.
  - Done when tests cover: portrait, landscape, small images not upscaled, the object URL revoked, and no store call.
  - Deps: 2.
- [x] 13. [ui-engineer ∥] Confirm sheet. **Done 2026-11-15:** src/ui/fuel/photoSheet.ts + photo.css (tokens only). `photoSheet({ mode, slot, dishes: LogItem[], state, photo?, preview? }, { onLog, onSearch, onCancel })`, `setState()`; `PhotoDecision` restates food-vision `Decision` (assignability checked in the test). States looking / confident / unsure / noMatch / error; ≥ 56px option rows with English + Thai name and "82%"; variant rows for multi-dish classes; S/R/L (Regular); meal chips; preview + estimate tag; sticky Log (disabled until a pick); "None of these: search". 19 render tests (1 tap Regular, 2 taps Large, checkCopy, no Claude/Ask in text or attributes). Screenshots docs/screenshots/m7b-photo-*.png (390×844, 3 accents, scrollWidth 390).
  - Files: src/ui/fuel/photoSheet.ts(+test), src/styles.css.
  - States:
    - "Looking…";
    - confident (top-1 preselected);
    - unsure ("Not sure. Pick one or search.", nothing preselected);
    - noMatch;
    - error ("Couldn't read the photo. Log it by hand.").
  - Option rows (≥ 56px): English + Thai name and the confidence as a small % (M7b-q6). Variant chips when a class has more than one dish.
  - S / R / L chips (Regular by default) with a kcal / protein preview from the M7 values and the "estimate" tag.
  - "None of these: search" opens the existing log-sheet search. Then Log and Cancel.
  - Focus trap + Escape, as in the M7 sheets. **No "Ask Claude" control.** A small preview of the photo is fine; it's never stored.
  - Done when:
    - render tests cover each state;
    - logging a confident top-1 at Regular is 1 tap after the photo (Log), and at Large is 2;
    - 390×844 harness screenshots in the 3 accents.
  - Deps: 2, 7.
- [x] 14. [ui-engineer ∥] Settings → Food photos. **Done 2026-11-15:** `createFoodPhotosSettings(props, actions) → { el, update }` in src/ui/screens/foodPhotos.ts (+ .css, 23 tests; moved from src/ui/fuel/ to keep clear of the parallel Fuel work), plugged into Settings as the optional `foodPhotos` prop (section `food-photos` after Nutrition; omitted → Settings unchanged, 2 tests). Model card (none / name, MB, dishes), Import/Replace (.tflite; non-.tflite and > 25 MB stopped before `validateModel`; mismatch / unreadable / save errors in words), Remove (app shows the Undo toast). Switch off by default, explainer "Photos stay on this phone. Only you can export them." + Turn on / Not now before it turns on; off is one tap. Count; Export (.zip) via `exportFoodPhotos` → `navigator.share({ files })` when `canShare`, else download; Safari NotAllowedError after the async zip → "Share the zip" tap; share-sheet cancel silent. Delete saved photos = two taps (3 s arm), app shows Undo. Export/Delete hidden at 0. All copy passes checkCopy. `npx vitest run src/ui` 46 files / 1000 tests green, eslint clean, tsc clean outside src/food-vision (ml-engineer's tests-first decide.ts). Screenshots docs/screenshots/m7b-settings-{empty,explainer,import-error,model,delete-armed}.png (390×844, scrollWidth 390, min tap 60px, min font 20px, no console errors). Wiring is task 16b.
  - Files: src/ui/fuel/foodVisionSettings.ts(+test), src/ui/screens/settings.ts(+test).
  - Model:
    - status (none / name, size, number of dishes);
    - "Import model (.tflite)" file input: > 25 MB → message; a failed `validateModel` → "This model doesn't match the dish list.";
    - Remove model.
  - "Save photos to improve recognition" switch, **off by default**. Its explainer shows before it turns on: "Photos stay on this phone, labelled with the dish you confirm. Export them to train a better model."
  - The saved-photo count, "Export photos (.zip)" (`navigator.share` with files → Save to Files, else a download), and "Delete saved photos" (Undo toast).
  - Done when render tests cover: off by default, the explainer before on, export hidden at 0 photos, and the import error states. Screenshots.
  - Deps: 2.
- [x] 15. [ui-engineer] Log sheet entry point. **Done 2026-11-16:** `photoAvailable` prop + `onPhoto(file)` action in src/ui/fuel/logSheet.ts. With `onPhoto` and a model: a full-width ≥ 56px "Log from a photo" button (photoCapture `photoButton`, `[data-log-photo]`) above the section buttons; without a model: the line "Log from a photo: add a food model in Settings." (`[data-photo-hint]`, M7b-q4); no `onPhoto` → sheet unchanged. Hidden while a detail is open. 4 new render tests (21 in the file).
  - Files: src/ui/fuel/logSheet.ts(+test).
  - The Photo button sits at the top of the log sheet when `photoAvailable` is true. Otherwise there's one line: "Log from a photo: add a food model in Settings." (M7b-q4).
  - Done when: render tests cover both, and the existing logSheet tests are green.
  - Deps: 12, 13.
- [x] 16a. [ui-engineer] Photo flow in the Fuel controller. **Done 2026-11-16:** `FuelHost.photo?: FuelPhotoHost { load(model), dispose(), prepare? }`; the controller reads `getModel` + `getFoodVisionSettings` with its other data and exposes `setPhoto({ model?, settings? })` (a new/removed model → `dispose`). Flow: `preparePhoto(keepBlob: savePhotos)` → photo sheet "Looking…" (error state if the photo can't be read) → `load(model).classify(canvas)` → `decide(…, CLASS_MAP, { claudeAvailable: false })` → result; a stale classify (new photo / closed sheet) is dropped. Log → `entryFromPhoto` → saveEntry → `maybeSavePhoto` (labelled with the confirmed dish, createdAt = when the photo was taken) → Undo toast removes the entry **and** the saved photo. "None of these" / "Log by hand" → log sheet Search, carrying the photo in that sheet's callbacks only: a Thai dish logged there at 1 plate → `photo-local`, no confidence, photo saved when on; anything else logs normally and the photo is dropped. Classify errors go to `console.warn`, never the developer log. 8 new controller tests (confident 1 tap, off → 0 writes, on → 1 write with the confirmed variant + Undo removes both, unsure, search, cancel, classifier error, dispose on replace/remove).
  - Files: src/ui/fuel/fuelController.ts(+test).
  - Flow: capture → injected classifier → `decide` → sheet → `entryFromPhoto` → store → Undo toast. `maybeSavePhoto` runs only when the setting is on. Drop the canvas and blob after logging or cancelling.
  - The slot comes from `slotFor(now, …)`, as other entries. Photos and results never go to the dev log.
  - Done when: controller tests with fakes cover confident / unsure / search / cancel, the off setting → 0 photo writes, and on → 1 write labelled with the dish he confirmed.
  - Deps: 8, 9, 11, 13, 15.
- [x] 16b. [main → ui-engineer] Wiring. **Done 2026-11-16:** new src/ui/fuel/foodVisionHost.ts keeps app.ts to +11 lines: `photoHost` (lazy `import('../../food-vision/classifier')` for `loadFoodClassifier` / `disposeFoodClassifier` / `validateModel`), and one Settings → Food photos instance (kept across Settings re-renders, numbers re-read on each show): import → `saveModel` (importedAt always new) + toast "Food model added./replaced." with Undo (puts the old model back / removes), Remove + Undo, save-photos switch, Export, Delete + Undo (`restorePhotos`). Each change calls `fuel.setPhoto`. Settings → Back up gains "Food photos and the food model aren’t in the backup. Export the photos in Food photos." (`BACKUP_PHOTOS_NOTE`). Photo → Large → logged with rings updated is checked by e2e (task 18) rather than by hand.
  - Files: src/ui/app.ts.
  - Pass the food-vision loader (model from `photoStore.getModel()`, or the bundled URL on verdict A), the photo store and the settings handlers. Open Dexie v6.
  - Done when, by hand in dev with the fake classifier: photo → Large → logged, with rings updated.
  - Deps: 9, 14, 16a.
- [ ] 17. [main] Bundled model and precache (**verdict A only; skip on B**).
  - Files: public/food-vision/food-classifier.tflite, public/food-vision/LICENSE-ATTRIBUTION.md, .gitignore (`!public/food-vision/food-classifier.tflite`), vite.config.ts (`food-vision/*.tflite` glob; check `maximumFileSizeToCacheInBytes`).
  - Done when: `npm run build` precaches it (size Δ recorded in the Decision) and the prod-preview offline photo flow works.
  - Deps: 6, 16b.

#### E2E
- [x] 18. [ui-engineer] E2E `e2e/food-photo.spec.ts` (390×844). **Done 2026-11-16:** 5 tests, fake classifier via `addInitScript` (result set per test), a 640×480 solid-colour PNG drawn in the page. Covers: no model → hint, no button; non-.tflite and label-mismatch imports refused, nothing stored; confident → 82% preselected, 1 tap Regular and 2 taps Large equal `entryFromFood` values + `photo-local` / `estimate` / `photoConfidence`, rings update; unsure → nothing preselected, Log disabled; no match → search → `photo-local` without confidence; save off → 0 `foodPhotos`; on → explainer → 1 photo (512×384, confirmed variant) → Export downloads `gym-clean-food-photos-2026-11-18.zip` with the jpg + exact `labels.csv` → Delete (2 taps) → Undo. Every test: 0 off-device requests, no console errors, nothing spoken, buttons ≥ 56px, scrollWidth 390, no "Claude" / "Ask". `--repeat-each=3` 15/15; with fuel/barcode/backup/settings specs 21/21; `npm run check` 110 files / 2934 tests green. Full `npm run e2e`: 149 passed, 1 skipped, 3 failed, all wall-clock camera/clip specs (focus-cues ×2, hands-free-live) under full parallel load, which this change doesn't touch; rerun alone (focus-cues + hands-free-live) 6/6 passed. Screenshots docs/screenshots/m7b-wired-*.png (10, `FOOD_SHOTS=1`).
  - Setup: a fake classifier through `addInitScript`. `setInputFiles` uses a **made-up image generated in the test** (a solid-colour PNG), never a real photo.
  - Cases:
    - confident → top 3 → Large → the entry has the Thai dish's Large values, `source: 'photo-local'`, `estimate: true`, `photoConfidence`;
    - unsure (0.45) → nothing preselected, no "Claude" text anywhere;
    - None of these → search → log;
    - no model → no Photo button, plus the Settings hint;
    - Settings import with a bad file → error;
    - save-photos off → `foodPhotos` count 0 after logging (read IndexedDB);
    - on → 1 photo with the right dishId → Export gives a zip with `labels.csv`;
    - **0 off-device requests** in every case.
  - Done when: green with `--repeat-each=3`, and the full `npm run e2e` is green.
  - Deps: 16b.
- [ ] 19. [ui-engineer] Opt-in real-classifier smoke `e2e/food-vision-smoke.spec.ts`.
  - Runs only when `FOOD_MODEL_SMOKE=<path>` is set (e.g. task 6's `ml/models/smoke.tflite`); skipped in CI.
  - Flow: Settings → Import → photo → real MediaPipe categories shown. Logs the inference ms.
  - Done when: it passes locally with the smoke model and is skipped without it.
  - Deps: 6, 16b.

#### Close
- [ ] 20. [reviewer] Review the branch diff against CLAUDE.md:
  - no network: CSP unchanged, no `fetch` in `src/food-vision` except the same-origin wasm/model, nothing in the dev log;
  - nothing stored when save-photos is off;
  - `git ls-files` has no dataset, photo or `.tflite` (except `public/food-vision/` on verdict A, with the licence recorded);
  - the DEV-only test seam isn't in `dist/`;
  - `decide` is pure; no Claude code, key or `api.anthropic.com`;
  - 64 / 20 / 56px, tokens only, `checkCopy` on new copy;
  - ml scripts don't download non-allowed sets without the flag.
  - Deps: 6, 18, 19.
- [ ] 21. [verifier] Verify against the SPEC M7b Accept items that are in scope:
  - run `npm run check`, `npm run e2e`, `npm run build`, and `python -m pytest ml/tests` (when Python is available);
  - bundle and precache sizes;
  - 390×844 screenshots `docs/screenshots/m7b-*`, console clean;
  - evidence goes into PROGRESS.
  - State plainly what waits:
    - top-3 ≥ 90% on his photos, < 300 ms on his iPhone (Checkpoint D);
    - the Claude items (step 4);
    - real training (on verdict B).
  - Deps: 20.
- [ ] 22. [main] Merge `m7b-food-vision` and deploy. Deploy was approved by Wongsaton for cloud-brief work, as relayed by the main session. Run as a cloud session, `docs/cloud-briefs.md` says to push the branch and open a PR instead of pushing `main`; follow the brief there.
  - Deps: 21.
- [ ] 🧍 **Checkpoint D stays open:**
  - turn on save-photos and collect ≥ 100 + training photos;
  - export the zip;
  - run `ml/` (on verdict B, with THFOOD under its own terms, M7b-q1);
  - import the model and use it for a week.

**Parallel waves:**
- **Start now:** 1 [ml], 2 [main], 10 [core], and a draft of 3 [ml].
- **After 2:** core 8 → 9. ui 12, 13, 14 (2 instances). ml 7 (after the draft of 3).
- **After 1:** finish 3 → 4 → 5 → 6 (ml, one instance; long). 11 [ml] can run alongside it once 7 is done, in a second ml instance.
- **Then:** 15 → 16a → 16b → 17 (A only) → 18 and 19 → 20 → 21 → 22.
- **Critical path:** app side 2 → 7 → 11 → 16a → 16b → 18 → 20. ML side 1 → 3 → 4 → 5 → 6 (training time on CPU). The app path doesn't wait on the ML path, except task 19 and verdict A's task 17.

### M9 — Native iOS shell (planned 2026-11-15; answered 2026-11-15; tasks 1–2 done)
**Contract:** SPEC M9 and the Decision "M9 native shell plan" (2026-11-15). Wongsaton: "Plan M9… No code until you answer." Nothing below starts until he answers M9-q1–q6 (or says "go with the defaults"). Logic is **tests first**. 🧍 = needs his Mac / Xcode / iPhone / Apple ID.

**Branch (when it starts):** `m9-native`, cut from main after M10e merges. Nothing is pushed without his OK.

**Fit with the current code (why the plan looks like this):**
- No Capacitor, `ios/` or `src/native/` exists yet. `vite.config.ts` sets `base` from `BASE_PATH` (GitHub Pages) and always adds `VitePWA` (service worker via `registerSW.js`). WKWebView doesn't run service workers for the `capacitor://` scheme, and the app is bundled anyway, so the native build needs its own mode: base `/`, no PWA plugin.
- `src/ui/voice.ts` drives `speechSynthesis` with persona voices picked by name (`voiceNames.ts`). A native `AVSpeechSynthesizer` has a different voice list, so the spike (task 6) tries the cheaper route first: keep web speech and only wrap it in the app's audio session. `src/ui/audioTest.ts` (Settings → Audio test) is where he compares the routes.
- `src/ui/wakeLock.ts` uses the web Wake Lock; the native idle timer is injected beside it, not instead of it.
- There's no full backup/restore (only the dev-log export). The app's IndexedDB is separate from Safari's, so his history can't reach the app without one.
- `src/main.ts` only mounts the app, so native start-up (detect, lazy-import `src/native/**`, inject) fits there without touching screens.
- **Owner:** `.claude/agents/ios-engineer.md` exists (`ios/**`, `capacitor.config.ts`, `src/native/**`, `fixtures/headmotion/**`, `docs/ios-setup.md`) but CLAUDE.md's table doesn't list it (M9-q2). Tasks are tagged `[ios-engineer]` on the default "yes"; if he says no, they become `[main]`. The agent file also cites a "SPEC §M8" and a head-motion-first "9.0 spike" that the SPEC doesn't have (M9-q2).

**Order:** 1 → 2 → 3 → (4 ∥ 5 ∥ 6) → 7 → 8 → 9 → 10 🧍 → 11 → 12 → 13 → 14 🧍. Backup/restore (B1–B3) runs in parallel from the start; it helps the PWA too.

- [x] 1. [main] Re-check the platform facts against current docs (Context7 / developer.apple.com / capacitorjs.com), because this plan's numbers come from the planner's knowledge (no web access in the planning session).
  - Check: Capacitor current major, its iOS floor and Xcode version, SPM vs CocoaPods default, `@capacitor/haptics` version; free provisioning limits (7-day expiry, 3 apps per device, 10 App IDs per 7 days, capabilities a Personal Team can't use); Apple Developer Program price in Thailand and TestFlight build life; Foundation Models OS/device/language list (Thai?) and context size; `CMHeadphoneMotionManager` (for later).
  - Files: docs/PROGRESS.md (update the Decision "M9 native shell plan" with sources and dates).
  - Done when: every fact in that Decision has a source + date, and any change to a default is flagged to Wongsaton.
  - Deps: M9-q answers.
  - **Done 2026-11-15:** every fact in the Decision now has a source + date; changes are marked **CHANGED** there and listed in Status.
- [x] 2. [main] Packages and a native build mode.
  - Files: package.json (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/haptics`, pinned to the major from task 1; scripts `build:native`, `ios:sync`, `ios:open`, `ios:run`), vite.config.ts (`--mode native` → base `/`, no `VitePWA`), .gitignore (`ios/App/Pods/`, `ios/**/xcuserdata/`, `ios/DerivedData/`, `ios/App/App/public/`, `ios/App/Signing.local.xcconfig`, `*.gymclean-backup.json`).
  - Done when: `npm run build` produces the same file list as before (incl. `sw.js`, `registerSW.js`); `npm run build:native` has neither and uses base `/`; `npm run check` passes; CLI telemetry off is in the setup doc (task 3).
  - Deps: 1.
  - **Done 2026-11-15:** `@capacitor/core` 8.6.2, `@capacitor/ios` 8.6.2, `@capacitor/haptics` 8.0.2 (dependencies), `@capacitor/cli` 8.6.2 (dev), all exact pins. Scripts: `build:native` (typecheck + `vite build --mode native`), `cap:telemetry-off`, `ios:sync` (build:native → telemetry off → `cap sync ios`), `ios:open`, `ios:run` (ios:sync → `cap run ios`); the `ios:*` ones fail until task 3 creates `ios/`. Telemetry is turned off by the scripts themselves (it's opt-out, see Decision), so task 3's doc only needs to mention it. Evidence: Verification evidence → M9.
- [ ] 3. [ios-engineer] The Capacitor iOS project. 🧍 needs Xcode on his Mac (M9-q9).
  - Files: capacitor.config.ts (appId placeholder, `webDir: 'dist'`, no `server.url`), ios/** (`npx cap add ios`), Info.plist (`NSCameraUsageDescription` in plain words, `ITSAppUsesNonExemptEncryption = NO`, portrait only, no background modes), deployment target per M9-q3, `ios/App/Signing.local.xcconfig.example` (team, bundle id; the real file gitignored), docs/ios-setup.md (install Xcode, sign in, Developer Mode on the iPhone, first run, trust the developer, re-sign every 7 days if free, `npx cap telemetry off`).
  - Done when: `npm run build:native && npx cap sync ios` and `xcodebuild -workspace/-project … -scheme App -destination 'generic/platform=iOS Simulator' build` succeed; the simulator launches to Today with no console errors (screenshot in docs/screenshots/m9/).
  - Deps: 2.
- [ ] 4. [ios-engineer] Camera inside the shell.
  - Files: ios/App/App/** (WKWebView media-capture permission handling if Capacitor's default doesn't grant `getUserMedia`; inline playback), docs/ios-setup.md (device checklist lines).
  - Done when: the simulator build loads the pose model and wasm from the bundle with no errors (the simulator has no camera), and the on-device checklist has "camera page opens, one curl set counts" for task 10.
  - Deps: 3.
- [ ] 5. [ios-engineer] Platform bridge + KeepAwake + haptics, **tests first** for the TS side.
  - Files: src/native/platform.ts(+test) (`isNative()` from the injected `window.Capacitor`, no static `@capacitor/*` import on the web path), src/native/keepAwake.ts(+test), src/native/haptics.ts(+test), ios/App/App/Plugins/KeepAwake/** (`isIdleTimerDisabled`, + XCTest).
  - Done when: TS tests with a fake bridge pass (on/off, errors fall back to "not available"); XCTest passes on the simulator.
  - Deps: 3.
- [ ] 6. [ios-engineer] **Ducking spike** (the reason M9 exists), then the chosen route, **tests first** for the TS side.
  - Route A: an `AudioSession` plugin sets `.playback` + `.duckOthers` around each web `speechSynthesis` utterance (activate on start, deactivate with `.notifyOthersOnDeactivation` on end). Keeps the persona voices.
  - Route B: a `GymVoice` plugin speaks with `AVSpeechSynthesizer` in that session, with `speak({ text, rate, pitch, voiceId })`, `stop()`, `voices()` and start/end events.
  - Also check whether the WebKit speech fix (2026-11-13 Decision, 326042@main) shipped in his iOS version; if speech already mixes, record it.
  - Files: ios/App/App/Plugins/AudioSession/** or GymVoice/** (+ XCTest for the session options), src/native/voice.ts(+test).
  - Done when: both routes build; a dev-only row in the native Audio test lets him try A and B with Spotify (task 10); TS tests cover start/end events, an error → web speech fallback, and no overlap with a running cue. The route he picks is recorded in Decisions.
  - Deps: 3.
- [ ] 7. [ui-engineer] Injectable native paths in voice, wake lock, haptics and Audio test, **tests first**.
  - Files: src/ui/voice.ts(+test) (`setNativeSpeaker(impl | null)`: same queue semantics, cue kinds, never cancels a cue mid-set, falls back to web speech on error), src/ui/wakeLock.ts(+test) (`setNativeKeepAwake`), src/ui/audioTest.ts(+test) ("Native voice (ducks music)" rows when injected), haptic calls on Set done and Apply (only when injected; nothing on the web).
  - Done when: unit tests with fakes pass and every existing voice/wake-lock test is unchanged and green. No `src/native` import from `src/ui`.
  - Deps: 5, 6 (TS interfaces only).
- [ ] 8. [main] Start-up wiring.
  - Files: src/main.ts (if `isNative()`, lazy-import `src/native/**` and inject into voice / wake lock / haptics), src/ui/app.ts (Settings → About shows "App: native" / "On-device AI: <status>" from the task 9 probe).
  - Done when: `npm run check` + full `npm run e2e` pass unchanged; a test (script or Vitest over `dist/`) shows the web main chunk has no Capacitor plugin code; the simulator build speaks through the native route.
  - Deps: 7.
- [ ] 9. [ios-engineer] Foundation Models **availability probe only** (de-risks M10 phase B; the brain itself is phase B).
  - Files: ios/App/App/Plugins/GymBrain/GymBrainPlugin.swift (`availability()` → `available | deviceNotEligible | appleIntelligenceNotEnabled | modelNotReady | unsupported`, plus `supportedLanguages`), src/native/gymBrain.ts(+test).
  - Done when: XCTest passes; on his phone (task 10) Settings shows the status and whether Thai is supported (feeds M10-q5).
  - Deps: 5.
- [ ] 10. 🧍 [Wongsaton + main] First install and the device checklist (docs/ios-setup.md).
  - On his Mac: Xcode signed in with his Apple ID (free or paid per M9-q1), iPhone in Developer Mode, `npm run ios:run`.
  - Checklist: launches in airplane mode; camera counts one curl set; ducking routes A and B with Spotify and Silent on (he picks one); the screen stays on through a 3-min rest; a PWA backup (B3) restores in the app; Safari Web Inspector → Network shows no request during a session; Settings shows the on-device AI status.
  - Done when: results are in Verification evidence → M9 and the voice route is a Decision.
  - Deps: 4, 6, 8, 9, B3.
- [ ] 11. [ui-engineer] E2E for the native path in the browser: e2e/native-bridge.spec.ts with a fake `window.Capacitor` and fake plugins.
  - Done when: a mini-session routes cues to the fake speaker, holds keep-awake from Start to Summary, and makes no network request; the full web e2e still passes. Deps: 8.
- [ ] 12. [ios-engineer] Update route per M9-q5.
  - Free: `npm run ios:run` (build:native → sync → run on the plugged-in / same-Wi-Fi phone); the doc says it also renews the 7-day signature.
  - Paid: also `npm run ios:testflight` (archive → export → upload; check the current upload tool first), ios/App/ExportOptions.plist; no credentials in the repo (App Store Connect API key stays in his keychain / a gitignored path).
  - Files: docs/ios-setup.md, ios/App/ExportOptions.plist (paid only); the script lines go to [main] in package.json.
  - Done when: he installs one update by the chosen route (🧍). Deps: 10.
- [ ] 13. [reviewer] Review the M9 diff (privacy: no network, no telemetry, no signing data in the repo; web path untouched) → [verifier] verify against SPEC M9 Accept (check, e2e, build, `build:native`, simulator build + screenshot, the task 10 evidence) → [main] merge + ask to push.
  - Deps: 11, 12.
- [ ] 14. 🧍 **Checkpoint G:** a week of gym sessions in the native app with music. He reports ducking, screen-on, camera, anything that differs from the PWA. Then M10 phase B (B1–B12) starts, with `[main, until an owner exists]` tasks moving to ios-engineer if M9-q2 is yes.

#### Backup / restore (parallel track; useful for the PWA too)
- [x] B1. [core-engineer] Backup format, **tests first**. Done 2026-11-15 (23 tests; `npm run check` green, 2605 unit tests).
  - API for B2/B3: `exportAll(db, { appVersion?, now? }) → BackupFile` (save with `JSON.stringify`); `importAll(db, textOrObject, { now? }) → { counts, undo }` (`undo` = the pre-import data as a BackupFile, kept in memory; `importAll(db, undo)` reverts); `validateBackup(db, input)` checks without writing; errors are `BackupError` with `code` `'corrupt' | 'format' | 'newer' | 'write'` (no partial writes in any case). `BACKUP_TABLES` lists the 13 backed-up tables; a test fails if a new Dexie table isn't put there or in `DEVLOG_TABLES`.
  - Rules: older `dexieVersion` files restore (missing tables come back empty); restore keeps the dev log and any secret settings row on this phone; secret-looking names (`apiKey`, `secret`, `token`, `password`…) are stripped from exports and ignored in files. The UI must confirm before calling `importAll` (B2's two-tap).
  - Files: src/data/backup.ts(+test).
  - `exportAll(db)` → `{ format: 'gym-clean-backup', version, dexieVersion, appVersion, createdAt, tables: {…} }` with every table except the developer log (M9-q7) and never an API key (phase C); `importAll(db, json)` validates, rejects a newer `dexieVersion` or unknown format, and replaces all data in one transaction.
  - Done when fake-indexeddb tests cover: round trip of every table, newer schema rejected, a broken file leaves the db untouched, no key field in the output.
  - Deps: none.
- [x] B2. [ui-engineer] Settings → Back up / Restore. Done 2026-11-15: `src/ui/screens/backupPanel.ts`(+test) in a Settings "Backup" section (before the developer log). Back up = a Blob download `gym-clean-YYYY-MM-DD.gymclean-backup.json` (no share sheet yet: `navigator.share` needs a fresh tap after the async export on iOS; the download goes to Files). Restore: file picker → `validateBackup` → "Replace all data on this phone?" with "N workouts" from the file, two-tap Replace (as Reset) or Cancel → `importAll` → settings and plan read again without a reload → Undo toast (`importAll(db, undo)`). Errors: newer → "Update the app first", corrupt/format → "This file isn't a Gym Clean backup. Nothing changed.", write → "Couldn't restore. Nothing changed.". e2e `e2e/backup.spec.ts` (2 tests).
  - Files: src/ui/screens/settings.ts(+test), e2e/backup.spec.ts.
  - Back up shares a `.gymclean-backup.json` file (share sheet on iOS, download elsewhere). Restore takes a file and asks "Replace all data on this phone?" with a two-tap confirm (≥ 56px). No network.
  - Done when: render tests + e2e round trip (seed → back up → clear → restore → History shows the sessions) + 390×844 screenshot.
  - Deps: B1 (API only).
- [x] B3. [main] Wire B1 ↔ B2 in app.ts. Done when the e2e passes. Deps: B1, B2. Done 2026-11-15 (ui-engineer, delegated): `exportBackup` / `pickRestoreFile` / `confirmRestore` / `undoRestore` / `reloadStored` in app.ts's Settings area. Screenshots `docs/screenshots/m9-backup-{confirm,restored,refused}.png`.

### M10 follow-up — equipment-aware swaps (planned 2026-11-15)
**Contract:** SPEC M10 "Follow-up: equipment-aware swaps (M10e)" and the Decision "M10e equipment-aware swaps" (2026-11-15). All logic and data is **tests first**. Wongsaton: "That's why I want the coach to help me" / "Yes, build it". He's travelling, so the M10e-q defaults (Blockers) get built.

**Branch:** `m10-equipment` (already checked out). Nothing is pushed without his OK.

**Fit with the current code (why the plan looks like this):**
- `TrainerCatalog.hasEquipment(equipment)` filters on free-exercise-db's coarse `equipment` field (`body only | cable | dumbbell | kettlebells | machine`), and `src/data/equipment.json` still holds the provisional M10-q6 default (it lists "leg press" and "calf raise" machines he doesn't have). "machine" can't tell a leg press from a smith machine, and "cable" can't tell a rope from a D-handle. So kit needs become **per-exercise data** (`src/data/exerciseKit.json`), and the core filter becomes `canDo(exerciseId)`. No `if (exercise === …)` anywhere.
- Today's swap pool already has quad candidates for Leg Press (Dumbbell Squat, Split Squat with Dumbbells, Lunges, Rear Lunge, Goblet Squat). It has no smith or barbell moves, so those are vendored. A small data list `replaceWith` ranks the closest replacements first (smith squat before a lunge) without code branches.
- `proposeSwapOptions(ctx, id, catalog, 'plan')` already builds a plan-scope swap with Apply / Undo / Plan changes. The equipment prompt **reuses it**, so `Proposal.action` stays `'swap'` and there's no new action, no `TrainerState` change and no Dexie version bump.
- The gym profile goes in the existing `settings` table (key `'gym'`), like `unit` and `'nutrition'`. Dexie stays at version 5.
- Today already has a two-button prompt pattern (`program-prompt`: Use it / Keep mine). The "missing kit" prompt copies it.
- The "Info" badge is automatic for ids without a 3D demo (`src/ui/badges.ts` → `hasDemo`), so vendored exercises need no UI work for it.
- **Other branches in flight:** cloud session 1 (M7b: `ml/**`, `src/food-vision/**`) and session 2 (camera e2e + Undo toast: `src/ui/app.ts`, `src/ui/fuel/**`, camera/hands-free/focus-cues specs). This plan doesn't touch `ml/**`, `src/food-vision/**`, `src/ui/fuel/**`, `src/ui/coach/undoToast.ts` or any camera spec. **Shared files it does touch:** `src/core/types.ts` (task 1), `src/ui/app.ts` (task 9, a small diff in the trainer block plus the Today/preview props, so expect a merge with session 2), `src/ui/screens/today.ts` / `preview.ts` / `src/styles.css` (task 8), `docs/PROGRESS.md` and `docs/SPEC.md`.

**Ownership:** core-engineer `src/data/**`, `src/core/trainer/**`; ui-engineer `src/ui/screens/**`, `src/styles.css`, `e2e/equipment.spec.ts` (new); main `src/core/types.ts`, `src/ui/app.ts`, git.

- [x] 1. [main] Shared type `GymProfile`.
  - Files: src/core/types.ts.
  - `GymProfile = { equipment: string[]; kept: string[] /* exercise ids he chose to keep despite missing kit */; updatedAt: number }` (SPEC M10e data model).
  - Done when: typecheck passes and the shape matches the SPEC.
  - Deps: none.
- [x] 2. [core-engineer] Equipment vocabulary, default profile and per-exercise kit needs, **tests first**.
  - Files: src/data/equipment.json (rewritten: `items: { id, label, group }[]`, `defaultProfile: string[]`, a note pointing at the M10-q6 Decision), src/data/exerciseKit.json (new: `exerciseId → { needs: string[][]; replaceWith?: string[] }`; `needs` is "any one of these lists, each list all-of"; bodyweight = `[[]]`), src/data/catalog.ts(+test).
  - Items (ids are data): `dumbbells` (5–75 lb), `kettlebell`, `adjustable-bench`, `cable-lat-pulldown`, `cable-low-row`, `cable-pulley` (adjustable pulleys), `cable-d-handle`, `cable-lat-bar`, `cable-rope`, `leg-extension`, `leg-curl`, `smith-machine`, `half-rack`, `barbell` (bar + plates), `plyo-box`, `pull-up-bar`, `leg-press`, `chest-press`, `pec-deck`, `calf-machine`.
  - `defaultProfile` = his list (Decision "Gym equipment (M10-q6)"): everything above **except** `cable-rope`, `pull-up-bar` (unconfirmed, M10e-q8), `leg-press`, `chest-press`, `pec-deck`, `calf-machine`.
  - Catalog API: `equipmentItems()`, `defaultGymProfile(): GymProfile`, `kitNeeds(id)`, `gymCanDo(id, profile)`, `preferredSwaps(id)`. `gymHas` / `gymEquipment` stay until task 9 moves app.ts off them, then this task's owner deletes them (task 9b).
  - Done when tests show:
    - every catalog exercise has a kit entry, and every id in `needs`, `replaceWith` and `defaultProfile` is a known item or catalog id;
    - with the default profile: **not doable** = Leg_Press, Calf_Press_On_The_Leg_Press_Machine, Standing_Calf_Raises (M10e-q2), Triceps_Pushdown_-_Rope_Attachment, Cable_Rope_Overhead_Triceps_Extension; **doable** = Face_Pull and Triceps_Pushdown (D-handle), Goblet_Squat (dumbbell or kettlebell), Lying_Leg_Curls and Seated_Leg_Curl (M10e-q3), Cable_Crossover and Cable_Chest_Press (M10e-q5), and every other program exercise;
    - every `replaceWith` id shares a primary muscle with its exercise;
    - the existing catalog tests (muscles, cues, how-to, SVG paths, banned words) still pass.
  - Deps: 1.
- [x] 3. [core-engineer, after 2] Vendor the leg-press and calf replacements, **tests first**.
  - Files: src/data/exercises.json, src/data/cues.json, src/data/howto.json, src/data/exerciseKit.json, src/data/catalog.test.ts.
  - Candidates (check each id exists upstream in `yuhonas/free-exercise-db` and the licence is still Unlicense; vendor fields unchanged; record the upstream commit SHA in a Decision): `Smith_Machine_Squat`, `Barbell_Squat` (or `Barbell_Full_Squat`, whichever upstream entry is the plain back squat), `Smith_Machine_Calf_Raise`. For a rear-foot-elevated (Bulgarian) split squat: check whether the vendored `Split_Squat_with_Dumbbells` already is one; if not, vendor the closest upstream dumbbell entry. Don't invent ids.
  - Each gets a cue (≤ 8 words), 2–3 how-to lines (≤ 70 chars) in coaching language, focus and tempo, and kit needs (smith: `smith-machine`; barbell squat: `half-rack` + `barbell`; split squat: `dumbbells` + `adjustable-bench`). Weight-logging line per M10e-q7.
  - `replaceWith`: Leg_Press → [Smith_Machine_Squat, Barbell squat, the split squat] (M10e-q1); Standing_Calf_Raises → [Smith_Machine_Calf_Raise, Standing_Dumbbell_Calf_Raise] (M10e-q2).
  - Done when: catalog tests pass for the new ids (muscles map to an area and an SVG path id, cue, how-to, no banned words), and none has a 3D demo (they show "Info"; `tracking: 'manual'`, no pose rule).
  - Deps: 2.
- [x] 4. [core-engineer, after 2+3] Kit-aware swap candidates and missing-kit detection, **tests first**.
  - Files: src/core/trainer/swapCandidates.ts(+test), src/core/trainer/equipment.ts(+test) (new), and the core tests that build a `TrainerCatalog` (actions/swap.test.ts, actions/avoidArea.test.ts, actions/rowMap.test.ts, coach.test.ts).
  - `TrainerCatalog.hasEquipment(equipment)` → `canDo(exerciseId)`, plus optional `preferred(exerciseId): readonly string[]`. Ranking: position in `preferred` first (only eligible ids), then the existing keys.
  - `missingKit(state, catalog, date, kept)` → `{ dayId, exerciseId }[]` for that date's effective day (`effectiveDay`, overrides included); `missingInPlan(state, catalog, kept)` for every plan day.
  - **Same commit as a one-line [main] change** in `src/ui/app.ts` (`canDo: (id) => gymCanDo(id, defaultGymProfile())`, `preferred: preferredSwaps`) so typecheck stays green. Task 9 replaces the default with the stored profile.
  - Done when tests cover:
    - Leg Press on Legs B → Smith Machine Squat, Barbell squat, the split squat, in that order (the day's own ids excluded);
    - a profile without `smith-machine` → the barbell squat first; dumbbells-only → dumbbell moves only;
    - rope exercises are never suggested; "Go easy on…" never picks an exercise the gym can't do;
    - `missingKit` returns Leg_Press for Legs B with the default profile, and nothing once the plan was swapped, for a kept id, or on a rest day;
    - every program exercise still has ≥ 1 candidate with the default profile;
    - every existing trainer test passes.
  - Deps: 2, 3.
- [x] 5. [core-engineer, after 4] Coach: the missing-kit proposal, **tests first**.
  - Files: src/core/trainer/coach.ts(+test), src/core/trainer/replies.ts(+test) if a new line is needed, src/core/trainer/phrases.json, src/core/trainer/evals/requests.json, src/core/trainer/intents.test.ts.
  - New chip `gymSwap` (args `exerciseId`) → reply "Your gym doesn't have the kit for Leg Press. Here's a swap." + the **plan-scope** proposal for the top candidate (via `proposeSwapOptions`, why line names the missing kit as data, e.g. "No leg press here. This works the same main muscles."), and chips: the other candidates (plan scope), **Just today** (`swapTo`, scope today), **Keep Leg Press** (new UI-only chip id `keepExercise`, like `endWorkout`). No candidate → the "No good swap…" reply + Keep.
  - The "Adjust my plan" chip lists missing-kit exercises first (one chip each).
  - Free text: "my gym has no leg press", "there's no leg press", "no leg press machine", "ไม่มีเครื่อง leg press" → `swap` with `exerciseId`, which goes to the same `gymSwap` flow when that exercise lacks kit. ≥ 6 new eval items.
  - Mid-workout: never offered unprompted (the Pause sheet's existing swap still works).
  - Done when tests cover: every reply passes `checkCopy`, `say` ≤ 8 words, the Keep chip is present, Apply then `undoLast` restores Leg Press exactly, the intent eval still ≥ 90% with 100% safety flags.
  - Deps: 4.
- [x] 6. [core-engineer ∥ 3–5] Gym profile persistence, **tests first**.
  - Files: src/data/gym.ts(+test) (new).
  - `loadGymProfile(db)` → the stored profile, else `defaultGymProfile()` (nothing written until he edits). `saveGymProfile(db, equipment)`: unknown ids rejected, `kept` cleared (a new profile asks again). `keepExercise(db, exerciseId)`.
  - Settings key `'gym'` in the existing `settings` table. **No Dexie version bump.**
  - Done when fake-indexeddb tests cover: default on first read, round trip, unknown id rejected, keep persisted, save clears `kept`, and every existing db test passing.
  - Deps: 1, 2.
- [x] 7. [core-engineer, after 3; same instance, same files] Single-handle copy for face pull and pushdown.
  - Files: src/data/cues.json, src/data/howto.json, src/data/catalog.test.ts.
  - Face_Pull and Triceps_Pushdown read right with one D-handle, per M10e-q4 (default: one arm at a time, reps per side; the plan numbers stay). E.g. face pull "Handle at face height, step back, arm straight." / "Pull toward your face, elbow high and wide." / "Return slowly. Then the other arm."
  - Done when: a test asserts neither entry says "rope" or "bar", cues ≤ 8 words, lines ≤ 70 chars, `checkCopy` clean.
  - Note: their 3D demos still show the old grip (task 12, can-follow).
  - Deps: 3.
- [x] 8. [ui-engineer ∥] Today and preview "missing kit" prompt.
  - Files: src/ui/screens/today.ts(+test), src/ui/screens/preview.ts(+test), src/styles.css (only if the program-prompt styles don't fit).
  - Props `missingKit?: { exerciseId: string; name: string } | null`; callbacks `onSeeGymSwap(exerciseId)`, `onKeepExercise(exerciseId)`.
  - A card in the `program-prompt` style (`data-gym-prompt`, role status, shown not spoken: nothing to react to mid-set): "Your gym has no kit for Leg Press." with **See a swap** (CTA) and **Keep it**, both ≥ 56px, body ≥ 20px, tokens only. The day's rows are unchanged until Apply (never silently).
  - Done when: render tests, 390×844 harness screenshots in the 3 accents, tokens test green, typecheck + lint clean.
  - Deps: 1.
- [x] 9. [main, after 4–6, 8] Wiring. Done 2026-11-15 (ui-engineer, delegated): app.ts loads the profile in `loadTrainer` (`loadGymProfile`), `trainerCatalog` = `canDo: gymCanDo(id, gym)`, `preferred: preferredSwaps`, `missingKitLabels`; `CoachContext.gymKept`; Today `missingKit` = first of core `missingKit(trainer, sessions, catalog, today, kept)`, the preview = the first row of the shown day the gym can't do (kept skipped); See a swap → `openCoach(phase, { chip: 'gymSwap', args })`; Keep it (prompt or the coach's `keepExercise` chip, which sets aside the open proposal and says "OK, keeping Leg Press…") → `keepExercise` + rerender. 9b done: `gymHas` / `gymEquipment`, `available` / `substitutes` / `legacyNote` and the legacy test are gone (nothing referenced them).
  - Files: src/ui/app.ts (trainer block ~L256–275 and the Today/preview props only).
  - Load the profile at startup (`loadGymProfile`); `trainerCatalog.canDo` reads it.
  - Today/preview get `missingKit` = the first `missingKit(...)` on the shown day, skipping `kept`.
  - See a swap → open the coach sheet with `handle({ chip: 'gymSwap', args })`; Apply / Undo / Plan changes as today. Keep it (prompt or chip `keepExercise`) → `keepExercise` + rerender.
  - No new dev-log events (existing trainer ids cover a swap).
  - 9b. [core-engineer] delete `gymHas` / `gymEquipment` and their tests once app.ts no longer uses them.
  - Done when, by hand: Legs B shows the prompt → See a swap → Apply → the preview shows Smith Machine Squat with "Info" → Undo restores Leg Press and the prompt; full existing e2e green.
  - Deps: 4, 5, 6, 8.
- [x] 10. [ui-engineer] E2E `e2e/equipment.spec.ts` (new; copy helpers from `e2e/trainer.spec.ts`, don't edit it).
  - Seed finished sessions so Legs B is up next.
  - The prompt shows; before any tap, the preview still lists Leg Press (no silent change).
  - See a swap → proposal "Leg Press → Smith Machine Squat" → **Apply** → Today/preview show Smith Machine Squat with the "Info" badge → reload keeps it → **Undo** → Leg Press and the prompt are back.
  - Keep it → reload → no prompt. Free text "my gym has no leg press" → the same proposal.
  - Every button ≥ 56px; 0 off-device requests.
  - Done when: passes with `--repeat-each=3`, full `npm run e2e` green.
  - Deps: 9.
  - Done 2026-11-15: 5 tests (prompt → See a swap → Apply → Smith Machine Squat with Info → reload → Undo via Plan changes; Keep it + reload; the coach's Keep Leg Press chip; typed "my gym has no leg press"; My gym). Shared helpers copied to `e2e/app.helpers.ts` (trainer.spec.ts untouched). `--repeat-each=5` 35/35 with backup.spec.
- [x] 11. *(can-follow, only if scope allows)* [ui-engineer] Settings → **My gym** checklist. Done 2026-11-15 with 11b: `src/ui/screens/myGym.ts`(+css, +test), Settings "Gym" section with a My gym row, `myGym` view in app.ts. Saves on each tap (`saveGymProfile`, the row flips in place so focus stays), plain note that Keep it choices reset when the list changes, "Stays on this phone." e2e: Keep it → untick Smith machine → the prompt is back and the swap offers Barbell Squat first → tick Leg press → no prompt (survives a reload). Screenshot `docs/screenshots/m10e-my-gym.png`.
  - Files: src/ui/screens/myGym.ts(+test) (new), src/ui/screens/settings.ts (a row), e2e/equipment.spec.ts (a case). 11b. [main] the route in src/ui/app.ts.
  - Grouped checkboxes from `equipmentItems()` labels, rows ≥ 56px, Save → `saveGymProfile` via a callback, a privacy line "Stays on this phone."
  - Done when: render tests + 390×844 screenshot; e2e: untick Smith machine → the Legs B swap offers the barbell squat first.
  - Deps: 6, 9.
- [ ] 12. *(can-follow, after M10e-q4 is answered)* [anatomy-3d-engineer] Face pull / pushdown 3D demos with a single handle (src/ui/demo3d/**). Not this round.
- [x] 13. [reviewer] Review the branch diff: core pure (no DOM/DB in `src/core/trainer`), kit needs as data with no exercise-id branches, nothing applied without a tap, Undo works, copy passes `checkCopy`, 56 / 20px and tokens, no network, ownership respected, vendored entries match upstream. Deps: 10 (and 11 if built).
- [x] 14. [verifier] Verify the milestone against SPEC M10e Accept: `npm run check`, `npm run e2e`, `npm run build`, intent-eval score, 390×844 screenshots `docs/screenshots/m10e-*.png` (prompt, proposal, applied preview with Info, My gym if built), console clean, 0 off-device requests; evidence into PROGRESS. Deps: 13.
- [x] 15. [main] Merge `m10-equipment` + **ask Wongsaton before pushing** (push = deploy). Deps: 14.
- [ ] 16. 🧍 **Checkpoint E (extended):** at the gym, Legs B runs with the leg-press swap; he reports the replacement's weight and whether the prompt felt right. Deps: 15.

**Parallel waves:**
- **Wave 1:** 1 [main], then 2 [core A] and 8 [ui] in parallel.
- **Wave 2:** 3 → 7 [core A], 6 [core B].
- **Wave 3:** 4 → 5 [core A].
- **Then:** 9 (+9b) → 10 → (11) → 13 → 14 → 15 → 16.
- **Critical path:** 1 → 2 → 3 → 4 → 5 → 9 → 10.

### M7 — Fuel: food & nutrition (planned 2026-11-15; after the polish round)
**Contract:** SPEC M7 (all of it, including Accept), SPEC §4 "M7 — nutrition" data model, and the Decision "M7 plan" (2026-11-15).
- All logic and data is **tests first** (targets, adjustment, portions, recipes, units, totals, search, store, script, data tables).
- Nothing is pushed or deployed without Wongsaton's OK.
- **Copy rules:** coaching language only ("45 g protein to go today", "On track this week"). No diet, weight-loss, health or medical claims. Every Fuel string passes the M10 `checkCopy` (M5b banned words + diagnosis terms). Computed numbers carry an "estimate" tag.
- **Privacy:** nutrition data lives only in IndexedDB on the phone. It never goes into the dev log or its export. Tests, fixtures and docs use made-up numbers only. The only network call in M7 is the optional barcode lookup, which sends just the barcode number.
- **Out of scope (M7b):** photo capture, the food classifier, `ml/**`, `src/food-vision/**`, the Claude backup and any `api.anthropic.com` CSP entry. The `photo-local` / `photo-ai` sources and `photoConfidence` exist only as types.
- **No 🧍 checkpoint:** SPEC M7 has none. Wongsaton can simply use it. M7b's Checkpoint D comes later.

**Branch:** `m7-fuel`, cut from main (4f812bf) once the polish round has merged.

**Fit with the current code (why the plan looks like this):**
- The tab bar (`src/ui/tabBar.ts`) has Today / History / Settings and `TabId` is a closed union. Fuel becomes a 4th tab (M7-q7). `app.ts`'s `View` union gets `fuel`, `weighIn`, `fuelSetup`, `recipe` and `myFood` screens.
- Dexie is at **version 4** (M10). M7 adds **version 5** with new tables only, so existing rows are untouched. Nutrition settings go in the existing `settings` table under key `'nutrition'`, like the unit and accent settings.
- `src/core/units.ts` already has `toUnit` / `fromUnit` / `snapToStep`. Weigh-ins reuse them and the unit setting.
- **Coach hooks:** `coach.ts` has `CoachContext.m7Available` and `food(ctx)` returns `FOOD_LATER` ("Food tips come with Fuel."). `app.ts` passes `m7Available: false`. The coach sheet already has the "What should I eat?" chip. M10 F1–F3 (below) replace the placeholder. Mid-session, the coach still doesn't offer food (existing coach test).
- **Food DB size and offline use:** the USDA subset is a large JSON file. Importing it as a module would make `tsc` and the main bundle slow. So it's imported with Vite's `?url` (a hashed asset, which `tsc` doesn't parse) and fetched on the first search. The PWA precache globs (`vite.config.ts`: `**/*.{js,css,html,woff2}`, …) don't cover `.json`, so main adds the asset pattern, or airplane mode breaks search.
- **CSP:** `index.html` has `connect-src 'self' blob: data:`. The same-origin food DB fetch is fine. The barcode lookup needs `https://world.openfoodfacts.org` added (barcode track only).
- **iPhone Safari has no `BarcodeDetector`.** Scanning on his phone needs an on-device library (see M7-q5), so barcode is a separate track that can be cut.
- **Existing reusable UI:** the M10 Undo toast (`src/ui/coach/undoToast.ts`) handles entry deletes (no confirm dialogs). `switchRow` in settings.ts covers the mode and barcode switches. Ring geometry follows the Rest ring (`ringOffset` in rest.ts).

**Ownership:**
- core-engineer: `src/core/nutrition/**`, `src/core/trainer/**` (F1), `src/data/**` (db.ts, `src/data/nutrition/**`), `scripts/build-foods.mjs` (+ `scripts/build-foods.test.mjs`, `scripts/fixtures/usda-mini/`).
- ui-engineer: `src/ui/screens/fuel.ts`, `src/ui/fuel/**` (new), `tabBar.ts`, `icons.ts`, `settings.ts`, `summary.ts`, `today.ts`, `src/ui/coach/**` (F2), `src/styles.css`, `index.html` (CSP), `e2e/fuel.spec.ts`, `e2e/barcode.spec.ts`.
- main: `src/core/types.ts`, `src/ui/app.ts`, `vite.config.ts`, `.gitignore`, `package.json`, git.

#### Core path
- [x] 1. [main] Shared types.
  - Files: src/core/types.ts.
  - Add the SPEC §4 M7 types (`MacroSet`, `Food`, `Recipe`, `FoodEntry`, `WeighIn`, `NutritionSettings`) plus what the plan needs:
    - `MealSlot`, `NutritionMode`;
    - `Favorite = { id, ref: { foodId } | { recipeId }, amount, createdAt }`;
    - `WeeklyCheck = { weekStart, avgKg, prevAvgKg, ratePct, kind: 'up' | 'down' | 'onTrack' | 'needData', deltaKcal, outcome: 'pending' | 'accepted' | 'dismissed', decidedAt? }`;
    - `NutritionTargets` (each macro with an `estimate` flag);
    - `FoodDbRow` (the compact USDA row, matching task 3);
    - `FoodSuggestion` (for F1/F2).
  - `Food` gains `barcode?` and `estimate?` (quick-estimate favorites). `Recipe` gains `nameTh?` and `updatedAt`.
  - Done when: typecheck passes and the shapes match SPEC §4 plus the additions above.
  - Deps: none.
- [x] 2. [main] Config.
  - Files: .gitignore (`data-src/` for the raw USDA downloads), vite.config.ts (precache the hashed food-DB asset).
  - Done when: `npm run build` lists the food-DB asset in the precache manifest. Before task 3 lands, a placeholder JSON is enough to show this.
  - Deps: none.
- [x] 3. [core-engineer] `scripts/build-foods.mjs` and the USDA subset, **tests first**.
  - Files: scripts/build-foods.mjs, scripts/build-foods.test.mjs, scripts/fixtures/usda-mini/ (made-up rows), src/data/nutrition/usda-foods.json (generated). Run it as `node scripts/build-foods.mjs`; main adds the `build-foods` npm script in task 17.
  - Reads USDA FoodData Central **bulk downloads** (Foundation, SR Legacy, FNDDS) from gitignored `data-src/usda/`. `--download` fetches the public files. **No API key and no account** (the FDC REST API needs a free data.gov key; we don't use it).
  - Keeps common foods. Output rows are compact: id, name, kcal / protein / carbs / fat per 100 g, and up to 3 household portions in grams.
  - Prints the gzip size and **fails above 2 MB gzip**.
  - Done when tests (on the mini fixture) cover: the field mapping, kJ → kcal when kcal is missing, rows without kcal or protein dropped, stable sorting/ids, and the budget failure. The real output is ≤ 2 MB gzip.
  - Deps: none. It can start immediately. It needs internet once for the download.
- [x] 4. [core-engineer] Thai dishes and seed foods, **tests first**.
  - Files: src/data/nutrition/thaiDishes.src.json (reference recipes: ingredients in grams with FDC ids, or an FNDDS code), src/data/nutrition/thaiDishes.json (generated by build-foods), src/data/nutrition/seedFoods.json, src/data/nutrition/foods.test.ts.
  - About 40 dishes: the SPEC examples plus common others. Each has an English name, a Thai name, kcal / protein / carbs / fat per typical plate, and Small / Regular / Large = 0.75 / 1 / 1.4 (M7-q9). `source: 'thai-estimate'`, and a note that names the FNDDS code or the reference recipe.
  - Seed food: "Protein shake" with **made-up placeholder values**, marked to edit from the label (M7-q4).
  - Never copy values from commercial apps.
  - Done when the data test checks that every dish and seed food has kcal + protein, a source and a note, every Thai dish has `nameTh` and 3 portions, and a dish rebuilt from its recipe matches the generated values. May land as 2 commits (20 dishes each).
  - Deps: 3.
- [x] 5. [core-engineer ∥A] Targets, **tests first**.
  - Files: src/core/nutrition/targets.ts(+test).
  - Age from birth year and today's date. Mifflin–St Jeor × activity (1.2 / 1.375 / 1.55 / 1.725). Surplus clamped to 0–600 (default 300). Protein clamped to 1.6–2.2 g/kg (default 1.8). Full mode: fat = max(25% of kcal, 0.6 g/kg) and carbs = the rest, never negative.
  - Weight = the 7-day average, else the latest weigh-in, else none (returns "weigh in first").
  - Overrides win per macro and drop the `estimate` flag. `visibleMacros(mode)`.
  - Done when tests cover: both sexes, every activity level, both clamps, a fat floor that binds, overrides, a Quick → Full → Quick round trip that changes no stored value, and no weigh-in. Made-up numbers only.
  - Deps: 1.
- [x] 6. [core-engineer ∥A, after 5] Weekly adjustment, **tests first**.
  - Files: src/core/nutrition/adjust.ts(+test).
  - `weeklyAverages(weighIns, weekStart)` with Monday–Sunday weeks (M7-q2). `weeklyCheck(...)` → a `WeeklyCheck`:
    - fewer than 4 weigh-ins in either week → `needData`, no change;
    - gain below the range → +150;
    - gain above 0.75%/week → −100;
    - otherwise on track.
  - The result is clamped so the target never drops below the maintenance estimate. `trend(weighIns, days)` gives the chart series (daily points + 7-day average).
  - Done when tests cover every branch, exactly 3 vs 4 weigh-ins, the maintenance floor, a week boundary at Sunday 23:59 / Monday 00:00, a DST week, and that accept/dismiss only records the outcome (nothing applies by itself).
  - Deps: 1, 5.
- [x] 7. [core-engineer ∥B] Portions, recipes and entry builders, **tests first**.
  - Files: src/core/nutrition/portions.ts(+test).
  - `scaleFood(food, amount)`: per 100 g × grams, or per serving × servings, times the portion factor.
  - `recipePerServing(recipe, foods)`: a macro missing in any ingredient stays undefined, not 0.
  - `entryFromFood` / `entryFromRecipe` / `entryFromQuick` copy the macros into the entry, so editing a recipe later doesn't rewrite past entries.
  - Rounding: kcal to whole numbers, grams to 1 decimal. Weigh-in kg/lb through `src/core/units.ts`.
  - Done when tests cover: 0.5 / 1 / 1.5 / 2 servings, S/R/L, per-100 g grams, a recipe with a missing fat value, a recipe edited after logging, and lb ↔ kg for weigh-ins.
  - Deps: 1.
- [x] 8. [core-engineer ∥B, after 7] Day totals, slots, recents, nudges and hints, **tests first**.
  - Files: src/core/nutrition/day.ts(+test).
  - `dayTotals`, `remaining` (never shown negative; "over by" instead).
  - `slotFor(time, lastSessionEnd)` per M7-q1. Day boundary at local midnight (M7-q8).
  - `recentItems(entries, n)`, deduplicated by ref + amount.
  - `nudgeFor(now, totals, targets, shownToday)` per M7-q6.
  - `postWorkoutHint(totals, targets)` ("45 g protein to go today" / "Protein target hit today").
  - `nutritionHistory(entries, sessions, days)` with training days marked.
  - Done when tests cover: the slot boundaries, post-workout, an entry at 23:59 vs 00:01, recents, the nudge firing at most once a day, every hint passing `checkCopy`, and training-day marks from finished sessions only.
  - Deps: 1, 7.
- [x] 9. [core-engineer ∥C] Food search + lazy loader, **tests first**.
  - Files: src/core/nutrition/search.ts(+test), src/data/nutrition/foodDb.ts(+test).
  - Pure ranking over `FoodDbRow[]` plus my foods, recipes and Thai dishes. My items come first, then exact, prefix and contains matches, shorter names first. English and Thai tokens.
  - The loader fetches the `?url` asset once and caches it in memory. The fetch is injected in tests.
  - Done when tests (on a fixture) cover: ranking, Thai queries, an empty query, the loader fetching once and showing an error state when offline before the first load, and search over 50k made-up rows staying under 50 ms in Vitest.
  - Deps: 1. Check the format against task 3's real output when it lands.
- [x] 10. [core-engineer ∥C] Persistence, **tests first**.
  - Files: src/data/db.ts(+test), src/data/nutrition/store.ts(+test).
  - Dexie **version(5)**, new tables only:
    - `foods` (`id, name, barcode`);
    - `recipes` (`id`);
    - `foodEntries` (`id, date, time`);
    - `weighIns` (`date`, one per date, the latest wins, M7-q10);
    - `favorites` (`id, createdAt`);
    - `weeklyChecks` (`weekStart`).
  - Nutrition settings live under settings key `'nutrition'`.
  - Store functions: CRUD, `seedOnce` (Protein shake as a favorite), `setMode`.
  - Done when tests cover: a v4 → v5 upgrade that keeps every existing row, seeding only once, a mode switch that loses no entry field, a delete followed by restore (for Undo), and every existing db test passing. Record the version bump as a Decision.
  - Deps: 1.

#### Screens (ui-engineer; props in, callbacks out, no DB; render tests + 390×844 harness screenshots in the 3 accents; tokens only)
- [x] 11. [ui-engineer] Fuel tab.
  - Files: src/ui/screens/fuel.ts(+test), src/ui/fuel/rings.ts(+test), src/ui/tabBar.ts, src/ui/icons.ts, src/styles.css.
  - A 4th tab, "Fuel" (M7-q7).
  - Rings: kcal + protein, plus carbs + fat in Full mode.
  - Remaining amounts in big numbers (≥ 64px), with "estimate" tags.
  - Today's entries grouped by slot. Each entry can be edited or deleted (delete uses the Undo toast).
  - A weigh-in button, a nudge banner slot, and an empty state ("Set up your targets").
  - Done when: render tests (Quick/Full, empty, over target) and screenshots pass.
  - Deps: 1.
- [x] 12. [ui-engineer] Log sheet.
  - Files: src/ui/fuel/logSheet.ts(+test).
  - Sections in SPEC order: favorites & recent, my recipes, Thai dishes, quick estimate, search, my foods (barcode is added in 21).
  - Portion stepper (0.5 steps) and S/R/L chips.
  - Quick-estimate form: name + kcal + protein, carbs/fat in Full mode, Light/Regular/Big presets (M7-q3), and "Save as favorite".
  - Search results arrive through a callback. Loading and offline states.
  - Focus trap and Escape, as in the Pause sheet.
  - Done when: a render test proves a favorite logs in ≤ 3 taps (open, item, Log), and screenshots pass.
  - Deps: 1.
- [x] 13. [ui-engineer] Recipe and My food editors.
  - Files: src/ui/fuel/recipeEditor.ts(+test), src/ui/fuel/myFoodEditor.ts(+test).
  - Recipe editor: ingredients in grams (picked through the search callback), servings, and a live per-serving preview.
  - My food: per 100 g or per serving, with an optional serving weight.
  - Done when: render tests and screenshots pass.
  - Deps: 1.
- [x] 14. [ui-engineer] Setup and Settings → Nutrition.
  - Files: src/ui/fuel/setup.ts(+test), src/ui/screens/settings.ts(+test).
  - Setup asks for height, birth year, sex, activity level and today's weight. Today's weight becomes the first weigh-in (M7-q11).
  - Settings: a Quick/Full switch; targets with "estimate" tags and hand overrides; surplus 0–600 and protein 1.6–2.2 steppers; "Re-run setup".
  - Done when: render tests and screenshots pass.
  - Deps: 1.
- [x] 15. [ui-engineer] Weigh-in screen.
  - Files: src/ui/fuel/weighIn.ts(+test).
  - A kg/lb stepper (the unit setting).
  - Our own SVG trend chart with daily dots and the 7-day average line.
  - The weekly suggestion card (Accept / Not now; `needData` shows "Need more weigh-ins").
  - Nutrition history for the last 14 days, with training days marked.
  - Done when: render tests (all 4 card kinds, kg and lb) and screenshots pass.
  - Deps: 1.
- [x] 16. [ui-engineer] Workout link and nudges elsewhere.
  - Files: src/ui/screens/summary.ts(+test), src/ui/screens/today.ts(+test).
  - Summary: an optional `fuel` prop showing today's protein vs target plus the hint. It's hidden when there are no targets.
  - Today: the nudge banner slot.
  - Done when: render tests show both are hidden when props are absent, and the existing summary/today tests stay green.
  - Deps: 1.

#### Wiring, coach food (M10 F1–F3) and e2e
- [x] 17. [main] Wiring.
  - Files: src/ui/app.ts, package.json (the `build-foods` script).
  - New views and the Fuel tab. Load the store on the first Fuel open.
  - Compute targets, totals, nudges and the weekly check through core. Accepting a check writes `overrides.kcal`, or the surplus, and records the outcome.
  - Pass the Summary protein line. Use the Undo toast for deletes.
  - Search lazy-loads `foodDb`.
  - Nutrition never goes into dev-log events.
  - Done when, by hand: setup → log a favorite → the rings update, airplane mode (in a prod preview) still searches, and the existing e2e stays green.
  - Deps: 2, 4, 5, 6, 8, 9, 10, 11–16.
- [x] F1. [core-engineer, after 7+8] Food suggestions in the coach, **tests first** (replaces M10 F1).
  - Files: src/core/trainer/actions/food.ts(+test), src/core/trainer/coach.ts(+test), src/core/trainer/replies.ts(+test).
  - `suggestFood(remaining, favorites, recipes, thaiDishes)` → 3 items that fit the remaining protein, then kcal, each with a Log payload (a `FoodEntry` draft).
  - When `m7Available` is true, `food(ctx)` returns the suggestions. `FOOD_LATER` stays only for `m7Available: false`. Mid-session it is still not offered.
  - Done when tests cover: nothing left → "You've hit today's targets.", no targets/data → the help reply pointing to Fuel setup, protein-first ordering, every line passing `checkCopy`. Made-up numbers only.
  - Deps: 1, 7, 8 (M10 task 11 is done).
- [x] F2. [ui-engineer] Food result card in the coach sheet (replaces M10 F2).
  - Files: src/ui/coach/foodCard.ts(+test), src/ui/coach/coachSheet.ts.
  - 3 rows (name, portion, kcal / protein), each with a Log button (≥ 56px).
  - Done when: render tests and screenshots pass.
  - Deps: 1 (`FoodSuggestion`).
- [x] F3. [main] Coach wiring to the M7 log (replaces M10 F3).
  - Files: src/ui/app.ts.
  - Pass `m7Available: true` once targets exist. Log → the store, then the Undo toast, then a rerender.
  - Done when, by hand: "What should I eat?" → Log → the Fuel rings update.
  - Deps: 17, F1, F2.
- [x] 18. [ui-engineer] E2E `e2e/fuel.spec.ts` (390×844).
  - Cases: the SPEC M7 Accept flow:
    - set up targets → log a favorite, a recipe serving, a Thai dish (Large) and a quick estimate → the rings and remaining amounts update;
    - switch to Full mode → carbs/fat appear and no data is lost;
    - weigh-ins over 2 fake weeks (clock mocked) → the suggestion card → Accept → the new target.
  - Also: delete + Undo, the coach food chip → Log (F3), offline search after the first load (prod preview, `context.setOffline`), and 0 off-device requests.
  - Done when: it passes with `--repeat-each=3` and the full `npm run e2e` is green.
  - Deps: 17, F3.

#### Barcode track (optional, off by default; cut the whole track if M7-q5 says no)
- [x] 19. [core-engineer ∥] Barcode core, **tests first**.
  - Files: src/core/nutrition/barcode.ts(+test), src/data/nutrition/offClient.ts(+test).
  - EAN-13 / EAN-8 / UPC-A checksum validation.
  - Open Food Facts JSON → `Food` (per 100 g, `source: 'openfoodfacts'`, kJ → kcal fallback, rejects missing kcal or protein).
  - The client has an injected fetch and a 10 s timeout. The URL holds only the barcode, there are no other params or headers with user data, and it is never called while the setting is off.
  - Done when tests cover: checksums, parsing (missing/odd units), the request shape, setting off → 0 calls, and the result saved to My foods so the next lookup is local.
  - Deps: 1.
- [x] 20. [main] Scanner dependency.
  - Files: package.json, vite.config.ts.
  - Pick an on-device barcode library for Safari (no `BarcodeDetector` on iOS). Check the current docs and size, and prefer a small wasm build (e.g. zxing-wasm). Precache its wasm so it works offline.
  - Done when: `npm run build` precaches it and the bundle-size delta is recorded in the Decision.
  - Deps: none (after M7-q5).
- [x] 21. [ui-engineer] Scanner UI + setting.
  - Files: src/ui/fuel/barcodeScan.ts(+test), src/ui/fuel/logSheet.ts, src/ui/screens/settings.ts, index.html (CSP `connect-src` + `https://world.openfoodfacts.org`).
  - Uses `BarcodeDetector` where it exists, else the library, else typing the digits.
  - The setting shows its explainer before it turns on: "Looks up the barcode number online. Nothing else is sent."
  - Camera frames stay on the phone and nothing is recorded.
  - Done when: render tests and screenshots pass, and the section is hidden while the setting is off.
  - Deps: 14, 19, 20.
- [x] 22. [main] Barcode wiring. Files: src/ui/app.ts. Done when, by hand, typed digits → result → saved to My foods → the second lookup works offline. Deps: 17, 21.
- [x] 23. [ui-engineer] E2E `e2e/barcode.spec.ts` with `page.route` mocks: off → 0 requests to openfoodfacts; on → the URL holds only the code; not found → a "Add it to My foods" path. Done when: green with `--repeat-each=3`. Deps: 22.

#### Close
- [x] 24. [reviewer] Review the branch diff against CLAUDE.md:
  - pure core (no DOM or fetch in `src/core/nutrition`);
  - no personal numbers anywhere in the repo;
  - copy passes `checkCopy`, with no diet or medical claims;
  - 64 / 20 / 56px, tokens only;
  - the only network call is the barcode lookup, and only when it's on;
  - nutrition data is kept out of the dev log;
  - no M7b scope crept in.
  - Deps: 18, 23 (or 18 alone if the barcode track is cut).
- [x] 25. [verifier] Verify against SPEC M7 Accept.
  - Run `npm run check`, `npm run e2e` and `npm run build`. Report the food-DB gzip size against the 2 MB budget.
  - Airplane-mode run in the prod preview.
  - 390×844 screenshots `docs/screenshots/m7-*`, console clean.
  - Evidence goes into PROGRESS.
  - Deps: 24.
- [x] 26. [main] Merge `m7-fuel` + **ask Wongsaton before pushing** (push = deploy). Deps: 25.

**Parallel waves:**
- **Start now (no deps):** 1 [main], 2 [main], 3 [core, needs one download], and 20 [main, only once M7-q5 is answered].
- **Wave 1 (after 1):**
  - core: up to 3 instances: A 5 → 6; B 7 → 8 → F1; C 9, 10, 19. Instance C, or the task-3 instance, goes on to 4 after 3.
  - ui: 11, 12, 13, 14, 15, 16 and F2 (2 instances, e.g. 11 + 12 + 16 and 13 + 14 + 15 + F2).
- **Wave 2:** 17 [main], 21 [ui, after 14 + 19 + 20].
- **Wave 3:** F3, 22 [main].
- **Wave 4:** 18 and 23 [ui] → 24 → 25 → 26.
- **Critical path:** 3 → 4 (USDA download + ~40 reference recipes, the longest single job) → 17 → F3 → 18 → 24 → 25 → 26. The logic path 1 → 7 → 8 → F1 → F3 is shorter.

### M4f — Camera for more exercises (planned 2026-11-14; wave 1 first, wave 2 after Checkpoint F1)
**Contract:** SPEC M4f (both rule tables, the `learning` status, the UI copy, Accept) and the Decision "M4f scope and the learning state" (2026-11-14).
- All logic and rule data is **tests first**.
- Nothing is pushed or deployed without Wongsaton's OK.

**Branch:** `m4f-camera-more`, cut from `m4d-demos` once the M4d batch the 3D engineer is building now has merged. Until then nobody edits `src/ui/demo3d/**`.

**Fit with the current code (why the plan looks like this):**
- `tracking: 'pose'` lives per planned exercise in `src/data/program.json`. The Camera badge, the Camera button and the Rest Camera button all follow it. `ruleFor(id)` gives the rule, and `index.test` already checks the pose ids and the rules one to one.
- **Tests that hard-code "the six" break as soon as a seventh rule exists:**
  - `index.test.ts`: the pose-id list; "only the press starts contracted / has an extended gate"; "only the lateral raise is increasing"; "leg only for the squat". Wave 2 also breaks "triplets mirrored by +1", because of the cross-body reverse-fly triplet.
  - `moves.test.ts`: `ALL_MANUAL` must have no rule, and `POSE_TRACKED` is a fixed list.
  - `catalog.test.ts`: every tracked exercise's tempo matches `Lift 1 s · Lower 2 s | Down 2 s · Up 1 s`. Concentration curls is `Lift 1 s · Hold 1 s · Lower 2 s`.
  - `e2e/howto.spec.ts`: the Push A badge table and the Pull A "3D demo only" rows (Hammer Curls).
- **The fixture suite** fails on a `fixtures/landmarks/<folder>/` that has no rule. The synthetic JSON can be rendered at any time, but it lands in the same commit as its rule or after it.
- `scripts/devlog.mjs` keeps `KNOWN_FOLDERS` by hand, and `devlog.test.mjs` checks it against the rules.
- The learning limit needs no change in `cameraView`'s focus tracker. It already reads `focusFlagsFor(rule, counter.rule)`, so masking in core is enough.

**Ownership:**
- core-engineer: `src/core/exercises/**`, `src/data/program.json`, `src/data/catalog.test.ts`, `src/data/devlog.ts`.
- pose-engineer: `tools/synthetic.ts`, `scripts/synthetic.mjs`, `fixtures/**`, `scripts/devlog.mjs`, `e2e/camera.spec.ts`.
- anatomy-3d-engineer: `src/ui/demo3d/**`.
- ui-engineer: badges, the camera page, the "Last set" fix, styles, the other e2e specs.
- main: `playwright.config.ts`, `app.ts` (only if needed), git.

#### Wave 1 — the easy six (starts when the M4d batch merges)
- [x] 1. [core-engineer ∥A] Rule status + learning mask, **tests first**.
  - Files: src/core/exercises/types.ts, index.ts, the six existing rule files (one line each), index.test.ts.
  - `RuleStatus = 'learning' | 'tuned'`, plus a **required** `status` on `ExerciseRule`. The six existing rules get `'tuned'`.
  - In index.ts:
    - `LEARNING_FOCUS_IDS = ['rushedLowering', 'stalled', 'outOfFrame', 'lowFps']`;
    - `focusFlagsFor` turns off every other id for a learning rule (`shrinkingRange` + the form rules);
    - `GRANDFATHERED_TUNED` = the six original folders;
    - `rulesTunedWithoutRealFixtures(rules, realFolders)`, the same shape as `formRulesWithoutRealFixtures`;
    - `ruleStatus(exerciseId): RuleStatus | undefined`.
  - Done when index.test covers:
    - every rule declares a status;
    - a learning rule declares only `LEARNING_FOCUS_IDS` flags and no form key;
    - `focusFlagsFor` on a learning rule with `shrinkingRange: true` forced → false, while `rushedLowering` stays true;
    - the guard returns `['<folder>']` for a fake tuned new rule without `real-*` files and `[]` for the grandfathered six;
    - the six are tuned, and their flags and fixture counts are unchanged (23 cases).
  - Deps: none.
- [x] 2. [core-engineer ∥A, after 1] The six wave 1 rules as data, **tests first**.
  - Files: src/core/exercises/{hammerCurl,concentrationCurl,inclineCurl,dbShoulderPress,bentOverRow,tricepsExtension}.ts, index.ts (`RULES`), index.test.ts, repCounter.test.ts.
  - Values: exactly the SPEC M4f wave 1 tables (folder, view, triplet, start/eccentric, thresholds, gates, hints, placement), with `status: 'learning'` and the learning focus flags.
  - Rewrite the "only X" tests in index.test as per-folder tables: start, direction, extended gate, limb.
  - Done when:
    - index.test covers the SPEC value table, every hint ≤ 6 words, placement lines ≤ 8 words, and the spoken sentence (with the distance);
    - repCounter.test, from built angle curves for each new rule: 4 clean reps → 4, a turn 15° past start but short of far → one `far` partial, ±8° jitter in the start band → nothing;
    - for triceps extension and the DB press, hanging arms (wrist below shoulder) curled up to the start → 0 reps;
    - `npm run check` is green with task 5 applied. **This lands together with or after task 5**: the rules break `moves.test` line 97 until then.
  - Deps: 1, 5.
- [x] 3. [core-engineer ∥A, after 2] Program flip + data tests.
  - Files: src/data/program.json (`tracking: "pose"` for the six), src/data/catalog.test.ts, index.test.ts.
  - `catalog.test.ts`: widen the tempo check to allow an optional `Hold 1 s` (the demo timing test still pins eccentric 2 s / concentric 1 s).
  - `index.test.ts`: the pose-id list becomes the 12.
  - Done when `npm run check` is green **in one commit with task 10's howto.spec update** (the main session integrates).
  - Deps: 2.
- [x] 4. [core-engineer ∥B] `ruleStatus` in the dev log, **tests first**.
  - Files: src/data/devlog.ts(+test), and src/data/db.ts if the row type needs it.
  - `DevLogSetStart.ruleStatus?: RuleStatus` is stored, then exported in the set's `camera` block.
  - Done when: a round-trip test covers it; an old row without it still exports; the size test still holds.
  - Deps: 1 (type only; can start on the literal union).
- [x] 5. [anatomy-3d-engineer] Make `moves.test.ts` data-driven.
  - Files: src/ui/demo3d/moves.test.ts, plus moves.ts only if a newly tracked demo misses its thresholds.
  - Changes:
    - `POSE_TRACKED` = every demo whose exercise has a rule. Keep the original six as a floor (`toEqual` superset).
    - "Manual has no rule" becomes "program `tracking: 'manual'` ⇒ `ruleFor` undefined".
    - The manual-range block keeps filtering by `!ruleFor`.
  - The newly tracked demos must then pass "≥ 10° past both thresholds", "starts where the rule starts, lowers the way it says" and "eccentric 2 s".
  - Checked by hand: Hammer 180→30 vs 150/70, DB shoulder press 50→178 vs 143/80, triceps extension 180→45 vs 150/80 all clear. Also check the Pull B demos (concentration, incline, bent-over row) if the batch built them.
  - Done when: moves.test passes with task 2's rules applied (a local patch is enough to check), and all other demo tests are unchanged.
  - Deps: **the M4d batch merged**.
- [x] 6. [pose-engineer ∥] Synthetic clips for the six.
  - Files: tools/synthetic.ts (six `EX` entries, original mannequin poses), scripts/synthetic.mjs, `fixtures/synthetic/<folder>/synthetic-0{1,2}*.webm`, `fixtures/landmarks/<folder>/synthetic-01__reps-4__partials-0.json` and `synthetic-02__reps-3__partials-2.json`.
  - Poses:
    - hammer: the curl pose, thumbs up;
    - concentration: seated, elbow on the inner thigh, camera at ~3/4 from the working side;
    - incline curl: torso reclined ~45°, arm hanging behind the torso line;
    - DB shoulder press: the seated-press pose with a back pad;
    - bent-over row: hinged ~45–60°, both arms rowing, no bench;
    - triceps extension: standing, both hands on one dumbbell overhead, side camera.
  - Partial turns land ≥ 15° past the start threshold and ≥ 10° short of the far one *as MediaPipe reads them* (it reads bent ends ~8–10° shallow).
  - Rules:
    - existing clips stay byte-identical;
    - a clip under ~90% detection isn't committed (report it);
    - thresholds are not touched: a clip the counter miscounts goes back to core-engineer.
  - Done when: 12 JSON files with their detection rates, and the fixture suite counts each one by its filename (35 cases).
  - Deps: none to start rendering (thresholds are in the SPEC). The JSON lands with or after task 2.
- [x] 7. [pose-engineer, after 2 + 4] Converter + camera e2e.
  - Files: scripts/devlog.mjs, scripts/devlog.test.mjs, e2e/camera.spec.ts.
  - `KNOWN_FOLDERS` += the six. The report prints "learning" on those sets.
  - camera.spec: Hammer Curls now offers the camera, and Dumbbell Bench Press still doesn't.
  - Done when: `npm run test:scripts` passes (including a learning set in a synthetic export), and camera.spec is green.
  - Deps: 2, 4.
- [x] 8. [ui-engineer ∥C] "Learning" badge.
  - Files: src/ui/badges.ts, src/ui/howto.test.ts, src/ui/howto.css (tokens only), src/ui/icons.ts if a glyph is added (original, same 24 grid).
  - `BadgeKind` += `'learning'`. `badgeList` appends `{ kind: 'learning', label: 'Learning' }` when `tracking === 'pose'` and `ruleStatus(id) === 'learning'`.
  - Neutral pill, ≥ 20px. Not amber, not `--cta`.
  - Done when unit tests show:
    - Hammer (pose) → `['3D demo', 'Camera', 'Learning']`;
    - Dumbbell Bicep Curl → `['3D demo', 'Camera']`;
    - a learning rule with `tracking: 'manual'` → no Learning;
    - typecheck and lint clean.
  - Deps: 1 (can start on a stubbed `ruleStatus`).
- [x] 9. [ui-engineer, after 8] Learning note on the camera page and the "Last set" fix.
  - Files: src/ui/cameraView.ts, src/ui/lastSetCorrection.ts, src/ui/screens/rest.ts and summary.ts (only if the fix row needs the status passed in), src/styles.css / handsfree.css (tokens).
  - Camera page:
    - a "Learning" chip in the top band (`data-learning`, accessible name per the SPEC);
    - the setup-card line "Still learning: fix the count on Rest." (`.setup-learning`, after the placement lines);
    - pass `ruleStatus` to `recorder.beginSet`.
  - Fix row: "Camera still learning. Fix it if it's off." under a learning camera set's "Last set", on Rest, in the camera rest mode and on Summary.
  - Nothing spoken.
  - Done when:
    - typecheck and lint clean;
    - camera-layout, rep-panel, hands-free, devlog-camera and focus-cues are still green;
    - the chip fits next to the title at 390×844 and 375×667 without wrapping the Close button.
  - Deps: 1, 4, 8.
- [x] 10. [ui-engineer, after 3 + 6 + 9] E2E.
  - Files: `e2e/learning.spec.ts` (new), e2e/howto.spec.ts.
  - Cases:
    1. Pull A preview: Hammer Curls `['3D demo', 'Camera', 'Learning']`, Dumbbell Bicep Curl without Learning. Push A table: Triceps Extension gets Camera + Learning.
    2. The in-session list sheet and the Exercise header show the same badges.
    3. Hammer Curls camera with the fixture landmarker on `hammer-curl/synthetic-01`: the chip and the setup line are visible, 4 reps are counted, and the gauge is present.
    4. Set done → Rest shows the learning line beside Fix; Fix changes the row.
    5. The dev-log export has `ruleStatus: 'learning'` on that set and `'tuned'` on a curl set.
    6. The Bicep Curl camera has no chip.
    7. No third-party request.
  - Done when: it passes with `--repeat-each=3` and the full `npm run e2e` is green.
  - Deps: 3, 6, 9, 11.
- [x] 11. [main] Integration.
  - Files: playwright.config.ts (put learning.spec in the fixture-landmarker project), app.ts only if the fix row needs the status passed in.
  - Commit order: 5 → 1 → 2 + 6's JSON → 3 + 10's howto.spec → 4, 7, 8, 9.
  - Done when `npm run check` and `npm run e2e` are green after each commit.
  - Deps: as listed.
- [ ] 12. [reviewer] Review the branch diff against CLAUDE.md:
  - rules are data, with no `if (exercise === …)`;
  - learning is enforced in core, not only in the UI;
  - no form flag on a new folder, and no `tuned` without `real-*`;
  - hints and placement use coaching words only;
  - sizes (20 / 56 / 64px), and colour roles (Learning is neutral, not warn or cta);
  - nothing new spoken;
  - privacy: `ruleStatus` is an enum only.
  - Deps: 7, 10.
- [ ] 13. [verifier] Verify wave 1 against SPEC M4f Accept.
  - `npm run check`: the fixture suite has 35 cases with unchanged old counts, and the guard and mask tests are green. Also `npm run e2e` and `npm run build`.
  - 390×844 screenshots, console clean: `docs/screenshots/m4f-badges-pull-a.png`, `m4f-camera-learning-hammer.png`, `m4f-camera-setup-triceps.png`, `m4f-rest-learning-fix.png`, `m4f-handsfree-rest-learning.png`.
  - `npm run devlog -- --dry-run` on an export marks the learning set.
  - Evidence goes into PROGRESS.
  - Deps: 12.
- [ ] 14. [main] Merge `m4f-camera-more`, then **ask Wongsaton before pushing** (push = deploy). Deps: 13.
- [ ] 15. 🧍 **Checkpoint F1 (wave 1 gym data).**
  - Wongsaton trains with hands-free on: Pull A (hammer), Pull B (concentration, incline curl, bent-over row), Push A (triceps extension), Push B (DB shoulder press).
  - He does ≥ 2 camera sets per new exercise, fixes every miscount on Rest, notes any placement that didn't work, then exports the dev log.
  - Deps: 14.
- [ ] 16. [pose-engineer, after 15] Convert the agreed sets.
  - Run `npm run devlog` → `fixtures/landmarks/<folder>/real-<date>-s<n>__reps-<logged>__partials-<logged>.json`, landmarks only, **only sets Wongsaton OKs** (M4f-q8).
  - Done when: the files are committed-ready, with a per-set report of counted vs logged.
  - Deps: 15.
- [ ] 17. [core-engineer, after 16] Replay, retune, promote, **tests first**.
  - Replay each real set through the counter (and the focus tracker with timing rules on).
  - Retune thresholds only as a Decision with the numbers.
  - Flip `status: 'tuned'` per folder that meets the SPEC M4f criteria. `shrinkingRange` goes on only if ≤ 1 fire per real clip.
  - Done when: the fixture suite counts every real set, the guard test is green, and the Decision table (folder × criterion × result) is written.
  - Deps: 16.
- [ ] 18. [reviewer] then [verifier] on the promotion diff (badge gone for the promoted exercises; screenshots). [main] then merges and asks to push. Deps: 17.

**Wave 1, parallel lanes:**
- **Right away, before the batch merges (no demo3d files):**
  - 1 [core ∥A];
  - 4 [core ∥B];
  - 6 [pose], rendering only;
  - 8 [ui ∥C], on a stubbed `ruleStatus`.
- **When the batch merges:** 5 [anatomy-3d]. Then 2 [core ∥A, after 1 + 5].
- **Then:**
  - 3 [core ∥A];
  - 7 [pose, after 2 + 4];
  - 9 [ui, after 1 + 4 + 8].
- **Last:** 11 → 10 → 12 → 13 → 14 → 🧍 15 → 16 → 17 → 18.
- **Critical path:** batch merge → 5 → 2 → 3 → 10 → 12 → 13. Core ∥A and ∥B never share a file (exercises/* vs devlog.ts).

- **Evidence, wave 1 tasks 1–5, 8 (2026-11-14):** M4d batch 2 committed first (bb227b2, reviewer PASS). Then tasks 1–5, 8 and the task-10 howto.spec update, reviewer PASS: `npm run check` on the exact staged tree → vitest 51 files / 1802 tests, scripts 24/24; `e2e/howto.spec.ts` 3/3. Task 5 changed one demo keyframe: bent-over row far elbow 80° → 75° (15° past the < 90° threshold). Not shippable yet: tasks 6, 7, 9, 10 (synthetic fixtures, converter, camera chip/setup line, `ruleStatus` into `beginSet`) must land before any push.

- **Verification, wave 1 (2026-11-14, verifier re-run on 96b0971):** PASS on SPEC M4f wave-1 Accept and tasks 1–11. `npm run check` 52 files / 1836 tests, scripts 29/29; `npm run build` OK (main 107.22 kB gzip); full e2e 111 passed, 1 skipped (opt-in HISTORY_SHOTS), no flakes; learning.spec ×3 33/33. Screenshots `docs/screenshots/m4f-*.png`. First verifier run FAILED (setup card clipped at 390×844, e2e gaps) → fixed in 80f9f3d.
  - **Known limitation (main, decided):** at 375×667 the camera set-up card is a short scroll box (content cut; "Got it" stays fully visible, 56px, and the rep number is never covered). This also affects tuned exercises and predates M4f; the target phone is 390×844+ (CLAUDE.md, iPhone 17 Pro). Follow-up: make the set-up card fit small phones (ui-engineer), and assert scrollHeight ≤ clientHeight in learning.spec:328.

#### Wave 2 — the doable nine (after Checkpoint F1 and his answers to M4f-q2/q6/q7, or their defaults)
- [ ] 19. [core-engineer] New triplets, **tests first**.
  - Files: src/core/exercises/triplets.ts, index.test.ts, src/core/angles.test.ts if needed.
  - New triplets:
    - `HIP` (shoulder–hip–knee);
    - `ANKLE` (knee–ankle–foot index);
    - `SHOULDER_LINE` (other shoulder–shoulder–elbow, cross-body).
  - The "mirrored by +1" test allows a declared cross-body triplet: the joint and the end stay mirrored, and the far point is the twin of the joint.
  - Done when: angle tests on built landmarks (hinge 90°, a standing hip ~170°, ankle 75→130, arm hanging vs level ~95→175) pass and the fixture suite is unchanged.
  - Deps: 15.
- [ ] 20. [core-engineer, after 19] The nine wave 2 rules as data, **tests first**, exactly as SPEC M4f wave 2 (all `learning`).
  - Same test shape as task 2, plus:
    - the calf raise and reverse fly as `increasing` rules;
    - step-up and pushdown starting contracted;
    - lunge, step-up, deadlift and calf as `leg`.
  - Calf raise: the 25° span leaves exactly the hysteresis room; check the partial depth (15 < 25) still holds.
  - Done when: `npm run check` is green with task 22 applied. Same landing rule as task 2 / task 5.
  - Deps: 19.
- [ ] 21. [core-engineer, after 20] Program flip for the nine + catalog tempo check.
  - Allow `Pull … · Return …` / `Push … · Return …` and the Hold variants.
  - Lunge targets per M4f-q6 (default: 10–12 → 20–24 total).
  - Done when check is green with task 25's howto.spec update.
  - Deps: 20.
- [ ] 22. [anatomy-3d-engineer] Demos vs the wave 2 thresholds.
  - Files: src/ui/demo3d/**.
  - The demos must pass the ≥ 10° test:
    - lunge 165→90 vs 155/110;
    - deadlift 167→90 vs 155/115;
    - calf 75→130 vs 90/115;
    - pushdown 75→175 vs 155/105;
    - pulldown 152→35 vs 140/70;
    - plus face pull, cable row and step-ups if the batch built them.
  - **The reverse fly demo measures hip–shoulder–elbow, but the rule measures the upper arm against the shoulder line.** Add a `shoulderLine` measure, or map it in the test.
  - Done when moves.test passes with task 20's rules.
  - Deps: 20 (values), any later M4d batch merged.
- [ ] 23. [pose-engineer ∥] Synthetic clips for the nine (machines as box props, like the row bench). Same rules as task 6. 18 JSON files, and the suite is at 53 cases. The JSON lands with or after task 20. Deps: none to render.
- [ ] 24. [pose-engineer, after 20] Converter `KNOWN_FOLDERS` += the nine, and camera.spec adds a leg exercise (Lunges) offering the camera. Deps: 20.
- [ ] 25. [ui-engineer, after 21 + 23] E2E + labels.
  - Update howto.spec for Legs A/B and Pull B.
  - learning.spec gets a leg case: the Lunges camera with `lunge/synthetic-01` shows "Right leg"/"Left leg" and the chip.
  - The lat pulldown setup card reads "Phone behind you": the pictogram stays front, and the text says behind.
  - Done when: `--repeat-each=3` passes and the full e2e is green.
  - Deps: 21, 23.
- [ ] 26. [reviewer] → 27. [verifier] (same checks as 12/13; suite 53 cases; screenshots `m4f-w2-badges-legs-b.png`, `m4f-w2-camera-lunge.png`, `m4f-w2-setup-pulldown.png`) → 28. [main] merge + ask to push. Deps: 24, 25, 22.
- [ ] 29. 🧍 **Checkpoint F2 (wave 2 gym data).** Legs A, Legs B, Pull A, Pull B and Push B; the same routine as F1. Then 30. [pose-engineer] convert → 31. [core-engineer] replay, retune, promote → 32. [reviewer]/[verifier]/[main], as tasks 16–18.

**Wave 2, parallel lanes:** 19 and 23 right after F1; then 20; then 21, 22 and 24 in parallel; then 25 → 26 → 27 → 28 → 🧍 29.

### M10 — AI trainer (planned 2026-11-14; phase A first, B with M9, C optional)
**Contract:** SPEC M10 and the Decision "M10 direction" (2026-11-14). All logic is **tests first**. Ownership
follows CLAUDE.md, and shared types are `[main]`. Native/iOS files have no owner in the table yet
(M10-q9), so those tasks are tagged `[main]` until Wongsaton approves an owner.

**Branch:** `m10a-trainer`, cut from main (c5e3a0d) on 2026-11-14 after M4d + M4f wave 1 shipped. The order against M7 and the open checkpoints is
M10-q8.

**Fit with the current code (why the plan looks like this):**
- `program.json` is imported statically (`src/data/catalog.ts`).
- Up next is "last session's day + 1" in `app.ts loadUpNext`, so there's no calendar yet.
- `startSession(day, …)` takes a `ProgramDay`, so an adjusted day can be passed in without changing the
  reducer's shape.
- `defaultsFor` prefers last time's weight over the plan. That's why lighter/deload needs `weightKgToday`.
- `exercises.json` holds only the 30 program exercises, so swaps need a vendored swap pool.

#### Phase A — trainer actions + coach chat (web)
- [x] 1. [main] Shared types.
  - Files: src/core/types.ts.
  - Add `BodyArea`, `UserPlan`, `Schedule`, `DayAdjust`, `DayOverride`, `TrainerState`, `Proposal`,
    `PlanChange` (SPEC M10 data model).
  - `PlannedExercise` gains `weightKgToday?` and `adjusted?`.
  - Done when: typecheck passes and the shapes match the SPEC.
  - Deps: none.
- [x] 2. [core-engineer ∥A] Body areas, equipment and swap pool, **tests first**.
  - Files: src/data/bodyAreas.json (new: area → free-exercise-db muscles; joint words → area),
    src/data/equipment.json (new: what his gym has, M10-q6), src/data/exercises.json (+ ~20–30 swap-pool
    exercises vendored from free-exercise-db), src/data/cues.json, src/data/howto.json,
    src/data/catalog.ts(+test).
  - `catalogExercises()` lists the whole catalog. Program exercises stay a subset.
  - Done when tests show:
    - every catalog exercise has muscles, a cue (≤ 8 words) and 2–3 how-to lines;
    - every muscle maps to exactly one area and to an SVG path id (the M2 test, widened to the catalog);
    - every equipment value is in equipment.json;
    - every program exercise has ≥ 1 swap candidate;
    - no banned words.
  - Deps: none.
- [x] 3. [core-engineer ∥B] Plan, schedule and calendar, **tests first**.
  - Files: src/core/trainer/plan.ts(+test).
  - `seedPlan(program)`, `effectiveDay(state, date)`, `calendar(state, finishedSessions, fromDate, days)`
    → `{ date, dayId | null, rest, override? }[]`, and `upNext(...)`.
  - Default schedule: rotation = the program order; rest weekdays per M10-q1 (answered: none, `[]`; still supported when set).
  - Done when tests cover:
    - the rotation after the last finished session (unfinished sessions ignored);
    - rest weekdays and missed days;
    - a rest override and a train override;
    - Sunday 23:59 / Monday 00:00 and a DST week;
    - `upNext` equalling today's behaviour when there are no overrides and no rest weekdays (no regression).
  - Deps: 1.
- [x] 4. [core-engineer ∥B, after 3] Apply / Undo, **tests first**.
  - Files: src/core/trainer/changes.ts(+test).
  - `applyProposal(state, proposal, now, source)` → `{ state, change }`: rejects a stale `baseVersion` and
    bumps `version`.
  - `undoLast(state, changes)`: LIFO; only the newest change that isn't undone; restores `before`.
  - `resetToProgram(state, program)` is itself a change, so it can be undone.
  - Overrides older than 14 days are pruned on apply.
  - Done when tests cover: a round trip that restores the state exactly, a stale proposal rejected, undo of
    an undone change rejected, reset + undo, and pruning.
  - Deps: 1, 3.
- [x] 5. [core-engineer ∥C] Session: `weightKgToday` and `REPLACE_UPCOMING`, **tests first**.
  - Files: src/core/session.ts(+test).
  - `defaultsFor` prefers `weightKgToday` over last time over the plan. A logged set today still wins for
    the next set.
  - New event `REPLACE_UPCOMING { exIndex, planned: PlannedExercise | null, now }`: `null` removes the
    exercise. Accepted only when that exercise has 0 logged sets, it isn't the running set, and the session
    isn't paused. It's applied to `day.exercises`, and the indices of the current set and later exercises
    stay right.
  - Done when tests cover: default precedence, replace/remove before and after the current index, rejection
    with logged sets, rest phase, the summary after a removal, and every existing session test passing.
  - Deps: 1.
- [x] 6. [core-engineer, after 3+4] Action: Not today / move session, **tests first**.
  - Files: src/core/trainer/actions/postpone.ts(+test).
  - `proposePostpone(state, sessions, today, { mode: 'useRestDay' | 'pushWeek', to?: date })` → a Proposal
    with a 7-day before → after preview and a why.
  - Done when tests cover:
    - both modes;
    - postpone on the day before the rest day;
    - postponing on a rest day → no proposal, with a "today is already a rest day" reply;
    - postponing twice in a row;
    - "move to <date>" onto a date that already has a session;
    - a session already started today → no proposal ("finish or end today's workout first").
  - Deps: 3, 4.
- [x] 7. [core-engineer, after 2+4] Action: go easy on an area, **tests first**.
  - Files: src/core/trainer/actions/avoidArea.ts(+test), src/core/trainer/swapCandidates.ts(+test).
  - `swapCandidates(exercise, catalog, { avoid?: BodyArea, exclude: ids, equipment })`: ranked by overlap of
    primary muscles, then secondary, then the same `tracking`. `tracking: 'pose'` only when a rule exists.
  - `proposeAvoidArea(day, area, catalog, opts)`:
    - primary in the area → swap, or remove when there's no candidate;
    - secondary only → lighten (default per M10-q2);
    - a whole day in the area (e.g. legs on a Legs day) → suggests "Not today" or a different day
      instead.
  - Done when tests cover:
    - arms on Pull A (curls removed or swapped, rows lightened);
    - arms on Push A (triceps extension swapped/removed, presses lightened);
    - legs on Legs A → a postpone suggestion;
    - a candidate never loads the avoided area (primary or secondary);
    - no candidate → remove;
    - swapped weights come from that exercise's history, else blank ("pick your weight").
  - Deps: 2, 4.
- [x] 8. [core-engineer, after 4] Actions: lighter today, deload week, swap, **tests first**.
  - Files: src/core/trainer/actions/lighter.ts(+test), src/core/trainer/actions/swap.ts(+test).
  - Lighter today: −1 set (minimum 2), −10% snapped down to the step in the display unit, bodyweight
    reps −20%.
  - Deload: dated overrides for 7 days with sets halved (rounded up) and −10%. The numbers are constants,
    pending M10-q3.
  - Swap: the top 3 candidates, scope `today` or `plan`.
  - Done when tests cover: kg and lb (35 lb → 30 lb, not 31.5), 2.5 kg minimum weights, bodyweight, 1-set
    exercises, deload spanning a rest day, swap scope `plan` changing every day that has the exercise, and
    swap excluding exercises already in the day.
  - Deps: 2, 4, 5 (`weightKgToday`).
- [x] 9. [core-engineer, after 4] Action: stalled → adjust, **tests first**.
  - Files: src/core/trainer/actions/stall.ts(+test). Reuses src/core/history.ts / stats.ts `topSet`.
  - `detectStalls(sets, sessions, plan)`: 3 finished sessions of the exercise in a row with no top-set gain
    (more weight, or more reps at the same weight), skipping sessions whose `adjust` is set.
  - `proposeStallFix(ex, option)`: `'lighter'` (−10%, rep top +2) or `'addSet'` (+1, maximum 5).
  - Done when tests cover: 2 sessions → none, 3 → stall, a lighter session in between is skipped, a gain
    resets it, bodyweight exercises, and the M5b N1 "drop" coexisting with it (one line each).
  - Deps: 4.
- [x] 10. [core-engineer ∥A] Intent matcher + eval set, **tests first**.
  - Files: src/core/trainer/intents.ts(+test), src/core/trainer/phrases.json (keywords per intent, area
    words, day words, discomfort and red-flag lists, diagnosis-term list; English + Thai per M10-q5),
    src/core/trainer/evals/requests.json (≥ 60 made-up requests: `{ text, intent, slots, safety,
    ruleSupported }`).
  - `matchIntent(text, ctx)` → `{ intent: 'postpone' | 'avoidArea' | 'lighter' | 'deload' | 'swap' |
    'stall' | 'food' | 'help', slots: { area?, date?, exerciseId?, scope? }, safety: 'none' |
    'discomfort' | 'redFlag' }`.
  - Done when:
    - ≥ 90% of `ruleSupported` items match intent + slots;
    - 100% of discomfort/red-flag items carry the flag;
    - unknown text → `help`;
    - no network or DOM;
    - the eval file has no personal data.
  - Deps: 1.
- [x] 11. [core-engineer, after 6–10] Replies, safety copy and the coach controller, **tests first**.
  - Files: src/core/trainer/replies.ts(+test), src/core/trainer/coach.ts(+test).
  - `replies.ts` turns a Proposal into title, lines, why and `say` (≤ 8 words), and holds:
    - the fixed referral line;
    - the fixed red-flag line;
    - the help text;
    - `checkCopy(text)` (M5b banned words + diagnosis terms).
  - `coach.ts`: `handle({ text } | { chip, args }, ctx)` → `{ reply, proposal?, chips[] }`. Context:
    phase, logged exercise ids, today, unit, M7 available.
  - Done when tests cover:
    - every reply text passes `checkCopy`;
    - discomfort → referral line + an area proposal (or an area chip question when no area is named);
    - red flag → only the End workout / Not today chips;
    - mid-session → only swap/remove of unstarted exercises;
    - food → the "comes with Fuel" reply before M7.
  - Deps: 6, 7, 8, 9, 10.
- [x] 12. [core-engineer ∥, after 1+3+4] Persistence, **tests first**.
  - Files: src/data/db.ts(+test), src/data/plan.ts(+test).
  - Dexie version(4):
    - `trainer` (key `'current'`: TrainerState);
    - `planChanges` (`++id, createdAt`);
    - a `SessionRow.adjust` field (no index).
  - `loadTrainerState(db, program)` seeds on first read. If `program.json`'s hash changed and `edited` is
    false, it re-seeds; if `edited` is true, it keeps the user plan (M10-q11).
  - `saveChange(db, change)`, `listChanges(db, limit)`.
  - Done when db tests cover: seed, re-seed, keep-if-edited, change list order, undo persisted, and every
    existing db test passing. Record the version bump as a Decision.
  - Deps: 1, 3, 4.
- [x] 13. [ui-engineer ∥] Coach sheet and proposal card.
  - Files: src/ui/coach/coachSheet.ts, src/ui/coach/proposalCard.ts, src/ui/coach/undoToast.ts,
    src/ui/coach/coach.css (new; tokens only).
  - Props in, callbacks out, no DB.
  - Contents:
    - message list;
    - chip row (≥ 56px, labelled icons);
    - area chips;
    - an optional text box (prop `allowTyping`);
    - Proposal card: title, before → after rows (24px+), why (20px), Apply (CTA) and Not now;
    - Undo toast with a 10 s bar (static under reduced motion);
    - a red-flag card style (danger only in confirmations, per M4e);
    - privacy line "Stays on this phone."
  - Focus trap and Escape, as in the Pause sheet.
  - Done when: render tests, 390×844 harness screenshots (chips, a proposal, red flag, Undo) in the 3
    accents, tokens test green, typecheck + lint clean.
  - Deps: 1.
- [x] 14. [ui-engineer ∥] Today, preview and Settings → Plan changes.
  - Files: src/ui/screens/today.ts, src/ui/screens/preview.ts, src/ui/screens/planChanges.ts (new),
    src/styles.css.
  - Today and preview:
    - a Coach button (≥ 56px);
    - a "Rest day" hero with **Train anyway**;
    - an "Adjusted today: …" banner with Undo;
    - the week strip from calendar entries (moved days marked).
  - The preview lists swapped/removed/lightened rows with an "Adjusted" badge.
  - Plan changes list: newest first, Undo on the newest one only, "Reset to default program" (two-tap).
  - Done when: render tests, 390×844 screenshots, typecheck + lint clean.
  - Deps: 1.
- [x] 15. [ui-engineer] Pause sheet Coach entry and Summary stall card.
  - Files: src/ui/screens/pauseSheet.ts, src/ui/screens/summary.ts, src/ui/coachSummary.ts.
  - Pause sheet: a "Coach" row that opens the sheet with `allowTyping: true` (the set isn't running while
    paused; Exercise/camera never show it).
  - Summary: a stall card under the M5b line with two options, each opening its Proposal.
  - Done when: render tests and screenshots.
  - Deps: 13.
- [x] 16. [main] Wiring.
  - Files: src/ui/app.ts, src/data/catalog.ts call sites.
  - Load the trainer state at startup.
  - Replace `loadUpNext` with `upNext(calendar…)`, and keep "never leave Start disabled".
  - Start uses `effectiveDay`, and the session row stores `adjust`.
  - Coach entry points call `coach.handle`. Apply → `applyProposal` + `saveChange` + rerender; mid-workout
    proposals dispatch `REPLACE_UPCOMING` per row.
  - Undo → `undoLast`. A mid-workout undo reverts only exercises that are still unstarted.
  - Spoken confirmation via the existing speaker (kind `cue`, not during a set, never cancelling).
  - Dev-log events `trainer { intent, action, outcome: 'shown' | 'applied' | 'dismissed' | 'undone',
    source }`: ids only.
  - Done when, by hand: Not today → Today moves, the avoid-arms day runs, Undo works, existing e2e green.
  - Deps: 5, 11, 12, 13, 14, 15.
- [x] 17. [ui-engineer] E2E `e2e/trainer.spec.ts`.
  - Cases: the SPEC M10 phase A Accept list. Also: Lighter today in lb shows 30 lb for a 35 lb default,
    reload keeps the plan, Reset + Undo, and no `input`/`textarea` on the Exercise screen during a set.
  - Done when: it passes with `--repeat-each=3` and the full `npm run e2e` is green.
  - Deps: 16.
- [x] 18. [reviewer] Review the branch diff against CLAUDE.md.
  - Pure core (no DOM, no fetch in `src/core/trainer`).
  - Every action goes through `propose*`; nothing applies without a tap; Undo everywhere.
  - Copy passes `checkCopy`; referral and red-flag lines are verbatim.
  - 56 / 64 / 20px, tokens only.
  - No typing mid-set; dev log ids only; no network.
  - Deps: 17.
- [x] 19. [verifier] Verify phase A against SPEC M10 Accept (phase A).
  - Run `npm run check`, `npm run e2e`, `npm run build`.
  - The intent-eval score.
  - 390×844 screenshots `docs/screenshots/m10-*`, console clean, 0 off-device requests.
  - Evidence into PROGRESS.
  - Deps: 18.
- [x] 20. [main] Merge `m10a-trainer` + **ask Wongsaton before pushing** (push = deploy). Deps: 19.
- [ ] 21. 🧍 **Checkpoint E:** a week with the coach (Not today, Go easy on…, a swap); he reports. Deps: 20.

**Later in phase A (needs M7):** now planned inside the M7 plan above as tasks F1–F3 (2026-11-15). Tick them there; the lines below are kept for reference.
- [ ] F1. [core-engineer] `actions/food.ts`, **tests first**: `suggestFood(remaining, favorites, recipes,
  thaiDishes)` → 3 items that fit the remaining protein/kcal (protein first), plus a Log payload. Done when
  tests cover: nothing left → "You've hit today's targets", no data → help, made-up numbers only. Deps: M7, 11.
- [ ] F2. [ui-engineer] A food result card with Log buttons in the coach sheet, plus the e2e case. Deps: F1, 13.
- [ ] F3. [main] Wiring to the M7 log. Deps: F1, F2.

**Parallel waves (phase A):**
- **Wave 1:** 1 [main], then 2 [core ∥A], 3 → 4 [core ∥B], 5 [core ∥C], 10 [core ∥A after 2 or a 4th
  instance], 13 and 14 [ui].
- **Wave 2:** 6, 7, 8, 9 [core, up to 2 instances: 6+9 and 7+8] and 12.
- **Wave 3:** 11, then 15.
- **Then:** 16 → 17 → 18 → 19 → 20.
- **Critical path:** 1 → 3 → 4 → 7 → 11 → 16 → 17.

#### Phase B — on-device brain (with M9; blocked on M9, planned 2026-11-15 and waiting on M9-q; owner per M9-q2)
- [ ] B0. Prerequisite: **M9 native shell** is specified, planned and running the web build on his iPhone
  (a separate plan). Not part of this list.
- [ ] B1. [core-engineer] Tool definitions, the single source, **tests first**.
  - Files: src/core/trainer/tools.ts(+test).
  - One entry per action: name, description, JSON-schema args (area enum, date `YYYY-MM-DD`, exerciseId
    enum from the catalog, scope enum), and `toProposal(args, ctx)` calling the matching `propose*`.
  - Done when tests cover:
    - 1:1 with the actions (no tool without an action, no action without a tool, except `food` until M7);
    - invalid args rejected with a short reason: unknown exercise, a past date, a removed area;
    - a tool call returns a Proposal and never a new state;
    - `tools.contract.json` is regenerated by the test and matches the committed file.
  - Deps: phase A 11.
- [ ] B2. [core-engineer] Instructions, context and output filter, **tests first**.
  - Files: src/core/trainer/brain/instructions.ts, context.ts, sanitize.ts (+tests).
  - The guardrail instructions (SPEC M10 Safety).
  - `serializeContext(state, sessions, sets, today)`: a compact text block whose budget is a constant
    (provisional ≤ 6,000 chars ≈ 1,500 tokens; check the current Foundation Models context size).
  - `sanitizeReply(text, safety)`: banned/diagnosis words → the fixed safe line; adds the referral line
    when `discomfort`; caps at 3 sentences.
  - Done when tests cover: the budget held on a heavy 4-week fixture history (made-up), no personal fields
    (notes) in the context, and sanitize on a list of bad replies.
  - Deps: B1.
- [ ] B3. [main, until an owner exists] Swift tool codegen + contract check.
  - Files: scripts/gen-trainer-tools.mjs(+test), ios/App/App/GymBrain/TrainerTools.generated.swift.
  - Generates `@Generable` argument structs with `@Guide` descriptions plus `Tool` conformances whose
    `call` records `{ name, args }` and returns "Proposed; the app will ask the user to confirm."
  - Done when: `npm run check` fails if the generated Swift is stale (diff test), and the script test
    covers each arg type.
  - Deps: B1, B0.
- [ ] B4. [main, until an owner exists] `GymBrain` Capacitor plugin (Swift).
  - Files: ios/App/App/GymBrain/GymBrainPlugin.swift (+ XCTest), src/native/gymBrain.ts (plugin
    registration/typing).
  - `availability()` → `available | deviceNotEligible | appleIntelligenceNotEnabled | modelNotReady |
    unsupported`.
  - `respond({ instructions, context, messages })` → `{ text, toolCalls, latencyMs }` via
    `LanguageModelSession(tools:instructions:)`.
  - Errors map to codes: guardrail, contextTooLong, unsupportedLanguage, timeout, other.
  - **Look up the current Foundation Models docs first** (CLAUDE.md rule 8).
  - Done when: XCTest with a fake session passes, and a manual run on his iPhone answers "can't make it
    today" with a `postponeSession` call.
  - Deps: B3.
- [ ] B5. [core-engineer] Brain adapters + fallback chain, **tests first**.
  - Files: src/data/brain/index.ts, src/data/brain/native.ts, src/data/brain/rules.ts (+tests). Transports
    are injected.
  - `pickBrain({ native?, claude?, settings })`; `ask(text, ctx)` → `{ reply, proposal?, chips, source,
    fallbackReason? }`.
  - Done when tests cover:
    - every availability reason → rules (+ reason);
    - every error code → rules + a one-line note;
    - a tool call → a validated Proposal (B1);
    - an invalid tool call → "I couldn't do that" + chips;
    - two tool calls → the first one shown, the second as a chip;
    - model text always passes through `sanitizeReply`;
    - chips bypass the brain.
  - Deps: B1, B2.
- [ ] B6. [ui-engineer] Coach sheet: "Thinking…" state (static under reduced motion), a source badge
  ("On-device AI" / "Quick replies"), Settings → Coach brain status with the fallback reason. Done when: render
  tests + screenshots. Deps: phase A 13.
- [ ] B7. [main] Wiring in app.ts (native bridge only inside the Capacitor build). The PWA keeps rules. Done
  when: the native build on his phone routes free text to Apple's model, and the PWA makes no change. Deps: B4, B5, B6.
- [ ] B8. [main, until an owner exists] On-device eval runner.
  - A dev-only Settings screen in the native build runs `evals/requests.json` through B5.
  - It exports a report (ids, expected vs got, pass/fail, latency; no text).
  - Done when the report shows: action + args ≥ 85% (M10-q10), safe replies 100%, 0 applied without a tap,
    p50 latency logged. Results go into PROGRESS.
  - Deps: B7.
- [ ] B9. [reviewer] → B10. [verifier] (B Accept, including contract/codegen in CI) → B11. [main] merge +
  ask to push → B12. 🧍 a week of the on-device coach (with the M9 checkpoint).

#### Phase C — optional Claude brain (blocked on M10-q7: paid account + yes)
- [ ] C1. [core-engineer] Claude adapter + key store, **tests first**.
  - Files: src/data/brain/claude.ts(+test), src/data/brain/keyStore.ts(+test).
  - Messages API with tool use: the B1 tools, the B2 instructions + context, and the
    `anthropic-dangerous-direct-browser-access` header.
  - Model from settings (default `claude-opus-5-5`), timeout 20 s, `fetch` injected.
  - The key lives in IndexedDB under a key that dev-log export and "Export all" skip.
  - Done when tests cover:
    - the request body has exactly the documented fields (messages, the context block, tools); no notes,
      no dev log, the key only in the header;
    - a `tool_use` → Proposal via B1;
    - 401/429/5xx/timeout → rules + reason;
    - the key never appears in any export.
  - Deps: B1, B2, B5.
- [ ] C2. [ui-engineer] Settings → Cloud coach (Claude).
  - Off by default.
  - An explainer of exactly what's sent, shown before the switch turns on.
  - Paste key, Test key, Remove key (two-tap), model picker.
  - index.html CSP `connect-src` gains `https://api.anthropic.com` (coordinate with M7b, which needs the
    same).
  - Done when: render tests + screenshots.
  - Deps: B6.
- [ ] C3. [main] Wiring + `scripts/trainer-eval.mjs` (runs the eval set against Claude with a key from an
  env var, locally only, never in CI, report ids + numbers). Done when: a local run report is in PROGRESS. Deps: C1, C2.
- [ ] C4. [ui-engineer] E2E `e2e/trainer-claude.spec.ts` with `page.route` mocks: off → 0 requests to
  api.anthropic.com; on → the request shape, a proposal shown, Apply/Undo; error → rules. Deps: C3.
- [ ] C5. [reviewer] → C6. [verifier] → C7. [main] merge + ask to push.

### M5c follow-up — Breaks inside a set: "tap to continue" (planned 2026-11-14; runs first)
**Contract:** SPEC M5c "Breaks inside a set" and the Decision "Wongsaton's answers before sleeping". Logic is **tests first**. **Not deployed without Wongsaton's OK** (he only authorized deploying M5).

**Branch:** `m5c-break-hold`, cut from `m5-live-trainer` once M5 tasks 11, 13 and 14 are committed (they edit cameraView.ts and app.ts). It merges **after** M5, so M5 can deploy on its own. Tasks B1–B4 and B8 only touch files M5's open tasks don't, so they can start before the cut, and main brings them onto the branch.

**Break definition (defaults, all data on `AutoSetConfig`, retuned at B3):**
- inside a set with ≥ `stopMinReps` (2) reps;
- posture/body-line gate (`counter.untracked` ∈ `posture`, `bodyLine`) failing continuously for `breakGateSec` = **5 s** while `present`. That's longer than a ~1–3 s bend to rack and shorter than the real 16 s sit;
- or not `present` for `awaySec` (3 s, unchanged). This replaces the M5c `away` stop;
- a `visibility` gate is never a break;
- gated (posture/bodyLine) frames reset the `still` and `stalled` clocks, so the sit-down can't become a still stop first.

The real push-up replay showed the still stop at 36 s during the sit, so B3 must confirm which signal the real sit gives.

- [x] B1. [core-engineer ∥A] autoSet hold, **tests first**.
  - Files: src/core/autoSet.ts(+test).
  - `AutoSetConfig.breakGateSec` 5.
  - `AutoSetInput.untracked?: 'visibility' | 'posture' | 'bodyLine' | null`.
  - New state `'held'`.
  - New action `{ type: 'hold'; reason: 'posture' | 'bodyLine' | 'away'; reps; partials; endedAt }`.
  - `continueSet(t)` → `{ type: 'holdEnded', how: 'continue' }`, back to `set` with the same counts and fresh stop timers.
  - `nextSet(t)` → `commit` (backdated endedAt, frozen counts); the caller dispatches SET_DONE then START_SET.
  - `confirm(t)` while held → `commit`; idle limits while held → `commit` then `close`.
  - While held: events change no counts, and no `start` happens.
  - A pending Undo window is unaffected: a break after a still stop is plain rest.
  - Done when tests cover:
    - a gate break at 5.0 s and none at 4.9 s;
    - a gate that flickers (re-tracked frames) restarts the 5 s;
    - away → hold, not `stopPending`;
    - a visibility gap of 10 s → no hold;
    - gated frames never produce `still` / `stalled`;
    - < 2 reps → nothing;
    - reps while held → no count, no start;
    - Continue → later still stop with the summed reps;
    - nextSet / confirm / idle while held → commit with the backdated endedAt;
    - paused while held → nothing;
    - plain rest in place → the M5c still stop + auto start, unchanged;
    - a break in rest doesn't disarm auto start;
    - every existing autoSet test passes, with the `away` stop cases rewritten to `hold`.
  - Deps: none.
- [x] B2. [core-engineer ∥A, after B1] Focus: no cues while held.
  - Files: src/core/focus.ts(+test).
  - `'held'` joins the quiet auto states.
  - Done when: a test shows a would-fire `outOfFrame` / `stalled` / `rushedLowering` input gives nothing with autoState `held`; the replay test is unchanged.
  - Deps: B1 (type).
- [x] B3. [core-engineer ∥A, after B1] Acceptance replay, **tests first**.
  - Files: src/core/autoSet.replay.test.ts.
  - Synthetic push-up **front-variant** landmark frames through the **real counter** + autoSet, reusing repCounter.test's angle-curve and seated-frame builders. Timeline from the M5c tasks 5–6 Decision: 6 reps; a 16 s sit (body line fails, person present); 5 reps; still.
  - Done when tests assert:
    - with a Continue tap after the sit → exactly one `commit` with 11 reps, and no `start`;
    - without a tap → a `hold`, no second set, no `start`;
    - a 5.7 s in-plank pause (the real longest) → neither a hold nor a stop.
  - **Real data:** if the main session still has the converted real push-up set outside the repo, replay it locally. Write a Decision with what the sit reads as (`untracked` reason, when the hold fires, no `stopPending`). If the real sit isn't body-line gated, report it: no silent retune. The real set isn't committed (Blockers B-q5).
  - Deps: B1.
- [x] B4. [ui-engineer ∥] Hold panel component.
  - Files: src/ui/holdPanel.ts (new), src/ui/handsfree.css. Not styles.css: M4e A2 rewrites it in parallel.
  - `createHoldPanel({ reps, partials, lastSet, onContinue, onNext })` with `setClock(sinceLastRepMs)`:
    - "On hold · 6 reps" and a break clock ≥ 64px (`data-hold-clock`);
    - **Continue set** and **Start next set** (**Save set** when `lastSet`), each ≥ 72px tall and full width;
    - `data-hold`, `data-reason`, `aria-live`;
    - a solid backing over the video.
  - Done when: 390×844 harness screenshots of both labels, text ≥ 20px, nothing overflowing, typecheck + lint clean.
  - Deps: none (shape from this plan).
- [x] B5. [ui-engineer, after B1 + B2 + B4 and the branch cut] Camera view hold flow.
  - Files: src/ui/cameraView.ts.
  - Feed: pass `counter.untracked` into autoSet, and autoState `held` into the focus tracker.
  - On `hold`:
    - mount the panel and freeze the shown count;
    - speak "Set on hold. Tap to continue." (kind `cue`, also with the spoken count off);
    - log `autoSet` `{ action: 'hold', reason, reps, partials, at }`.
  - While held:
    - the counter runs silently;
    - a counted rep → "Tap Continue to count." at most once per 10 s;
    - the clock ticks from endedAt.
  - Buttons:
    - Continue → unmount, the count resumes from N (offset the counter's own count), speak "Keep going.";
    - Start next set / Save set → new option `handsFree.onHoldNext(endedAtWall, counts, { startNext })`;
    - Close while held saves, like Close in the Undo window.
  - Done when:
    - typecheck + lint clean;
    - the existing camera e2e specs (camera-layout, rep-panel, rep-count, hands-free, devlog-camera, focus-cues) pass;
    - a manual run on the fixture landmarker shows reps → no person 3 s → hold panel + prompt.
  - Deps: B1, B2, B4.
- [x] B6. [main] Wiring.
  - Files: src/ui/app.ts (and playwright.config.ts for a new spec).
  - `onHoldNext`: SET_DONE `{ now: endedAt }`, then (`startNext`) START_SET `{ now }`, then `camera.setSession(...)` + `beginLoggedSet`.
  - Save set on the last set: the existing commit path, so the camera closes.
  - Done when, by hand on Push A with the fixture landmarker: hold → Start next set → the DB row for set 1 is backdated, and set 2's `restTakenSec` ≈ the break.
  - Deps: B5.
- [x] B7. [ui-engineer] E2E `e2e/hands-free-break.spec.ts`.
  - Fixture landmarker and hooks as in hands-free.spec.ts, plus a gate hook: a seated/leaning frame that fails the posture or body-line gate. Real timers, mocked speech.
  - Cases:
    1. 2 reps → `__noPerson` → hold at ~3 s, the prompt spoken, no "Set done", no DB row;
    2. back + reps without a tap → not counted, the reminder spoken, no auto start, still no row;
    3. Continue → the count resumes from N → freeze → still stop → **one** row with the total;
    4. Start next set → row 1 backdated to its last rep, set 2 running, `restTakenSec` ≈ the break;
    5. a gate held 6 s → hold; a 2 s gate then stillness → the normal still stop;
    6. plain rest in place → M5c stop + auto start unchanged;
    7. last set → Save set → the camera closes;
    8. Close while held saves;
    9. buttons ≥ 56px;
    10. no third-party request.
  - Done when: it passes with `--repeat-each=3` and the full `npm run e2e` is green.
  - Deps: B6.
- [x] B8. [pose-engineer ∥] Converter.
  - Files: scripts/devlog.mjs(+`scripts/devlog.test.mjs`).
  - The report shows `hold:<reason> <sec> → continue|next|save`.
  - A set with a hold converts to **one** fixture.
  - Done when: a synthetic export with a hold mid-set converts to one fixture the suite counts, and the script tests pass.
  - Deps: none (event shapes from B1/B5 in this plan).
- [x] B9. [reviewer] Review the branch diff against CLAUDE.md:
  - pure core;
  - break thresholds are data;
  - prompt spoken, never cancelling a count;
  - 56 / 64 / 20px;
  - no medical words;
  - plain rest and hands-free off unchanged;
  - no focus cues on hold;
  - dev-log data = enum + numbers.
  - Deps: B3, B7, B8.
- [x] B10. [verifier] Verify against SPEC M5c "Breaks inside a set" Accept.
  - `npm run check`, `npm run e2e`, `npm run build`.
  - 390×844 screenshots `docs/screenshots/m5c-hold.png` and `m5c-hold-last-set.png`, console clean.
  - A dev-log export with a `hold` event, and `npm run devlog -- --dry-run` showing one set.
  - Evidence into PROGRESS.
  - Deps: B9.
  - Evidence 2026-11-14 (41e7ecf): verifier PASS.
    - `npm run check`: 1164 unit, 19 script.
    - `npm run e2e`: 75/75.
    - Build OK.
    - Dev-log hold → Continue export converts to one fixture: "start:tap stop:still hold:bodyLine 12.3s → continue".
    - Screenshots: `docs/screenshots/m5c-hold.png`, `m5c-hold-last-set.png`, `m5c-hold-continued-rest.png`. Clock 88px, buttons 80px, smallest text 20px.
    - Not deployed; it waits for Wongsaton's OK (B11).
  - Open, non-blocking:
    - the dimmed rep panel under a sit hold reads "Step into frame";
    - the footer Set done is visible under the hold panel;
    - the M5b "Sets: 4" wording.
- [ ] B11. [main] Merge `m5c-break-hold` after M5's merge, then **ask Wongsaton before pushing** (push = deploy). Deps: B10.
- [ ] B12. 🧍 Folded into **Checkpoint B3**: on the hands-free gym day, a push-up rest-pause set and one walk-away; he reports whether the hold and taps felt right (and the B-q questions).

**Parallel waves:**
- **Now:** B1 [core ∥A], B4 [ui], B8 [pose].
- **Then:** B2 and B3 [core ∥A, after B1; can be one instance in sequence].
- **After the branch cut:** B5 → B6 → B7 → B9 → B10 → B11.
- **Critical path:** B1 → B5 → B6 → B7.

### M4e steps 2–3 — Build the approved mix (planned 2026-11-14; follows the M5c follow-up)
**Contract:** SPEC M4e "Picked" + Accept, `docs/design/m4e-mix/README.md` (tokens, moods, type, icons, gym rules), `docs/design/m4e-directions/README.md` (core selectors), and the Decision "Wongsaton's answers before sleeping". Logic is **tests first**. **Not deployed without Wongsaton's OK.**

**Branch:** `m4e-redesign`, cut from `m5-live-trainer` after M5's merge (task 17). `m5c-break-hold` is merged in before A16 (camera restyle). Wave-1 tasks touch no M5 or M5c file.

**Shape:**
- The screens live inline in app.ts (main-owned). So each screen becomes a ui-engineer module, `src/ui/screens/<screen>.ts`: props + callbacks in, element out, no DB access. Main swaps it into app.ts.
- The screen tasks share styles.css, so they run one at a time, in the order Wongsaton asked for.
- Hard rules stay: ≥ 64px numbers, ≥ 20px body (the mix README's 16–18px bend applies only to short labels next to an icon or number), ≥ 56px targets, voice over screen, reduced motion, no third-party request, original art.

- [x] A1. [main] Packages + shared type.
  - Files: package.json, src/main.ts, src/core/types.ts.
  - Add `@fontsource/barlow-condensed` and `@fontsource/barlow`. Import only the latin-subset CSS: Condensed 700; Barlow 400/600/700.
  - Add `lighthouse` (dev), used by the verifier against `vite preview`.
  - Add `export type Accent = 'orange' | 'volt' | 'yellow'`.
  - Done when: `npm run build` puts the `.woff2` files in `dist/assets` (same-origin, no external font URL) and typecheck passes.
  - Deps: none.
- [x] A2. [ui-engineer ∥] Tokens, moods, themes, guard test.
  - Files: src/styles.css, src/ui/handsfree.css, src/ui/devlog.css, src/ui/audioTest.css, src/ui/tokens.ts (new), src/ui/tokens.test.ts (new), index.html (theme-color).
  - `:root` holds the mix's shared tokens: colours, `--font-display` / `--font-body`, the type scale (18/20/22/34/72/84/120/132), radii, `--ic-*`, tap sizes.
  - `.mood-energy` / `.mood-pro` / `.mood-track`.
  - Accents:
    - `[data-accent="orange"]` (default): `#FF7A1A` / `#1A0B00`;
    - `"volt"`: `#C8F31D` / `#12160A`, **plus `--success` `#FFC94D` / `--on-success` `#221800`**;
    - `"yellow"`: `#FFD60A` / `#000000`.
  - Every existing raw colour and font size in those CSS files moves onto tokens.
  - `tokens.ts`: `cssToken(name)` for canvas/3D.
  - `tokens.test.ts` (imports the CSS `?raw` and globs `src/ui/**/*.ts`): no hex/rgb/hsl outside the token blocks, no `font-size` without `var(`, and no colour literal in `src/ui/**/*.ts`. A named allow-list covers the 3D files until A7 and `cameraView.ts` until A16.
  - Done when:
    - the test is green;
    - each accent pair's contrast is asserted ≥ 7:1 (on-cta on cta) and ≥ 3:1 (cta on bg);
    - the existing e2e still pass, since the look barely changes yet;
    - typecheck + lint clean.
  - Deps: A1 for the font families (can start with fallbacks).
- [x] A3. [core-engineer ∥A] Home/summary selectors, **tests first**.
  - Files: src/core/stats.ts(+test). Pure; takes session rows + set logs.
  - `weeklyStreak(sessions, today, minPerWeek)`: consecutive Mon–Sun local weeks with ≥ `minPerWeek` finished sessions. The current week counts once it qualifies and doesn't break the streak while it's in progress.
  - `STREAK_MIN_PER_WEEK` is a provisional constant: Blockers A-q1.
  - `weekDots(sessions, today)`: 7 entries (`done` / `today` / `rest` / `future`).
  - `lastSession(sessions, sets)`: day, duration, volume, date.
  - `sessionVolume(logs)`: Σ reps × kg; bodyweight sets add 0.
  - `volumeVsLast(logs, prevSameDayLogs)`: percent, or null with no previous.
  - `newBests(todayLogs, historyLogs)`: per exercise, more reps at the same or higher weight, or more weight, with the old value.
  - **No `nextTimeHint`:** Summary's "Next time" line is the M5b coach line (SPEC).
  - Done when tests cover:
    - week edges: Sunday 23:59 / Monday 00:00 local, a gap week breaks the streak, the in-progress week;
    - empty history;
    - unfinished sessions ignored;
    - volume in kg for lb-entered weights;
    - a best at a lower weight with more reps isn't a best;
    - the first-ever session → no bests;
    - no DOM.
  - Deps: none.
- [x] A4. [core-engineer ∥B] Data layer, **tests first**.
  - Files: src/data/db.ts(+test).
  - `getAccent / setAccent` (key `accent`, default `'orange'`, an unknown value reads as orange).
  - `sessionsSince(db, sinceMs)` and `setsForSessions(db, ids)`, plus `bestSetsFor(db, exerciseIds)` or all sets of those exercises.
  - No Dexie version bump unless an index is needed; if one is, do the bump and record it as a Decision.
  - Done when: db tests cover default / set / read back / unknown, and the history queries; existing db tests pass.
  - Deps: A1 (Accent type).
- [x] A5. [core-engineer ∥C] `EXTEND_REST { sec, now }`, **tests first**.
  - Files: src/core/session.ts(+test).
  - Accepted only in `rest`, not paused, sec > 0.
  - Raises `restTargetSec` for this rest only; the next rest uses the plan's `restSec`.
  - The overrun check uses the extended target.
  - Done when tests cover:
    - rest / exercise / paused / summary;
    - two taps → +60;
    - the next rest is back to plan;
    - overrun with and without the extension;
    - `restCues` crossings at the new target: "Ten seconds" fires again at target − 10 when it hasn't been passed (a restCues test, same instance);
    - existing session tests pass.
  - Deps: none.
- [x] A6. [ui-engineer, second instance ∥] Icon set.
  - Files: src/ui/icons.ts(+test).
  - Port the original 24-grid `ICONS` from `docs/design/m4e-mix/_src/build.mjs`: 2.25px stroke, round caps, `currentColor`, `aria-hidden`.
  - `icon(name, size: 'sm' | 'md' | 'lg')`.
  - Done when: a test renders every name, checks the stroke width, and finds no `href` / external reference; typecheck + lint clean.
  - Deps: none.
- [x] A7. [anatomy-3d-engineer ∥] 3D/2D colour alignment.
  - Files: src/ui/body3d/**, src/ui/demo3d/player.ts (+ scene files), src/ui/skeleton3d.ts, src/ui/bodyMap.ts(+test).
  - Body, rim, stage and muscle colours come from `cssToken('--body' | '--edge' | '--stage-1' | '--stage-2' | '--muscle')`, read when the scene is created. The fallback is the token value in one exported constant, not scattered literals.
  - The muscle colour is the mix's cyan everywhere, with a text legend kept.
  - bodyMap gains a compact `mini` size for the Today day strip.
  - Done when:
    - 390×844 screenshots of the Exercise inline figure, the full viewer, a demo and the camera skeleton show cyan muscles and a visible rim on the stage;
    - bodyMap tests pass;
    - these files have no colour literal.
  - Deps: A2's token names (can start from the README table).
- [x] A7b. [ui-engineer, after A7] Remove the 3D entries from the tokens test allow-list. Files: src/ui/tokens.test.ts. Done when: green. Deps: A2, A7.
- [x] A8. [ui-engineer] **Today** (Energy) + day preview + tab bar.
  - Files: src/ui/screens/today.ts, src/ui/screens/preview.ts, src/ui/tabBar.ts, src/styles.css.
  - Hero:
    - day name 84px;
    - exercise count and an estimated time;
    - muscle chips;
    - the figure with the muscles lit;
    - Start workout CTA 80px.
  - Below the hero:
    - streak tile (`weeklyStreak` + `weekDots`, ≥ 64px number);
    - last-time tile;
    - day strip with mini figures; the next day is outlined in cta;
    - the silent-mode hint keeps its place above Start.
  - Tab bar: Today / Settings, 72px, labelled.
  - Done when: a render unit test, 390×844 harness screenshots in all 3 accents, nothing overflowing, typecheck + lint clean.
  - Deps: A2, A3 (types), A6; A7 for the mini figure (stub until then).
- [x] A9. [main] Wire Today and the preview.
  - Files: src/ui/app.ts.
  - Replace `todayScreen` / `previewScreen`. Load the history via A4 for the selectors (`STREAK_MIN_PER_WEEK`).
  - Tab bar navigation.
  - Apply `data-accent` on `<html>` at startup from `getAccent`.
  - Done when: by hand, Today shows streak / last time from real IndexedDB data, Start works, and the existing e2e are green.
  - Deps: A1, A4, A8.
- [x] A10. [ui-engineer] **Exercise** (Pro) + **Pause sheet** + workout top bar.
  - Files: src/ui/screens/exercise.ts, src/ui/screens/pauseSheet.ts, src/ui/topBar.ts, src/styles.css.
  - Exercise screen:
    - lit stage with the figure, set count 72px, muscle legend, How to;
    - REPS / WEIGHT labels above the 72px steppers;
    - the lavender cue panel with the speaker icon;
    - Set done as the only orange.
  - Top bar: list / Camera / Pause, 60px, labelled.
  - Pause sheet:
    - Resume (CTA);
    - **Skip exercise**;
    - **End workout** (two-tap confirmation kept, danger + icon + words).
  - Done when: a render test, 390×844 harness screenshots, typecheck + lint clean.
  - Deps: A2, A6.
- [x] A11. [main] Wire Exercise + the Pause sheet; remove Skip/End from the Exercise and Rest footers.
  - Files: src/ui/app.ts.
  - Done when: by hand, Skip and End work only from the Pause sheet.
  - Deps: A9, A10.
- [x] A11b. [ui-engineer] Move the e2e specs that tap Skip/End to the Pause sheet.
  - Files: e2e/*.spec.ts (not camera.spec.ts).
  - Done when: the full `npm run e2e` is green.
  - Deps: A11.
- [x] A12. [ui-engineer] **Rest** (Track).
  - Files: src/ui/screens/rest.ts, src/styles.css.
  - Countdown:
    - 132px white countdown;
    - dashed ring draining in cta (static under reduced motion);
    - amber/over state kept, not colour-only.
  - **+30 s** (≥ 56px, labelled "+30 s").
  - "Last set … Fix" strip (the existing component).
  - Next card (orange top rule, figure, target, cue).
  - Coach tip slot.
  - Start set CTA.
  - Top bar: list / Pause.
  - No Skip/End.
  - Done when: a render test, 390×844 screenshots (normal / overrun / with tip), typecheck + lint clean.
  - Deps: A2, A6, A10 (topBar).
- [x] A13. [main] Wire Rest.
  - Files: src/ui/app.ts.
  - `+30 s` → `EXTEND_REST`; `tick()` uses the new target.
  - The camera rest panel stays as is until A16.
  - Done when: by hand, +30 s moves the clock and "Ten seconds" comes 30 s later.
  - Deps: A5, A11, A12.
- [x] A14. [ui-engineer] **Summary** (Energy).
  - Files: src/ui/screens/summary.ts, src/ui/coachSummary.ts, src/ui/focusSummary.ts, src/styles.css.
  - Celebration:
    - trophy + "Push A done";
    - a volume card (72px) with vs-last;
    - new bests (green block + medal icon + old value);
    - tiles: sets / reps / exercises.
  - The existing Coach + Focus sections, restyled.
  - Today's notes.
  - The "Next time" coach line last, kept low-key.
  - Done when: render tests (with and without a previous session), screenshots, the existing coachSummary / focusSummary tests pass, typecheck + lint clean.
  - Deps: A2, A3, A6.
- [x] A15. [main] Wire Summary.
  - Files: src/ui/app.ts.
  - History for `volumeVsLast` / `newBests`.
  - Done when: by hand, a second session of the same day shows a vs-last % and a best.
  - Deps: A4, A13, A14.
- [x] A16. [ui-engineer, after `m5c-break-hold` is merged in] **Camera** (Pro).
  - Files: src/ui/cameraView.ts, src/ui/autoStopBanner.ts, src/ui/cameraRestPanel.ts, src/ui/holdPanel.ts, src/ui/handsfree.css.
  - Solid `--surface` HUD panels (never translucent).
  - Rep count 120px.
  - Neutral range gauge with the target mark in `--success`.
  - Set done is the only cta.
  - Canvas colours via `cssToken`.
  - Remove the `cameraView.ts` allow-list entry.
  - Done when:
    - screenshots of set mode, Undo, rest mode and hold in all 3 accents;
    - the camera e2e specs pass;
    - the tokens test is green with no camera allow-list.
  - Deps: A2, A6, B11 merged.
- [x] A17. [ui-engineer] **Settings** (Pro).
  - Files: src/ui/screens/settings.ts, src/ui/accentPicker.ts, src/ui/coachVoiceSettings.ts, src/ui/devLogPanel.ts, src/styles.css.
  - Accent picker: Orange / Volt / Yellow, each a swatch + name, the chosen one in white fill with dark text, ≥ 56px.
  - Existing switches, the unit choice, coach voice and dev log restyled; On/Off words next to the switches.
  - Done when: a render test, screenshots in all 3 accents, typecheck + lint clean.
  - Deps: A2, A6.
- [x] A18. [main] Wire Settings.
  - Files: src/ui/app.ts.
  - A picker change → `setAccent` and set `data-accent` at once.
  - Done when: by hand, the accent survives a reload and success turns gold on Volt.
  - Deps: A4, A15, A17.
- [x] A19. [ui-engineer] Overlays (Pro), mostly CSS.
  - Files: src/styles.css, src/ui/howToSheet.ts, src/ui/badges.ts, src/ui/lastSetCorrection.ts, src/ui/coachTip.ts.
  - Covers the exercise list, notes, How-to, body sheet, badges, coach tip and Fix strip.
  - Done when: screenshots, typecheck + lint clean.
  - Deps: A2, A6.
- [x] A20. [ui-engineer] E2E `e2e/m4e-theme.spec.ts`. Cases:
  - pick Volt → reload → still Volt; the computed `--success` is gold;
  - Orange / Yellow keep green;
  - +30 s extends the clock, and "Ten seconds" is spoken 30 s later;
  - Skip/End are absent from Exercise/Rest and work from the Pause sheet;
  - the fonts load from the app's origin;
  - Today's streak / last-time tiles appear after a seeded session;
  - no third-party request.
  - Done when: it passes with `--repeat-each=3` and the full `npm run e2e` is green.
  - Deps: A9, A11b, A13, A15, A16, A18.
- [x] A21. [reviewer] Review the branch diff against CLAUDE.md:
  - sizes (64 / 20 / 56; the label bend only next to an icon or number);
  - contrast;
  - colour never alone;
  - one action colour;
  - reduced motion;
  - self-hosted fonts and no third-party request (CSP unchanged);
  - original icons and art;
  - pure core selectors;
  - tokens the only source;
  - no medical words.
  - Deps: A7b, A19, A20.
- [x] A22. [verifier] Verify against SPEC M4e Accept.
  - `npm run check` (tokens test included), `npm run e2e`, `npm run build`.
  - **Every screen × Orange / Volt / Yellow at 390×844**, via `scripts/screenshots.mjs m4e`: Today, preview, Exercise, Pause sheet, Rest, Rest +30 s, Summary, Camera set / Undo / rest / hold, Settings, How-to. Output `docs/screenshots/m4e-<screen>-<accent>.png`, console clean.
  - **Lighthouse accessibility ≥ 95 on Today** (built app, `vite preview`, mobile).
  - Bundle size delta (fonts included).
  - Evidence into PROGRESS.
  - Deps: A21.
- [ ] A23. [main] Merge `m4e-redesign`, then **ask Wongsaton before pushing** (push = deploy). Deps: A22.
- [ ] A24. 🧍 (no SPEC checkpoint; informal) Wongsaton looks at the screenshots and trains with the new look; notes go in via `/feedback`.

**Parallel waves:**
- **Wave 1 (alongside the M5c follow-up):**
  - A1 [main];
  - A2 [ui];
  - A6 [ui, second instance];
  - A3 [core ∥A];
  - A4 [core ∥B, after A1];
  - A5 [core ∥C];
  - A7 [3d].

  A3 needs its own core instance (the M5c follow-up's B1–B3 hold one), or it runs after B3.
- **Wave 2:** A7b, then the screen pipeline. The ui-engineer runs A8 → A10 → A12 → A14 → A17 → A19 in order, since they all touch styles.css. Main follows each one: A9 → A11 → A13 → A15 → A18. A11b goes right after A11.
- **Then:** A16 once B11 is merged → A20 → A21 → A22 → A23.
- **Critical path:** A2 → A8 → A9 → A10 → A11 → A12 → A13 → A14 → A15 → A17 → A18 → A20 → A21 → A22.

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
- [x] 7. [core-engineer, after 5 + 6 + 9] Real-data replay + enable decision. Done 2026-11-13: `src/core/focus.replay.test.ts` (45 tests), both lateral-raise form flags on; numbers in the Decision "M5 task 7 replay". Open: the raise-too-high flaw clip needs a re-render (see that Decision).
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
- [x] 9. [pose-engineer ∥] Synthetic clips with form flaws (positive fixtures for the geometry and tempo rules).
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
  - Evidence 2026-11-13: six `synthetic-03-*` clips, each 8 reps / 0 partials, with the mistake on reps 5–8.
    - Detection rates: elbow-swing 866/870, rushed-lowering 819/822, short-range 797/798, arms-out-of-sync 1085/1086, raise-too-high 797/798, hip-sag 793/798 (all 99.4–99.9%).
    - **Plan change:** the lateral-raise mistake is now **two clips**, `arms-out-of-sync` and `raise-too-high`, one rule each. With one arm stopping lower, the two-arm mean can't also cross the height limit.
    - Flaws are rendered about 2× larger than the target, because MediaPipe reads them at about half size (named constants in tools/synthetic.ts). `fixtures/synthetic/flaws.json` holds the rendered values, not the measured ones.
    - The fixture suite now has 23 cases, all counting their filename reps.
- [x] 10. [pose-engineer, after 9] Converter report.
  - Files: scripts/devlog.mjs(+`scripts/devlog.test.mjs`).
  - The per-set report lists each `focusCue` event (id, rep, value / baseline) and the set's `focusScore` event.
  - Done when: a synthetic export with these events prints them, and the existing script tests pass.
  - Deps: none beyond the event shapes in tasks 11/13 (written in this plan).
  - Evidence 2026-11-13: `npm run test:scripts` 16/16, including 3 new focus tests. A synthetic export prints each set's cues and score. Only ids and numbers are printed, and none of it goes into fixtures.
- [x] 11. [ui-engineer] Focus tracker in the camera view.
  - Files: src/ui/cameraView.ts, src/styles.css.
  - **Lifecycle:**
    - One tracker per camera sheet, only when the exercise has a rule (the Settings camera test has none).
    - Flags come from `focusFlagsFor(rule, counter.rule)`, so the push-up front variant gets its own.
    - Feed it every tick after the counter and `autoSet`, with no-pose ticks too.
    - `reset` at every set start (manual Start set, or the exercise phase), with the target = the top of the range.
    - On an auto start, seed it with the rest-mode rep events since the start action's `at`. Keep ≤ 8 s of those events.
    - Every tick is fed (with autoState/paused); the core tracker ignores rest frames and stays quiet in pending, closed and paused.
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
- [x] 13. [main] Wiring.
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
- [x] 14. [ui-engineer] E2E `e2e/focus-cues.spec.ts`. Fixture landmarker as in hands-free.spec.ts, real timers, mocked speech that records order.
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
- [x] 15. [reviewer] Review the branch diff against CLAUDE.md:
  - pure core (focus.ts / focusScore.ts: no DOM, no MediaPipe);
  - every rule's thresholds and flags are data (no `if (exercise === …)`);
  - no geometry flag on without real fixtures (task 6's test);
  - voice over screen (every cue spoken through the policy, never over a count);
  - no second partial cue; no cues in rest mode or the Undo window;
  - no medical words; sizes (20 / 56 / 64px);
  - privacy: dev-log cue data = enum + numbers;
  - hands-free off and manual exercises unchanged apart from the score.
  - Deps: 7, 10, 14.
- [x] 16. [verifier] Verify against SPEC M5 Accept.
  - `npm run check`: fixture suite counts unchanged, plus the synthetic-03 clips; the replay test green. Also `npm run e2e` and `npm run build`.
  - 390×844 screenshots, console clean: `docs/screenshots/m5-camera-cue.png`, `m5-camera-stalled.png`, `m5-summary-focus.png`, `m5-coach-tempo.png`, `m5-rest-fix-score.png`.
  - A dev-log export after the flow shows `focusCue` + `focusScore` events, and `npm run devlog -- --dry-run` lists them.
  - The task 7 Decision exists, and the flags in the code match its table.
  - Evidence into PROGRESS.
  - Deps: 15.
  - Evidence 2026-11-14 (4c35244): verifier PASS.
    - `npm run check`: vitest 1122, scripts 16/16, fixture suite 23 cases.
    - `npm run e2e`: 68 passed. focus-cues ×3: 15/15. Build OK.
    - Flags match the Decision table.
    - Scores on screen and in the DB: 80, then 75 after the Fix, then 85 with "(not scored)" lines.
    - Dev-log export has focusCue and focusScore, and `devlog.mjs --dry-run` prints the Focus section.
    - Speech order: "Six, Slow the lowering., Seven".
    - Screenshots: `docs/screenshots/m5-*.png`, 9 files at 390×844.
    - Console clean apart from the headless GPU warning. No third-party requests.
    - Not changed by M5, found in passing: 16px stat labels on Summary and an 18px "Today" line on Rest (to be fixed in M4e); the M5b "Sets: 3" wording is ambiguous.
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

- 2026-11-18: **M15 task 1 findings (encoder + blur spike; pose-engineer; scratch page outside the repo, Mac M4 Pro + iOS 27.2 Simulator Safari).**
  - **Encoder path A: WebCodecs ring buffer.** Live loop: `new VideoFrame(video)` → `VideoEncoder` H.264 Main (avc1.4d0028) 720×1280 ~4 Mbps, keyframe every 30 frames → keyframe-aligned ~8 s GOP ring in memory (~4 MB; 540×960 ~2.5 Mbps fallback). Kept clip, during rest: `VideoDecoder` → PoseLandmarker mask rerun on decoded frames → WebGL2 blur + overlay at 1080×1920 → `VideoEncoder` H.264 High (avc1.640028) ~8 Mbps → MP4 mux. **Path B (MediaRecorder timeslices) rejected**: a later slice can't be cut out and played alone (measured in Chrome; Simulator result saved, unread), and WebKit bug 323550 records portrait MP4 sideways on iOS 26.6/27.0. Path C (native encoder, task 17) kept as contingency only.
  - **Muxer: `mediabunny@1.66.0`** (MPL-2.0, no runtime deps, no network; successor to deprecated `mp4-muxer`); tree-shaken ~37 KB gzip. Unmodified use only (MPL file-level copyleft).
  - **Mask: PoseLandmarker's own mask** (`outputSegmentationMasks`, `numPoses: 1`) at export only; live masks off. No mask → fully blurred (fail-closed, verified visually).
  - **Measured (Mac, headed Chrome 157, 30 fps source):** 720×1280 pose 29.1 fps (detect ~10 ms), + armed encoder 29.4 fps (encode() 0.04 ms, 0 dropped) — but the **first armed run per page dipped to 13–16 fps** (encoder start-up) → configure + warm the encoder at the preview, before the set. Blur 0.5–1.3 ms/frame at 1080×1920. Export of a 6.8 s window: 3.0 s total (mask 11.3 ms/frame); output plays, 1080×1920, H.264 High 4.0, moov first; real footage ≈ 5 MB per 5 s at 8 Mbps.
  - **Implementation rules:** choose configs via `isConfigSupported`, prefer-hardware then no-preference (Playwright Chromium has no hardware H.264); size the encoder from the first real frame, never from constraints (portrait/rotation bug family; Safari has no `VideoFrame.rotation`); `MediaStreamTrackProcessor` is worker-only in Safari → use `new VideoFrame(videoEl)` on the main thread. Headless SwiftShader pose fps is meaningless → fps evidence from headed Chrome + the iPhone. Headed Chrome with fake camera + armed encoder stalled rVFC in 3 tries (watch in e2e).
  - **Task changes:** task 4 adds `mediabunny@1.66.0` (no `mp4-muxer`); tasks 9/10 as above; task 17 contingency; tasks 20/22 e2e with the no-preference encoder, assert the export MP4 plays at 1080×1920; task 21 adds an in-app (WKWebView) probe: `VideoEncoder`/`VideoDecoder.isConfigSupported` for avc1.4d0028 720×1280 and avc1.640028 1080×1920 + `MediaRecorder.isTypeSupported('video/mp4')`.
  - **Only his iPhone can confirm:** WebCodecs inside WKWebView; pose fps with the ring armed (720p/540p, first-arm dip, heat over a workout); export time on the phone; portrait orientation of `VideoFrame(video)`; mask quality around arms/dumbbells; memory pressure.
  - **Needs his approval only if the pose mask proves too coarse:** downloading Google's `selfie_segmenter.tflite` (~250 KB) to vendor into public/models.

- 2026-11-17: **M14 task 1 findings (Apple facts, ios-engineer, paper only; Xcode 27.2, iOS/watchOS 27.2 SDKs).** Free Personal Team **should** work on paper (HealthKit + Background modes allowed on watchOS for the free membership); task 2 proves it on his devices.
  - **Free-team limits:** 10 App IDs / 7 days, 3 devices, **3 apps per device**, profiles expire after 7 days (watch app expires with the iPhone app; reinstall both from Xcode). Not documented whether the watch counts as a device or the watch app as its own app slot (a 2020 forum report says it can hit "maximum number of apps"). Task 2: delete the scratch apps afterwards; never reuse Gym Clean's bundle id for the scratch app.
  - **Plan changes (planner, before M14 builds):**
    1. **Health permission timing:** a workout session needs permission to **write workouts**, so the first live-heart-rate session on the watch shows the Health sheet with "write Workouts" even with Save to Health off. The switch then only decides save vs discard at Finish; rewrite the watch's write-permission text so it's true when Save is off. Watch target needs both `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`.
    2. **"Discarded = nothing in Health" is wrong:** `discardWorkout()` keeps the samples already added; the watch saves heart-rate/energy samples during the session. With Save off there is no workout record, but those samples stay in Health (normal Apple Watch data; M11 will read them). Fix the switch copy and SPEC privacy line.
    3. **Locked iPhone:** mirroring (watchOS 10+) only wakes the iPhone app periodically, minutes apart; WKWebView JS while locked isn't supported by any doc. Keep "phone unlocked, screen kept on" as the only supported setup; don't build on mirroring.
    4. **Task 27:** `transferUserInfo` doesn't work in the Simulator → queued path is device-only (simulator test uses sendMessage/applicationContext).
    5. **Task 12:** add `NSMotionUsageDescription` (missing today; without it the app crashes on start). Headphone-motion rate isn't documented (the "~25 Hz" is folklore): measure it; core logic uses timestamps.
    6. **Watch target:** `UIBackgroundModes` workout-processing, plus Audio if haptics during the session need it (check in task 2); template "Watch app for Existing iOS App", `WKCompanionAppBundleIdentifier` = iOS bundle id, not standalone; deployment target **watchOS 26.0**.
    7. **iOS WCSession delegate must implement activationDidComplete / sessionDidBecomeInactive / sessionDidDeactivate**, or iOS terminates the app in the background after a watch switch.
  - **Applied 2026-11-17 (planner):** plan tasks 2, 3, 4, 6, 8, 9, 11, 12, 14, 16, 17, 18, 19, 21, 24, 27, 30, 33 and SPEC M14 (new "Platform facts" block, Goals 3–5, Changes, Non-goals, Privacy strings, `hello.healthAccess` in the data model, Accept/E2E/Simulator/Checkpoint L) now follow these findings. The watch asks for Health access at its first workout session after one explain screen; the phone never prompts and the Save switch only picks finish vs discard. Copy for Save to Health: "Saves each gym session as a Strength Training workout in Apple Health." + "Either way, the heart rate and calories your watch measures during the session stay in Health, like your other Apple Watch readings." Watch Info.plist: share "Shows your heart rate during your gym session. Gym Clean doesn't send it anywhere."; update "Runs a workout on your watch so it can read your heart rate. Heart rate and calories from the session are added to Health. The workout itself is saved only if you turn on Save to Apple Health." All new copy gender-neutral (his partner may use the app). Supersedes the "iOS asks then" / "discarded" / mirroring lines in Decision "M14 Wrist and ears".
  - **Task 2 checklist additions:** record watchOS/iOS/AirPods firmware; watch Developer Mode (Settings → Privacy & Security → Developer Mode, appears after Xcode pairing starts); install result or exact error; what the first watch Health sheet lists; does a session start with write denied; heart rate keeps updating wrist-down; haptics with workout-processing only; Health afterwards (no workout, samples remain); AirPods `isDeviceMotionAvailable`, measured Hz, updates while other-app music plays; delete scratch apps.

- 2026-11-17: **M15 task 2 findings (phone-only storage + share; ios-engineer, paper only).** Nothing blocks M15; no paid account; **no Meta/Facebook App ID** as long as sharing uses the iOS share sheet.
  - **Storage:** `@capacitor/filesystem` **8.1.5** (exact) with `Directory.LibraryNoCloud` → `Library/NoCloud/Clips/<clipId>.mp4`; the plugin marks `Library/NoCloud` excluded from backup (folder-level, re-set on each call; create `Clips` at startup so the flag sticks before the first write). Replaces the Decision's "Application Support/Clips" wording (both under Library, same backup rules). `tmp`/`Caches` rejected (system may purge starred clips). App IndexedDB lives in `Library/WebKit/…` and should be treated as **backed up**, so video never goes in Dexie in the iPhone app; Dexie `clips` holds metadata only. Apple says the exclusion flag is not a guarantee → copy says "kept out of iCloud backup", not "guaranteed".
  - **Writes:** no Capacitor 8 path avoids base64; `writeFile` first ~1 MB chunk + `appendFile` the rest (~6–8 MB per 6 s 1080×1920 clip, estimate). Playback via `Capacitor.convertFileSrc(uri)` (8.6.2 asset handler serves mp4 with Range support).
  - **WebKit storage can be evicted** under pressure while native files survive → purge must also delete files with no metadata (`readdir` is the source of truth) and run on launch, Clips open and resume. No iOS timed deletion; 7-day purge is app-side (a clip can outlive 7 days if the app isn't opened; still phone-only).
  - **Share:** `@capacitor/share` **8.0.3** (exact), `Share.share({ files: [fileUri] })` (the `file://` uri, not the convertFileSrc URL); "Share canceled" is a no-op. PWA keeps `navigator.share({ files })` + download. **Don't** use `instagram-stories://` (needs a Meta App ID since Jan 2023, a Meta developer registration + terms, and puts the clip on the pasteboard).
  - **Info.plist:** add `NSPhotoLibraryAddUsageDescription` ("Only used if you pick Save Video in the share sheet. Gym Clean never saves to Photos on its own.") — the share sheet's Save Video can crash without it and `@capacitor/share` can't hide that option.
  - **Task changes:** task 4 adds both packages; task 16 is mostly TS (`src/native/clips.ts`) + the plist key (custom `GymClips` Swift plugin only as a fallback); tasks 6/19 purge orphan files + run on resume; tasks 20/21 fake `Filesystem` + `Share`. Phone checks (Checkpoint M): plays/loops/scrubs; share sheet shows Instagram → Story 9:16; Save Video prompt with our text, no crash; cancel = no error; iPhone Storage grows/shrinks with clips; backup size doesn't grow; date +8 days → unstarred gone.

- 2026-11-17: **M12 slice 2 task 20: the weekly check-in card posts only once he has finished at least one session in that check-in week** (main call). Without it the card showed on every fresh install's first Coach-tab open and broke 11 e2e specs. Prewarm runs on mic down; text-box focus prewarm needs a `ChatActions` focus callback (task 21 adds it).

- 2026-11-17: **M12 slice 2, G1 build calls** (main + owners, reviewer-checked):
  - **Context budget `CONTEXT_BUDGET_CHARS = 3200`** (plan said ≤ 6,000 provisional): Apple's window is 4,096 tokens per session incl. all 14 tool schemas; at 3 chars/token, minus instructions (~880), tool JSON (~4,730), a 400-char message, 2×600 read results and a 600-token reply leaves ~3,280. `context.test.ts` recomputes it from the real texts. Real token counts get logged on the phone (task 7 / Checkpoint J); lower it if a session hits the context limit, or move the 4 read results into the context text.
  - **Exercise ids in tool args are patterned strings checked against the catalog at runtime**, not enums (60 ids × 4 fields ≈ 1,500 tokens).
  - **Last 8 turns go inside the context text**, not as separate messages.
  - **Reminder ids:** `kind:YYYY-MM-DD` ↔ `code×100,000,000 + yyyymmdd` (session 1, missedDay 2, sundayRecap 3). Missed-day nudge only for yesterday (if missed, unanswered) and today (if still planned), so a long break doesn't nudge daily. Session reminder default time 18:00.
  - **Check-in week:** opens Sunday, stays open through Saturday (Mon–Sun week keyed by its Monday); skipped stays skipped; check-ins are backed up, never in the dev log or any brain context.
  - **sanitizeReply fails closed** (some fine replies like "rest 2 days between leg sessions" get replaced); watch it in the task 14 eval.
  - **Open question for Wongsaton (not blocking, default kept):** the intake's own-words goal text (e.g. "lose 5 kg") goes into Apple's on-device context as typed; weight/measurement *goal numbers* are filtered. Default: keep it (on-device only, never Claude).

- 2026-11-17: **M15 Best-rep clips (his words, 2026-11-17: "Don't forget about social engineer job, it can record in the app while i'm working out, randomize record of the perfect lift up weight or anything to be good of public via instagram"; on the no-recording rule: "you can change that but need to save only on my phone not on cloud").** CLAUDE.md's Privacy hard rule was updated by main the same day to allow exactly this (opt-in, visible dot, others blurred, phone-only storage excluded from iCloud backup, shared only by him via the share sheet). New milestone **M15** in SPEC (after M14), release **1.17.0**, branch `m15-best-rep-clips` cut from the M14 result, ends at 🧍 **Checkpoint M**. SPEC §6 "recording/saving video" is changed (noted there and in M15 "Changes to earlier contracts"). Plan under "Current milestone plan → M15". **Planner calls he can correct:**
  - **Order: after M14** (default). Running it in parallel with M14's watch track is possible (M15-q1) but not planned.
  - **Opt-in per workout, every workout:** the "Record best reps" switch on the camera preview / Start screen starts **off every workout** (not remembered), so filming is always a fresh choice. While armed a red dot **plus the word "Clips"** shows on the camera screen (not colour alone). Clips need the camera running for that set (rep events drive everything); camera-off sets never record.
  - **One camera:** the recorder reads the same `MediaStream` / video element the pose loop uses. The **ring buffer (~8 s) lives in memory only**, never written anywhere, dropped on disarm, leave, Finish and `visibilitychange` hidden.
  - **Window per rep:** the clip is cut around a **counted rep event** (rep start − ~1.5 s lead-in … rep end + ~0.5 s, clamped to 4–6 s; data), not "the last 8 s at Set done", so walking to the phone never ends up in a clip. During a set the app holds two in-memory candidates: the **last rep** and the **best-form rep** so far.
  - **Triggers (data in `src/core/clips/rules.ts`, provisional until Checkpoint M):** `form` = a rep with no cue fired, full range (reached the far threshold, no partial), tempo inside the exercise's tempo band (the M5 T1 numbers) — the best such rep of the set; `best` = the set beats his best weight or e1RM for that exercise (slice 1b e1RM; warm-ups excluded) → the last rep; `hard` = he taps effort **Hard** on Rest → the last rep (decided after the set, so the candidate is held until the next set starts or the workout ends); `manual` = **"Save last rep"** on the Rest screen. **At most one automatic clip per set; at most 5 automatic clips per workout** (data); when full, a higher-priority trigger (`best` > `hard` > `form`) replaces the lowest-priority one of this workout. Manual saves are always kept and don't count toward the 5. "Randomize" in his words = whichever reps qualify; no random sampling.
  - **No voice "save that":** the slice 2 mic is chat-only and never in a workout screen (Decision "M12 slices 1b + 2"), which wins over the brief; the Rest button replaces it (M15-q2).
  - **Blur fails closed:** everyone except the tracked person is blurred using the **pose landmarker's own segmentation mask** for the one tracked pose (no second model unless task 1 shows the mask is too costly or too coarse, then MediaPipe's selfie/multiclass segmenter); a frame with no mask is **fully blurred**. Strength Light / Medium (default) / Strong; **no zero** (M15-q5). The blur, overlay and encode run on the **kept clip only, during rest**, so the pose loop pays only for the raw ring-buffer encode; **no unblurred frame is ever written to storage**.
  - **Silent by default:** no audio track; a "Sound" switch (off) in Settings → Clips asks for the microphone on first switch-on (M15-q4).
  - **Storage only on the phone:** PWA = Dexie (next version after slice 2's v11, i.e. v12 unless taken) `clips` (metadata) + `clipBlobs` (video), both in `LOCAL_ONLY_TABLES`. iPhone app = the video as a file in **Application Support/Clips with `isExcludedFromBackup`** (WKWebView's IndexedDB lives under Library and would go into an iCloud device backup), metadata in Dexie. Never in Back up files, the dev log, the copy report, any coach/brain/Claude context or share stats; never uploaded by the app. **Auto-delete after 7 days unless starred** (on launch and on opening Clips). The app **never saves to the Photos app** (iCloud Photos may sync it); the clip screen says he can still pick "Save Video" in the share sheet himself.
  - **Export:** H.264 MP4, **1080×1920 (9:16)**, overlay = exercise name, weight × reps in his unit ("Show weight" on by default, M15-q3), "New best" or a form line ("Clean rep"), the Gym Clean mark; Instagram safe margins (top ~250 px, bottom ~340 px kept clear; data). No numbers about body, Health, heart rate or food. Share only on his tap (native share sheet in the iPhone app, Web Share with a file in the PWA, download fallback).
  - **Clips screen for every user** (not owner-only): it is opt-in and each phone keeps its own clips (his wife's phone shows only hers). Reached from the workout Summary ("2 clips saved") and Settings → Clips; play, star, delete, share, "Delete all clips".
  - **Performance:** the pose loop must stay **≥ 24 fps** with the recorder armed (measured on the fake-camera run and on his iPhone); if not, the buffer drops to 540p / 24 fps (data) before anything else changes. Task 1 picks the encoder path (WebCodecs ring buffer, MediaRecorder timeslices, or a native encoder fed by the web view if WKWebView has neither).
  - **Ownership:** recorder, buffer and blur live in **`src/pose/clips/**`** (pose-engineer's existing `src/pose/**`, so the CLAUDE.md table needs no change). `.claude/agents/pose-engineer.md` still says "Never record, store or upload frames": main updates that line to the M15 exception (config, main's call) before task 8.
  - **Story pack:** the user-level `social-media` agent builds a Story pack template from clips **he picks** after Checkpoint M; **nothing is posted** and his clips are **never committed** (the repo is public): they go in a gitignored folder on his Mac.

- 2026-11-17: **M14 Wrist and ears (his words, 2026-11-17: "Add it and I need apple watch app too").** After being told AirPods head motion and an Apple Watch app were parked / out of scope, he asked for both. New milestone **M14** in SPEC (after M13), release **1.16.0**, branch `m14-wrist-ears` from the M13 result, ends at 🧍 **Checkpoint L** (gym, watch + AirPods). SPEC §6, M9 "Later" and M11 "What stays out" are changed (noted in each and in M14 "Changes to earlier contracts"). Plan under "Current milestone plan → M14". **iPhone app only.** **Planner calls he can correct:**
  - **The phone stays the brain.** The watch is a remote: it sends `SET_DONE` / `START_SET` (Start now) / `EXTEND_REST` (+30 s) / `PAUSE` / `RESUME` / `SKIP_EXERCISE` (with a confirm) and shows phone snapshots. These are existing reducer events, so **no session reducer change**. Events carry an id + the snapshot rev; the phone dedupes and drops stale ones (a Set done tapped on both counts once). Workouts **start on the phone only**; starting from the watch, complications and standalone watch use are later.
  - **Link drops:** the watch keeps the rest countdown, shows a one-step lookahead after an offline Set done, and keeps a **persisted** event queue until the phone acks; the next snapshot wins. Locked-phone handling (mirrored workout session keeping the iPhone app and its WebView alive) is only promised if the facts task proves it; until then the supported setup is the phone unlocked with the screen kept on (M9), in a pocket or face down. *(Superseded 2026-11-17 by "M14 task 1 findings": no mirroring; phone unlocked + screen on is the only supported setup.)*
  - **Heart rate:** from an `HKWorkoutSession` (traditional strength training) on the watch. "Heart rate in the app" **on by default**: current value on the phone's Rest screen and **per-set avg/max on `SetLog.hr`**, local and **backed up like sets** (his brief), unlike M11's `healthDays`. Raw samples in memory only. HR and head numbers stay **out of every coach/brain context (rules, Apple, Claude)**, the copy report and share images (same spirit as the M11 build Decision (8)); HR also stays out of the dev log.
  - **Recovery hint** on by default, shown on watch + Rest screen, **not spoken by default** ("Say it" switch): "Heart rate back down. Ready when you are." Rule as data (≥ 45 s rested, ≥ 15 s left, 5 s median ≤ baseline + 30% of the set's rise; fallback max − 25 bpm), tuned at Checkpoint L. No zones, no age-based max, no safe/unsafe, no number spoken.
  - **Save to Apple Health = off by default**; writing is new. Turning it on shows what is written (a Strength Training workout with HR and calories, nothing else) and iOS asks then. Off → the watch workout is **discarded** at Finish. M11's own-source dedupe keeps it out of the weekly load. *(Corrected 2026-11-17 by "M14 task 1 findings": Health access is asked at the first watch workout whatever the switch says; discard means no workout record, but the session's heart-rate/energy samples stay in Health; no "nothing else" wording.)* Whether WHOOP double-counts it is asked at Checkpoint L. (This is the "plan writing later" from M11-q5.)
  - **Watch sizes:** the CLAUDE.md numbers apply in points on the watch (main numbers ≥ 64 pt, text ≥ 20 pt, primary button ≥ 56 pt), black background, one primary action per screen; haptics at 10 s left and rest end (stronger), light tap on Set done. Phone voice unchanged.
  - **AirPods uses (all off until he turns AirPods on; each its own switch):** "Keep your head still." (yaw/roll drift; curls, rows, presses, lateral raise, triceps extension), "Keep your neck long, eyes ahead." (pitch; push-up, rows, bent-over row, goblet squat), and **head-counted reps** for the three standing calf raises + **dumbbell shrug** (vendored from free-exercise-db if absent). Counting starts `learning` (pre-fills the set, corrected on Rest) and becomes `ready` at ≥ 90% exact sets on his clips; the camera wins when both exist. Head hints are spoken between reps, at most one per set, sharing the camera hint cooldown; nothing on screen mid-set. No head motion during rest ("neck-friendly reminders" = the neck-neutral cue, not posture nags at rest).
  - **Motion permission** asked on first switch-on in Settings after a why page; **not** added to the M13 first-launch flow (keeps first launch short).
  - **Fixtures:** head frames are never stored; the **only** raw export is the owner-mode clip recorder (in memory → a JSON file via the share sheet on his tap). Synthetic clips first (ios-engineer, `fixtures/headmotion/synthetic/`), his clips per the SPEC guide at Checkpoint L or earlier (task 28); thresholds are provisional until then, like M4 on synthetic fixtures.
  - **Paid account:** if the free Personal Team can't install/run the watch app, the watch tasks wait for **M14-q1** (US$99/year, his call); the AirPods track and the core watch logic still build. No Dexie version change (optional `SetLog` fields + settings rows `'watch'`, `'headMotion'`).
  - **Answered 2026-11-17.** **M14-q1:** "let's try the free version, and I will decide the pay in the future" → build with the free Personal Team; task 2's spike decides. If the free team can't run the watch app, the watch-only tasks (14–19, 27, watch half of 24) pause and main asks him again with the facts; the AirPods track and the core watch logic (5–7, 20, 21) proceed. **M14-q2:** "I got series 9 and pro 2" → **Apple Watch Series 9** (runs current watchOS; `HKWorkoutSession` heart rate) and **AirPods Pro 2** (head tracking supported). Task 1 confirms both against Apple's docs; we target his devices only (no older-model fallbacks).

- 2026-11-17: **M13 Published look (his yes, 2026-11-17).** Wongsaton: "Help me think about the app, how to approve or make it ready to use as a public app (not public right now but just need the app look like startup and published app on app store)". Audience: "my friends seeing it on my instagram and my wife using it daily". Approval: "Yes, plan it and give me options to turn on owner mode". New milestone **M13** in SPEC; plan under "Current milestone plan → M13". It builds **after M12 slices 1b and 2** on its own branch `m13-published-look` from the M12 result; release **1.15.0** with tour pages; ends at 🧍 **Checkpoint K** (he and his wife try a fresh install; he posts if he wants). The app is not being published: no paid Apple account, TestFlight, App Review, store labels, accounts, sync or analytics.
  - **Owner mode = option A (his pick, 2026-11-17: "Go with option A").** Tap the version line in Settings → About **7 times** to show an "Owner tools" switch. **Fresh installs start off; installs from before 1.15.0 (sessions or to-do answers already there, i.e. his phone) start on**, decided once on the first launch without a `settings 'ownerMode'` row; the row is local and backed up. Off hides: the To-dos card / list / guides / Copy report, the re-sign reminder, the Developer log section, the build hash (About and tour), the tour's "Added to your to-dos" page and the slice 2 dev eval screen; a user sees "Version 1.15". On = everything exactly as before M13. Options B (a visible switch at the bottom of Settings) and C (long-press the logo on Today) were not chosen.
  - **Planner calls he can correct:**
    - With owner mode off the **developer log records nothing** (a normal user can't see or clear it); the saved switch is kept and applies again when owner mode is on.
    - With owner mode off the to-do **decision steps** can't be reached; their settings stay at the defaults (M12-q1, M12-q4, Claude, signing).
    - An install that trained on 1.13/1.14 before 1.15.0 (e.g. her phone, if installed early) starts with owner mode **on**; the switch is visible there, so she turns it off once.
    - **Name:** built with "Gym Clean" behind `APP_NAME` in `src/core/brand.ts` (a scan test lists the few non-TS places), so a rename is cheap. He keeps the name (M13-q1, 2026-11-17: "Keep it Gym Clean"). **Tagline default: "Your pocket strength coach."** (one constant; he can reword it).
    - **Permission pages explain first and keep the slice 2 rules:** mic is still asked only on first mic use (its page has no Allow button); notifications only when a reminder is switched on (the page's button switches the session reminder on); Health through the M11 connect flow; camera on its button. The PWA shows the camera page only.
    - **Story image:** 1080×1920; the lead number is his choice in the preview, **sessions done by default**; "total lifted" shows only if he picks it (this relaxes slice 1's "no weights" for a monthly total only; never per-lift weights, body or Health data); missed days are grey rings with no "missed" text.
    - **Landing page:** `public/welcome/index.html`, served by the existing Pages deploy at `<site>/welcome/`; static, no script, no tracker, no personal name; the service worker skips that path (`navigateFallbackDenylist`).
    - **Store screenshots use a made-up demo profile** (a generated backup restored by the script), never his data.
    - **About** becomes its own screen (privacy promise, "Coaching, not medical advice.", licenses generated from `package.json` + a hand list for vendored data/model/fonts, his copyright line); in-app only, no external links. This changes slice 1c's "no links" to "no external links".
    - **Version shown to users:** MAJOR.MINOR ("Version 1.15"), plus .PATCH when it isn't 0.
    - The second anatomy silhouette is left for later. The `social-media` agent / `/story` is not in this repo's `.claude/`; main dispatches it if it is a user-level agent.

- 2026-11-17: **M12 slices 1b + 2 (his go-ahead, 2026-11-17: "Go ahead slice 2 and 1b").** After using slices 1 + 1c on his iPhone he said the coach "still cannot help much" (free text only reaches the rule matcher), so slice 2's Apple brain is what he wants most; 1b stays tight and split for parallel owners. Order per SPEC: 1b (release **1.13.0**) then 2 (release **1.14.0**), both on `m12-coach-tab`; merge/push stays his call. Plans under "Current milestone plan → M12 — slice 1b / slice 2". **Apple Intelligence is on and fully downloaded on his iPhone** (his words 2026-11-17: "It finished"), so Checkpoint J tests the real model; the rules fallback stays for phones without it (e.g. his wife's). **Planner calls he can correct (his go-ahead 2026-11-17):**
  - **M12-q1 = default:** Apple's on-device coach may see the "Lighter today?" card's **reason sentences only**, never numbers; Claude never. Read at runtime from `coach.appleCardReasons` (the to-do decision step); "no" there removes them from Apple's context (tested).
  - **M12-q4 = defaults:** measurement sites left/right arm, chest, waist, hips, left/right thigh; Epley e1RM on each session's top set (warm-ups excluded, sets over 12 reps not charted); warm-ups only before the day's first barbell / smith / heavy-dumbbell lift (heavy = ≥ 12 kg per dumbbell, data); review every 5 weeks. Read at runtime from `settings 'trainerKit'` (defaults merged), so the to-do decision step or a later change takes effect.
  - **Second user (his wife) in 1b:** intake asks goal kind (build muscle / lose fat / get stronger / general fitness, plus optional own words), days 2–6, session length 30/45/60/75, experience, easy-on areas. A **starter plan** is built deterministically from templates as data (full body / upper-lower / push-pull-legs by days; sets/reps by goal × experience; kit-aware; fits the session length) and offered as a Proposal; his own plan is never replaced without Apply. Fresh installs see the intake before the first Today (skippable); existing installs are never forced (a "Set your goal" card + the 1.13.0 tour). **Fuel targets follow goal and sex** (Mifflin already per sex): muscle +300 kcal / 1.8 g/kg protein, strength +200 / 1.8, general 0 / 1.6, fat −400 / 2.0 (range −600…+600, never below BMR), weekly-check bands per goal; no goal = today's behaviour; a goal change shows before → after and changes nothing until Apply. **"Share my gym"** = a JSON file with equipment ids only (no `kept`, no personal data) via the share sheet / download, imported in My gym with a preview. A scan test keeps his name (except the About credit) and personal goals/numbers out of data and copy.
  - **Body fat + lean mass:** `bodyFat` / `leanMass` HealthTypes default off (old `'health'` rows read them as off; asked only when switched on); stored in `healthDays` (local-only, re-read from Health after a restore, like other Health values), never in `weighIns`, any coach/brain context or the dev log. ios-engineer adds the HealthKit reads.
  - **Easy-on list:** `TrainerState.easyOn`, changed only by a Proposal (`easyOn`, Apply / Undo); `effectiveDay` applies the avoid-area treatment for each listed area on every projected day (computed, so removal restores); every `propose*`, the focus-block builder and the starter plan never add load there. Feel-today soreness only offers **today's** avoid-area.
  - **Short on time "supersets":** accessories are **paired back to back with a 45 s pair rest** (`pairWith`), shown as pairs; true alternating supersets (A1/B1/A2/B2 in the session machine) are deferred — he can ask for them at Checkpoint J.
  - **Feel today:** two signals `feltLow` (energy ≤ 2) and `sore` (any area), so both together show the card without Health (SPEC data model edited; it listed one signal).
  - **Effort by voice** ("one word" in the SPEC) is not in slice 2: the mic is chat-only and never in a workout screen; effort stays a tap on the rest screen.
  - **Dexie:** v10 = `measurements`, `goals`, `dayFeels` (backed up), `progressPhotos` (`LOCAL_ONLY_TABLES`); intake in `settings 'intake'`; v11 (slice 2) = `checkIns` (backed up). Check-in answers stay out of every brain context.
  - **Slice 2 shape:** read-only tool results are computed by the app before each `respond` and passed in (no JS round trip; ios-engineer may propose one after the docs check). An unavailable Apple brain → rules plus **one plain note per reason, once** ("Apple Intelligence is off, so I'm using quick replies. Turn it on in Settings > Apple Intelligence & Siri."). Speak replies default "Mic only". Reminders via local notifications (choice after the docs check: `@capacitor/local-notifications` or a small plugin), all off by default, permission asked on the first switch-on; session reminder at his time, missed-day nudge next day 09:00 once, Sunday recap 19:00; text has no numbers about body, Health, weight or food.
  - **Follow-ups from the slice 1 verifier** are 1b tasks 2 (postpone wording), 3 (iOS `MARKETING_VERSION` follows package.json; ios-engineer owns `scripts/sync-ios-version.mjs`, main may add it to the CLAUDE.md table) and 4 (tab switch scrolls to top, main in app.ts).
  - **To-dos:** 1.13.0 adds "Trainer kit at the gym" (feeds Checkpoint J) and a body-comp auto step in the VeSync topic; 1.14.0 adds "Coach on your iPhone (Checkpoint J)".

- 2026-11-16: **M12 slice 1c (his yes, 2026-11-16).** Wongsaton: "Plan to add everything in the list to the app such as wizard that I need to do step by step on the app to finish each topic" · "Go with A, copy report but keep it in the app since I export it one time. I need it guide me as wizard same as when the other app publishes the new version." · "Yes, add it to the plan". New **slice 1c** (right after slice 1, before slice 1b): What's New tour per release, to-do guides (auto + ask + decision steps, as data), one in-app Copy report. SPEC M12 has the section "What's New tour + To-do guides (slice 1c)" + slice 1c Accept; plan under "Current milestone plan → M12 — slice 1c". **Planner calls he can correct:**
  - **Version = tour key** (his add, 2026-11-16: "don't forget to put version number and my name as copyright credit"): `package.json` version read at build time as `__APP_RELEASE__`, plus `__APP_BUILD__` (short git sha); shown as "Version 1.12.0 (build abc1234)" in a new **Settings → About** section at the bottom and on the tour's first page; the tour key is the semver part. About also shows **"© 2026 Wongsaton Kampusan"**. The copy report header has the version + build, not his name. `__APP_VERSION__` (sha + build time) stays the dev-log id and is the per-build id for the re-sign clock.
  - **Version policy:** MAJOR `1` (the app is live); **MINOR +1 per shipped milestone slice**, in ship order and not tied to the milestone number (M12 slice 1 + 1c = `1.12.0`, the next shipped slice `1.13.0`); **PATCH +1 for a fix-only deploy** with no tour pages. Main bumps it in the merge commit; tour pages always come with a new MINOR.
  - **Fresh install** (no sessions, no `'whatsNew'` row) → tour marked seen silently. Several unseen releases → one tour, newest first. Tour only on Today at app open, never in a workout or on the camera. Back / Next buttons always (swipe is only a shortcut).
  - **Ship 1c with slice 1** (one merge, so the first launch shows the 1.12.0 tour about slice 1): asked as M12-q5; default yes.
  - **Storage:** `todoAnswers` in Dexie **v9**, **backed up** (his own words; no Health values); tour/to-do state in `settings` keys `'whatsNew'`, `'todos'`, `'todoSignals'`. Slice 1b's tables move to **v10** (or fold into v9 if 1c hasn't shipped), superseding the v9 note in "M12 trainer kit".
  - **PWA and iPhone app keep separate to-dos** (their databases are separate). iPhone-only topics (Health week, iPhone week, VeSync, re-sign) show in the PWA labelled "In the iPhone app" and don't count there; he copies a report from each app he uses.
  - **Auto ticks stick** once recorded (with their time), except the recurring re-sign topic. Thresholds as data: 3 sessions in the iPhone app, Health data on 7 of 7 days, 2 coach changes, 6 camera sets in one session, 3 learning exercises on camera, photo meals on 7 days, re-sign warning at ≤ 2 days left.
  - **Topic mapping:** I (slice 1 check) · H (Apple Health week) · G (iPhone app week) · E extended (coach at the gym) · B3 (hands-free) · C + F1 (camera counting, cues, learning) · D (food photos) · VeSync check (ask only; reading body fat / lean mass is built in slice 1b) · decisions M12-q1, M12-q4, Claude · 7-day re-sign (M9-q1). M12-q2, M12-q3 and the "How's my week? gym-only" question are ask steps inside topic 1; M11 task 2 (WHOOP types) is an ask step in topic 2; M4f-q8 in topic 6.
  - **Decision steps set settings directly:** M12-q1 → `coach.appleCardReasons` (default yes; read by slice 2); M12-q4 → `trainerKit` defaults confirmed, or "change something" + a note that the planner turns into a Decision (settings untouched); Claude → `coach.claudeWanted` only; the key gets its own Settings screen in slice 3 and is never in a to-do, a report, a backup or the dev log. Re-sign → `signing` (`paid` stops the reminder).
  - **Hands-free auto step:** if no reliable stored hands-free marker exists (core-engineer checks the devlog tables), it becomes an ask step ("Did you train a day with hands-free on?"); this Decision gets a line when that's settled.
  - **Report:** plain text, answers + ticks since the last copy, preview first, clipboard (fallback: select-all text box), then marked sent; "Copy all again" when nothing is new. Never Health values, photo data, key-like strings ("[key removed]"), chat message text, food/body numbers. Notes are included as typed. Nothing in the dev log.
  - **No checkpoint of its own:** his pasted report goes through `/feedback`.

- 2026-11-17: **M12 slice 1 review calls (main; he can correct at Checkpoint I).** (1) **No fixed rest days ≠ misses:** with `restWeekdays` empty (his setting), each Mon–Sun week has a target = rotation length capped at 6; untrained past days are rest (dim) up to 7 − target, beyond that missed; scores read "X of 6"; the missed-day card fires only for a real miss. Fixed rest weekdays and focus-block weeks keep their own rest days. (2) **Calendar day cells 55.7px wide × 64px tall:** 7 edge-to-edge columns can't reach 56px at 390px without overflow — an accepted exception to the 56px rule, confirm at Checkpoint I. (3) **Ring fills animate `stroke-dashoffset`** (rest ring, set ring, calendar rings): paint-only on small SVGs, zeroed by the one global reduced-motion rule; the motion test whitelist stays limited to `ringFill`. (4) A new focus block overlapping a running one cuts the old block at the new start (keeps its past); the builder's trim never goes below his own plan's sets.
- 2026-11-16: **Second user: his wife (his words).** "I have a plan to use this app with my wife, so I will share the app to her soon when it's ready." / "Yes, her own phone, same apartment gym. The target of the goal might be different from me, that's why I need coach to be a personal trainer. It will make the app flexible for each user by their goal." Implications to plan in **slice 1b** (with the intake + goal item 3), not slice 1/1c: (1) **goal-driven starting plan**: the intake asks goal (e.g. build muscle / lose fat / get stronger / general fitness), experience, training days and session length, and the app builds a starter plan **deterministically from templates as data** (same rule as focus blocks: the brain only picks params); his current plan stays as his; (2) **nutrition targets follow the goal** (M7 math per sex/goal — check sex-specific BMR and the goal → surplus/deficit mapping); (3) **same gym**: a "Share my gym" file (his gym profile only, no personal data) she can import, or she ticks the kit herself; (4) **nothing hard-coded to him**: goal text, voice default (Calm), Health/WHOOP optional, About credit stays his as the author; (5) her iPhone counts toward his free Apple ID's 3 devices with the 7-day re-sign; the PWA needs nothing. Each phone keeps its own data (no accounts, no sync).
- 2026-11-16: **Body fat + lean mass from Health (his yes).** He uses a VeSync scale that syncs into Apple Health. Asked about VeSync: route via Apple Health (no VeSync API/credentials — no official public API, unofficial login + network would break the privacy rules). He said "Yes, add body fat and lean mass": slice 1b item 4 gains two read-only HealthTypes `bodyFat` (%), `leanMass` (kg) with their own switches (the iOS Health sheet goes from 6 to 8 types; asked only when he turns them on), per-day pick like weight, trends next to weight in Fuel; never in coach/Claude context, not backed up beyond what weigh-ins already are (main decides with the slice 1b plan).
- 2026-11-16: **M12 trainer kit (his picks, 2026-11-16).** From the design doc section "Trainer kit" (gaps vs a human personal trainer; research basis NASM OPT, ACSM 2026, Fitbod / Future / Caliber / Ladder reviews), Wongsaton picked **all 12**. They form **slice 1b "Trainer kit"** (web + iPhone, rule brain, after slice 1, before slice 2): (1) Easy / Good / Hard effort after each set feeding M5b; (2) automatic warm-up sets (~50% × 8, ~70% × 4, kit-snapped, spoken, excluded from volume / bests / completion); (3) intake + Goal card + standing "go easy on" list + 4–6-week review; (4) monthly tape measurements in Fuel + e1RM chart per lift; (5) "I have 20 / 30 / 45 min" proposal; (7) next block + lighter week at block end, deload suggestion after ~6 hard weeks or stalls; (8) opt-in progress photos; (9) "How do you feel today" energy + soreness counting as one "Lighter today?" signal; (10) 2–3 spoken setup cues per lift the camera can't judge; (11) weekly cardio minutes from Health on the week strip / Calendar; (12) protein-per-meal nudge, post-workout meal idea, ~10 learn cards. **Item 6 (local-notification reminders, off by default, + weekly 3-question check-in) moves to slice 2** because it needs the native app. SPEC M12 has the items + slice 1b Accept; PROGRESS has a slice 1b outline (detailed plan after slice 1 is verified). Planner calls he can correct: **progress photos stay on the phone only** (IndexedDB, `LOCAL_ONLY_TABLES`, never in backups, the dev log, Apple's context or Claude, never uploaded, off by default); measurements / goals / intake / effort are backed up like weigh-ins; the cardio line is display-only and stays out of every coach context (M11 build Decision (8)); feel-today alone can make the card (energy ≤ 2 + a sore area = two signals) so it works without Health; soreness only leads to "Go easy on…" proposals, never medical wording; slice 1b's gym feedback folds into Checkpoint J (no extra stop); the new tables take Dexie v9 (or join v8 if slice 1 hasn't shipped yet).
- 2026-11-16: **M12 approved, slice 1 starts now (Wongsaton).** He approved the Coach tab design (`docs/superpowers/specs/2026-11-16-coach-tab-chat-design.md`): brain = both, Apple's on-device model first, Claude optional; input = typing + hold-to-talk mic; English only; focus blocks; Calendar + proof of completion; app-wide motion. He said **"start slice 1"** now, **alongside his open Checkpoint H week** (M11). This is his call over CLAUDE.md rule 1 ("don't start N+1 until N meets every acceptance criterion"): M11's remaining items (task 14 review/verify/merge, Checkpoint H) stay open and M12 slice 1 builds on `m12-coach-tab` in parallel. His "Go both" is the yes for the Claude brain (M10-q7), built in slice 3; nothing calls Anthropic until he pastes his own key. SPEC edits: new "### M12", §6 and M10 non-goals now allow the deterministic focus block and on-device speech recognition (slice 2).
- 2026-11-16: **M12 plan (planner).** Plan under "Current milestone plan → M12 — slice 1"; contract SPEC M12. **Claude's calls, which he can correct** (from the design plus planning):
  - **Tabs:** Today · Fuel · **Coach** (centre, raised) · **Calendar** (replaces History) · Settings. Per-exercise history stays one tap deeper (Calendar → day → exercise).
  - **One chat, two frames:** the Coach tab is home; Today / preview Coach buttons, the "Lighter today?" card, the M10e gym prompt and Summary's stall card open the tab with their chip pre-sent; the Pause sheet shows a compact sheet version of the same component on the same thread. Mid-workout messages are stored in the same thread (phase `workout`).
  - **Chat history kept** (resolves M10-q12 as "keep"): Dexie `chatMessages` (v8), last 30 days, Clear chat, not in backups (`LOCAL_ONLY_TABLES`), never in the dev log. A stored proposal keeps a live Apply only while `baseVersion` matches; otherwise it shows its outcome or "expired" + Ask again. Live `Proposal.next` states are kept in memory, not stored in the thread.
  - **Brain router seam in slice 1:** `CoachBrain` interface in `src/core/types.ts` (main), router + rules brain in `src/data/brain/` (core-engineer, where M10 B5 already planned it), wiring in app.ts (main). Slice 1 registers rules only. This splits the caller's "main owns the seam" by file ownership: main owns the interface and wiring, core-engineer the router file.
  - **Focus block:** stored as `TrainerState.blocks` (dated, built days materialised, no Dexie change); `ProposalAction 'focusBlock'`, scope `dated`, Apply/Undo through changes.ts like any proposal. Defaults as data (`focusRules.ts`): focus weekly sets ×1.4 (range 1.3–1.5), ≥ 2 focus days/week, a per-session set cap, last week = the M10 lighter rule, 2–6 weeks, 3–6 weekdays; his rotation days cycled over the chosen weekdays; other groups keep their current sets. During a block the rotation pointer is frozen and resumes after the block from the last finished non-block session. Dated overrides (Not today, Lighter, swaps) still apply on block days. "Keep going" at the block recap = a new block proposal. The rule flow asks group → weeks (2–6; "this month" = 4) → days ("Keep my days" / 3–6).
  - **Completion:** planned for any date = the projection from the current state (plan + blocks + dated overrides + sessions); no daily plan snapshot is stored in slice 1, so a later "from now on" plan edit can change how an old missed day reads (done days use what was logged). A day counts on its session's start date; sessions on rest dates = extra (shown, never in the denominator). Week start = `weekStartOf` (src/core/stats.ts). Missed-day prompt: the newest missed planned date in the last 7 days, shown once on Today with Move it / Skip it. Recaps: one per finished week and one per finished block, posted as coach messages.
  - **"How's my week?" uses gym sessions only.** The design says "from the week strip / weekly load"; the M11 build Decision (8) keeps the weekly-load line and every Health value out of all coach contexts, and that Decision wins. Outside workouts can be added to the answer later only with his OK.
  - **Share month:** a PNG drawn on a canvas on the phone (1080×1350; grid + scores; no weights, body or Health data), handed to `navigator.share({ files })` or a download link. §6 "sharing" stays out as an app feature.
  - **Motion:** tokens `--dur-fast/base/slow` 120/220/320 ms, a standard and a spring-ish ease, transform/opacity only, one global reduced-motion rule; the Exercise and camera screens get no new motion (`data-motion="off"`); the rep counter is unchanged.
  - **E2E strategy:** slice 1 needs no fakes (rules only); slices 2/3 use a fake `GymBrain` / speech bridge (like M11's fake GymHealth) and `page.route` mocks for Claude.
  - **Open items (none blocks slice 1):** (a) slice 2: the design gives Apple's brain the M11 card reasons, but the M11 build Decision (8) says no Health value reaches any coach context — card reasons are text, not values, so the planner reads them as allowed for Apple only (as SPEC M11 says), to confirm with him before slice 2 (M12-q1); (b) the exact focus numbers (×1.4, set cap) get tuned at Checkpoint I; (c) whether a later plan edit should leave old Calendar days as they were (a stored daily snapshot) — asked at Checkpoint I (M12-q2); (d) Claude key + paid account before slice 3 (his, per the design).

- 2026-11-16: **Camera e2e stability + toast fix** (branch `e2e-camera-stability`). Flakes were test timing: times now taken inside the page (rep-count freeze, hook set, set-mode time), clip pauses on the camera frame clock, redraw-sensitive reads polled, fake-camera NotReadableError retried in the helper. `hands-free-live` waits 90 s and **skips only locally, only with ≥ 10 one-second fps samples whose mean is > 0 and < 12 fps** (machine-speed limit, not an app threshold; never skips when `CI` is set, still fails at a healthy rate; the mean fps is recorded as a `live-fps` test annotation). Page-side times (`__repsAt`/frozenAt, `__heldAt`, `__setModeAt`) are asserted > 0 before any "x − t" check. **Rep-counting specs never run beside other tests** (verifier FAIL 2026-11-16: a full 7-worker run starved five `hands-free` tests side by side, focus-cues and coach-voice to 0 reps): `playwright.config.ts` runs in phases via project dependencies — `mobile` + `pwa` in parallel, then `mobile-person-camera` (live model: camera-person, rep-count, devlog-camera, hands-free-live), then `mobile-clips` (wall-clock fixture clips: hands-free, hands-free-break, focus-cues, learning, coach-voice), each workers 1 / fullyParallel false. Costs: a full local run takes ~18.5 min (was ~12); a failure in an earlier phase skips the later ones (the run is still red); a single serial spec run alone needs `--no-deps` or it runs the earlier phases first. CI unchanged (workers 1). `m4e-theme` "app script blocked" now routes `/src/main.ts` by regex: Vite serves the entry as `main.ts?t=…` after an invalidation, which the old glob missed (the app booted); the test also asserts the route actually fired. Toast: `placeToast` sets `data-toast-over="sheet|screen"` (asserted in fuel.spec) and documents that `.fuel-sheet` is the contract with src/ui/fuel. Stress runs must use separate checkouts (two e2e runs in one checkout cause Vite HMR reload storms). Toast: placed at the bottom edge over Fuel sheets, `--toast-space` lifts the sheet's main button above it; "Restore undone." shown once. Follow-ups: per-port Vite cacheDir; pose-engineer may retry getUserMedia once on NotReadableError.
- 2026-11-16: **M7b export check + Mac model.** Root cause of the Colab export failure: the self-check fed MediaPipe full-size photos, whose non-antialiased downscale flips ~5% of top-1 answers vs the head trained on Pillow-resized 224×224 photos (the .tflite itself matched 100%). Fix: metadata written in pure Python (no libEGL on bare Linux), check runs on photos pre-resized to 224×224 stretched, 200 check images, `min_top1_agreement` 0.98 (raised, not lowered); model + json written before the check. App contract: classifier.ts pre-resizes to 224×224 stretched with high-quality smoothing before MediaPipe. Mac model `food-classifier-mac-1.tflite` (30 classes, THFOOD-50 only, gitignored, copied to his Downloads): test top-1 81.5% / top-3 95.1%, agreement 1.000, 6.84 MB, 3.6 ms/image on Mac CPU. 23-class rerun mac-0 85.2% / 96.8% matches Colab colab-1. Weakest: larb_moo, moo_tod_kratiem, kor_moo_yang (~42% top-1).
- 2026-11-16: **Backup + coach hardening (reviewer notes on M10e/backup).** `validateBackup` now checks every row against a per-table shape (required fields + types; optional fields typed when present; `weeklyChecks` avg/prev/rate may be null; extra fields allowed for a newer app at the same schema) before the confirm step, refusing with `'corrupt'` and naming the table/field, db untouched. Secret stripping only touches `settings` rows, by an explicit name list (`SECRET_NAMES` in `src/data/backup.ts`, exact match ignoring case and `-`/`_`): such a settings row is dropped and such a property is removed inside settings values; other tables and names like `tokenCount` are kept. `LOCAL_ONLY_TABLES` (foodPhotos, foodModels) and the devlog stay out. Coach: `phrases.json` `missingKit.bareNot` ("no more", "anymore", "today", "tonight", "tomorrow", "this week", "for now", วันนี้, …) blocks the bare-"no" missing-kit swap, so "no more squats" / "no squats today" → help and "no legs today please" → avoidArea legs today; explicit statements ("my gym has no leg press", "no leg press here") still swap. Eval set +2 items (100 total, 97 rule-supported), rule matcher still 100%.
- 2026-11-16: **7 more Thai dishes (54 total).** `thai:pad-pak-ruam-mit`, `thai:kor-moo-yang`, `thai:khao-mok-gai`, `thai:suki-nam-moo`, `thai:yentafo`, `thai:kuay-jab`, `thai:goong-pao`: our own reference recipes in `thaiDishes.src.json` mapped to USDA rows (stand-ins named in each note: shoulder blade for pork neck, surimi for fish balls, catsup + miso for the pink sauce, sriracha for suki sauce, cooked shrimp for river prawns, canned sweet corn for baby corn), rebuilt with `node scripts/build-foods.mjs --dishes-only` (thaiDishes.json 7.1 kB gzip). foods.test.ts dish cap raised 50 → 60. The class map (`src/food-vision/classMap.json`) is the ml/food-vision owners' to extend.
- 2026-11-16: **Overnight approvals (Wongsaton: "Yes to all three")**: (1) deploy M7b food photos tonight if review + verifier + CI pass (inert until he imports a model); (2) build + deploy the backup/coach hardening (per-table row checks, settings-only secret stripping, "no more squats" not a missing-kit swap); (3) add 7 dishes (pad pak ruam mit, kor moo yang, khao mok gai, suki, yentafo, kuay jab, goong pao) and include them in the Mac retrain (30 classes).
- 2026-11-16: **M11 (Apple Health + WHOOP) answers** — plan on branch `m11-health` (f015871). Wongsaton: M11-q2 **route A** (WHOOP → Apple Health → Gym Clean, no network; so no HRV / Recovery / Strain, which WHOOP doesn't export to Health); M11-q3 **if HealthKit needs the paid Apple account, pause M11**; M11-q5 **read-only for now, plan writing to Health later**; other defaults (6 types, kept out of backups/dev log/Claude) stand. His Xcode test (Signing & Capabilities → + HealthKit on the free Personal Team) decides go/pause. M11 will need Dexie v7 (M7b took v6).
- 2026-11-16: **Dexie version 6 (M7b).** New tables only, `foodModels: 'id'` and `foodPhotos: 'id, createdAt, dishId'`, no upgrade function (v5 → v6 test keeps every row). Both are left out of the JSON backup (`LOCAL_ONLY_TABLES` in src/data/backup.ts): they hold large Blobs; photos leave the phone through the zip export, the model is re-imported in Settings. A restore leaves them untouched. The 'foodVision' setting lives in `settings` and is backed up.
- 2026-11-16: **M7b dataset verdict B** (ml/DATASETS.md): no public set both allows training+publishing weights and has enough of our dishes (THFOOD-50/100, Food-101, UEC: non-commercial research only; Commons CC0/CC BY too few per dish; Open Images counts unknown). So: pipeline + 2-class smoke run only in the repo; Wongsaton trains privately on his Mac (THFOOD under its terms + his own photos) and imports the model in Settings; task 17 (bundled model) is dropped. Class map: 23 classes covering 31 of 47 dishes. Answers 2026-11-16: M7b-q2…q6 "yes" (defaults); q1 Colab still asked (public data only, never his photos). Open route to A later: a Commons + Open Images (CC BY) set, needs his OK to download the Open Images label files.
- 2026-11-16: **M7b photo export folder names.** The zip uses a safe folder per dish (`thai:pad_thai` → `thai_pad_thai`; any char outside `[A-Za-z0-9._-]` → `_`), because `:` doesn't extract cleanly on macOS/Windows. `labels.csv` (`file,dishId,createdAt`) keeps the exact id and is the only source of labels for `ml/prepare.py` (task 5).
- 2026-11-15: **M7b local part plan (planner).** It follows `docs/cloud-briefs.md` Session 1, which Wongsaton prepared. Plan under "Current milestone plan"; contract: SPEC M7b steps 1–3, 5 and Training. Branch `m7b-food-vision` from c818def.
  - **Step 4 (Claude backup) is out:** it needs a paid key and his open proxy-vs-own-key decision. No Claude client, button, key or CSP entry. `decide()` keeps a `claudeAvailable` input (always false) so step 4 can plug in later. The SPEC Accept items about Claude wait for it.
  - **Datasets need a licence check first (task 1).** The SPEC names THFOOD-50/100, which it describes as non-commercial research only. The cloud session trains only on data whose licence allows training **and** publishing the weights (verdict A). Otherwise it builds and smoke-tests the pipeline and **stops before real training** (verdict B).
  - **Model delivery.** This reconciles SPEC ("never commit the trained model; import it once in Settings") with the brief ("commit the model only if ≤ 25 MB and the licence allows redistribution"):
    - Settings → Import (stored in IndexedDB) is always built;
    - a bundled, precached model at `public/food-vision/` (one `.gitignore` exception) is added **only on verdict A**;
    - otherwise the SPEC rule stands, and the model never enters the repo.
  - **No network:** the MediaPipe vision wasm is the existing same-origin, precached `mediapipe/wasm/` fileset. The model comes from IndexedDB or the same origin. The CSP doesn't change.
  - **Class map:** `src/food-vision/classMap.json` maps each classifier label to one or more `thai:*` dish ids (look-alike variants share a class; the first one is the default). The app and the Python pipeline both read it, and a test checks that every class has a dish in `thaiDishes.json`.
  - **Data model:** `FoodEntry` gains `source?: 'photo-local' | 'photo-ai'`, because the SPEC's entry `source` didn't exist on `FoodEntry`. `photoConfidence` is set only when the logged dish was one of the offered options. Dexie **version 6** adds new tables only (`foodModels`, `foodPhotos`). Food-vision settings live under settings key `'foodVision'`, with `savePhotos: false`.
  - **Photo export** is a pure store-only zip writer in `src/core/zip.ts`, with no new dependency. It holds the photos plus `labels.csv` (file, dishId, createdAt) only.
  - **E2E** uses a fake classifier through a seam that exists only under `import.meta.env.DEV` (it must not appear in `dist/`). The real MediaPipe path has an opt-in smoke spec on a 2-class smoke model.
  - **Compute:** no GPU on his Mac or in the cloud session. Training uses a small frozen backbone with cached embeddings (≈ 2 h of CPU). Colab is allowed for public data only.
  - **Split ownership:** the pure decision logic lives in `src/food-vision/decide.ts` (ml-engineer, DOM-free, tests first), as the brief asks. The FoodEntry builder lives in `src/core/nutrition/photo.ts` (core-engineer).
  - The M7b-q defaults are provisional until he answers.
- 2026-11-16: **M11 build decision: Health wins for weigh-ins** (Wongsaton: "use data from Health because it syncs from my weight scale app"; supersedes "first import wins, typed replaces" in (5) below). Rule as built in `src/core/health/weighIns.ts` `dailyWeighIns` / `planWeighInImport`: (a) when Weight is on, each local date's pick is the earliest body-mass sample before 12:00, else the earliest sample that day; kg rounded to 4 decimals; (b) the pick is written as that date's weigh-in (source `health`) and replaces a typed one, unless the date is in `deletedHealthWeighIns` (then whatever he left stays); (c) a later read rewrites an imported row when the pick changed; a row already holding the same health value is not rewritten; (d) a weigh-in he types on a Health-filled date stays until a read whose window includes that date (normally the next app open for today/yesterday) brings a Health value — then Health wins. Settings → Health → Weight explainer: "Uses your weight from Health, like a scale app. It replaces a typed weigh-in." (e) **One-time catch-up without a type change:** the 'health' settings row stores a storage-only marker `weighInRule: 2` (`HEALTH_WEIGH_IN_RULE` in `src/data/health/store.ts`), written by every `saveHealthSettings`; `getHealthSettings` hides `lastReadAt` when the stored row lacks the current marker, so the first sync after this change reads the full 35 days once and then saves the marker with the new `lastReadAt`. The marker is stripped from backups like `lastReadAt` (`HEALTH_LOCAL_FIELDS`). Fuel's weight (latest weigh-in, and `currentWeight`'s 7-day average) reads the stored rows, so it shows the Health value once replaced (store.test + e2e). Follow-up for ui-engineer: the Fuel weigh-in sheet has no copy yet saying a typed weigh-in is replaced by Health on the next read when Weight is on.
- 2026-11-16: **M11 build decisions (tasks 3–12).** (1) **Connected** = at least one Health type is on; nothing extra stored (`lastReadAt` can't be used: turning a type on clears it to force a 35-day re-read). Connect with every type off turns on the six SPEC types, then `requestRead`, then sync; iOS's sheet still lets him refuse each. (2) **No workout average heart rate:** `HealthWorkout.avgHr` stays empty because it needs a 7th permission (Heart Rate) beyond the approved six; nothing in M11 uses it. (3) Custom read-only Swift plugin (`GymHealth`, local package `GymHealthCore` with XCTest); `capacitor-health` lacks sleep/HRV/RHR, `@capgo/capacitor-health` is MPL-2.0. (4) HealthKit HRV is SDNN, WHOOP's is RMSSD: baselines stay per source. (5) `healthDays` + `readiness` + `lastReadAt` are not backed up; switches and `deletedHealthWeighIns` are; imported weigh-ins are normal weigh-ins (first import wins, typed replaces, deleted import stays deleted). (6) Card buttons answer the card once per day and open the existing M10 coach on chip lighter / deload / notToday (same Apply/Undo path, no new Proposal). (7) Plugin code only in a lazy `health-*.js` chunk loaded when `Capacitor.isNativePlatform()`; the web main chunk has none. (8) **Stricter than SPEC on the coach:** the weekly-load line is *not* put in the coach context either (SPEC M11 allows it); no Health value reaches any coach context (M11-q7). (9) Turning on only Workouts also lists Active Energy on the iOS sheet (workout kcal needs it); both are in the approved six. Follow-ups: Fuel weigh-in sheet line "Health's weight replaces this on the next read." when Weight is on (reviewer note, ui-engineer); persist the activity-line answer (now 7 days in memory); move "drop today's card when its type is turned off" from the UI host into `setHealthTypeEnabled`.
- 2026-11-16: **M11 answered and started.** Answers as under Blockers (route A, read-only, defaults for q1/q4/q6/q7/q8). HealthKit on a free Personal Team is **verified**: Xcode added the capability (`ios/App/App/App.entitlements` with only `com.apple.developer.healthkit`, no background delivery, no clinical records, no team id) and the signed build succeeded (commit 1b974b1 on the M9 worktree branch). Branch `m11-build` = main c076135 + the M9 iOS project (e89ee6f + 1b974b1) + the M11 plan (f015871). **Dexie is now at version 6 (M7b)**, so M11's `healthDays` table is **version 7**, not 6 as the plan says; plan text below means v7.
- 2026-11-16: **M11 health data plan (planner, paper only).** Wongsaton asked to use Apple Health and his WHOOP data so the coach can help him improve. SPEC M11 is written as a **proposal** (it changes §6, which keeps "Apple Watch / heart rate" out of scope); the plan is under "Current milestone plan"; questions M11-q1–q8 under Blockers. Until he approves M11-q1, §6 still wins.
  - **How the facts were gathered:** this planning session had **no web access** (no WebSearch/WebFetch tool available), so nothing below was checked against a live page today. Each fact is the planner's understanding, with the **official page to check** named; M11 task 1 re-checks every one and records source + date, exactly as M9 task 1 did. **NOT VERIFIED** applies to every bullet until then.
  - **(1) HealthKit on a free Personal Team.** Planner's understanding: HealthKit is one of the capabilities a free Apple ID (Personal Team) **can** add; the free-team exclusions are things like push notifications, iCloud, Apple Pay, In-App Purchase, Sign in with Apple, Associated Domains. Background delivery (`com.apple.developer.healthkit.background-delivery`) and Clinical Health Records are separate entitlements we don't need. Check: https://developer.apple.com/help/account/reference/supported-capabilities-ios (the "Apple Developer" column — the M9 check couldn't read this table as text) and, decisively, Xcode → Signing & Capabilities → + HealthKit with his Personal Team on his Mac. **If free can't, M11 waits on M11-q3** (paid program, US$99/year per the M9 Decision). Also from Apple's docs to confirm: `NSHealthShareUsageDescription` is required to read; HealthKit data is unavailable while the device is locked; read authorization status is hidden by design (a denied type just returns no samples), so the app can't tell "denied" from "no data" (https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data, https://developer.apple.com/documentation/healthkit/protecting-user-privacy).
  - **(2) Capacitor plugin vs custom.** Planner's understanding of the community options: `@perfood/capacitor-healthkit` (MIT, iOS only), `capacitor-health` by mley (MIT, iOS + Android Health Connect), `@capgo/capacitor-health` (Capgo; licence to check). Whether any declares a Capacitor 8 peer and covers sleep stages, HRV SDNN, resting HR and workouts with source info is unknown. Check: npm registry (`npm view <pkg> peerDependencies license time`) and each GitHub repo's issues/last release. **Default: a thin custom Swift plugin** (`GymHealth`, read-only, ~6 types): no third-party code with access to health data, Capacitor 8 SPM fit is ours, matches M9's "Swift stays thin" and own-plugin pattern (KeepAwake, AudioSession). Switch to a library only if task 1 finds one that is maintained, Capacitor-8, MIT/Apache, and covers all types.
  - **(3) What WHOOP shares with Apple Health.** Planner's understanding: WHOOP **writes** workouts (its activities), sleep analysis, heart rate, resting heart rate, HRV, active energy and possibly respiratory rate; it **reads** some profile/body data (e.g. height, weight) and possibly workouts from other apps. **Recovery % and Strain are WHOOP scores with no Apple Health type, so they are not shared.** WHOOP measures HRV as RMSSD while Apple's type is SDNN, so the coach only compares HRV with his own baseline from the same source. Check: WHOOP support's Apple Health integration article (support.whoop.com) — and, decisively, M11 task 2 (🧍 he reads the WHOOP row in the Health app on his phone).
  - **(4) WHOOP Developer API (route B).** Planner's understanding: developer.whoop.com, OAuth 2.0 authorization-code flow; a registered app has a client id **and client secret**, and the token exchange uses the secret (PKCE-only public clients: unknown); refresh tokens need the `offline` scope; read scopes include `read:recovery`, `read:cycles` (day strain), `read:sleep`, `read:workout`, `read:profile`, `read:body_measurement`; v2 of the API replaced v1; webhooks need a public HTTPS endpoint; rate limits and the WHOOP API Terms of Use apply (for example, rules on storing and showing WHOOP data). Check: https://developer.whoop.com/docs (OAuth, scopes, rate limits) and WHOOP's API terms. **Privacy meaning:** route B makes the app talk to WHOOP's cloud. His data already lives there; the app would **download** it (nothing about his workouts is uploaded), but it breaks M9's "no network request" rule, needs a CSP entry, tokens on the phone, and — if a secret can't safely live in the app — a small server he owns, which would see his tokens and data in transit. That's a product decision (M11-q2), not a default. Route A gives sleep/HRV/RHR/workouts/active energy without any of that; it only lacks the recovery % and strain scores.
  - **Defaults chosen:** route A (WHOOP → Apple Health → Gym Clean, no network); read-only; six types (body mass, workouts from other apps, active energy, sleep, resting HR, HRV); per-type switches; personal 28-day baselines, ≥ 7 days before use; a "Lighter today?" card on 2+ signals that only opens existing M10 proposals (Lighter / Not today / Deload), never auto-applies, never mid-workout, never spoken; per-day summaries stored, no raw samples; Health data out of backups, dev log and Claude; no write-back.
  - **Native app only:** HealthKit has no web API. The PWA shows "Health data works in the iPhone app." The branch is cut from `m9-native`.
  - **Checked 2026-11-16 (ios-engineer, M11 task 1 for the plugin; Apple pages read through developer.apple.com's documentation JSON, npm through the registry).** No fact changes a default.
    - Sleep stages: `HKCategoryValueSleepAnalysis` = `inBed`, `awake`, `asleepCore`, `asleepDeep`, `asleepREM`, `asleepUnspecified` (+ deprecated `asleep`, same raw value 1); `allAsleepValues` (iOS 16+) is the asleep set. Detailed stage samples overlap the in-bed sample but not each other; Apple Watch only writes awake samples between sleep samples. → plugin sums asleep stages per source, merges overlaps, leaves out in-bed/awake. https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis, …/hkcategoryvaluesleepanalysis/allasleepvalues
    - HRV: `heartRateVariabilitySDNN` (iOS 11+), time units, discrete; HealthKit's HRV is **SDNN** ("standard deviation of the inter-beat (RR) intervals"). Confirms: WHOOP's RMSSD, if it writes into this type, is only comparable with its own baseline. https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn
    - Resting HR: `restingHeartRate` (iOS 11+), count/time, discrete; the system "may delete earlier samples and replace them with better estimates" during the day (Apple Watch). → read the morning value with that in mind (core-engineer). https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/restingheartrate
    - Body mass: `bodyMass` (iOS 8+), mass units, discrete. Active energy: `activeEnergyBurned` (iOS 8+), energy units, **cumulative**, "may be condensed and/or coalesced" → the plugin uses a daily `HKStatisticsCollectionQueryDescriptor` (`.cumulativeSum`, iOS 15.4+), which de-duplicates overlapping sources (WHOOP + iPhone). …/activeenergyburned, …/bodymass, …/hkstatisticscollectionquerydescriptor
    - Workouts: `HKWorkout` (`workoutActivityType`, `duration`, `startDate`); `statistics(for:)` (iOS 16+) gives the workout's active energy; `totalEnergyBurned` still documented, not deprecated. Average HR would need the **heart-rate** read permission, which is not one of the six types, so `avgHr` stays empty (see report). …/hkworkout, …/hkworkout/statistics(for:)
    - Async queries: `HKSampleQueryDescriptor` (iOS 15.4+). Authorization: `requestAuthorization(toShare:read:) async` (iOS 15+); the app **crashes without the usage key**; read denial is hidden ("it simply appears as if there is no data"); `authorizationStatus(for:)` covers sharing only. …/hksamplequerydescriptor, …/hkhealthstore/requestauthorization(toshare:read:), …/hkhealthstore/authorizationstatus(for:), …/protecting-user-privacy
    - Locked phone: the store is encrypted while locked; queries fail with `HKError.Code.errorDatabaseInaccessible` → plugin rejects with code `LOCKED`, TS returns an empty result with status `locked`. …/hkerror/code/errordatabaseinaccessible
    - Availability: `HKHealthStore.isHealthDataAvailable()` true on iPhone; false on iPadOS ≤ 16 / macOS. …/hkhealthstore/ishealthdataavailable()
    - Capacitor 8 local plugin: `CAPPlugin, CAPBridgedPlugin` with `identifier`/`jsName`/`pluginMethods`, registered by a `CAPBridgeViewController` subclass in `capacitorDidLoad()` → `bridge?.registerPluginInstance(...)`; JS side `registerPlugin('GymHealth')`. https://capacitorjs.com/docs/ios/custom-code (and `@capacitor/ios` 8.6.2 `CAPBridgeViewController.capacitorDidLoad`).
    - npm plugins (registry, 2026-11-16): `capacitor-health` 8.4.0 (mley, MIT, peer `@capacitor/core >=8`, published 2026-09-23) — no sleep, HRV or resting HR → doesn't fit. `@capgo/capacitor-health` 8.13.0 — **MPL-2.0**, not MIT/Apache. `@perfood/capacitor-healthkit` 1.3.2 — peer Capacitor ^4, last publish 2025-02. `@flomentumsolutions/capacitor-health-extended` 0.9.5 — needs Capacitor ≥ 9 beta. → **default stands: thin custom `GymHealth` plugin.**

- 2026-11-15: **Hand-off to the cloud (Wongsaton flying, Mac offline).** Branch `m10-equipment` (M10e equipment swaps, M7 follow-ups, M9 B1–B3 backup, M9 docs) is reviewer PASS (ff3f318); the local verifier was stopped mid-run (partial screenshots `docs/screenshots/m10e-verify-*.png` committed, no verdict) — the cloud session re-runs verification, then merges and deploys (his approval: "Deploy it when it's ready", "merge and deploy them too"). M9 task 3 (Capacitor iOS project) is on branch `m9-native` (e89ee6f, not for main yet). **Device checklist on his iPhone 17 Pro, 2026-11-15: 4/4 pass** (dark launch, no white flash; works in Airplane Mode; portrait only; camera prompt with the right words). Reviewer non-blocking notes for M10e/backup: validate row shapes per table before restore; narrow secret stripping to settings rows / an explicit list; negative eval cases so "no more squats" isn't a missing-kit swap; never render vendored `instructions` (Barbell/Smith squat text mentions knee stress).
- 2026-11-15: **M10e vendored swap pool (task 3).** From yuhonas/free-exercise-db at commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (licence checked: Unlicense), fields unchanged, no images: `Smith_Machine_Squat`, `Barbell_Squat` (the plain back squat; `Barbell_Full_Squat` is the full-depth variant), `Smith_Machine_Calf_Raise`. `Split_Squat_with_Dumbbells` is already rear-foot-elevated upstream, so no extra split squat. Swap pool now 30.
- 2026-11-15: **M9 native shell plan (planner, paper only; facts re-checked 2026-11-15 by main, M9 task 1).** Wongsaton said yes to "Plan M9 … No code until you answer." SPEC M9 is now a full section (it replaces the outline); the plan is under "Current milestone plan". Supersedes M10-q9. He answered "defaults for all 9, iPhone 17 Pro" the same day.
  - **How the facts were checked:** the planner had no web access; task 1 re-checked each one on 2026-11-15 against official pages (capacitorjs.com, developer.apple.com through its documentation JSON, support.apple.com, apple.com, npm registry, and the `@capacitor/ios` 8.6.2 source). **CHANGED** marks a fact that differs from the planner's version; **NOT VERIFIED** marks one no official page confirmed. None of the changes moves a M9-q default.
  - **Capacitor** (checked 2026-11-15):
    - Current stable major is **8**: latest **8.6.2** (2026-11-12) for core/cli/ios, `@capacitor/haptics` **8.0.2** (peer `@capacitor/core >=8.0.0`). Source: npm registry (`npm view @capacitor/core dist-tags`), https://github.com/ionic-team/capacitor/blob/main/CHANGELOG.md.
    - iOS floor **15.0** ("iOS 15+ is supported", and `s.ios.deployment_target = '15.0'` in the 8.6.2 podspec); **Xcode 26.0+**; **Node 22+** (`engines: node >=22.0.0`; this Mac has Node 26). Sources: https://capacitorjs.com/docs/ios, https://capacitorjs.com/docs/getting-started/environment-setup.
    - **Swift Package Manager is the default** for new iOS projects in Capacitor 8 ("CocoaPods was the default … in Capacitor 7 and earlier"; `--packagemanager CocoaPods` opts back). Source: environment-setup page above.
    - **CHANGED (new):** **Capacitor 9.0.0-rc.0** is on the `next` tag since 2026-11-12, not GA. It needs iOS 16+, **Xcode 27**, **Node 24+**. We pin 8.6.2 (stable, matches Xcode 26 and our iOS 26 target); move to 9 after GA as its own task. Source: https://capacitorjs.com/docs/next/updating/9-0.
    - **CHANGED:** the CLI telemetry is **opt-out**, not opt-in: on the first `cap` command in an interactive terminal it turns itself on and says how to opt out (`node_modules/@capacitor/cli/dist/telemetry.js`, "Telemetry is opt-out"). Our `ios:*` scripts run `cap telemetry off` first (it writes only the machine's Capacitor sysconfig), so no usage metrics leave his Mac (CLAUDE.md: no analytics).
    - Official plugin used: `@capacitor/haptics`. Keep-awake and ducking stay two tiny own plugins.
  - **Free Apple ID (Personal Team)** (checked 2026-11-15, https://developer.apple.com/support/compare-memberships/): "up to **10 App IDs**, which expire after **7 days**"; "up to **3 devices**, which expire after 7 days" (**CHANGED: added**); "up to **3 apps per device**". The app stops opening when the 7-day profile expires until it's rebuilt from Xcode. TestFlight needs App Store Connect, i.e. the paid program. **NOT VERIFIED:** which capabilities a Personal Team can't add (push, iCloud, Sign in with Apple, Associated Domains, HealthKit): Apple's "Supported capabilities (iOS)" table (https://developer.apple.com/help/account/reference/supported-capabilities-ios) didn't come through as text. It doesn't matter for M9: camera, audio session, idle timer, haptics and the Foundation Models on-device model need no entitlement; task 3 confirms in Xcode → Signing & Capabilities on his Mac. iPhone needs Developer Mode on.
  - **Apple Developer Program** (checked 2026-11-15): "**99 USD per membership year**. Prices may vary by region and are listed in local currency during the enrollment process" (https://developer.apple.com/programs/enroll/). **TestFlight**: "You can test a build for up to **90 days**" (https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview); up to 100 internal and 10,000 external testers (https://developer.apple.com/testflight/). Paying needs his explicit yes (CLAUDE.md rule 7).
  - **Foundation Models** (checked 2026-11-15):
    - Framework: iOS / iPadOS / macOS / visionOS **26.0+** (https://developer.apple.com/documentation/foundationmodels). Needs an Apple Intelligence device with Apple Intelligence on and the model downloaded; `SystemLanguageModel.Availability.UnavailableReason` = `deviceNotEligible`, `appleIntelligenceNotEnabled`, `modelNotReady` (…/systemlanguagemodel/availability-swift.enum/unavailablereason).
    - Devices: "iPhone 16 models or later, iPhone 15 Pro, iPhone 15 Pro Max, iPhone Air" (and the new iPhone Duo), so **his iPhone 17 Pro qualifies**; Apple Intelligence needs up to 14 GB free on iPhone 17 Pro models. Source: https://support.apple.com/en-us/121115.
    - Context: **4,096 tokens per session**, counting instructions, prompts, tool schemas + inputs + outputs, Generable schemas and every response; English ≈ 3–4 characters per token. Sources: https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window, https://developer.apple.com/documentation/foundationmodels/managing-the-context-window. `SystemLanguageModel.contextSize` and `tokenCount(for:)` read it at runtime (listed with the 26.4 changes on https://developer.apple.com/documentation/updates/foundationmodels; the task 9 probe guards them with `#available`). M10 B2's 1,500-token context budget still fits.
    - **Languages: Thai is NOT supported** (confirmed). Apple Intelligence languages: English, Danish, Dutch, French, German, Italian, Norwegian, Portuguese, Spanish, Swedish, Turkish, Vietnamese, Chinese (simplified, traditional), Japanese, Korean (https://support.apple.com/en-us/121115; Thai appears on https://www.apple.com/ios/feature-availability/ only for non-AI features). **CHANGED:** the list is longer than the planner's. The model "understands and generates text in any language that Apple Intelligence supports"; check with `supportsLocale(_:)` / `supportedLanguages` (https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models). So Thai free text goes to the rule matcher (M10-q5), as planned.
    - **CHANGED (new, iOS 27):** iOS 27 is the shipping iOS now (27.2 on 2026-10-26, https://www.apple.com/newsroom/2026/10/siri-ai-is-available-in-more-languages-starting-today/). It ships a **new on-device model** (Apple: test prompts again after people update) and adds **`PrivateCloudComputeLanguageModel`**: 32K context, stronger reasoning, needs the network, a daily request limit and a managed entitlement (`com.apple.developer.private-cloud-compute`, eligibility required). It runs **off the device**, which the CLAUDE.md privacy rule ("all … inference stays on the device") rules out, so M9/M10 B use only `SystemLanguageModel`; using PCC would be his product decision. Sources: https://developer.apple.com/documentation/updates/foundationmodels, https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute. Deployment target stays **iOS 26.0** (M9-q3).
  - **`CMHeadphoneMotionManager` (later, not M9)** (checked 2026-11-15): iOS **14.0+**; the Info.plist motion usage key is required ("If this key is absent, the system crashes your app when you start device-motion updates"); no entitlement. Source: https://developer.apple.com/documentation/coremotion/cmheadphonemotionmanager. **NOT VERIFIED / CHANGED:** Apple names supported headphones only by example ("such as AirPods Pro 2 or AirPods 4", https://developer.apple.com/documentation/coremotion/getting-motion-activity-data-from-headphones); the planner's model list and "about 25 Hz" aren't on any Apple page found, so treat both as unknown until measured on his AirPods. It still needs a SPEC section before it's planned.
  - **Camera (`getUserMedia`) in the Capacitor WKWebView** (checked 2026-11-15 in the `@capacitor/ios` 8.6.2 source): `WebViewDelegationHandler.webView(_:requestMediaCapturePermissionFor:…)` answers `.grant`, and `CAPBridgeViewController.webViewConfiguration` sets `allowsInlineMediaPlayback = true` and `mediaTypesRequiringUserActionForPlayback = []`. So no WebKit prompt and inline video work out of the box; iOS still shows its own camera prompt, which needs **`NSCameraUsageDescription`** in Info.plist (task 3). Older WebKit reports of no prompt on `capacitor://localhost:<port>` (https://bugs.webkit.org/show_bug.cgi?id=259304) → keep the default hostname (no port). Task 4 likely needs no native code; it confirms on the device.
  - **Planner's recommended defaults (the M9-q questions), accepted 2026-11-15:** start on the **free Apple ID**, decide on the paid account at Checkpoint G; **ios-engineer** in the CLAUDE.md table; **min iOS 26.0**; **first features:** shell + offline bundle + camera + ducked voice + screen-on (+ light haptics, + backup/restore), then M10 phase B's Foundation Models; head motion, notifications and HealthKit later or never; updates from a **bundled** build (no `server.url`); **keep the PWA** as the main app.
  - **Native build mode (built in task 2):** `vite build --mode native` → base always `/` (BASE_PATH ignored), no `VitePWA` (no `sw.js`, `registerSW.js`, `workbox-*.js` or `manifest.webmanifest`), same CSP meta. Every other mode is the old config. Output goes to `dist/` (Capacitor `webDir`), so `ios:sync` rebuilds it before copying.
  - **HealthKit / Apple Watch:** the ios-engineer agent text lists them, but SPEC §6 keeps them out of scope. SPEC wins until he says otherwise (M9-q4).
- 2026-11-15: **M10e equipment-aware swaps (planner).** His gym has no leg press, but Legs B has Leg Press. Wongsaton: "That's why I want the coach to help me" and "Yes, build it". Plan under "Current milestone plan"; contract: SPEC M10 "Follow-up: equipment-aware swaps (M10e)".
  - **Scope:** a follow-up to M10 phase A on branch `m10-equipment`, not a new milestone number. It proceeds on his explicit word while Checkpoint E is open, as M7 and M10 did.
  - **Gym profile:** a list of equipment ids stored on the phone (settings key `'gym'`, existing table, **no Dexie version bump**). Default = his list from the photos (Decision "Gym equipment (M10-q6)"). Editable later (Settings → My gym, can-follow).
  - **Kit needs are data:** `src/data/exerciseKit.json` gives each catalog exercise "any of these kit lists". The coarse free-exercise-db `equipment` field stays as vendored but no longer decides swaps. `TrainerCatalog.hasEquipment` becomes `canDo(exerciseId)`.
  - **Never silent, asked once:** when the day has an exercise his gym can't do, Today/preview show a prompt; the coach offers a plan-scope swap (the existing swap Proposal: Apply, Undo, Plan changes), plus Just today and Keep it. Keep it is remembered until he edits his gym; Just today asks again next time (M10e-q6).
  - **Closest replacement first** via a data list (`replaceWith`), then the existing muscle ranking. The avoid-area rule (swaps share a primary muscle) is unchanged.
  - **Vendored:** smith squat, barbell squat and a smith calf raise from free-exercise-db (Unlicense), only ids checked upstream. They show "Info" (no 3D demo) and are manual.
  - **Single D-handle:** face pull and pushdown copy is written for one handle (M10e-q4). Rope-only exercises are never suggested.
  - **Files kept clear of the cloud sessions:** no `ml/**`, `src/food-vision/**`, `src/ui/fuel/**`, `src/ui/coach/undoToast.ts` or camera specs. Shared: `src/core/types.ts`, `src/ui/app.ts` (expect a merge with session 2), `today.ts` / `preview.ts`.
  - The M10e-q defaults are provisional until he answers.
- 2026-11-15: **Answers recorded:** M10-q2 "yes" (helper exercises stay, 10% lighter; as built), A-q5 "no" (a rep best at a lighter weight doesn't count; as built), A-q6 "keep it" (Volt gold and `--warn` amber stay). No code change.
- 2026-11-15: **Gym equipment (M10-q6), read from Wongsaton's 41 photos of his apartment gym** (photos stay on his Mac in `private/`, gitignored; people ignored). Swaps and future camera exercises should only use this list.
  - **Matrix cable tower** (stacks 10–295 lb, 15 lb steps): lat pulldown (long bar, thigh pad), seated low row, adjustable pulleys (19 positions) on a column + overhead beam, side pulleys (crossover-type moves likely possible). **Attachments seen: lat bar and single D-handle only** (no rope, straight bar or V-handle seen → face pull / rope pushdown need his check).
  - **Matrix leg extension / leg curl combo** (10–160 lb, 10 lb steps, +5 lb add-on). **Matrix smith machine.** **Torque half rack** with barbell, J-hooks, safeties (pull-up bar likely, unconfirmed). A **Torque plate-loaded leg/glute machine** (type unsure).
  - **Not seen:** leg press, chest press, pec deck, standalone calf machine, assisted pull-up/dip, decline bench, bands. (Program's Leg Press / Seated Cable Rows / Cable Crossover / Triceps Pushdown / Face Pull: Leg Press has no machine → needs a swap; the cable ones fit the tower if the attachment exists.)
  - **Free weights:** TKO hex dumbbells 5–75 lb in 5 lb steps (60 lb not seen), small dumbbells 5–25 lb and 7/9/12 kg on storage benches, one 18 lb kettlebell, a slam ball, bumper and grip plates.
  - **Benches:** 3+ adjustable flat/incline benches, a utility bench. **Other:** plyo box 20/24/30 in, BOSU, stability balls, foam rollers, step risers; cardio (treadmills, stair climbers, ellipticals, spin bikes, air rowers, curved treadmill), Pilates reformers.
  - **Phone spots:** open floor beside the cable tower gives a 2–3 m side spot; the right-hand column backs onto a hallway (tight, people pass). Big windows on several walls: don't point the phone toward them (backlight).
- 2026-11-15: **Barcode scanner library (M7 task 20).** `zxing-wasm` ^3.1.6 (MIT; zxing-cpp underneath is Apache-2.0), reader-only build `zxing-wasm/reader`: EAN-13/EAN-8/UPC-A (asked for explicitly, `maxNumberOfSymbols: 1`, `tryHarder`), works in iOS Safari (no `BarcodeDetector` needed). Rejected `@zxing/library` 0.23 (Apache-2.0, pure JS, maintenance mode, ~11.9 MB unpacked, weaker 1D decoding). Loader `src/ui/fuel/barcodeDecoder.ts` → `loadBarcodeDecoder()` dynamically imports the lib and `zxing-wasm/reader/zxing_reader.wasm?url`, so nothing is in the main bundle; one shared instance, a failed load isn't cached. **Self-hosted wasm, no network:** the library's default `locateFile` points at fastly.jsdelivr.net; we pass our own `locateFile` that returns the Vite asset URL (`assets/zxing_reader-<hash>.wasm`, same origin), and overrides replace the default (checked in `share.js`); frames are decoded in memory, nothing is sent. Workbox `globPatterns` gains `assets/zxing_reader-*.wasm` (the `.js` chunks were already matched). **Size delta** (probe build with the loader reachable): +3 precache entries, +~962 KiB (21 637.54 → 22 599.91 KiB): wasm 946.86 kB (414.30 kB gzip) + `reader` JS chunk 37.72 kB (13.44 kB gzip) + a tiny URL stub; main `index` chunk unchanged. Until task 21/22 imports the loader, the real build doesn't emit it and Workbox warns that the zxing glob matches nothing (same as the USDA JSON glob).
- 2026-11-15: **M7 wave 1 review (tasks 4–16, 19, F1, F2).** Reviewer CHANGES REQUIRED → fixed → PASS. A weekly check of kind up/down with `deltaKcal: 0` means "no change possible" (target at maintenance, or surplus at 600 with no hand-set kcal); `checkHasChange()` gates Accept, the card shows "Your target stays the same" + Got it. `applyAcceptedCheck` applies exactly `deltaKcal`. One USDA converter (core `foodFromDbRow`); USDA household measures stay on the row, not `Food.portions`. Weigh-in UI takes core `TrendPoint[]`/`HistoryDay[]`. Ships with the polish batch (Wongsaton: "Ship with M7"). Open for task 17/F3: 4-tab bar on every screen, Food lookup for `usda:*` favorites/recents, pass candidates (incl. Thai dishes) to `entryFromSuggestion`, no double S/R/L factor on recents, `skipIds: EDIT_FROM_LABEL`, label save clears `estimate`, merge mode/barcode into setup save, CSP `connect-src` for Open Food Facts (task 21). Non-blocking: coach `skipFood` also hides quick-estimate favorites (custom + estimate) — narrow to `skipIds`; Fuel tab Dismiss needs a real handler.
- 2026-11-15: **Dexie version 5 (M7 task 10).** New tables only (`foods: 'id, name, barcode'`, `recipes: 'id'`, `foodEntries: 'id, date, time'`, `weighIns: 'date'` (one per date, latest wins), `favorites: 'id, createdAt'`, `weeklyChecks: 'weekStart'`); no upgrade function, every v1–v4 row is untouched (fake-indexeddb v4 → v5 test). Nutrition settings live under settings key `'nutrition'`, the one-time seed flag under `'nutritionSeeded'`.
- 2026-11-15: **M7 plan (planner).** Wongsaton: "Polish, then Fuel". M7 is built next, after the polish round. Plan under "Current milestone plan"; contract: SPEC M7.
  - **Order:** CLAUDE.md says to finish milestones in order. M6 is built, M4 is still provisional, and Checkpoints B3 / E / F1 are open. M7 doesn't touch the camera, so it proceeds on his explicit word, as M5 and M10 did.
  - **Food DB:**
    - `scripts/build-foods.mjs` reads USDA FoodData Central bulk downloads (public domain / CC0; no API key, no account) from gitignored `data-src/usda/`.
    - It writes `src/data/nutrition/usda-foods.json`, which is committed and must stay ≤ 2 MB gzip; the script enforces this.
    - The app imports it with `?url` and fetches it on the first search, which keeps `tsc` and the main bundle fast. The PWA precaches it, so search works offline.
  - **Thai dishes are computed, not typed in:**
    - a committed reference-recipe source (`thaiDishes.src.json`: FDC ids + grams, or an FNDDS code) builds `thaiDishes.json`, so every value is traceable to USDA;
    - no commercial-app values.
  - **Dexie version 4 → 5**, new tables only (foods, recipes, foodEntries, weighIns, favorites, weeklyChecks). Nutrition settings use the existing `settings` table (key `'nutrition'`).
  - **Privacy:**
    - nutrition data stays in IndexedDB and is never written to dev-log events or exports;
    - made-up numbers only in tests, fixtures and docs;
    - the seed "Protein shake" ships with placeholder values to edit from the label.
  - **Network:** the only off-device call in M7 is the optional Open Food Facts barcode lookup. It's off by default and sends the barcode number only. The CSP gains `https://world.openfoodfacts.org` only with the barcode track. iOS Safari lacks `BarcodeDetector`, so scanning needs an on-device library (M7-q5); typed digits always work. The barcode track is separate and can be cut.
  - **Copy:** coaching language only, with no diet, weight-loss, health or medical claims. All Fuel copy passes M10 `checkCopy`. Computed values carry an "estimate" tag.
  - **Nothing applies by itself:** weekly suggestions apply only on Accept, and coach food suggestions only on Log, with Undo.
  - **M10 F1–F3** (coach food suggestions) are folded into the M7 plan as its F tasks.
  - **M7b scope stays out:** no photo capture, classifier, `ml/`, `src/food-vision/` or Claude backup. Their types exist only as SPEC §4 placeholders.
  - **No 🧍 checkpoint** (SPEC M7 has none).
  - The M7-q defaults are provisional until he answers.

- 2026-11-15: **M10 phase A verified (task 19).** Every SPEC M10 phase A Accept item met: check 2186 + 29; intent eval 87/87 (100%), safety 31/31; build OK (main 142.53 kB gzip); full e2e 123 passed, 1 skipped; trainer.spec ×5 parallel 60/60 after fixing a flaky tap-target helper (it measured between Plan changes' two renders). Screenshots `docs/screenshots/m10-*.png`. Non-blocking: the Undo toast covers the tab bar for 10 s; older "3D demo"/"Camera" chips under 56px (pre-M10).

- 2026-11-15: **M10 fix round (main).** (1) "Go easy on <area>" swaps only for a candidate sharing a primary muscle outside the area; with today's catalog it removes primary-area moves and lightens secondary-area moves (SPEC updated). (2) REPLACE_UPCOMING and the new INSERT_UPCOMING work while paused; mid-workout Undo restores removed rows in place. (3) If a mid-workout change on Rest leaves no unstarted rows the session goes to Summary and Undo can't reopen it (actions refuse when nothing would be left, so this shouldn't occur). Evidence: check 2186 + 29; full e2e 123 passed, 1 skipped; re-review PASS.

- 2026-11-15: **M10 wiring decisions (main).** (1) "Train anyway" on a rest day writes a `{date}` train override for today (version bump, saved, no PlanChange) so the calendar and the coach treat today as training; review fix: on a day that is rest only because of a standing "Not today", Train anyway undoes that change instead. (2) Mid-workout "Lighter today" changes only exercises with 0 logged sets. (3) Trainer dev-log events are recorded only inside a workout (the dev log is per-workout, M4c); events from Today/preview/Summary are not logged. (4) Rest weekdays default to none (M10-q1 answered "No fixed rest days").
- 2026-11-15: **M10 tasks 16–17 evidence.** `npm run check` green (2152 + 29); `e2e/trainer.spec.ts` ×3 24/24; full e2e 119 passed, 1 skipped (opt-in HISTORY_SHOTS), 0 flaky. Screenshots `docs/screenshots/m10-*.png` (coach sheet, proposal, confirmation + Undo, Today adjusted, rest day, preview adjusted, Plan changes). Review (task 18): CHANGES REQUIRED, blocking = Sunday default rest day (fixed 0a2be23); non-blocking items in fix round.
- 2026-11-15: **M10-q1 answered: no fixed rest days (core-engineer).** `DEFAULT_REST_WEEKDAYS` / `seedPlan` → `restWeekdays: []`, so Up next with no history is the first program day on any weekday, Sunday included, and "Not today" (use rest day) slides the week and says "no rest day". Rest weekdays stay fully supported; tests and `e2e/trainer.spec.ts` that cover rest days set Sunday explicitly. No migration: Dexie v4 isn't shipped, so a dev-seeded `[0]` is simply kept (loadTrainerState never rewrites rest weekdays).
- 2026-11-15: **M10 Dexie version 3 → 4 (core-engineer, task 12).** New tables only: `trainer` (key `'current'`, row `{ key, state: TrainerState }`) and `planChanges` (`++id, createdAt`); `SessionRow.adjust` is unindexed, so existing rows are untouched (upgrade test v3 → v4). `loadTrainerState` re-seeds an unedited plan when program.json's hash changes (plan + rotation from the program; rest weekdays, overrides kept; version + 1, no change record) and keeps an edited one (M10-q11), with `defaultProgramChanged` for the "new default program" prompt.
- 2026-11-14: **M4f wave-1 retune from synthetic (core-engineer).** Two wave 1 rules miscounted their rendered clips (pose-engineer, staged in `fixtures-staging/m4f/`). Both stay `learning`; real sets at 🧍 Checkpoint F1 decide the final values. SPEC M4f wave 1 table updated.
  - **Watch at 🧍 Checkpoint F1 (reviewer):** the triceps `minVisibility: 0.4` lets MediaPipe guesses of a hidden wrist through; replay his real triceps sets at 0.4 and 0.5 before promoting, and re-check the narrow extended window (136–140 worked, 142 miscounts).
  - **Triceps extension: 150 / 80 → 138 / 95, visibility gate 0.5 → 0.4** (world angles, side view, best side; extended gate kept).
    - Clips are filmed ~40° round from the side toward the front, because square side-on the upper arm hides the mannequin's face and detection drops 25–65% of frames.
    - The bent end reads shallow (rendered 15° → 69–83° smoothed). Straight overhead arms read 150–160°. The rendered 112° partials turn at about 100–108°.
    - The near wrist sits behind the head at the bottom and reads visibility 0.41–0.49. At the 0.5 gate every bottom was hidden (92/425 and 51/421 frames), so a fast rep whose return was hidden failed the minimum leg time. That is why no threshold pair at 0.5 counted the clips with any margin (only 136–140 × 84–86, which depends on one frame of timing).
    - With the gate at 0.4 (0 frames dropped), the clips count exactly for extended 136–140 × contracted 90–106. 138 / 95 is the middle of that window. Higher extended values (≥ 142) miscount clip 02 (extra partials or reps), because the mannequin's partial wobbles up to ~150°.
    - Image-plane angles (as the seated press) were checked and **don't work** from this 3/4 camera: at most 1 rep per clip at every threshold pair tried (extended 130–150 × contracted 70–100, best or both sides), with frame-to-frame jumps of 50–100°.
    - Before → after: synthetic-01 (4/0) **3 reps 1 partial → 4/0**; synthetic-02 (3/2) **1 rep 3 partials → 3/2**.
  - **Concentration curl: 145 / 70 → 145 / 85.**
    - The 3/4 view reads the curled end at 61–72° smoothed. Clip 02's fast last rep bottomed at 72, so it was a partial. The partials turn at 115–120°.
    - The clips count exactly for contracted 74–100 at extended 143–147. The suggested lower extended value (~135) fails: a pose glitch at the top of each curl, then about 1 s of hidden frames, leaves too little visible lowering time, so the rep reads as rushed. 145 stays.
    - Before → after: synthetic-01 4/0 → 4/0; synthetic-02 (3/2) **2 reps 3 partials → 3/2**.
  - All 6 staged triceps / concentration clips are now in `fixtures/landmarks/`, with every other synthetic clip still counting exactly. The 3D demos still clear the new thresholds (`src/ui/demo3d/moves.test.ts`).
  - **Watch at Checkpoint F1 (pose-engineer's warning, no change now):** the bent-over row's `< 90` and the curls' bent ends read 12–35° shallow in world angles. Real reps may stop short of the contracted threshold and count as partials. Check those folders' real sets first.
- 2026-11-14: **M4f scope and the learning state (planner).** Wongsaton approved "Camera for more exercises" ("Yes, plan to do it") and said "I confirm everything you need right now". So the open points below use the defaults in Blockers M4f-q1…q9 and the work goes ahead. Contract: SPEC M4f.
  - **Groups as agreed:**
    - wave 1 (easy): hammer, concentration and incline curls, DB shoulder press, bent-over two-DB row, standing DB triceps extension;
    - wave 2 (doable): lunges, step-ups, stiff-legged deadlift, standing calf raises, reverse flyes, face pull, triceps pushdown, lat pulldown, seated cable rows;
    - manual: bench press, incline press, flyes, bench dips, cable crossover, leg press, leg extensions, lying leg curls, seated one-leg calf raise.
    - Wave 1 starts once the M4d batch merges; wave 2 after his wave 1 gym data (Checkpoint F1).
  - **Status is a required rule field, `status: 'learning' | 'tuned'`.**
    - The six existing rules are **grandfathered as `tuned`**, including the curl, row and squat, which have no real fixtures. They shipped through M4/M5 with their M5 flags, and marking them learning now would silently turn their `shrinkingRange` off. Their form rules keep the M5 guard. (M4f-q5 asks whether he wants them marked too.)
    - **A learning rule** counts as usual, speaks counts and the M4c partial hints, runs hands-free and gets a focus score. Its focus rules are limited to timing (`rushedLowering`, `stalled`) plus the presence/fps reports (`outOfFrame`, `lowFps`). `shrinkingRange` and every form rule are off.
    - The limit is enforced in core twice: a data test, and a run-time mask in `focusFlagsFor`. The UI never decides it.
  - **Promotion to tuned follows the M5 rule ("uncommitted data can only switch a rule off"):**
    - the folder needs committed `real-*` fixtures meeting the pre-registered criteria in SPEC M4f (≥ 2 sets, ≥ 16 reps, counted exactly against his corrected labels, retunes logged as Decisions with every synthetic fixture still passing);
    - a guard test fails on any non-grandfathered `tuned` folder without `real-*` files;
    - `shrinkingRange` then turns on only under the M5 "≤ 1 fire per real clip" criterion.
    - The SPEC M5 "Reliable from: all 6" wording now reads as "all tuned rules"; learning rules get the timing subset only.
  - **UI copy:**
    - "Learning" badge after "Camera" (data-driven);
    - "Learning" chip in the camera top band;
    - setup-card line "Still learning: fix the count on Rest.";
    - fix-row line "Camera still learning. Fix it if it's off."
    - None of it is spoken: it asks for no mid-set reaction, so it doesn't fall under "voice over screen".
    - Neutral colour role: not warn, not the action colour.
  - **Views and thresholds** are the SPEC M4f tables. They are starting values derived from the tuned neighbours (curl 150/70, row 145/90, press 143/80 in the image plane with the wrist-above-shoulder gate), with extra room at bent ends because world angles read bent ends shallow (M4 Decision). The triceps extension gets the press's extended gate, so lifting the dumbbell up from hanging arms isn't a rep. The DB shoulder press reuses the seated-press convention: shoulders start, the first press counts (Decision 2026-11-13, answer 2). No `otherView` on any new rule.
  - **Wave 2 needs three new triplets** (hip, ankle, a cross-body shoulder line for reverse flyes, because the incline bench hides the hips). It also needs a looser "mirrored triplets" test. The reverse fly demo measures a different angle than its rule and must be reconciled (task 22).
  - **Ordering note:** CLAUDE.md says to finish milestones in order. M4 is still provisional (Checkpoint B) and Checkpoints C/B3 are open. M4f proceeds on his explicit approval, like M5 did. Every new rule ships `learning`, so nothing unverified is presented as tuned.
- 2026-11-14: **M4d batch 1, Legs A + Push B, 9 demos** (review PASS; check 1488 tests; anatomy/howto e2e 7/7): stiff-legged deadlift, lunges, lying leg curls, standing calf raises, dumbbell flyes, dumbbell shoulder press, cable crossover, triceps pushdown, bench dips. New measured joints: `hip`, `ankle`, `armOpen`. New optional `hold` (1 s, matching the how-to tempo lines).
  - **Deviations (accepted):**
    - Lunges use a fixed split stance, right leg forward only, with no step or switch.
    - Deadlift "standing" reads 167°.
    - Flyes start open.
    - Shoulder press reuses the seated-press path with a 50° start and a back pad.
    - Calf raise opens on a 3/4 rear view.
    - Machines are simplified boxes.
    - Bench dips measure the load at the neck.
  - **Follow-ups:**
    - `poses.ts` is in the main chunk through `hasDemo`, and its inverse tables build eagerly. Move to an id-only module or build lazily.
    - Verifier: check that the flyes front view and the calf column don't hide the movement, and that the long tempo labels fit.
- 2026-11-14: **M10 direction: "AI personal trainer"** (Wongsaton's request: suggest food, postpone a session, adjust the plan when his arms hurt; free and local if possible; iPhone 17 Pro). He chose the free/local path proposed by the main session.
  - **Phase A (web):** deterministic trainer actions + a coach chat with quick-action chips and a rule-based intent matcher.
  - **Phase B (with M9):** Apple Foundation Models through a Capacitor Swift plugin with tool calling, each tool 1:1 with a phase A action.
  - **Phase C (optional, opt-in):** a Claude brain with his own on-device key.
  - **The brain only proposes.** Every change is a validated Proposal, applied on a tap and undoable.
  - **Milestone id:** M10, because M9 is the native shell (it was only named in the 2026-11-13 ducking Decision; the SPEC now has an outline) and M8 isn't used anywhere in the docs.
  - **Safety:** the copy rules live in SPEC M10. They extend the M5b banned words with diagnosis terms, use a fixed referral line ("If something doesn't feel right, check with a doctor or physio."), and a fixed red-flag line. No banned word appears in either line.
  - The defaults marked M10-q* are provisional until he answers.
- 2026-11-14: **M6 (Polish & install) built on branch `m6-polish`.** Review: 2 blocking items fixed (a TS tuple in history.spec; a real-flow e2e, history-flow.spec, that seeds IndexedDB and checks unfinished sessions are excluded). check 1422 unit + 24 script tests; M6 e2e 12/12.
  - **PWA** (vite-plugin-pwa, generateSW):
    - It precaches about 21 MB, including the 14.7 MB wasm and the 5.8 MB pose model, so the camera works in airplane mode even if it has never been opened.
    - Update strategy: registerType 'prompt' with no skipWaiting, so a new version takes over only on the next full launch and never mid-workout. On iOS, swipe the app away to update.
    - Original icons come from the in-app logo (`npm run icons`). Nothing is active in dev.
    - iOS note: the home-screen app has its own storage, separate from Safari, so history in Safari doesn't carry over.
  - **History:**
    - The Last 7 days scoreboard and list, plus a per-exercise view with best set, trend, volume or reps change and average focus.
    - Window: the current Mon–Sun week plus the 3 before it (22–28 days), matching stats.ts week maths.
    - Loading and error cards.
    - A third tab (Today / History / Settings).
  - **Follow-ups:**
    - Move the bodyweight reps-change into core (`ExerciseTrend.repsChange`).
    - Pin a DST time zone in the history tests.
    - Tapping the History tab from detail should return to the list.
    - Wongsaton should try the install on his real iPhone (Checkpoint: add to home screen, airplane mode).
- 2026-11-14: **Polish follow-ups on branch `polish-followups`** (from main eb16eed; review PASS; check 1377 unit + 24 script tests).
  - **Pause sheet:**
    - Escape resumes, and a focus trap keeps focus inside the sheet.
    - The armed End timer is cleared when the sheet leaves, via an observer that runs only while armed.
    - The screen behind (and the camera sheet) is `inert` while paused. Focus goes to Resume on open and back to Pause on resume.
    - New e2e: Skip while resting.
  - **Core:** dayInfo helpers moved to `src/core/dayInfo.ts`. New `doneDaysThisWeek`, which now bounds the week and keeps the latest start.
  - **Tabs:** an exhaustive `goTab` switch.
  - **Dev-log report:** per-set "Sets:" lines and a "Summary:" block (miscounts, auto start/stop without Undo, holds, cues, speech, fps). Ids and numbers only.
  - **Open, small:**
    - devlog "without Undo" also counts stops cancelled by a rep or a pause; the auto-start denominator includes non-hands-free sets;
    - add an e2e asserting `inert` while paused.
- 2026-11-14: **M4e cleanup round done** (review PASS). check 1358; full e2e 90/90 (adds layout-dock.spec and a camera header test).
  - **Camera:** exercise names wrap to at most 2 lines, and the video stays ≥ 600px.
  - **Rest:** while a coach Apply is up, the ring is 264px and the clock 120px, so Apply clears Start set by ≥ 16px.
  - **Dead old-screen CSS removed.** The transitional font tokens are kept as named steps; `--fs-count` is removed. Weights 800 → 700.
  - **Labels and sizes:**
    - notes Save is now the standard CTA;
    - +30 s and the list button have accessible names that contain their visible labels;
    - list status words are 20px.
  - **`--muscle-2` is now #2899c8** (3.14:1 on body).
  - **Screenshots:** all 57 `m4e-*` re-shot in all 3 accents.
  - **Open, for Wongsaton (A-q6):** `--warn` amber is close to the Yellow CTA (over-rest clock vs buttons) and to Volt gold.
  - **Open, small:** Exercise's first screen runs ~30px under the sticky Set done until you scroll. Fixing it would mean shrinking content; that's a design call.
- 2026-11-14: **M4e A22 verifier PASS** (56c5d1a).
  - **Checks:** `npm run check` 1358 tests + 19 scripts; full e2e 87/87; m4e-theme ×5 35/35.
  - **Lighthouse accessibility on Today: 100.**
  - **Build:** 4 self-hosted woff2 fonts and no external URLs in dist.
  - **Accents:** computed tokens match each accent; Volt success is gold.
  - **Screenshots:** 57 at 390×844 in `docs/screenshots/m4e-<screen>-<accent>.png`; scrollWidth 390 everywhere.
  - **Bundle:** main is 108.9 kB gzip, +28.4 kB since M4c, which includes M5/M5b/M5c.
  - **Cleanup round (non-blocking):**
    - the camera header truncates long exercise names ("Dumbbel…"), which breaks a gym rule;
    - the notes row starts under the sticky Set done;
    - Rest shows two filled CTAs when a coach Apply is up;
    - `--warn` sits too close to the Yellow CTA and to Volt gold (design call A-q6).
- 2026-11-14: **M4e A21: branch review PASS** (`git diff 06bfa4d..HEAD`, 10 commits, 81 files; nothing blocking).
  - **Confirmed:** CSP, fonts and privacy; tokens-only guard (allow-list down to `body3d/palette.ts`, so A7b is done); sizes; reduced motion; voice; pure core; nothing lost from the old screens.
  - **Cleanup after A22:**
    - remove the dead old-screen CSS (`.set-counter`, `.stepper-label`, `.footer-row`, `.rest-label`, `.nowrap`, `.top-bar.end`, `.list-btn`, `.rest-next`, base `.stepper` / `.rest-clock` / `.next-up`);
    - retire or rename the transitional font tokens, and drop the unused `--fs-count`;
    - font-weight 800 → 700 (only 700 is loaded);
    - notes-sheet Save → `.cta-btn`;
    - accessible names should contain the visible label (+30 s, the list button);
    - the list status words are 18px with no icon;
    - `--muscle-2` on body is 2.47:1.
  - **Question for Wongsaton:** A-q6, whether Volt gold is too close to the over-rest/hold amber.
- 2026-11-14: **M4e A20 done.** e2e/m4e-theme.spec.ts: 7 tests, 42/42 with repeat-each 6; with settings.spec, 30/30 ×3 after the fix.
  - **Covers:** the accent persisting before first paint; Volt gold vs green; +30 s moving "Ten seconds" back 30 s; Skip/End only in Pause; self-hosted fonts; Today tiles after seeded and finished sessions; no third-party requests.
  - **Race fixed:** the accent's localStorage copy is written only after the IndexedDB save lands. Before, reloading within milliseconds of a pick flipped back to the old accent.
  - **Full e2e:** 85/87. The 2 failures are the known load-sensitive real-timer camera specs (focus-cues:341, hands-free-live:90); both pass alone.
- 2026-11-14: **M4e A17–A19: Settings (Pro), accent picker, overlays done** (review PASS). check 1358 tests; full e2e 80/80.
  - **Accent picker:** Orange / Volt / Yellow, with the chosen one in white fill plus a check. The pick applies at once and is saved to IndexedDB.
  - **No colour flash at startup:** a localStorage copy (`gc-accent`) is applied by an inline script in index.html before first paint. IndexedDB stays the source of truth.
  - **Settings layout:** the Today tab leaves Settings ("‹ Back" is gone), and switches show On/Off words.
  - **Overlays:** all badges are neutral; How-to cue uses the lavender panel; the Fix toggle is neutral; Apply is the orange press.
  - **Guard:** now also catches named colours and literal font sizes in TS.
  - **Screenshots:** in the scratchpad; A22 re-shoots them into docs.
  - **Follow-up:** make `onTab` an exhaustive switch once History exists.
- 2026-11-14: **M4e A16 Camera (Pro) done.** Review: one blocking item, fixed. Undo and Continue set are now neutral surface-2 buttons, because white fill is reserved for selected/on states. Set done (and Start set in rest mode) are the only orange fills.
  - **Overlay:** the canvas skeleton takes its colours from tokens, read once per start, with a 2.5× dark halo.
  - **Panels and numbers:** solid surfaces; the rep count is 120px.
  - **Gauge:** neutral, target in --success. "Reached" shows by thickness plus the green fill, not only by colour.
  - **Allow-list:** cameraView.ts removed; only body3d/palette.ts is left.
  - **Tests:** all 8 camera specs pass; hands-free and camera-layout re-run 20/20 after the fix.
  - **Screenshots:** 12 harness shots in the scratchpad; A22 re-shoots them into docs.
  - **Mockup items not built:** the camera subtitle, the "On device" chip and the "Range" heading.
- 2026-11-14: **M4e A14 and A15: Summary (Energy) done.**
  - **Review:** one blocking item, fixed. app.ts caches the raw history (`prevLogs`, `history`) and recomputes vs-last % and new bests from the current logs on every render, so a Fix on Summary updates them.
  - **Tests:** new e2e/summary.spec.ts covers vs-last, a new best, a Fix that refreshes both, and a bodyweight-only day; 4/4 with repeat-each 2. Full e2e 74/75: the single failure was focus-cues:341, which passed when re-run alone (load-sensitive, seen before).
  - **Wording:** the coach "why" line reads "Reps: 8, 8, 7" instead of "Sets: …".
  - **Hero title is 44px**, a title rather than a number; every main number is ≥ 64px.
  - **Bodyweight days:** the card shows total reps.
  - **Known:** the vs-last % rounds a −12.5% change to −12 (Math.round).
- 2026-11-14: **M4e A12 and A13: Rest (Track) done** (review PASS). Full e2e 75/75; check passes with 1323 unit tests.
  - **Ticking:** the Rest screen keeps a `restView.update()` handle, so each tick changes only the clock text and the ring offset, with no re-render.
  - **Over rest:** "+0:12" plus the "Over rest" label, so it isn't shown by colour alone.
  - **+30 s** dispatches EXTEND_REST.
  - **Deviation from the README:** the Rest top bar keeps Camera for pose exercises. The M5c rest-camera flow needs it.
  - **Sheets:** `.overlay` is now z-index 20, so sheets sit above screen content and the camera sheet. Guarded by an anatomy e2e.
  - **3D fixes:** inline viewers clear transparently on the stage; pickView weights muscles by area, so pull days show the back.
  - **Narrow phones:** the timer scales below 390px.
  - **Still to come:** an e2e for +30 s in A20; Rest screenshots in A22.
- 2026-11-14: **M4e A10, A11 and A11b done: Exercise (Pro) and the Pause sheet** (review PASS). Full e2e 75/75; check 1308.
  - **Skip and End live only in the Pause sheet.** Skip dispatches RESUME then SKIP_EXERCISE; End needs two taps; Resume gets focus when the sheet opens.
  - **Unchanged by choice:** skipping the last unfinished exercise goes straight to Summary in one tap, the same as the old footer Skip.
  - **Follow-ups:**
    - make the page behind the sheet inert and resume on Escape;
    - clear the armed End timer when the sheet closes;
    - add an e2e for Skip while resting;
    - the 3D canvas paints its own background on the Exercise stage (anatomy-3d: transparent clear or stage gradient);
    - the verifier re-shoots Exercise and Pause in A22.
- 2026-11-14: **M4e A8 and A9 Today done.** Review: one blocking issue fixed — smoke now asserts the hero reads "Push A" on a fresh database and Start is enabled. Full e2e was 74/75 before that fix (the smoke test); smoke and session pass after it.
  - **The hero Start opens the preview** rather than starting directly, so last time's weights load for the defaults. Two taps, deliberately.
  - **Today loads up-next first, then the tiles separately,** so a failed history query never leaves Start disabled.
  - **The streak window is 26 weeks** (`STATS_WEEKS`). The streak can't show more than about 26, and a last session older than that shows "None yet". Widen it if he ever gets near it.
  - **Silent hint:** it stays on the preview, above Start, and isn't on the Today hero.
  - **Screenshots:** A8 harness at 390×844 in Orange, Volt and Yellow, in the scratchpad. The verifier re-shoots them in A22.
  - **Follow-ups:**
    - move dayInfo's pure helpers (estimateMinutes, dayMuscles, setCount) into src/core;
    - give the loading `…` h1 an sr-only label;
    - the Pull A mini figure only lights the arms from the front view (anatomy-3d: check `BACK_FIRST`).

- 2026-11-14: **M4e A2 and A7 done** (review: 2 colour-role fixes applied: done status is green, "Keep going." is lavender; the how-to phase label is plain text).
  - **Checks:** `npm run check` 1282 tests; full e2e 75/75 in A2's run.
  - **Tokens:** all colours and font sizes live in `:root`, moods and accents. Guard test: tokens.test.ts, which reads the CSS from disk because Vitest blanks CSS imports. Allow-list: `body3d/palette.ts` (fallback) and `cameraView.ts` (until A16).
  - **Sizes snapped 2–4px.** Short labels are 18px (`--fs-label`).
  - **`--warn` amber kept** for overtime, skipped, hold and the silent hint. With Volt on, success gold is close to it (question A-q6).
  - **Follow-ups for the screen tasks:**
    - `.small` and `.day-meta` reading text are 18px → `--fs-body` (A10);
    - `.rep-num` base colour should be `--text` when there's no target;
    - pressable outline buttons (`.coach-apply`, `.lsc-fix`) → filled;
    - howto badges should use a neutral surface;
    - tighten the guard (named colours, TS font-size in demo3d/player.ts);
    - weight 800 is used but only 700 is loaded.

- 2026-11-14: **M4e A3–A6 done** (review PASS). `npm run check` passes: 1237 unit tests, 19 script tests.
  - **stats.ts** passes under 8 time zones, across the EU and US DST switches.
  - **New `SetLog.restTargetSec`.** It holds the rest target in force before that set, plan rest plus any +30 s. The session overrun and the coach advice both use it, so a +30 s rest used in full doesn't count as a rest overrun (A-q3). Old rows fall back to the plan.
  - **"New best" (as built):** today's top set per exercise (heaviest, then most reps) compared with the history's top set. Heavier, or more reps at the same weight, counts as a best. More reps at a lower weight does not.
    - A rep best at a lighter weight he has used before isn't reported, e.g. 20×10 when history has 22.5×3 and 20×8.
    - Question for Wongsaton in Blockers (A-q5); defaults stay as built.
  - **Non-blocking follow-ups:**
    - pin a DST time zone in the stats tests for UTC CI;
    - check real-browser SVG namespace for icons in the A8 screenshots;
    - escape `opts.class` in iconMarkup;
    - UI fallback when `volumeVsLast` is null (bodyweight days).

- 2026-11-14: **M5c break hold B5–B7 done** (review PASS).
  - **e2e/hands-free-break.spec.ts:** 7 tests, 21/21 with `--repeat-each=3`. It runs in the `mobile-clips` project (workers: 1) with focus-cues. Full `npm run e2e`: 75/75. `npm run check` green (1164 unit, 19 script).
  - **Screenshots** taken by the spec: m5c-hold, m5c-hold-last-set. The verifier re-shoots them into docs/screenshots.
  - **The B5/B6 hand run on the fixture landmarker was done as e2e,** not by hand: Continue, Start next set, Save set, Set done, Close and idle all save backdated.
  - **Posture breaks don't happen in practice.** The posture gate re-locks after 3 s (`LEAN_RELOCK_MS`), which is shorter than `breakGateSec` 5 s, so only body-line breaks (the front push-up sit-down, his real case) and walk-aways hold. A long bend falls back to plain rest (still stop + Undo). SPEC is annotated. Retune at Checkpoint B3 if bends should hold too; that would need a longer re-lock while in a set, which changes M2 counting and needs its own tests.
  - **Open, non-blocking:**
    - hide the footer Set done while held (M4e);
    - the 3-min idle e2e lengthens every run;
    - the visibility-gap test should also assert nothing is saved;
    - pause-while-held is untested;
    - check that held-period rep events don't skew the focus baseline after Continue.

- 2026-11-14: **M5 deployed:** 4bda987 is live. CI passed: test (e2e 63 passed), build and deploy, all success. Next human step: 🧍 Checkpoint C, a full camera session at the gym, together with Checkpoint B3 (hands-free).

- 2026-11-14: **M5c break hold: B1–B4 and B8 done** (review PASS).
  - **B3, synthetic run:** the head-on sit reads `untracked = bodyLine` with the person present. The hold fires 5.0–5.6 s into the sit, with no still stop first. With Continue tapped, the set is one commit of 11 reps. A 5.7 s pause in the plank does nothing (a 6.3 s control does stop).
  - **Not confirmed on the real set:** that waits for B-q5 / Checkpoint B3.
  - **Walk-away now holds instead of stopping.** e2e `hands-free.spec.ts` ("away stop") and `focus-cues.spec.ts` (set 3 walk-away) expect the old stop and stay red on this branch until B5 rewrites them as hold, prompt, then Continue or Next.
  - **`src/core/testkit/` is test-only,** enforced by ESLint.

- 2026-11-14: **M5 tasks 11, 13, 14 and 15 done** (review PASS, no blocking items).
  - e2e/focus-cues.spec.ts: 5 tests covering the plan's 10 cases. It runs in its own `mobile-clips` Playwright project with workers: 1, because one in three local repeat runs failed under parallel load.
  - Review hardening:
    - `onFocus` is only sent once the set has ≥ 1 counted rep, so a lone low-fps cue before rep 1 can't score a set the user then types in by hand;
    - the camera tick stops right after `feedFocus` if the sheet was closed.

- 2026-11-14 — **Planner defaults for the two approved follow-ups** (plans above; SPEC M4e "Picked" and M5c "Breaks inside a set" updated). Each is data or easy to change; open points are under Blockers.
  - **Break definition:** posture/body-line gate for 5 s while present, or away for 3 s, with ≥ 2 reps. A break holds the set instead of the M5c `away` stop. Gated frames don't feed the still/stalled timers. Visibility gaps aren't breaks.
  - **Hold behaviour:**
    - reps during a hold aren't counted (a spoken reminder instead);
    - "Start next set" saves the held set backdated to its last rep, then starts the next one now;
    - on the exercise's last set the button reads "Save set";
    - Close, Set done and idle limits save the held set.
  - **Acceptance replay:** the real push-up set isn't committed, so the replay is a scripted push-up front-variant timeline through the real counter. A local run on the real set, if available, is reported as a Decision.
  - **M4e:**
    - screens become ui-engineer modules under `src/ui/screens/`, which main wires into app.ts;
    - Summary's "Next time" reuses the M5b coach line (the step-1 `nextTimeHint` is dropped);
    - the tab bar is Today / Settings until History exists;
    - "+30 s" extends only the current rest, and overrun is measured against the extended target;
    - no "Skip rest" button;
    - the day preview uses the Energy mood.
- 2026-11-13 (night): **Wongsaton's answers before sleeping.**
  - **M4e: the mix is approved** (docs/design/m4e-mix): Energy for Today and Summary; Pro for Exercise, Camera and Settings; Track for Rest. One orange action colour everywhere. Next: step 2 (tokens and themes), then step 3 (screens, Today first).
  - **Accent themes:** keep Orange, Volt and Yellow. Because Volt sits close to success green, success switches to gold (the Pro direction's `#FFC94D`) while Volt is active.
  - **Rest screen:** add "+30 s". Move Skip and End into the Pause sheet so they can't be tapped by accident.
  - **Push-up / hands-free break = "tap to continue"** (option b).
    - A sit-down or walk-away inside a set doesn't end the set.
    - After such a break, hands-free stops starting a new set from reps on its own. A tap is needed (Continue set, or Start next set).
    - Plain rest in place, without a break, keeps the M5c auto start.
    - This needs a small M5c follow-up plan: what counts as a "break" (posture or body-line gate failing, or the person away) and for how long.

- 2026-11-13: **Update to the M5 task 7 replay after the flaw re-render.** This replaces the related numbers below.
  - **raise-too-high:** reps 5–8 now read 131.8–132.5° and fire at reps 6 and 8 at the live 120° threshold. That closes the "no positive replay at 120°" gap.
  - **squat short-range:** reads 0.77–0.78 of baseline, so it's no longer thin against 0.85. The trade-off: reps 5–8 bottom out about 2° under the 100° count line, so a future re-render could tip one into a partial.
  - **hip-sag:** reads 155.7 / 162.3 / 157.1 / 154.2°, so `hipSag` fires at rep 8 only.
  - **curl elbow-swing:** unchanged; rep 7 stays at 24.4°. A bigger drift turns reps into partials.
  - The flags and the enable decision are unchanged.
  - `createHold` and `MID_REP` are exported so the replay test's pre-set sync check reuses the tracker's own hold logic.

- 2026-11-13: **M5 task 7 replay: lateral raise `armsOutOfSync` and `raiseTooHigh` are ON** (`src/core/focus.replay.test.ts`; counter + focus tracker frame by frame, autoState `set`, hands-free defaults, 30 fps; real clips with every lateral-raise rule forced on).
  - **Threshold change:** `FOCUS_DEFAULTS.raiseTooHighDeg` 100 → **120** (Wongsaton's answer (1)). Tested at the edges: 121 fires, 120 and 119 don't. The cue text stays "Stop at shoulder height." Accuracy before/after on his 80 real reps: at 100°, 3 of 4 clips would fire (peaks 91.5–109.2°); at 120°, 0 fires, margin 10.8°.
  - **Real clips (4 × 20 reps, all counted 20/20):**

    | Clip | Fires (every rule on) | Lowest eccentric ratio | Lowest range ratio | Peak `maxAngle` | Largest held \|L − R\| |
    |---|---|---|---|---|---|
    | s1-0 | 0 | 0.77 | 1.00 | 101.0–107.3° | 7.3° |
    | s1-1 | 0 | 1.11 | 1.02 | 94.0–101.8° | 5.9° |
    | s1-2 | 0 | 1.03 | 1.02 | 96.7–109.2° | 5.5° |
    | s1-3 | 0 | 0.82 | 0.90 | 91.5–102.1° | 10.4° |

    Ratios are against the set's baseline (the mean of reps 1–2). The lines are: rushed < 0.5, range < 0.85, \|L − R\| > 20° held 0.5 s, peak > 120°.
  - **Per rule × exercise:**

    | Rule | Exercise | Fires | Margin | Flag | Why |
    |---|---|---|---|---|---|
    | Arms out of sync | Lateral raise | real 0/80; out-of-sync clip fires at reps 6 and 8, never on 1–4 | real ≤ 10.4° vs 20° (pre-registered ≤ 15° ✓); the s1-0 one-arm swing reads **39.4°** held 0.5 s (> 20° ✓); clean flaw reps 4.7–5.8°, flawed 23.9–26.1° | **on** | all 3 pre-registered criteria pass |
    | Raise too high | Lateral raise | real 0/80; raise-too-high clip **0** at 120° (fires at reps 6 and 8 with a 100° override) | real peaks ≤ 109.2° vs 120° | **on** | Wongsaton's criterion (0 real fires) passes. The pre-registered "every peak ≤ 95°" fails (109.2°). That line was a 5° margin under the old 100° threshold, and his answer (1) replaced it |
    | Rushed lowering | Lateral raise | real 0 per clip | lowest ratio 0.77 vs 0.5 | on (unchanged) | ≤ 1 fire per clip ✓ |
    | Shrinking range | Lateral raise | real 0 per clip | lowest ratio 0.90 vs 0.85 | on (unchanged) | ≤ 1 fire per clip ✓. Thin margin (s1-3 reps 15–16, fatigue) |
    | Rushed lowering | Curl (flaw clip) | reps 6, 8; reps 1–4 never | flawed 0.33–0.37, clean ≥ 0.98 | on (unchanged) | positive fixture works |
    | Shrinking range | Goblet squat (flaw clip) | reps 6, 8; reps 1–4 never | flawed 0.82–0.83 vs 0.85: **thin** | on (unchanged) | positive fixture works; the synthetic dip is only 2–3% past the line |
    | Elbow drift | Curl (flaw clip) | rep 6 only; reps 1–4 never | flawed 24.4–36.0° vs 25°: rep 7 misses by 0.6° and breaks the streak; clean ≤ 1.1° | off (unchanged) | no real curl fixtures |
    | Body swing | Curl (flaw clip) | reps 6, 8; reps 1–4 never | flawed 23.2–26.7° vs 15°; clean ≤ 10.7° | off (unchanged) | no real curl/row fixtures |
    | Hips sag | Push-up side (flaw clip) | rep 6 only; reps 1–4 never | rendered 135° reads 152.6–158.1° on reps 5–7 and 163.9° on rep 8 (vs < 160°); clean ≥ 166.7° | off (unchanged) | no real side push-up fixtures |
  - **Clean clips:** all 12 synthetic-01/02 clips fire nothing with every rule forced on. With every rule on, the flaw clips also fire only on reps ≥ 5. Cross-talk: the elbow-swing clip also fires `bodySwing`@7 and `shrinkingRange`@8, because the swing shortens the measured curl range to 0.71–0.85.
  - **The lateral-raise flaw is two clips:** `synthetic-03-arms-out-of-sync` (left arm at ~0.65 of the range, trailing mid-rep; right arm to 110°) and `synthetic-03-raise-too-high` (both arms 90° → 116° rendered). Task 9's plan had one clip.
  - **Gap (pose-engineer):** the raise-too-high clip was rendered for the old 100° line. 116° rendered reads only 108.2–109.0°, so at 120° it has no positive fixture. The replay test pins this (0 fires at 120°, reps 6 and 8 at a 100° override). **Re-render reps 5–8 to ~135–140° rendered (MediaPipe reads ~8° low)** and tell core-engineer, who will flip `OWN_RULE` in the replay test to expect reps 6 and 8. The enable decision doesn't depend on it, because the rule is a plain `maxAngle > 120` compare that is tested at its edges.

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
  - **raiseTooHigh:** rep peaks are 91–109°, so it would fire on 3 of 4 clips. It stays off, and the press-height question goes to Wongsaton. *(Superseded by the M5 task 7 replay: the threshold is now 120° and the rule is on.)*
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

### M7 (2026-11-15)
- Verified on `m7-fuel` at 6e3bc2d **plus the uncommitted working tree** (scanner tasks 21–23 + fix round: barcodeScan.ts/css, logSheet, fuelController, fuel screen, tabBar, app.ts, index.html CSP, e2e/fuel.spec.ts, e2e/barcode.spec.ts). Load average 4.9–6.4 at the start (other sessions idle-ish), 3.3 at the end. Verdict: **PASS** (non-blocking notes below).
- `npm run check`: typecheck (both projects) + lint clean, Vitest **93 files / 2,582 tests passed**, node script tests **56/56**. Nutrition + units alone: 11 files / 215 tests (targets incl. overrides, clamps, fat floor, Quick→Full→Quick round trip; adjust incl. 3 vs 4 weigh-ins, Sunday 23:59 / Monday 00:00, DST week, never below maintenance; portions 0.5/1/1.5/2, S/R/L, missing macro stays missing, recipe edited after logging, lb↔kg). `foods.test.ts` checks every one of the **47 Thai dishes** (source `thai-estimate`, `nameTh`, kcal + protein, 3 portions, `usda:` note, Atwater within 15%, rebuilt-from-recipe match) and the seed Protein shake.
- `npm run build`: main `index` **587.39 kB / 177.50 kB gzip** vs origin/main (119acd5, same build) **459.88 / 142.53 kB** → **+127.5 kB raw / +35.0 kB gzip**. Lazy: `usda-foods-*.json` 2,650 kB / **356.6 kB gzip** (gzip -6: 360,514 B, budget 2 MB), `zxing_reader-*.wasm` 946.9 / 414.3 kB gzip, `reader` 13.4 kB gzip, `zxing_reader` js 0.08 kB gzip; landmarker, three, scene, viewer, skeleton3d unchanged. Precache **26 entries (25,311 KiB)**, was 22; `dist/sw.js` lists `assets/usda-foods-CEIZg-2w.json`, `assets/zxing_reader-BCjuyud6.wasm` and `assets/zxing_reader-DGddFt39.js`. CSP `connect-src 'self' blob: data: https://world.openfoodfacts.org`.
- `E2E_PORT=5311 npx playwright test` (full suite, 7 workers): **140 passed, 1 skipped** (`history.spec.ts:336` HISTORY_SHOTS, opt-in), 0 failed, 0 flaky, 11.9 min. All six `fuel.spec.ts` and five `barcode.spec.ts` cases passed, including the prod-preview offline food search and `pwa.spec.ts` offline install. The camera/live specs that failed or flaked in earlier loaded runs all passed first time: `hands-free-live.spec.ts:90` (17.2 s), `camera-person.spec.ts:3` and `:37`, `hands-free.spec.ts:604`, `focus-cues.spec.ts:444`. So no rerun and no origin/main comparison was needed (a clean origin/main snapshot was prepared and used only for the bundle-size baseline). CI still skips the live rep count on GPU-less runners.
- Flakiness: `npx playwright test e2e/fuel.spec.ts e2e/barcode.spec.ts --project=mobile --repeat-each=5`: **55/55 passed**, 0 flaky (19.3 s).
- Click-through (`SHOT_PORT=5312 node scripts/screenshots.mjs m7`; clock mocked to Wed 11 Nov 12:00, Open Food Facts routed to a made-up product / a 404, speech spy, BarcodeDetector removed so the zxing reader runs on the fake camera). Made-up values only:
  - setup (male, Active, 70.0 kg) → rings 2,807 kcal / 126 g to go, both "estimate";
  - Favorites: seed Protein shake asks for its label first → 130 / 25 → "130 kcal · 25 g protein" → Log;
  - recipe "Chicken rice bowl" (chicken breast + rice from the USDA list, pot makes 2) → "133 kcal · 21 g protein" per serving → Log;
  - Thai: pad kra pao (ข้าวผัดกะเพราหมูสับไข่ดาว) Large → "1,170 kcal · 57 g protein" → Log;
  - Quick estimate "Noodle shop near work" 650 / 30 → Log;
  - rings: 2,083 of 2,807 (724 to go), protein 134 of 126 ("+8 g protein over target"), 4 entries under Lunch;
  - Settings → Full: 4 rings (carbs 95 of 400, fat 67 of 78), still 4 entries, kcal/protein unchanged, quick entry still "650 kcal · 30 g protein";
  - Today → Coach → "What should I eat?" → 3 rows, each "Fits your 724 kcal left" (row 0 "Khao pad with chicken … 722 kcal · 43 g protein") → Log → "Logged" toast → Fuel shows 5 entries;
  - Settings barcode: **off by default**, 0 Open Food Facts requests while off → explainer ("Looks up the barcode number online … Nothing else is sent …") → Turn on → Search → Scan a barcode (camera `on`, zxing) → typed 4006381333931 → detail "Made-up oat drink (Test brand)", "Saved … to My foods"; typed 5901234123457 → 404 → "Open Food Facts doesn't have 5901234123457 yet" → Add it to My foods → editor with the barcode → Made-up crackers 420 / 9 per 100 g → saved → My foods lists shake, oat drink, crackers. Exactly 2 requests left the device, both `GET https://world.openfoodfacts.org/api/v2/product/<code>.json` (routed);
  - second context, clock Mon 2 → Mon 16 Nov: setup 70.0, weigh-ins 70.0 ×3 then 70.1 ×4 → weekly card `up`, "Add 150 kcal a day?" ("up 0.14% … slower than your plan", "New target: 2,959 kcal a day (was 2,809)", estimate) → Accept → card gone → Fuel ring 2,959 kcal.
  - Nothing spoken in either flow.
- Screenshots 390×844 (DPR 2), every one **scrollWidth 390**, **0 page errors**. Console: one `Failed to load resource … 404` from the intentional not-found barcode lookup (the e2e filters the same line); nothing else. Every remaining/target number on the rings 64px; **no visible button under 56px** in any shot; smallest text 18px, only short labels (tab labels, "estimate" tags, "Delete" under its icon, "70 kg" in the Weigh-in button, "Weekly check" eyebrow), as allowed by the M4e `--fs-label` decision; body text ≥ 20px.
  - `docs/screenshots/m7-verify-fuel-empty.png`, `m7-verify-setup.png`, `m7-verify-fuel-start.png`, `m7-verify-log-favorites.png`, `m7-verify-shake-label.png`, `m7-verify-recipe-editor.png`, `m7-verify-log-thai.png`, `m7-verify-thai-large.png`, `m7-verify-quick-estimate.png`, `m7-verify-fuel-quick-rings.png`, `m7-verify-fuel-entries.png`, `m7-verify-settings-nutrition-full.png`, `m7-verify-fuel-full-rings.png`, `m7-verify-coach-food.png`, `m7-verify-coach-food-logged.png`, `m7-verify-barcode-explainer.png`, `m7-verify-scan-sheet.png`, `m7-verify-scan-found.png`, `m7-verify-scan-missing.png`, `m7-verify-scan-add-myfood.png`, `m7-verify-myfoods-after-add.png`, `m7-verify-weigh-in-top.png`, `m7-verify-weekly-card.png`, `m7-verify-weigh-in-history.png`, `m7-verify-fuel-after-accept.png`.
- Non-blocking observations:
  1. **The 10 s Undo toast covers a sheet's main button until you scroll.** Measured (`test-results/m7-toast.mjs`): with a "Logged …" toast up (618–762 px), the scan sheet's Look up (618–690) is fully under it, and a tap there hits the toast. After scrolling the sheet (the extra 248 px padding from fuel.css), Look up sits at 524–596, clear, and works. The barcode detail's Log (622–694) is the same: under the toast until scrolled (barcode.spec checks only the scrolled case). The toasts also cover the Meal chips in the Thai detail and the editor's Protein field (`m7-verify-thai-large.png`, `m7-verify-scan-add-myfood.png`). This matches the design comment in fuel.css, but a sweaty user may not think to scroll. Owner: ui-engineer (e.g. lift the sheet's sticky action above the toast, or shorten the toast while a sheet is open).
  2. The Undo toast from a log follows across tabs and into the coach and scan sheets for its full 10 s (seen on Settings, Coach and Scan). This is the M10 behaviour.
  3. Main chunk +35 kB gzip (Fuel screens + nutrition core). The food list and the scanner are lazy, as planned.
  4. The setup screenshot shows the sticky Save targets bar just below "Stays on this phone." with no gap. It isn't clipped.

### M10e + backup (2026-11-15)
- Verified on `m10-equipment` at **2acf4e2** (clean tree apart from untracked `fixtures-staging/`; app code untouched). Reviewer PASS at ff3f318. **GitHub CI on 2acf4e2: run 43743340017 passed** (check + full e2e + build, Linux); the full e2e wasn't repeated locally.
- `npm run check`: typecheck + lint clean, Vitest **99 files / 2,707 tests passed**, node script tests **56/56**. M10e + B1 suites alone (intents, equipment, swapCandidates, gym, backup, catalog): 6 files / 121 passed. Intent eval: **100%** (95/95 rule-supported items, no miss printed; 6 gym/"no leg press" items incl. Thai), safety flags 100%. Covered by name: Leg Press → Smith squat, barbell squat, split squat in order; no smith → barbell first; never rope / never kit the gym lacks, with or without an avoid area; every program exercise has a candidate; `missingKit` on Legs B / after a swap / kept / rest day / overrides; gymSwap Apply → Undo restores Leg Press exactly; free text reaches the same proposal; every missing-kit reply passes `checkCopy`; profile default / round trip / unknown id rejected / keep / save clears kept / still Dexie v5.
- `npm run build`: OK. Main `index` **614.15 kB / 184.32 kB gzip** vs origin/main (c818def, `vite build` of a `git archive` copy) **587.39 / 177.49 kB** → **+26.8 kB raw / +6.8 kB gzip**. CSS 87.71 kB. Lazy unchanged: three.module 535.59, landmarker 154.39, scene 38.65, reader 37.72, viewer 5.73, skeleton3d 2.36 kB. **Precache still has `assets/usda-foods-CEIZg-2w.json` (2.65 MB) and `assets/zxing_reader-BCjuyud6.wasm` (947 kB)**, same hashes as main. 26 entries here vs 24 on the archive copy: the extra two are `mediapipe/wasm/*` from the gitignored `public/mediapipe/` that exists only in a checkout with `npm install`, not a branch change.
- Targeted e2e, `E2E_PORT=5371 npx playwright test e2e/{equipment,backup,fuel,barcode,trainer,history,history-flow}.spec.ts`: **36 passed, 1 skipped** (`history.spec.ts` HISTORY_SHOTS, opt-in), 0 failed, 11.0 s. Flakiness: `equipment.spec.ts` + `backup.spec.ts` `--repeat-each=5`: **35/35 passed**.
- Click-through (`SHOT_PORT=5372 node scripts/screenshots.mjs m10e`; clock Fri 13 Nov 18:00, Push A…Pull B seeded so Legs B is next; Open Food Facts routed):
  - Today: "Your gym has no kit for Leg Press." See a swap / Keep it; preview still lists Leg Press before any tap (1 row);
  - See a swap → proposal "Swap Leg Press from now on · Legs B · Leg Press → Legs B · Smith Machine Squat", why "No leg press here. This works the same main muscles."; chips Try Barbell Squat, Try Split Squat with Dumbbells, Just today, Keep Leg Press;
  - Apply → Undo toast, prompt gone; preview Smith Machine Squat with **Info** badge, Leg Press 0 rows; **reload keeps it** (Smith 1 row + Info, Leg Press 0, no prompt);
  - Settings → Plan changes → Undo → Today prompt back, preview lists Leg Press again;
  - **Keep it** → prompt gone, still gone **after reload**, preview keeps Leg Press and shows no prompt;
  - My gym: Leg press unticked / Smith ticked by default → tick Leg press → reload → no prompt, still ticked → untick → reload → prompt back (Keep reset by the profile change);
  - Backup: Back up downloads `gym-clean-2026-11-13.gymclean-backup.json`; switch to lb; Restore → "Replace all data on this phone? … 5 workouts." → first tap "Tap again to replace" → second tap → "Restored from the backup." + Undo toast, unit back to kg → Undo → "Restore undone.", unit lb again;
  - M7: Fuel setup → Coach "what should I eat" → 3 rows (555 kcal · 54 g, 708 · 50 g, 775 · 45 g), **no decimal grams**.
  - Off-device requests: **0** (offsite list empty, 0 Open Food Facts calls).
- Screenshots 390×844 (DPR 2), every one **scrollWidth 390**, **0 console errors/warnings, 0 page errors**, **no visible button under 56px**: `docs/screenshots/m10e-verify-{prompt-today,prompt-preview,proposal,applied-today,applied-preview,applied-preview-reloaded,plan-changes,plan-changes-undone,kept-today,settings,my-gym,my-gym-ticked,backup,restore-confirm,restore-tap-again,restored,restore-undone,coach-food}.png`.
- Non-blocking observations:
  1. 18px text on screen: the hero muscle chips (Quadriceps / Hamstrings / Calves), the streak weekday letters and the tab-bar labels. All predate this branch: its CSS only adds rules for the new gym prompt, My gym and backup panel, which use `--fs-body` / `--fs-cue`, and the measure found no new text under 20px.
  2. The proposal screenshot opens with the coach's reply line scrolled half out under the sheet header ("…Leg Press. Here's a swap." visible). The card itself is whole.
  3. After Restore → Undo, "Restore undone." shows both inline and in the toast at the same time.
  4. Main chunk +6.8 kB gzip (equipment/kit data, My gym, backup panel).

### M7b local part (2026-11-16)
- Verified on `m7b-food-vision` at **d84547b** (tree clean apart from untracked `fixtures-staging/`; app code untouched). Reviewer PASS on d84547b. Scope: SPEC M7b steps 1–3, 5 + Training; task 17 dropped (verdict B), task 19 opt-in (no `e2e/food-vision-smoke.spec.ts`; the real-model check below stands in for it).
- `npm run check`: typecheck + lint clean, Vitest **110 files / 2,945 tests passed**, node script tests **56/56**. Covers decide (0.6 vs 0.59, dedupe, `claudeAvailable: false` never offers Claude), `entryFromPhoto`, classMap (30 classes, every dish in the Thai table: 54 dishes incl. the 7 new ones), photoStore (off → 0 writes), Dexie v5 → v6, zip, classifier (224 px pre-resize, subset label check), backup hardening (per-table row checks, settings-only secret stripping, `tokenCount` kept), "no more squats" not a missing-kit swap.
- `ml/.venv/bin/python -m pytest ml/tests --runslow`: **54 passed** (39.9 s).
- `npm run build`: OK. Main `index` **652.35 kB / 195.81 kB gzip** vs origin/main 000f26f (separate worktree, wasm copied) **614.15 / 184.32 kB** → **+38.2 kB raw / +11.5 kB gzip** (photo sheet, Food photos settings, zip, photo store, class map, 7 dishes, hardening; the classifier itself is lazy). Lazy: `classifier` 3.93 kB, tasks-vision now a shared `vision_bundle` 154.07 kB (main had it inside `landmarker` 154.39 kB; `landmarker` is now 0.84 kB). **No `__gymCleanFake` in dist/**. URL hosts in dist/ identical to main; CSP `connect-src` unchanged (`'self' blob: data: https://world.openfoodfacts.org`); no `api.anthropic.com`. Precache 28 entries (25,383 KiB) vs 26 (25,339 KiB): only `classifier-*.js` and `vision_bundle-*.js` added.
- Targeted e2e (port 5391 was held by another worktree's dev server, so `E2E_PORT=5397`): `food-photo, fuel, barcode, backup, equipment, settings, trainer` **38/38 passed** (21.9 s). `food-photo.spec.ts --repeat-each=5`: **25/25**.
- **Linux CI check** (`mcr.microsoft.com/playwright:v1.65.0-noble`, `CI=1 --retries=1`, full `npm run e2e`): **151 passed, 1 flaky, 1 skipped** (22.4 min), exit 0. Flaky: `camera-person.spec.ts` (`drawn` ≤ 50 on the GPU-less first try, passed on retry); no camera/pose file changed vs origin/main. Skipped: `history.spec.ts` HISTORY_SHOTS (opt-in). food-photo 5/5 green on Linux. GitHub CI on origin/main (43796074793) green; d84547b not pushed yet.
- **Real model** (dev server, headless Chromium 390×844, no fake seam): Settings → Food photos → import `ml/models/food-classifier-mac-1.tflite` → validated and stored in 2.0 s, card "6.5 MB · 30 dishes", 30 labels in IndexedDB. Fuel → Log food → Log from a photo with a held-out THFOOD-50 **test-split** pad thai image (local file, nothing uploaded) → **confident**, Pad thai with shrimp 70% preselected (then khao moo daeng 14%, suki 6%) → Large → Log → entry `Pad thai with shrimp (Large)`, 776 kcal / 36.3 g (= 554 × 1.4, 25.9 × 1.4), `source: 'photo-local'`, `estimate: true`, `photoConfidence: 0.7`, 0 saved photos (save off). Solid blue 1024×768 image → **unsure** (21/19/14%), nothing preselected, Log disabled. Direct classify, same shared classifier, GPU delegate (SwiftShader), 7 held-out test images (pad thai, tom yum, som tum, khao man gai, pad kra pao, massaman, gai yang): **top-1 correct 7/7**; 4032×3024 resize + classify **96–153 ms** (first call ~140 ms), native-size **63–73 ms**; first photo end-to-end incl. model load + warm-up 1.9 s, later photos 84 ms. Mac numbers, not iPhone. Off-device requests **0**. Console: MediaPipe's own `odml.pa.googleapis.com/v1/log` blocked by the existing CSP (2 errors, same as pose since M3) and GL driver warnings; no app errors.
- Screenshots 390×844 (DPR 2), all **scrollWidth 390**, min button 56px: `docs/screenshots/m7b-verify-{settings-no-model,settings-model,log-sheet,photo-real-padthai,photo-real-padthai-large,fuel-logged,photo-real-solid,photo-real-somtum,photo-real-somtum-end}.png`.
- Still waiting (not claimed): top-3 ≥ 90% on ≥ 100 of his own held-out meals and < 300 ms on his iPhone (Checkpoint D); the Claude items (step 4); training on his photos.
- Non-blocking observations:
  1. The Undo toast ("Food model added." / "Logged …") stays over the photo sheet for its few seconds and covers the variant / plate-size rows; Log lifts above it, so nothing is blocked.
  2. Main chunk +11.5 kB gzip.
  3. The model card shows 6.5 MB for 6,835,511 bytes (MiB).

### Camera e2e stability + toast (2026-11-16)
- Verified on `e2e-camera-stability` at **8c018a9** (main 4fb3873 + 9e3c878 + PROGRESS Decision; tree clean apart from untracked `fixtures-staging/`; app code untouched by the verifier). Diff: `src/ui/app.ts` (toast placement over `.fuel-sheet`, `--toast-space`, MutationObserver on body, "Restore undone." once), `src/ui/fuel/fuel.css` (sticky main button + padding under a toast), 11 e2e files.
- `npm run check`: typecheck + lint clean, Vitest **110 files / 2,945 tests passed**, node script tests **56/56**.
- `npm run build`: OK. Main `index` **652.75 kB / 195.94 kB gzip** (+0.40 kB / +0.13 kB gzip vs 652.35 / 195.81 at M7b d84547b). Lazy chunks unchanged (`classifier` 3.93 kB, `vision_bundle` 154.07 kB, `three.module` 535.59 kB). Precache 28 entries (25,383.81 KiB), same as M7b.
- **Full local `npm run e2e`** (`E2E_PORT=5401`, 7 workers, 11.9 min): **146 passed, 8 failed, 1 skipped** (HISTORY_SHOTS, opt-in). Failed: `hands-free.spec.ts` (i,v), (ii), (iii), (iv), (vi) (five run side by side, each "data-reps stays 0" at `repsThenFreeze`), `focus-cues.spec.ts:362` (data-reps never 8), `coach-voice.spec.ts:229` (data-reps never 3), `m4e-theme.spec.ts:137` (`#app` not empty with `main.ts` routed to abort). No Vite reload lines in the log. The machine had the Claude desktop renderer at ~170% CPU throughout; no other e2e or docker run was going. All 8 passed on an immediate rerun of those three files (**19/19**, 1.3 min).
- **Second full local `npm run e2e`** (same port, after the CI and repeat runs, nothing else running): **154 passed, 0 failed, 1 skipped** (HISTORY_SHOTS) in 12.0 min. `hands-free-live` passed (1.1 min), not skipped.
- So the full local suite at 7 workers was green 1 of 2 times. The first run's 7 rep-count failures are the kind this branch was meant to fix (the count stayed 0 for the whole 20–45 s wait, five `hands-free` tests side by side). Not claimed fixed under load on this Mac.
- **Linux CI container** (`mcr.microsoft.com/playwright:v1.65.0-noble`, `CI=1 --retries=1`, workers 1, `scratchpad/docker-e2e-r1.sh`): **154 passed, 0 failed, 0 flaky, 1 skipped** (HISTORY_SHOTS) in 21.4 min. `hands-free-live` passed (18.7 s), not skipped; `camera-person` passed first time (it was flaky at M7b).
- `--repeat-each=3`, six camera specs (camera-person, hands-free, hands-free-break, focus-cues, hands-free-live, camera-layout): **108/108 passed** (30.4 min, 7 workers; `hands-free-live` ×3 passed at 19.9 / 57.4 / 41.2 s, none skipped).
- `--repeat-each=3`, fuel + barcode + backup + food-photo: **60/60 passed** (18.8 s). Includes the new fuel toast test and backup's "Restore undone." shows once, inline, with no toast.
- **Click-through at 390×844** (`node scripts/screenshots.mjs cam-verify`, dev server, clock 18 Nov 12:10, OFF routed, dev fake food classifier, made-up solid PNG): targets → Thai dish logged → while its Undo toast is up: the same Thai dish again, then Scan (typed code) → found item, then Log from a photo. For each sheet's main button, measured where it sits with no scroll: Thai **Log** 588–660 px (72 px tall), toast top 684; Scan **Look up** 588–660, toast 684; barcode **Log** 588–660, toast 684; photo **Log** 601–673, toast 709. In every case it is on screen, wholly above the toast, ≥ 56 px, `elementFromPoint` at its centre is the button, and a tap at that spot logged it (4 entries; last toast "Logged Pad thai with shrimp."). Photo sheet scrolled to the end: the Large plate-size chip (260–316) and Log (545–617) are both clear of the toast. With the sheets closed the toast is back above the tab bar (toast bottom 762, tab bar top 770). Nothing spoken, 0 console errors/warnings; the only off-device request is the expected (routed) OFF lookup for the typed code.
- Screenshots (DPR 2), all **scrollWidth 390**, no visible button under 56 px: `docs/screenshots/cam-verify-{fuel-toast,thai-detail-toast,scan-toast,barcode-detail-toast,photo-toast,photo-toast-scrolled,fuel-after}.png`.
- **Fix round after the verifier FAIL** (phased config, page-side time guards, m4e regex route, 12 fps local floor): two consecutive full local `npm run e2e` runs, 7 workers, **154 passed / 0 failed / 1 skipped** (HISTORY_SHOTS) each, ~18.5 min; `npm run check` green (110 files / 2,945 tests, scripts 56/56). Reviewer re-review PASS. CI evidence: the main deploy run after this commit.
- Non-blocking observations:
  1. With the toast up, the sticky main button covers part of the item just above it at that scroll spot (Thai: the "836 kcal" line; Scan: the bottom 8 px of the typed digits field). Both scroll clear; the field's centre stays tappable.
  2. Smallest text on Fuel is the 18 px "70 kg" on the Weigh-in button (unchanged by this branch).

### M9 tasks 1–2 (2026-11-15, main, worktree)
- Packages: `@capacitor/core` 8.6.2, `@capacitor/ios` 8.6.2, `@capacitor/haptics` 8.0.2, `@capacitor/cli` 8.6.2 (exact pins; `npm install` on Node 26.0.0).
- `npm run check`: typecheck + lint OK, Vitest **93 files / 2582 tests passed**, script tests **56/56**.
- `npm run build`: **precache 26 entries (25310.83 KiB)**, same as before the change. File list compared with a build from the commit before (f6fada2): identical apart from content hashes; `sw.js` precache URL list identical except the 4 chunks that carry the per-build `__APP_VERSION__` stamp (index, scene, skeleton3d, viewer), which change on every build, also with no code change (rebuilt twice to confirm). `index.html` identical modulo hashes.
- `BASE_PATH=/gym-clean/ npm run build:native`: OK; no `sw.js`, `registerSW.js`, `workbox-*.js` or `manifest.webmanifest`; `index.html` uses `/assets/…` and `/icons/…` (base `/` despite BASE_PATH); CSP meta unchanged (`connect-src 'self' blob: data: https://world.openfoodfacts.org`); no `serviceWorker` in any chunk.
- `E2E_PORT=5341 npx playwright test e2e/pwa.spec.ts`: **1 passed** (installs, then offline with the model and wasm from the cache).
- `.gitignore`: `ios/App/Signing.local.xcconfig`, `ios/App/App/public/`, `ios/**/xcuserdata/`, `ios/App/Pods/`, `*.gymclean-backup.json` checked with `git check-ignore`; `Signing.local.xcconfig.example` and `Info.plist` stay tracked.
- Not run: `ios:*` scripts (no `ios/` until task 3; Xcode broken on this Mac, M9-q9).

### M11 Apple Health (2026-11-16)
- **On his iPhone (task 13, 2026-11-16):** first install showed no Connect (GymHealth header arrived late → fixed in 271bbdc, verified in the simulator); after Connect + Read now, Fuel showed his Health weight tagged "from Health" once Health-wins (77eddd9) was in: **pass** (he confirmed). He also confirmed: the iOS Health sheet listed **only the six types** (read only), and Today shows the **week line** with his outside workouts: **pass**. Task 13 done; the readiness card itself is judged over a week at Checkpoint H.
Verifier on `m11-build` at 424cafd (reviewer PASS on the same commit). **Verdict: PASS for everything that can run on the Mac; the 🧍 iPhone items (task 13) and Checkpoint H are pending.**
- `npm run check`: typecheck + lint clean, Vitest **125 files / 3157 tests passed**, script tests **56/56**. Health tests: `src/core/health/{days,baseline,readiness,readiness.fixtures,copy,weighIns,weeklyLoad,sync}.test.ts`, `src/core/nutrition/activityCheck.test.ts`, `src/native/health.test.ts` (fake bridge: no plugin, unavailable, denied → empty ok, partial, locked → `status: locked`, other failure → `failed`, never throws); fixtures in `src/core/health/fixtures/` (normal week, short sleep + high RHR, one signal only, sparse, mixed HRV sources ×2).
- `E2E_PORT=5731 E2E_PWA_PORT=6731 npm run e2e` (all phases): **159 passed, 1 skipped** (the opt-in `HISTORY_SHOTS` test), 18.1 min. `e2e/health.spec.ts` 5/5; `--repeat-each=5` on it: **25/25**.
- `npm run build`: OK, precache 30 entries (25424.84 KiB). Main `index-Dz3YDO-h.js` 680.74 kB (205.80 kB gzip): **0 matches for `GymHealth` / `registerPlugin`**; the plugin is only in the lazy `health-DRjgxf-M.js` (3.26 kB / 1.44 kB gzip). Other lazy chunks: three.module 535.59 kB, vision_bundle 154.07 kB.
- Native: `npx vite build --mode native && npx cap sync ios` OK (no tracked file changed). `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -destination id=<GymClean iPhone 17 Pro sim> CODE_SIGNING_ALLOWED=NO build`: **BUILD SUCCEEDED**, 0 warnings. Built `Info.plist` has `NSHealthShareUsageDescription` (SPEC text) and no `NSHealthUpdateUsageDescription`; `App.entitlements` has only `com.apple.developer.healthkit` (no team id); the plugin calls `requestAuthorization(toShare: [], read:)`. `xcodebuild -scheme GymHealthCore … test`: **19 tests, 0 failures, TEST SUCCEEDED**. (The simulator is named "GymClean iPhone 17 Pro", so `name=iPhone 17 Pro` in docs/ios-setup.md doesn't match it on this Mac; use the id or that name.)
- Screenshots 390×844 (DPR 2) from the wired app with a fake `window.Capacitor` GymHealth bridge (made-up data, same as e2e/health.spec), `node scripts/screenshots.mjs m11`: `docs/screenshots/m11-verify-health-settings-connect.png`, `m11-verify-health-settings.png`, `m11-verify-health-settings-bottom.png`, `m11-verify-health-settings-confirm.png`, `m11-verify-today-card.png`, `m11-verify-fuel-weigh-in.png`, `m11-verify-health-pwa.png`. Every one **scrollWidth 390, 0 console errors/warnings, 0 page errors, 0 off-site requests**; nothing spoken. Connect asked iOS for exactly the six types; all six switch rows 60px. Card: "Lighter today?" with "Sleep was about 1 h 50 m shorter than usual." and "Resting heart rate is about 7 bpm higher than usual.", buttons Lighter today / Not today / Train as planned all 56px; week line "This week: 0 gym sessions, 1 other workout (run 40 min)". Fuel: Weigh-in 70.4 kg + "from Health" tag. No visible button under 56px; body text ≥ 20px; 18px only on short labels (tab labels, muscle chips, the Weigh-in chip value and its tag), as allowed by the M4e `--fs-label` decision (same as M7).
- 🧍 Pending (Wongsaton, task 13): the Health sheet lists only the six types on his iPhone, WHOOP data appears, a Health weigh-in shows in Fuel, Safari Web Inspector shows no network request. Then Checkpoint H.
- Doc gaps for main (not blocking): the M11 task checkboxes in "Current milestone plan" are all still `[ ]`, the Milestone checklist line still says "waiting on the M11-q answers, no build", and SPEC M11's heading still says "PROPOSED … no build".

### M12 slices 1 + 1c (2026-11-17)
Verifier on `m12-coach-tab` at 9ecd50c (reviewer PASS: slice 1 after 85fb908, slice 1c at 32e5c5e + nits 3ae8142 / 9ecd50c). **Verdict: PASS** for slice 1 task 20 and slice 1c task 16; 🧍 Checkpoint I (his iPhone, a few days) is pending, not a failure.
- `npm run check`: typecheck + lint clean, Vitest **157 files / 3765 tests passed**, script tests **56/56**. M12 unit tests present and green: `src/core/trainer/focusBlock.test.ts` (+ `actions/focusBlock.test.ts`; deterministic, 2/6 weeks, revisions), `src/core/progress/completion.test.ts` (midnight, DST), `src/data/chat/store.test.ts`, `src/data/db.test.ts` ("GymDb v8 … upgrades a v7 database keeping every existing row", "GymDb v9 … upgrades a v8 database keeping every existing row"), `src/data/brain/{router,rules}.test.ts`, `src/core/trainer/intents.test.ts` (eval set 128 items incl. week/progress/focusBlock/focusEdit/doToday, score ≥ 0.9), `src/ui/motion{,.render}.test.ts`, `src/core/todo/{detectors,progress,whatsNew,report}.test.ts` (re-sign 3 vs 2 days left; DST spring/fall in `whatsNew.test.ts`; `sk-ant-…` → "[key removed]"), `src/data/todos/{topics,store,facts}.test.ts`, `src/data/whatsNew/pages.test.ts`, `src/core/version.test.ts` (label, release = package.json version, credit), `src/ui/todo/*.test.ts`, `src/ui/{shareMonth,focusSummary}.test.ts`, `src/ui/screens/calendar{,Day}.test.ts`.
- `E2E_PORT=5391 E2E_PWA_PORT=6391 npm run e2e` (all phases, one run): **190 passed, 1 skipped** (opt-in `HISTORY_SHOTS`), 19.0 min, no flakes (clip specs passed first time). M12 specs: calendar 7/7, coach-tab 4/4, focus-block 1/1, motion 2/2, today-m12 6/6, todos 4/4, whats-new 6/6; trainer 12/12. Flakiness: those 7 specs `--repeat-each=5` (project mobile): **150/150 passed** (44.9 s).
- `npm run build`: OK, precache 30 entries (25561.79 KiB). Main `index-DU21ETdU.js` **799.19 kB (244.61 kB gzip)** (M11 was 680.74 kB): contains `1.12.0` (2 matches), **0 matches for `GymHealth` / `registerPlugin`**; lazy: health 3.64 kB, three.module 535.59 kB, vision_bundle 154.07 kB, scene 38.65 kB, reader 37.72 kB.
- Native: `npx vite build --mode native && npx cap sync ios` OK (no tracked file changed). `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -destination id=3BA81E3F-3EDA-4B9C-89CA-29F80BA63B0B ("GymClean iPhone 17 Pro") CODE_SIGNING_ALLOWED=NO build`: **BUILD SUCCEEDED** (only the usual appintentsmetadataprocessor note); the bundled `public/assets/index-*.js` contains `1.12.0`. (The iOS bundle's `CFBundleShortVersionString` is still `1.0`; nothing in SPEC requires it to follow package.json.)
- Screenshots 390×844 (DPR 2) from the wired app, clock Fri 13 Nov 2026 18:00 (tour/to-dos Mon 16), made-up sessions as e2e/calendar.spec, `node scripts/screenshots.mjs m12`: `docs/screenshots/m12-verify-today.png` (+ `-full`; to-do card "To-dos: 0 of 8 done · Next: Coach tab and Calendar" below Start, missed card "You missed Legs A on Thu." Start it / Skip it), `m12-verify-coach-empty.png` (5 tabs 78×72, Coach centre raised, 4 starters), `m12-verify-coach-proposal.png`, `m12-verify-coach-applied.png` (Applied. + Undo on the card), `m12-verify-focus-collapsed.png` (Chest focus 4 weeks, 26/26/25/20 sets, week 4 "lighter week"), `m12-verify-focus-expanded.png` (+ `-full`; Focus labels in words), `m12-verify-pause-chat.png` (during the set: 0 inputs, 0 to-do card, 0 tour, 0 tab bar), `m12-verify-calendar-month.png`, `m12-verify-calendar-scores.png` ("43% · 2 of 6 sessions, 43% of planned sets"; month "15% · 3 of 25 sessions"), `m12-verify-calendar-day.png` (+ `-full`; Pull A partly: row 1 partial, 4 missed), `m12-verify-share-month.png` (the 1080×1350 PNG itself, download fallback "Image saved.", 0 requests after the tap), `m12-verify-tour-first.png` ("1 of 7", "Meet the Coach tab", "Version 1.12.0 (build 9ecd50c)"), `m12-verify-tour-last.png` ("Added to your to-dos", 12 topics), `m12-verify-todo-list.png` (+ `-full`; "0 of 8 done"), `m12-verify-guide-auto.png` (Step 1 of 8, Not yet 0 of 1, Try it), `m12-verify-guide-ask-note.png` (Step 4 of 8, note 31/500), `m12-verify-guide-decision.png` ("Setting after this: Yes"), `m12-verify-report-preview.png` (header "Version 1.12.0 (build 9ecd50c)", "App: PWA", no name), `m12-verify-settings-about.png` ("Version 1.12.0 (build 9ecd50c)", "© 2026 Wongsaton Kampusan"). Every page **scrollWidth 390, 0 console errors, 0 page errors, 0 off-site requests** (route-aborted and recorded), nothing spoken; the only console lines are 2 Chromium WebGL "GPU stall due to ReadPixels" performance warnings on the Exercise screen behind the Pause chat (3D body, pre-existing). Smallest visible button 56px on every screen; body text ≥ 20px, 18px only on labels (tab labels, weekday heads, muscle chips, tour "WHAT'S NEW") per the M4e `--fs-label` decision. Calendar day cells 55.7 × 64px (accepted exception, Decision "M12 slice 1 review calls" (2)).
- Reduced motion (`reducedMotion: 'reduce'`, matchMedia true): running finite animations after Today load, Calendar tab, Coach starter + reply, tour open, tour Next: **0 each**.
- Observations for Checkpoint I (not failures): (a) with no fixed rest days, the first week of this made-up history (one session Mon 2) shows Wed 4 – Sun 8 as five "missed, Pull A" days (the rule in Decision "M12 slice 1 review calls" (1)); worth his look; (b) the Not today proposal's why reads "Push A moves to Saturday and the rest follow. Push A moves to next week." (two different Push A days, M10 postpone copy) — reads like a contradiction; (c) the score numbers count up on open, so a quick glance can catch a mid-count value (shown final under reduced motion).
- 🧍 Pending: Checkpoint I on his iPhone (slice 1 task 22); slice 1 task 21 / 1c task 17 merge (M12-q5).

### M12 slice 1b (2026-11-17)
- **Re-check after the one FAIL (2026-11-17, main):** feel-today alone now makes the "Lighter today?" card without Health (core `syncHealth` builds it from feels when Health is unavailable/off/failed; host shows it without the plugin). `npm run check`: 193 files / 4703 tests, scripts 70/70. e2e (no-fsevents wrapper, mobile): trainer-kit (extended to assert the card on the web), health, today-m12, intake = 21/21. All slice 1b Accept items now met → **PASS**. Installed 1.13.0 (build 245) on his iPhone; he confirmed version, tour (9 pages), feel-today row, body comp switches, trainer-kit to-do.
Verifier (task 40) on `m12-coach-tab`, app code at 312158b (reviewer PASS + review fixes); HEAD moved to b40d6e5 during the run (docs only: PROGRESS + SPEC, no code). **Verdict: FAIL** on one Accept item (feel-today → "Lighter today?" card without Health, below); everything else passes.
- `npm run check`: typecheck + lint clean, Vitest **193 files / 4690 tests passed**, script tests **70/70**. Slice 1b unit tests present and green, e.g. `src/core/warmup.test.ts` (50 % × 8 / 70 % × 4, kg 2.5 and lb 5 steps, barbell plates, none for bodyweight/light, first heavy lift only), warm-ups excluded in `stats.test.ts` (volume, bests), `history.test.ts`, `trainer/actions/stall.test.ts`, `progress/e1rm.test.ts`, `progress/completion.test.ts`; `advice.test.ts` (effort); `trainerKit/{defaults,goals,intake,review}.test.ts` (review once per 4–6 weeks); `trainer/actions/{easyOn,shortOnTime,starterPlan}.test.ts`, `trainer/estimate.test.ts`, `trainer/nextBlock.test.ts` (deload / stalls once, then not for 4 weeks); `health/readiness.test.ts` (feltLow + sore, one signal no card, two signals a card); `setupCues.test.ts` (2–3 cues ≤ 8 words, checkCopy); `health/cardio.test.ts` (no double count, DST); `nutrition/{nudges,goalTargets,targets}.test.ts` (BMR floor, no goal = old rule); `data/learnCards.test.ts`; `data/db.test.ts` "GymDb v10 … upgrades a v9 database keeping every existing row"; `data/backup.test.ts` (goals/measurements/day feels/intake/trainer kit/effort backed up; progress photos left out and refused); `data/progressPhotos/store.test.ts` (nothing in the dev log); `data/gymFile.test.ts`; `core/noPersonal.test.ts`; `health/bodyComp.test.ts`; `trainer/actions/postpone.test.ts`; `native/iosVersion.test.ts` (MARKETING_VERSION = package.json).
- Full e2e, **via the no-fsevents wrapper** (`scratchpad/e2e37/pw.sh`, `E2E_PORT=5774`; plain `npm run e2e` timed out on `config.webServer` after 60 s, the known fsevents hang on this Mac). Run 1: 155 passed, 1 failed, 1 skipped, 47 did not run (later phases skipped) — the failure was `e2e/camera-layout.spec.ts:573` "gauge on the live camera view (375×667)" (gauge box not found within 5 s) under parallel load; **rerun alone: 2/2 passed (8.3 s)**. Run 2 (full, all phases, one run): **203 passed, 1 skipped** (opt-in `HISTORY_SHOTS`), 19.1 min, no flakes; mobile-person-camera 6/6, mobile-clips 41/41, pwa 1/1. New specs: trainer-kit 4/4, intake 5/5, body 3/3, tab-scroll 1/1. Flakiness: those 4 specs `--repeat-each=5` (project mobile): **65/65 passed** (54.7 s).
- `npm run build` (same no-fsevents NODE_OPTIONS): OK, precache 30 entries (25712.34 KiB). Main `index-CNqsF5Nw.js` **928.71 kB (290.03 kB gzip)** (slice 1/1c: 799.19 kB): contains `1.13.0` (11 matches: version label + 9 tour pages), **0 matches for `GymHealth`, `GymSpeech`, `registerPlugin`** (GymHealth only in lazy `health-Dc-yhocJ.js` 3.80 kB; GymSpeech in no web chunk). Lazy: three.module 535.59 kB, vision_bundle 154.07 kB, scene 38.65 kB, reader 37.72 kB, dist 7.98 kB, viewer 5.73 kB, classifier 3.93 kB.
- iOS: `vite build --mode native && npx cap sync ios` OK (no tracked file changed). `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build` (derived data in the scratchpad): **BUILD SUCCEEDED** (only the usual appintentsmetadataprocessor note). Built `App.app/Info.plist`: **CFBundleShortVersionString 1.13.0**, CFBundleVersion 245; pbxproj `MARKETING_VERSION = 1.13.0` (both configs); bundled `public/assets/index-B0mcSO0o.js` contains `1.13.0`.
- Screenshots 390×844 (DPR 2), clock Fri 13 Nov 2026 18:00, made-up data only (seeded sessions, canvas-drawn images, a fake GymHealth bridge), `node scripts/screenshots.mjs m12b` (+ `m12b feel-card`): `docs/screenshots/m12b-verify-warmup-set.png` ("Warm-up 1 of 2 · 7.5 kg × 8", Skip warm-ups; during the set 0 effort/feel/goal/learn/readiness elements, 0 inputs), `m12b-verify-warmup-rest.png` ("Next · Warm-up 2 of 2"), `m12b-verify-effort-row.png` (How was that set? Easy 3+ left / Good 2 left / Hard 0–1 left, Why?), `m12b-verify-learn-effort.png`, `m12b-verify-short-on-time.png` (+ `-full`; pair "Seated Dumbbell Press + Side Lateral Raise: back to back, 45 s rest", sets trimmed, Pushups removed, "about 30 min instead of 48", Apply / Not now), `m12b-verify-feel-today.png` (+ `-full`), `m12b-verify-feel-today-saved.png` ("Go easy on chest today?" on the feel row), `m12b-verify-feel-card-native-connected.png` ("Lighter today?" with both feel reasons + Go easy on chest), `m12b-verify-learn-card.png` (consistency, from "How's my week?"), `m12b-verify-intake.png` (Question 1 of 5), `m12b-verify-intake-summary.png` (+ `-full`; starter plan 3 × full body, "Nothing changes until you tap Apply."), `m12b-verify-goal-card.png` ("Dumbbell Bench Press 22.5 kg × 5 by 2027-02-05", 0 %, On track, 12 weeks left), `m12b-verify-e1rm-chart.png` (3 points 19 / 22.2 / 25.3, "Best estimate 25.3 kg on 11 Nov"), `m12b-verify-measurements.png` (+ `-full`; waist 81.5 cm), `m12b-verify-photo-compare.png` (+ `-full`; off by default, two made-up images side by side), `m12b-verify-cardio-today.png` and `m12b-verify-cardio-calendar.png` ("Cardio this week: 95 min" = run 40 + ride 55, last week's walk not counted; PWA: 0 cardio lines), `m12b-verify-tour-first.png` ("1 of 9", "How was that set?", "Version 1.13.0 (build b40d6e5)"; 9 pages through "Added to your to-dos"). Every page **scrollWidth 390, 0 console errors, 0 page errors, 0 off-site requests**; Today/Coach/intake/photos flows spoke nothing; the workout spoke the warm-ups and setup checks between sets only. Smallest visible button 56px everywhere; body text ≥ 20px, 18px only on labels (tab labels, muscle chips, rest "Last set:", reps "count"). Only console lines: 4 Chromium WebGL "GPU stall due to ReadPixels" performance warnings on the rest screen (3D figure, pre-existing).
- **FAIL — feel-today → "Lighter today?" card without Health** (SPEC M12 item 9 "so both together work without Health", Decision "M12 trainer kit": "feel-today alone can make the card … so it works without Health"; slice 1b Accept e2e "feel-today → 'Lighter today?' card"). Energy 2 + chest sore, then Save: iPhone app with Health connected (no sleep/HRV data) → the card shows with both feel reasons (`m12b-verify-feel-card-native-connected.png`); **iPhone app with Health not connected → no card; PWA → no card** (only the "Go easy on chest today?" row). Cause: `src/ui/healthHost.ts` `todayProps()` returns `readiness: null` when the Health plugin isn't loaded (`if (!api) …`), so the feel-only card computed in `syncOnce` is never shown. `e2e/trainer-kit.spec.ts` "Feel today …" asserts the Go easy offer, not the card, so the gap is untested. Likely owner: main (wiring B, task 36) / ui-engineer (`healthHost.ts`, task 38 e2e).
- Observations (not failures): the effort row says "Good 2 left" while its learn card says "two or three clean reps left"; the Goal card shows 0 % "On track" right after the intake although the seeded e1RM rose 19 → 25.3 kg (progress counts from the goal's start).

### M12 slice 2 (2026-11-18)
Verifier (task 24) on `m12-slice2` at 2bcda69 (reviewer PASS + task 23 fixes d0224f6), working tree clean before the run. **Verdict: PASS** for everything the Mac can show; the real Apple model, on-device speech, the on-device eval numbers and notifications on the phone/Watch are 🧍 Checkpoint J (task 26), not failures.
- `npm run check`: typecheck + lint clean, Vitest **214 files / 5228 passed, 1 skipped** (the local-only classifier smoke model), script tests **86/86**. Slice 2 unit tests present and green, e.g. `trainer/tools.test.ts` ("tools.contract.json equals the generated contract", 4 read-only tools flagged, `proposeFocusBlock` params only, invalid args → short reason, a call returns a Proposal never a state), `trainer/brain/context.test.ts` ("never contains: Health numbers, weekly load, cardio, body comp, measurements, weigh-ins, photos, check-ins, notes, dev log"; reasons present with `appleCardReasons` true/undefined, absent with false; heavy 4-week history within budget), `sanitize.test.ts`, `readTools.test.ts`, `evals/facts.test.ts` (24 made-up items, every fact found in its source), `data/brain/router.test.ts` (each of the 5 reasons → rules + note once, stored in brainNotes; errors every time; never calls fetch), `apple.test.ts` (no fetch/XHR/WebSocket/sendBeacon), `evalRunner.test.ts`, `speakRules.test.ts`, `reminders/{schedule,copy}.test.ts` (all off by default, missed-day once, Sunday 19:00, off → cancel, no numbers), `checkIn/checkIn.test.ts`, `data/db.test.ts` "GymDb v11 … upgrades a v10 database keeping every existing row", `native/{gymBrain,speech,reminders}.test.ts` (no permission prompt at load; only `request()` prompts).
- `node scripts/gen-trainer-tools.mjs --check`: "TrainerTools.generated.swift is up to date." (14 tools in `tools.contract.json`).
- Full e2e, plain `E2E_PORT=5481 E2E_PWA_PORT=6481 npm run e2e` (no fsevents hang this time). Run 1: 176 passed, **1 failed**, 1 skipped, 47 did not run — `e2e/motion.spec.ts:39` "a tab switch plays its entrance" (0 animations right after the Calendar tab click, under parallel load; not in the known-flake list); **rerun alone: 2/2 passed**. Run 2 (full, all phases): **224 passed, 1 skipped** (opt-in `HISTORY_SHOTS`), 19.5 min, no failures (the known load flakes focus-cues:364/603, tab-scroll:21, fuel:228 all passed). Slice 2 specs in run 2: coach-apple 8/8 (incl. the two task 23 "availability check rejects / hangs past 4 s → couldn't check + Check again" tests), mic, reminders, check-in, coach-layout: 21/21. Flakiness: those 5 specs `--repeat-each=5` (project mobile): **105/105 passed** (33.5 s).
- `npm run build`: OK, precache 33 entries (25813.11 KiB). Main `index-DPgj3T-O.js` **1,016.31 kB (318.12 kB gzip)** (slice 1b: 928.71 kB); contains `1.14.0` (8 matches); 0 matches for `GymSpeech`, `GymHealth`, `registerPlugin` (1 for `GymBrain`: only the lazy-import of `gymBrain-*.js`). Plugins only in lazy chunks: gymBrain 3.30 kB, speech 3.14 kB, reminders 2.43 kB, health 3.81 kB. Other lazy: three.module 535.59 kB, vision_bundle 154.07 kB, scene 38.65 kB, reader 37.72 kB.
- iOS: `npx vite build --mode native && npx cap sync ios` OK (plugins incl. `@capacitor/local-notifications@8.3.1`; no tracked file changed); bundled `public/assets/index-*.js` contains `1.14.0`. `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO build` (derived data in the scratchpad): **BUILD SUCCEEDED** (only the usual appintentsmetadataprocessor note). Built `Info.plist`: CFBundleShortVersionString **1.14.0**, CFBundleVersion 267, `NSMicrophoneUsageDescription` "Lets you talk to the coach. Audio stays on this phone.", `NSSpeechRecognitionUsageDescription` "Turns what you say to the coach into text on this phone." XCTests on `iPhone 17`: **GymHealthCore 21/21, GymSpeechCore 29/29, GymBrainCore 35/35, 0 failures, 0 skipped, TEST SUCCEEDED** each.
- Screenshots 390×844 (DPR 2) from the wired app (dev server) with the e2e fakes (`e2e/native-fakes.ts` GymBrain/GymSpeech, `src/native/fakeReminders.ts`; made-up data, clock Fri 13 Nov 18:00, check-in Sun 15), via a temporary Playwright spec under `test-results/verify24/` (it imports the e2e fakes, so `scripts/screenshots.mjs` was not extended): `docs/screenshots/m12s2-verify-coach-native-idle.png`, `-mic-listening.png` (Listening… Let go to send. Slide off to cancel.; live words in the box), `-mic-reply.png` (reply spoken: the `say` text, once, as Mic only), `-apple-reply.png` (badge "Answered by On-device AI"; typed → nothing spoken), `-apple-proposal.png` (lighterToday card, Apply), `-brain-off-note.png` ("Apple Intelligence is off, so I'm using quick replies. Turn it on in Settings > Apple Intelligence & Siri.", badge Quick replies), `-coach-settings-available.png` (+ `-bottom`; "✓ On-device AI", Speak replies Mic only / Always / Off), `-coach-settings-off.png`, `-coach-settings-unknown-reject.png` and `-unknown-hang.png` (**task 23 fix confirmed**: "Couldn't check Apple Intelligence just now. Quick replies answer until it can." + Check again enabled; tapping Check again returns to the same state, never stuck on "Checking…"), `-checkin.png` (3 × 1–5 chips, "1 Low / 5 High"), `-checkin-done.png` ("Saved: energy 4, sleep 3, soreness 2."), `-reminders-off.png` (all off), `-reminders-on.png` (Session on, 18:00 picker), `-reminders-denied.png`, `-eval-idle.png` (token line "Instructions 1180 · tools 1420 · prompt 950 of 4096 tokens", fake numbers), `-eval-report.png` (Actions / Safe / Facts / Median time / Errors "0 of 160"; rows are ids + expected/got action and args, no reply text; scores are the fake bridge's, meaningless), `-pwa-coach.png` (PWA: 0 mic elements). Every page **scrollWidth 390, 0 console errors/warnings, 0 page errors, 0 off-site requests** (route-aborted and recorded). No visible control under 56px except the Talk button **while pressed** (54.3px: the press-feedback shrink; 56px+ at rest, e2e `expectTapTargets` passes); body text ≥ 20px, 18px only on the tab labels. The earlier `m12s2-*.png` harness shots (12:18) predate task 23 and show no "couldn't check" state; the `m12s2-verify-*` set supersedes them. `m12s2-sim-*` (simulator, real plugins) still match: on the simulator the mic says it can't do on-device speech and every Apple `respond` falls back (Apple's framework refuses the simulator).
- 🧍 Deferred to Checkpoint J (the simulator cannot run Apple's model or on-device speech): real Apple answers + badge, the on-device eval run (M10 phase B Accept: actions + args ≥ 85 %, 100 % safe, 0 changes without a tap, p50 latency; facts match rate), real token counts, the mic (one Microphone prompt, no Speech prompt, AirPods/music behaviour, live words), notifications arriving on the phone and Watch, Airplane Mode.
- Observations (not failures): (a) while listening the text box narrows to ~135px, so a longer phrase shows only its tail ("w is my week"); (b) the reminder time picker shows "06:00 PM" (Chromium en-US 12-hour) next to 24-hour copy ("at 09:00", "Sunday at 19:00"); the iPhone shows the picker in his own clock format; (c) the rules reply after the "Apple Intelligence is off" note reads "I can help with:" with its chips only in the bottom chip row; (d) `motion.spec.ts:39` is a new load flake (run 1 only).

## Blockers / questions for Wongsaton
- **New (M14 Wrist and ears, planned 2026-11-17):**
  - ~~(M14-q1) Paid Apple account for the watch app?~~ **Answered 2026-11-17: "let's try the free version, and I will decide the pay in the future".** We build with the free Personal Team; M14 task 2 (a blank watch app on your iPhone + Series 9) decides. If the free team can't run the watch app, the watch part pauses and we ask you again with the facts and the US$99/year cost; the AirPods part goes ahead.
  - ~~(M14-q2) Your devices?~~ **Answered 2026-11-17: "I got series 9 and pro 2"** → Apple Watch Series 9 and AirPods Pro 2 (head tracking supported).
  - **M14-q3 answered 2026-11-18: "It can be touched, that's fine"** → the default stands (Health access at the first watch workout; session samples stay in Health; no remote-only mode). Kept below for the record.
  - ~~(M14-q3, not blocking; default gets built) Health on the watch~~ works a bit differently than planned.** Apple's rules (M14 task 1): to show live heart rate, the watch has to run a workout, and that needs Health access to **save workouts**. So the first time you use the watch app in a workout, Health asks for access, even with "Save to Apple Health" off. With Save off, no workout is saved, but the heart rate and calories your watch measured during the session stay in Health (like any Apple Watch reading; M11 can read them). **Default:** accept this, say it plainly in Settings and the permission text, and if you say no to Health access the watch still works as a remote, just without heart rate. Say if you'd rather have the watch app run with **no heart rate and no Health access at all** (a remote only) as an option.
- **New (M15 Best-rep clips, planned 2026-11-17; none blocking, defaults get built):**
  - **M15-q1–q5 answered 2026-11-17: "Go with the defaults"** (after M14; button only, no spoken "save that"; weight shown by default; no sound by default, Sound switch kept; blur always on, no zero). The questions below stay for the record.
  - **(M15-q1) When?** Default: **after M14** (Checkpoint L first). If you want clips sooner, M15 can run in parallel with M14's watch track (different files; only the version number and the What's New list collide), but it then delays the AirPods/watch fixes.
  - **(M15-q2) "Save that!" by voice?** Not in M15: the slice 2 mic is chat-only and never listens during a workout (Decision "M12 slices 1b + 2"). M15 gives a **"Save last rep" button on the Rest screen** instead. A spoken "save that" would mean the mic listening during sets; say if you want that later.
  - **(M15-q3) Weight on the clip?** Default: the Story overlay shows **weight × reps** (you asked for "the perfect lift up weight"), with a "Show weight" switch per clip and in Settings → Clips (on by default). Say if it should start off.
  - **(M15-q4) Gym sound?** Default: clips are **silent**; a "Sound" switch in Settings → Clips (off) adds the mic track and asks for the microphone then. Gym music in a clip can get muted by Instagram. Say if you'd rather we leave sound out entirely.
  - **(M15-q5) Blur can't go to zero.** Blur strength is Light / Medium (default) / Strong; there is no "off", because other people in the gym didn't agree to be filmed. Say if you need a "no blur" option for an empty gym (it would still default to Medium each workout).
- **New (M13 Published look, planned 2026-11-17; not blocking):**
  - ~~(M13-q1) Keep the name "Gym Clean"?~~ **Answered 2026-11-17: keep it** ("Keep it Gym Clean"). The name stays behind one constant anyway.
  - Owner mode: **answered 2026-11-17, option A** (7 taps on the version line; Decision "M13 Published look").
- **New (M12 Coach tab, planned 2026-11-16; not blocking slice 1. The defaults are what gets built):**
  - ~~M12-q1~~ and ~~M12-q4~~: **defaults taken 2026-11-17** with his "Go ahead slice 2 and 1b" (Decision "M12 slices 1b + 2"); he can still change either in the to-do decision steps and the app follows. Kept below for the record.
  - **(M12-q1, before slice 2) Apple's coach and your Health card.** The design lets Apple's on-device coach see the "Lighter today?" reasons (e.g. "Sleep was shorter than usual"), never raw numbers, and never Claude. An earlier M11 build note kept every Health value out of the coach. **Default: Apple's on-device coach may see the card's reason sentences only; Claude never.** OK?
  - **(M12-q2, at Checkpoint I) Old Calendar days after a plan change.** If you later change the plan "from now on", should old missed days still show what was planned back then? **Default for slice 1: no snapshot; done days always show what you logged.** We'd add a daily snapshot if this bothers you.
  - **(M12-q3, at Checkpoint I) Focus-block size.** Default: the focus muscle gets about 40% more weekly sets and trains at least 2 days a week, the last week is lighter. Too much, too little?
  - **(M12-q4, before slice 1b; not blocking) Trainer kit details.** Defaults: measurement sites = left/right arm, chest, waist, hips, left/right thigh; e1RM = the Epley formula on each session's top set; warm-ups only before the day's first barbell/smith/heavy-dumbbell lift; the 4–6-week review every 5 weeks. Change any?
  - **"How's my week?"** counts gym sessions only (not WHOOP/Health workouts), per the M11 rule that Health stays out of the coach. Say if you want outside workouts in that answer.
  - **(M12-q5, slice 1c; not blocking) Ship slice 1 and the to-dos together?** **Default: yes**, one update, so the first time you open it the What's New tour explains the Coach tab and Calendar and your checkpoints appear as to-dos. Alternative: ship slice 1 now and the tour + to-dos a few days later.
- **M11 Health data: ANSWERED 2026-11-16.** Wongsaton: route A ("Go with route A, get the information from Health"), read-only ("Let's just read it for now, plan to write to it later"), paid account only if needed ("If need it, just pause for now"; not needed: HealthKit capability added and the build succeeded on the free Personal Team, 2026-11-16), and "Use the defaults" for q1, q4, q6, q7, q8. Still open (not blocking): 🧍 task 2, which types WHOOP writes into Health on his phone. (Was:)
- **New (M11 Health data, planned 2026-11-16; BLOCKING for M11 only: no code until you answer, or say "go with the defaults"). Details in SPEC M11 and Decision "M11 health data plan":**
  - **(M11-q1) Approve the scope change?** SPEC §6 keeps heart rate / Apple Watch out of scope. M11 would read a few Apple Health types in the iPhone app (not the PWA) so the coach can auto-fill weigh-ins, count your outside workouts, and suggest "Lighter today?" on days your sleep, HRV and resting heart rate look off versus your own usual. **Default: yes, as written in SPEC M11.**
  - **(M11-q2) How WHOOP data gets in.**
    - **Route A (recommended):** WHOOP → Apple Health → Gym Clean. The WHOOP app already copies sleep, HRV, resting HR, workouts and calories into Apple Health; Gym Clean reads them there. No internet, no account, no server, nothing new leaves your phone. Missing: WHOOP's own Recovery % and Strain scores (Apple Health has no place for them), so the coach uses the numbers behind them instead.
    - **Route B:** the WHOOP Developer API. Gives Recovery % and Strain directly, but the app then downloads your data from WHOOP's servers over the internet, you'd create a WHOOP developer app, and if WHOOP requires a client secret we'd either store your secret only on your phone or run a small server you own.
    - **Default: route A.** Route B can be added later.
  - **(M11-q3) Paid Apple account, only if needed.** We believe HealthKit works with your free Apple ID (to be confirmed in Xcode, task 1). If it turns out it doesn't: pay US$99/year for the Apple Developer Program, or pause M11? **Default: pause and ask you again with the facts.**
  - **(M11-q4) Which data.** **Default:** weight, workouts from other apps (e.g. WHOOP activities), active calories, sleep, resting heart rate, HRV. Nothing else (no steps, SpO₂, temperature, live heart rate during sets). Each has its own switch in Settings → Health. Add or drop any? (🧍 task 2: please check Health app → Apps → WHOOP and tell us which types WHOOP writes on your phone.)
  - **(M11-q5) Should Gym Clean ever write your gym sessions into Apple Health** (as "Traditional Strength Training" workouts, so WHOOP/Health see them)? **Default: no for M11** (read-only, simpler, no write permission). Could be a later opt-in switch.
  - **(M11-q6) The "Lighter today?" rule.** **Default:** the card shows only when **2 or more** of these hold — sleep ≥ 1 h under your usual, HRV ≥ 15% under your usual, resting HR ≥ 5 bpm over your usual, a ≥ 60 min or hard outside workout in the last 24 h. It offers Lighter today / Not today / Train as planned, and nothing changes unless you tap Apply. If it fires on 3 of 7 days, it offers a Deload week instead (at most every 14 days). Too eager, too quiet, or OK to start and tune at Checkpoint H?
  - **(M11-q7) Where health data may go.** **Default:** stays in the app only: not in Back up files, not in the developer log, never sent to the Claude coach (phase C). Apple's on-device coach (phase B) gets only the card's reasons. Imported weigh-ins are normal weigh-ins and do go into backups. OK?
  - **(M11-q8) Activity level from Health.** **Default: yes:** at the Fuel weekly check, if your active calories fit a different activity level than the one set, the card asks "Switch to 'moderate'?" (never by itself). Or leave Fuel's activity level alone?

- **New (M7b food photos, local part, planned 2026-11-15; not blocking. The defaults below are what gets built unless you say otherwise):**
  - **(M7b-q1) Training data licence.** The datasets the SPEC names (THFOOD-50/100) look like non-commercial research only, so a model trained on them can't be published in the public repo or site. **Default:**
    - if task 1 finds a dataset that allows training and publishing, the cloud session trains on it and the app ships the model;
    - if not, the pipeline is built and tested, and **you** train on your Mac with THFOOD (after reading its terms) plus your own photos;
    - you then import the model in Settings. It stays on your phone and is never committed.
    - Is that OK? And would Google Colab (free GPU) be OK for the public-data part? Your photos stay on your Mac either way.
  - **(M7b-q2) Which dishes the camera knows.** **Default:**
    - it only learns dishes that are already in the 47-dish Thai list;
    - look-alikes share one guess (pad kra pao pork / chicken / shrimp → you pick the kind in the sheet; pork comes first);
    - dataset dishes that aren't on the list are dropped, and listed in `ml/DATASETS.md`. Tell us which to add (each one needs a reference recipe first).
  - **(M7b-q3) When it isn't sure** (top guess below 60%). Without the Claude backup, **default:** show the top 3 with nothing preselected, plus "Not sure. Pick one or search." Above 60%, the top guess is preselected.
  - **(M7b-q4) No model on the phone yet.** **Default:** the log sheet shows "Log from a photo: add a food model in Settings." in place of the Photo button. Alternative: hide it completely until a model exists.
  - **(M7b-q5) Saved photos.** **Default:**
    - when "Save photos to improve recognition" is on, each confirmed photo is saved at ≤ 512 px (about 50–100 KB), labelled with the dish;
    - turning the setting off stops saving but keeps what's there until you tap "Delete saved photos";
    - no limit, and the count is shown.
    - Is 512 px enough? (The model looks at 224 px.)
  - **(M7b-q6) Showing confidence.** **Default:** a small "82%" next to each guess. Alternative: words ("likely" / "maybe") or nothing.
  - **Paid accounts:** none for this part. Step 4 (Claude backup) still waits on the paid key and on your choice of proxy or your own key stored on the phone.

- **M9 native iOS shell: ANSWERED 2026-11-15 — Wongsaton: "Go with your defaults for all 9, I'm using iPhone 17 Pro". q1 free Apple ID first; q2 ios-engineer added to CLAUDE.md (its agent file in the main checkout still needs the §M8 / HealthKit / spike-order fix: Claude is not allowed to edit .claude/agents there; M9 briefs override it); q3 iOS 26.0; q4–q8 defaults; q9 Xcode: installed at /Applications/Xcode.app but `xcodebuild` fails to load CoreDevice ("Error loading required libraries… reinstall") — he must open Xcode and finish/repair its component install before task 3. (Was: planned 2026-11-15; BLOCKING: no code until you answer, or say "go with the defaults"). The platform facts are in Decisions "M9 native shell plan" and get re-checked against live docs before any code:**
  - **(M9-q1) How the app gets signed.**
    - **Free Apple ID:** costs nothing. The app stops opening 7 days after each install until you plug in (or same Wi-Fi) and re-run it from Xcode on your Mac. At most ~3 such apps on the phone. No TestFlight.
    - **Paid Apple Developer Program:** US$99 a year (billed in baht). Signing lasts a year, updates install from the TestFlight app over the air (each build lasts 90 days), no Mac needed after each change.
    - **Default:** start free to prove ducking, camera and screen-on; decide at Checkpoint G whether the weekly re-sign is worth US$99/year to avoid. Nothing in M9 needs the paid account.
  - **(M9-q2) Owner for the native code.** OK to add this line to the CLAUDE.md "Agent team" table? `| ios-engineer | ios/**, capacitor.config.ts, src/native/** (Capacitor shell, Swift plugins, TS bridge), docs/ios-setup.md, scripts/gen-trainer-tools.mjs (M10 B3) |`. The agent file `.claude/agents/ios-engineer.md` already exists, but it mentions a "SPEC §M8" that doesn't exist, starts with an AirPods head-motion spike and lists HealthKit (out of scope in SPEC §6). **Default:** yes to the line, and the agent file is updated to match SPEC M9 (head motion / HealthKit removed until a milestone covers them). The M10 phase B tasks tagged `[main, until an owner exists]` move to ios-engineer.
  - **(M9-q3) Minimum iOS.** **Default: iOS 26.0**, since it's only for your iPhone 17 Pro and Apple's on-device model needs 26 anyway. Alternative: Capacitor's floor (iOS 15) if another phone should run it.
  - **(M9-q4) Which native features first.** **Default, in M9:** the shell itself (offline, camera), **voice that ducks music** (the original reason), **screen stays on**, light **haptics** on Set done / Apply, and **Back up / Restore** to move your history in. **Next (M10 phase B):** Apple's on-device coach brain. **Later, only if you want them (each gets its own spec):** AirPods head motion, notifications (e.g. "rest over" while the phone is locked), HealthKit / Apple Watch (currently out of scope). Want anything moved up or dropped?
  - **(M9-q5) How updates reach your phone.** **Default:** the web app is bundled inside the native app (works offline, nothing loaded from the internet). An update = `npm run ios:run` from your Mac (free route; this also renews the 7 days) or a TestFlight build (paid route). Alternative: the app loads the GitHub Pages site, so updates arrive like the PWA, but it then needs the network on launch and loses offline use.
  - **(M9-q6) Keep the PWA?** **Default: yes.** GitHub Pages stays the main app and keeps working unchanged; the native app is an add-on. You'd pick one for daily logging, because their data is separate (see q7).
  - **(M9-q7) Moving your data.** The app can't see Safari's storage. **Default:** Settings → Back up in the PWA, Restore in the app (one file through Files / AirDrop, never uploaded). The developer log isn't included (it's large); a coach API key never is. OK?
  - **(M9-q8) App name and bundle id.** **Default:** "Gym Clean"; the bundle id (e.g. `com.<you>.gymclean`) and your team id live only in a local, gitignored Xcode file, never in the public repo.
  - **(M9-q9) Xcode on your Mac.** Is Xcode 26 installed (with the iOS simulator)? The helpers run on this Mac, so they can do simulator builds themselves; signing in with your Apple ID, Developer Mode on the iPhone and the first install are yours (🧍). **Default:** you install Xcode before M9 starts.
- **New (M10e equipment-aware swaps, planned 2026-11-15; not blocking. You're travelling, so the defaults get built):**
  - **(M10e-q1) Leg Press replacement order.** **Default:** Smith machine squat first, then barbell back squat in the half rack (safeties set), then a dumbbell split squat. Same 4 × 10–12; the weight is blank the first time ("pick your weight").
  - **(M10e-q2) Standing calf raises (Legs A).** The plan's version uses a calf machine, and none was seen. **Default:** the coach offers a swap once (Smith machine calf raise, then standing dumbbell calf raise). If you already do them on the smith, tap Keep it.
  - **(M10e-q3) Leg curl machine.** Is the Matrix combo a **seated** or a **lying** curl? **Default:** it counts for both Lying Leg Curls and Seated Leg Curl, so no prompt.
  - **(M10e-q4) Face pull and pushdown with the single D-handle.** **Default:** one arm at a time, reps per side (same numbers as the plan); the how-to says "handle", not rope/bar. Alternative: pushdown with both hands on the lat bar.
  - **(M10e-q5) Cable crossover / cable chest press with one handle.** **Default:** counted as doable (one arm at a time, or a second handle if there is one), so no prompt.
  - **(M10e-q6) "Just today".** **Default:** the prompt comes back next Legs B; "Keep it" stops it until you change My gym. OK?
  - **(M10e-q7) Logging barbell and smith weights.** **Default:** barbell = plates + bar (a standard 20 kg / 45 lb bar); smith = only the plates you add, because smith bars differ. The how-to says so.
  - **(M10e-q8) Pull-up bar on the half rack** (likely, unconfirmed). **Default:** not in your profile; tick it in My gym if it's there.
  - **(M10e-q9) The Torque plate-loaded leg/glute machine.** What is it (hack squat, pendulum squat, hip thrust, leg press)? If it's a leg press or hack squat, Leg Press might not need a swap at all. **Default:** not counted as a leg press until you say.
- **New (M7 Fuel, planned 2026-11-15; not blocking. The defaults below are what gets built unless you say otherwise):**
  - **(M7-q1) Meal slots.** Entries get a slot from the time, and you can change it. **Default:**
    - breakfast before 10:30, lunch 10:30–14:30, snack 14:30–17:30, dinner 17:30–21:30, snack after that;
    - "post-workout" for anything logged within 2 h after you finish a workout.
  - **(M7-q2) Weekly check day.** **Default:** weeks run Monday–Sunday. On Monday the card compares last week's average weight with the week before. It stays until you Accept or tap Not now.
  - **(M7-q3) Quick-estimate presets** (Light / Regular / Big plate). **Default:** each preset fills in starter kcal + protein that you edit before logging. The values are typical-plate guesses, not yours. Your saved favorites ("Thai place near work — pad see ew") keep your own numbers. Alternative: the presets multiply the numbers you typed by 0.75 / 1 / 1.4.
  - **(M7-q4) Protein shake.** The repo is public, so it ships with placeholder values. **Default:** the first time you log it, the app asks you to enter the numbers from your product's label (kept only on your phone).
  - **(M7-q5) Barcode: build it now?** **Answered 2026-11-15: "Yes, off by default".** **Default: yes, as the last part of M7, off by default.**
    - The lookup goes to Open Food Facts (free, no account) and sends only the barcode number. Results are saved to My foods so the next scan works offline.
    - iPhone Safari can't read barcodes by itself, so scanning adds a small on-device scanning library to the app (roughly 1 MB; the exact size gets checked).
    - Typing the digits always works.
    - Alternatives: typed digits only, or skip barcode until later.
  - **(M7-q6) Evening nudge.** **Default:** shown only when you open the app, after 19:00, if protein is under 75% of the target. At most once a day, and it can be dismissed. Example: "40 g protein to go today." Never pushed or spoken.
  - **(M7-q7) Where Fuel goes.** **Default:** a 4th tab, in the order Today / Fuel / History / Settings.
  - **(M7-q8) When a food day ends.** **Default: at midnight.** A snack at 00:30 counts toward the new day. Alternative: the day ends at 03:00.
  - **(M7-q9) Thai dish list and portions.** **Default:**
    - the ~40 dishes are the SPEC examples plus other common dishes;
    - Small / Regular / Large = 0.75 / 1 / 1.4 × a typical plate.
    - Tell us any dishes you eat often that should be on the list. You can also save your own as recipes or quick-estimate favorites.
  - **(M7-q10) Weigh-ins.** **Default:** one weigh-in per day (entering again replaces it), done in the morning. The app doesn't check the time.
  - **(M7-q11) First targets.** Targets need your weight. **Default:** setup asks for today's weight and saves it as your first weigh-in.
  - **Paid accounts / external services:** none needed for M7.
    - USDA FoodData Central bulk files are free public downloads; the API key route isn't used.
    - Open Food Facts is free, with no key.
    - The only things that need a paid account are in M7b (Claude backup) and M10 phase C, and both are out of M7.
- **New (M4f Camera for more exercises, planned 2026-11-14; not blocking. Per "I confirm everything you need right now", the defaults below are what gets built unless you say otherwise):**
  - **(M4f-q1) Curl and row style.** Hammer curls, incline curls and the bent-over row: do you move both arms together, or alternate? **Default: both together.** The phone sees you side-on and counts the near arm, so alternating would count only half your reps.
  - **(M4f-q2) One arm or leg at a time** (concentration curls; step-ups in wave 2). **Default:**
    - the camera counts the arm or leg nearest the phone, and reps are per side, as the plan already reads (10–12);
    - do that side first: hands-free says "Set done" about 6 s after it, and the other side isn't counted;
    - known cost: the rest clock starts when the first side ends, so "rest taken" includes the second side.
    - Alternative: you turn around between sides and the camera counts both sides into one set. That's more work and needs your OK.
  - **(M4f-q3) Partial hints while learning.** **Default: spoken as usual** ("Curl higher."), so you know why a rep didn't count and can fix it on Rest. Alternative: shown only, until the exercise is tuned.
  - **(M4f-q4) Hands-free and the focus score while learning.** **Default: both on.** A wrong auto stop still has Undo, and a wrong count has Fix. Alternative: hands-free off for learning exercises.
  - **(M4f-q5) The original six.** The curl, row and squat have never seen your real reps either. **Default: they stay as they are, with no "Learning" badge.** Alternative: mark them Learning too, which also turns their "Full range." cue off until real data confirms them.
  - **(M4f-q6) Lunges (wave 2).** The camera counts every lunge, left and right. **Default: the target becomes the total**: 10–12 per leg → 20–24 per set in the plan. Alternative: keep per-leg targets and halve the count (an odd count rounds up).
  - **(M4f-q7) Phone spots in your gym (wave 2).** The lat pulldown needs the phone **2–3 m behind you** at head height, because the machine blocks the front. Face pull, pushdown and the cable row need it **side-on, 2–3 m from the cable station**. Is there room? **Default: yes.** If not, that exercise stays manual. **PARTLY ANSWERED 2026-11-15 from the photos: open floor beside the main cable tower (2–3 m side spot OK); see Decisions "Gym equipment (M10-q6)".**
  - **(M4f-q8) Committing your real sets.** **Default:** after each gym checkpoint we commit, as landmark numbers only (never video), just the sets you OK, like B-q5. Those sets are what moves an exercise from Learning to tuned.
  - **(M4f-q9) Triceps extension.** **Default: one dumbbell overhead with both hands** (the how-to). Alternative: one arm at a time, which would follow M4f-q2.
- **New (M10 AI trainer, planned 2026-11-14; the defaults are what gets built if you say "go"):**
  - ~~**(M10-q1) Rest days and "Not today".**~~ **Answered 2026-11-15: "No fixed rest days".** Default schedule now has `restWeekdays: []`; rest weekdays still work when set. Original question: Which weekday(s) are your rest days? Default: Sunday. When you postpone, should the coach use this week's rest day so you still get 6 sessions ("use rest day", the default), or slide the whole week by a day ("push week")? Both are offered; which one should be preselected?
  - **(M10-q2) "Go easy on my arms".** Exercises where arms are the **main** target (curls, triceps work) get swapped or removed. What about exercises where arms only **help** (rows, presses, pulldowns)? Default: keep them, 10% lighter. Alternatives: swap those too, or leave them as planned. **ANSWERED 2026-11-15: "yes" — the default (helper exercises stay, 10% lighter).**
  - **(M10-q3) Lighter today / deload.** Default for "Lighter today": 1 set fewer (at least 2) and 10% lighter, with bodyweight exercises at 20% fewer reps. Default for "Deload week": half the sets and 10% lighter for 7 days. OK?
  - **(M10-q4) "Stalled".** Default: no progress on an exercise's best set for 3 sessions in a row. The options offered are "10% lighter and build back up" or "+1 set". Right trigger, right options?
  - **(M10-q5) Language.** Will you type to the coach in English, Thai or both? Default: English, plus Thai keywords for the common cases (พรุ่งนี้, เจ็บ, ปวด, แขน, ขา…). Note: Apple's on-device model may not support Thai yet; we'll check when phase B starts.
  - **(M10-q6) Your gym's equipment** (for swaps): dumbbells and a bench for sure. Which machines and cables are there (lat pulldown, cable stack, leg press, leg curl/extension, calf machine, pull-up bar, …)? Swaps only suggest what's on the list. **ANSWERED 2026-11-15: from his 41 gym photos (kept private, `private/gym-equipment-photos/`, never committed); list in Decisions "Gym equipment (M10-q6)".**
  - **(M10-q7) Phase C (Claude).** It needs a **paid Anthropic account** and your own API key, pasted into the app and kept only on your phone. When it's on, your messages, plan and workout numbers go to Anthropic (never notes, camera or the dev log). Do you want it at all? If yes: default model `claude-opus-5-5`, or a cheaper one?
  - **(M10-q8) Order.** Build M10 phase A right after M6 merges (before M7 Fuel)? Also, CLAUDE.md says to finish milestones in order, and Checkpoints C/B3 are still open. OK to build M10 phase A while those wait? Food tips need M7, so they come after it either way.
  - **(M10-q9) Native shell (M9) and its owner.** **Superseded 2026-11-15 by M9-q1–q9** (M9 is now specified and planned on paper). Original question: The SPEC only has an M9 outline. Phase B needs it planned first: Capacitor iOS app, how it gets on your phone (Xcode on your Mac with a free Apple ID, which re-signs every 7 days, or a paid Apple Developer account for TestFlight). There's also no agent that owns `ios/**` and `src/native/**`. Add one (e.g. `native-engineer`) to the CLAUDE.md table? That needs your OK.
  - **(M10-q10) How good must the on-device brain be?** Default bar: the right action and arguments on ≥ 85% of the example requests, and 100% safe replies. Higher or lower?
  - **(M10-q11) Updating the default program.** If I change `program.json` later and you've already edited your plan with the coach, default: keep your plan and show "a new default program is available" (Use it / Keep mine). OK?
  - **(M10-q12) Chat history.** Default: the chat isn't saved; only the list of applied plan changes is kept (for Undo). Want the conversation kept on the phone?
  - **(M10-q13) Red flags.** For phrases like chest pain, dizziness or numbness, the coach only says "Stop the workout for today and get checked by a doctor." and offers End workout / Not today. OK?
- **A-q7 (small):** Legs days show the figure from the back, because hamstrings plus calves outweigh the quads by area, even though the quads get the most sets. Should Legs show the front instead?
- **A-q6 (Volt):** with the Volt accent, achieved items turn gold, which looks close to the amber used for warnings (overtime, on hold). Keep it, or change one of them? **ANSWERED 2026-11-15: "keep it".**
- **A-q5 (new bests):** should a rep best at a lighter weight you've used before count? For example 20 kg × 10 when your best at 20 kg was × 8. As built, only a heavier top set, or more reps at your top weight, counts. **ANSWERED 2026-11-15: "no" — as built, only a heavier top set or more reps at the top weight counts.**
- **🧍 Checkpoint B3 (hands-free gym test, waiting for his report):** train a day with hands-free on, note every wrong auto start/stop and whether 6 s stillness / the 5 s Undo feel right, then export the dev log.
- ~~M4e design pick~~: answered, the mix (Decisions 2026-11-13 night).
- ~~Press, "first press = positioning"?~~: answered, no; the counter stays at 8.
- ~~Push-up set with a sit-down break~~: answered, one set, "tap to continue" (plan above).
- **New (M5c follow-up, not blocking; the defaults are built, see Decisions 2026-11-14):**
  - **(B-q1) Set ends with a walk-away or a long bend.** A walk-away or a ≥ 5 s bend at the **end** of a set looks the same as a mid-set break, so that set waits for a tap ("Start next set" / "Save set"). Until the tap, the rest clock cues ("Ten seconds", "Go") don't play; the save is backdated, so rest taken is still right. Default: as decided ("doesn't end the set"). Alternative: after a break, standing still in place for 6 s ends the held set like a normal stop, and a tap is only needed if you start repping.
  - **(B-q2) Reps done during the hold, before you tap.** Default: not counted, and you hear "Tap Continue to count.". Alternative: they're added when you tap Continue.
  - **(B-q3) A break during rest** (after a normal stop): auto start stays on. OK?
  - **(B-q4) Timings:** 5 s of sitting or bending = a break; 3 s out of frame = a break. Retune at Checkpoint B3.
  - **(B-q5) Push-up fixture:** OK to commit the landmark JSON (no video) of the real push-up set as a fixture, labelled one set of 11?
- **New (M4e, not blocking; defaults in the plan):**
  - **(A-q1) Streak:** how many workouts make a week count? Provisional: 3 (`STREAK_MIN_PER_WEEK`, one constant).
  - **(A-q2) History tab:** it doesn't exist yet, so the tab bar is Today / Settings. OK?
  - **(A-q3) +30 s:** it counts as planned rest, so no overrun is flagged for the extra 30 s. OK?
  - **(A-q4) "Skip rest" button:** step 1 proposed one; the plan relies on Start set instead. OK?
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
- ~~🧍 M4e (later): pick one of the 2–3 visual directions~~: done, the mix.
- **🧍 Checkpoint B: fixture videos still outstanding. Next gym visit.** Not blocking M4 day to day (it runs on synthetic fixtures), but M4 isn't fully done until these pass (M4 task 15). Record per SPEC §5 into `fixtures/videos/<folder>/<label>__reps-<n>__partials-<m>.mp4` (gitignored, never committed). Folders: `curl`, `push-up`, `shoulder-press`, `row`, `goblet-squat`, `lateral-raise`. For each: one clean clip, plus one with 2–3 partial reps and fast lowering, 10–30 s. Then tell me and I'll run `npm run landmarks`.
- **Question (not blocking): should "count reps out loud" default to on or off?** The plan defaults it to **on** ("voice over screen" rule). It's a toggle in Settings either way.
- ~~Camera test fps~~ — done: 30 fps on the phone, inference stays on the main thread.
- **Checkpoint A:** do one real session from https://wongsatonk.github.io/gym-clean/ and report what felt off, what annoyed you, and what you never used. Things worth checking: do the voice cues play with the screen on and the phone silent switch off? Does the screen stay awake? Are the starting weights in the program close?

