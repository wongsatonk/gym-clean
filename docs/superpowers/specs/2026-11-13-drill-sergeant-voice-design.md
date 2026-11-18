# Drill-sergeant coach voice — short design (2026-11-13)

## Intent
Wongsaton wants an extra coach voice: male, with a strong accent, rude, and full of energy, so the
app pushes him harder mid-set. It is an option next to today's calm voice, not a replacement.

## Approaches
- **A — Built-in iPhone voice + rude script (picked).** It uses Web Speech `speechSynthesis` with a
  male English voice chosen from the voices on the phone, faster and lower, plus a rude set of lines.
  Free, can ship tonight, and works offline. The limit is that the voice reads the lines flatly; it
  can't shout.
- B: Recorded lines (AI voice service or his own recordings) played as audio. Real shouting, but it
  needs a paid account or recording time, and the lines are fixed. Kept as a possible upgrade.
- Ruled out: a cloud TTS call per line. It needs a network at the gym and an API key, and
  everything stays on the device.

## Design
- **Settings → "Coach voice":** Calm (today) / Drill sergeant, plus the Rudeness level below. Saved like the other settings. Next to
  it is a voice picker that lists only the male English voices installed on the phone, chosen by a
  known-name list:
  - US: Aaron, Fred, Evan, Nathan, Tom
  - UK: Daniel, Arthur
  - Australia: Gordon
  - India: Rishi
  - iOS character voices: Rocko, Eddy, Reed, Grandpa
  
  Default: the first one found from Daniel (UK) → Arthur (UK) → Rocko → Aaron → Fred. "Test voice"
  speaks one line in the chosen voice.
- **Delivery:** rate about 1.15 and pitch about 0.8 for drill sergeant; calm stays at 1.0 / 1.0.
- **Script:** a new pure data module, `src/core/personas.ts`, maps each spoken message to 2–4
  rude variants, rotated so the same line doesn't repeat back to back. It covers partial hints,
  rest cues ("Ten seconds", "Go"), hands-free "Set done / Keep going / Camera off", coach tips,
  and the M5 focus cues. **Count words stay plain numbers** so the count is never late.
  Examples:
  - Partial: "Half a rep? Curl it all the way up!"
  - Ten seconds: "Ten seconds. Quit stalling."
  - Go: "Go! Get under that weight!"
  - Set done: "Set done. Eight reps. Don't get comfy."
  - Keep going: "Did I say stop? Keep going!"
  - Tip: "Next time: two and a half kilos more. You can handle it."
- **Rudeness level (Wongsaton, 2026-11-13: "option to select how rude … unlocked for every word, up to a
  maximum"):** a 3-step setting, shown only when Drill sergeant is picked, saved like the other
  settings:
  1. **Tough:** no swearing ("Move it! Full range!").
  2. **Rude** (default): mild words such as damn, hell, ass ("Half a rep? That's a damn warm-up.").
  3. **Savage:** every word unlocked, including full profanity such as shit and fuck ("Did I say stop? Get the fuck back
     under that weight!").
  
  Each line is written per level. A higher level may reuse lower-level variants. The script data
  carries the level, and a test checks that no line uses a word above its level.
- **Hard limits at every level (not settings):** no slurs or insults about identity, no jokes about
  body, weight or looks, no "push through the pain" and nothing about injury (CLAUDE.md's no medical
  claims rule), and form cues still say the actual fix. The lines are written into the app;
  nothing is generated live. A test checks a banned-word list across all lines.
- The speech policy is unchanged: one cue per 6 s, never over the count, and spoken even when a screen
  shows the same thing.

## Non-goals
Real shouting audio (that's option B), voice input, and per-exercise personalities.

## Left to the builder
The exact lines, the variant rotation, and how the picker shows a voice's accent.

## Status
Approach A picked (2026-11-13). Wongsaton added the rudeness level and asked to build it. Accent: no
preference given, so the default order applies, and he can pick from the voice list.
