# Coach tab: chat with a personal trainer + app-wide motion (design, 2026-11-16)

## Intent (his words)
"Redesign the coach; move it to the middle of the tab. I need it interactive with me, can talk everything on
it like a chat with my personal trainer. Also, add animation to the app to make it best UX."
Answers: brain = **both, Apple's on-device model first, Claude optional**; input = **typing and a mic**;
language = **English** (chat, mic locale `en`; Thai is not supported in v1); timing = **start slice 1 now**,
alongside his Checkpoint H week (his call, 2026-11-16).
Later (his words): "The coach will have the knowledge if I need him to help me plan the week of exercise such
as this month I need to build my chest, he will help me write a plan for each day."

Why: today's coach is a sheet with chips and a keyword matcher; free text it doesn't recognise gets
"I can help with:". He wants a real conversation he can reach in one tap, and an app that feels polished.

## Goals
1. **Coach is a tab in the middle of the bottom bar**: Today · Fuel · **Coach** · History · Settings. The
   Coach tab is visually distinct (raised/filled centre button) but keeps the tab-bar rules (≥ 56px, label,
   active state).
2. **A chat screen**: message bubbles (his on the right, coach on the left), a text box, a send button, a
   hold-to-talk **mic** button, quick-action chips above the input (the M10 chips stay as shortcuts), and
   Proposal cards inline in the thread (before → after, why, Apply / Not now, then Undo — the M10 path).
3. **Free conversation** about his training, plan, exercises, form cues, food and his targets, his week and
   his Health card reasons. Off-topic or medical questions get a friendly redirect (M10 safety rules).
4. **Brains, in order:** (a) chips → rules directly; (b) free text → **Apple Foundation Models** on the
   iPhone app when available (M10 phase B, `GymBrain` plugin, tools 1:1 with M10 actions); (c) else
   **Claude** if he turned it on (M10 phase C, his own key, stored only on the phone); (d) else the rule
   matcher. Settings shows which brain answers and why ("Apple Intelligence is off", …). A per-message
   "Ask Claude instead" action is offered on a coach reply when Claude is on.
5. **Mic (iPhone app):** hold to talk; on-device speech-to-text (Apple Speech, `requiresOnDeviceRecognition`
   or the iOS 26 SpeechAnalyzer — check current docs); his words appear live in the input; release sends.
   Coach replies are shown, and **spoken** with the chosen coach voice (Calm / Drill sergeant) when "Speak
   replies" is on (default on for mic-sent messages, off for typed). Never speaks or listens mid-set.
6. **Motion across the app** (see Motion).

## Non-goals / anti-goals
- No change applies without his tap (M10 core principle). The model never writes data by itself.
- No medical advice, diagnosis, or injury talk beyond the M10 referral/red-flag lines.
- No AI-written programs (§6).
- No audio recording or upload: speech is turned into text on the phone; audio is never stored or sent.
- The coach is not reachable during a set or from the camera (M1b rule) — the tab bar is hidden there, as now.
- Claude never receives Health data (M11-q7); only what the phase C explainer lists.
- Motion must never slow a tap or hide state; anti-goal: "fancy but sluggish".

## Constraints
- Phone-first, dark, readable at 2 m: bubble text ≥ 20px, buttons ≥ 56px, high contrast.
- Privacy (CLAUDE.md): phase A/B and the mic stay on the phone, no network. Phase C only while on.
- Apple's model: small context window → the M10 compact context block + last N turns, with a test-enforced
  token budget. Check current Foundation Models + Speech API docs before building (CLAUDE.md rule 8).
- PWA (Safari): Coach tab + chat still work with chips + rules (and Claude if on). The mic is native-only
  in v1 (Safari's speech recognition may use Apple servers; not worth the privacy ambiguity).
- New iOS permissions: Microphone + Speech Recognition (usage strings, asked on first mic use only).
- M10 SPEC lists "speech recognition in the app" as a non-goal — this design reverses that (SPEC edit).

## Approaches considered
- **Brain:** A Apple only (free, private, iPhone only, shallower) · B Claude only (smart, costs, data
  leaves phone) · **C both, Apple first — picked by him.**
- **Input:** typing only · **typing + hold-to-talk mic — picked by him** · always-listening (rejected:
  battery, privacy, other people in the gym).
- **Placement:** keep the sheet + add a tab (two ways to the same chat) vs **tab only, sheet kept just for
  the Pause sheet mid-workout (between sets)** — my call: the tab is the home; Today's Coach button and the
  Lighter-today card open the tab with the chip pre-sent; the Pause sheet keeps a compact sheet version of
  the same chat component.


## Focus block: the coach writes a plan (his request; reverses the §6 / M10 non-goal "AI-written programs")
- He says e.g. "This month I want to build my chest." The coach asks only what's missing (focus muscle group,
  weeks 2–6, training weekdays) and proposes a **focus block**: every day for the next N weeks.
- **The app builds the block, deterministically** (pure core, tests first): from his current plan, his gym
  kit (M10e `canDo`), the vendored exercise list and rules as data — focus group gets ~+30–50% weekly sets
  and appears on 2 days/week, other groups held at maintenance, last week is a lighter week, set/rep ranges
  and exercise picks follow the existing program's style. The brain (rules, Apple or Claude) only picks the
  parameters and explains; it never free-writes workouts.
- Shown in the chat as a **week-by-week card** (expand a week → days → exercises). He can ask for edits
  ("swap Thursday's flyes", "only 4 days a week") → a revised block. **Apply** replaces the plan for those
  weeks (dated, like overrides); **Undo** / Settings → Plan changes restores the previous plan; when the block
  ends the plan returns to his normal rotation (or he keeps it).
- Works with the rule brain too (chips: "Build a focus block" → focus picker → weeks → weekdays), so it is
  in **slice 1**. SPEC §6 and M10 non-goals get edited to allow this.

## Calendar + proof of completion (his request at approval, 2026-11-16: "Add the feature for the calendar
to the app as well. I need the coach to follow my plan, help me prove I finished the plan he made for each
exercise, each day, week, month")
My calls (correctable):
- The **History tab becomes "Calendar"** (5 tabs stay: Today · Fuel · Coach · Calendar · Settings). Top: a
  **month grid**; each day shows planned vs done (done = filled ring, partly done = partial ring by sets
  completed / sets planned, missed = hollow, rest = dim, focus-block days marked). Tap a day → that day's
  plan with **each exercise ✓ / partly / missed** (sets and reps done vs planned, from logged sessions) and a
  "Train this day" / "Move" action. The existing per-exercise history stays one tap deeper.
- **Week and month scores:** "This week: 4 of 5 sessions, 92% of planned sets"; month the same, plus the
  focus muscle's weekly sets vs the block's target. Streaks keep working.
- **The coach follows the plan:** it reads these scores (context + a read-only `progressSummary` tool and a
  rule answer for "How am I doing?"), mentions a missed day once on Today with an offer to move it, and at the
  end of a week / focus block posts a short recap in the chat.
- **Proof:** a "Share month" card (an image made on the phone: the month grid + scores, no body data) he can
  save or share himself; nothing is uploaded by the app.
- Completion is computed (pure core, tests first) from the plan + overrides + logged sessions; no new
  manual check-off (logging sets is the proof). A day done with **Train anyway** counts as extra.
- In **slice 1**.

## Chat details (my calls, correctable)
- **History:** the thread is kept on the phone (Dexie `chatMessages`), last 30 days, with "Clear chat".
  Not in backups, not in the dev log (dev log keeps ids/numbers only, as M10). Resolves M10-q12 as "keep".
- **Context for the brain:** today's plan, next 7 days, 4 weeks of top sets, active overrides, today's
  Fuel totals vs targets, the M11 card reasons (Apple only), and the last ~8 turns.
- **Streaming feel:** a typing indicator while the model works; Apple's model replies appear word by word
  if the API streams, else the whole reply fades in.
- **Starters:** an empty thread shows 3–4 suggestion chips ("How's my week?", "Swap today's squat",
  "What should I eat tonight?", "Go easy on shoulders").
- **Failures:** a model error falls back to the next brain with a one-line note; never a dead end.

## Motion (my calls, correctable)
- Tokens: `--dur-fast 120ms`, `--dur-base 220ms`, `--dur-slow 320ms`, one standard ease + one spring-ish
  ease; transform/opacity only; everything off under `prefers-reduced-motion` (instant swaps).
- Tab switches: short cross-fade + 8px slide in the direction of travel; the tab indicator slides.
- Sheets: slide up with a backdrop fade; drag-to-dismiss where a sheet already exists.
- Chat: bubbles rise + fade in; typing indicator dots; mic button pulses while listening with a live level ring.
- Buttons/chips: press scale (0.97) + highlight; Apply → a check morph; Undo toast slides up.
- Today: cards stagger in on first load; numbers (streak, kcal, reps) count up briefly; the readiness card
  slides in; set complete → a quick ring fill. Rep counter number keeps its current behaviour (no motion
  that could make it hard to read mid-set).
- No motion on the Exercise/camera screen during a set beyond what exists (readability first).


## Scope and slices (builder check, my calls)
This is a new milestone, **M12 — Coach tab**, that also builds M10 phases B and C, in three slices:
1. **Slice 1 (web + iPhone, no new brain):** Coach tab, chat screen + history, chips + rules, inline
   Proposals, motion across the app. Rules gain answers for "How's my week?" (from the week strip / weekly
   load) and "What should I eat?" (M10 food suggestion via Fuel targets).
2. **Slice 2 (iPhone):** Apple brain (`GymBrain` plugin, M10 phase B tasks) + the mic (speech plugin).
3. **Slice 3:** Claude brain (M10 phase C). His "Go both" counts as the yes to build it (M10-q7); default
   model `claude-opus-5-5` per SPEC; nothing calls Anthropic until he pastes his own key in Settings.
Each slice ends with reviewer + verifier; slice 2 ends with an on-iPhone check by him.

## Builder-check answers (my calls)
- **Free answers:** the model may answer from the context block without a tool. Read-only tools are added
  for facts (`weekSummary`, `exerciseInfo`, `foodIdeas`); every change still goes through a `propose*` tool.
  Replies ≤ 4 short sentences. M10 safety rules unchanged (banned words, referral line, red flags).
  Eval adds a "facts" set: numbers quoted must match the context (100%), plus the M10 bars (85% right
  action, 100% safe).
- **Health never reaches Claude:** messages store `usedHealth: true` when their context included M11 card
  reasons; Claude requests drop those turns and never get Health context. A request-body test enforces it.
- **Spoken replies:** every reply has `text` (shown) and `say` (≤ 12 words, ≤ 8 mid-workout) — only `say`
  is spoken, in the chosen voice. With Drill sergeant on, the brain gets a style line for `say` (still
  passes the copy checks); `text` stays plain.

## Left to the builder
Exact Foundation Models / Speech API usage, plugin method shapes, token budget numbers, the chat
component's file layout, the Dexie version bump, and the e2e strategy (fake `GymBrain` + fake speech bridge,
like M11's fake GymHealth).

## Open for him later (not blocking)
- Claude key: he adds it himself in Settings when he wants Claude (paid Anthropic account).
