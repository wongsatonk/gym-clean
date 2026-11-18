# Gym Clean: Story pack drafts (M13)

Drafts only. Nothing has been posted. Post them yourself if you want to, in this order.
Every screen shown is the made-up demo profile from the store screenshot set (no real weights, food or
body numbers). Add music inside Instagram if you want it; the frames have none.

Frames: 1080×1920 PNG, one Story each (about 5 s on screen). Re-render with
`node docs/social/m13/src/render.mjs` after editing `src/frames.html`.

| # | File | On the card (EN / TH) | Alt text |
|---|---|---|---|
| 1 | `story-1-hook.png` | I built my own gym app. / แอปออกกำลังกายที่ผมสร้างเอง · "Your pocket strength coach." | Dark card with the Gym Clean logo and the headline "I built my own gym app." Three phone screens below show the app's Today plan, a guided set and the food tracker, labelled as a demo profile with made-up numbers. |
| 2 | `story-2-coaches-every-set.png` | It coaches every set. / พาเล่นทีละเซ็ต บอกกล้ามที่ใช้ · chips "Target muscle in 3D", "Cues read out loud" | Headline "It coaches every set." A phone shows a set screen for a stiff-legged dumbbell deadlift: set 1 of 4, a 3D figure with the hamstrings lit in blue, the spoken cue "Hips back, feel the hamstring stretch.", and 12 reps at 10 kg. |
| 3 | `story-3-plan-and-food.png` | Today's plan. Today's food. / แผนซ้อมกับอาหาร อยู่ในแอปเดียว | Headline "Today's plan. Today's food." Two phones: one shows the next workout, Full body B with 7 exercises, about 45 minutes; the other shows calories, protein, carbs and fat still to go for the day, each marked "estimate". Demo profile, made-up numbers. |
| 4 | `story-4-privacy.png` | Everything stays on this phone. / ข้อมูลทั้งหมดอยู่ในมือถือเครื่องนี้ | A lock icon and the headline "Everything stays on this phone." Three ticks: the camera counts reps on the phone and no video is saved or sent; workouts, food and body numbers are stored only on the phone; no account, no ads, no tracking. A box notes the one exception: barcode lookup is off until you turn it on, and then sends only the barcode number. |
| 5 | `story-5-built-it-myself.png` | I built it myself. / ทำเองทั้งแอป ตั้งแต่วางแผนถึงเขียนโค้ด · "Ask me about it." / อยากรู้อะไร ถามได้เลย | Headline "I built it myself." with the line "Planned and coded with a team of AI coding agents (Claude Code)." A tilted card shows the app's monthly Story image: November 2026, 14 sessions done, on a calendar (demo data). Text: "Share your month as a Story, right from the app. Ask me about it." |

## Caption (if you post them with a caption or as a carousel)

**English**
I built my own gym app. Gym Clean guides each set, shows the muscle you're working in 3D,
reads the cues out loud, and tracks food too. Everything stays on the phone. I planned and
coded it with AI coding agents (Claude Code). Ask me anything about it.

**ไทย**
ผมสร้างแอปออกกำลังกายเอง ชื่อ Gym Clean พาเล่นทีละเซ็ต โชว์กล้ามที่ใช้แบบ 3D พูดคิวให้ฟัง
และจดอาหารได้ด้วย ข้อมูลทั้งหมดอยู่ในมือถือเครื่องเดียว วางแผนและเขียนโค้ดร่วมกับ AI coding agents
(Claude Code) อยากรู้อะไร ถามได้เลย

**Hashtags** (pick 3–6): #buildinpublic #homemadeapp #strengthtraining #gymlife #ทำแอปเอง #ออกกำลังกาย

## Sticker ideas (in Instagram)

- Frame 2: poll "Would you use this?" Yes / Maybe.
- Frame 5: question box "Ask me about the app" / "ถามเรื่องแอปได้เลย".
- Link sticker only if you decide to share the landing page; nothing in these drafts needs it.

## Checks done on the text

- Only built features: guided sets, 3D target muscles, spoken cues, camera rep counting, food
  tracking, the monthly share image (M13 task 25), the About privacy promise (`src/ui/screens/about.ts`).
  Nothing planned is mentioned.
- Privacy wording follows the About screen, including its one exception (opt-in barcode lookup
  sends only the barcode number).
- No medical or results claims, no user counts, reviews or numbers beyond the demo screens.
- Viewer-facing lines are gender-neutral ("Ask me about it", "อยากรู้อะไร ถามได้เลย"); "ผม" is
  only used for your own voice.
- Original graphics: the app's own logo path, colours and Barlow fonts; the phone frames are drawn
  in CSS. No third-party logos. Claude Code is named in plain text only.
- Text stays between y=250 and y=1580 (clear of Instagram's top and bottom overlays).
