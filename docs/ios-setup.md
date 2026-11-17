# Gym Clean on your iPhone (M9 native shell)

The iPhone app is the same web app, bundled inside a small Capacitor shell, so it works offline and
loads nothing from the internet. The GitHub Pages app (PWA) keeps working exactly as before; the
native app is an add-on. Its data is separate from Safari's (move it with Back up / Restore once that
lands, M9 B1–B3).

This page is what only you can do: sign in, connect the iPhone, install. Everything is free with a
normal Apple ID. Facts were checked on 2026-11-15 (PROGRESS Decision "M9 native shell plan").

## What you need

- This Mac with **Xcode 26 or newer** (it has Xcode 27.2) and Node 22+.
- Your **iPhone 17 Pro** on **iOS 26.0 or newer**, and a USB-C cable.
- Your **Apple ID** (free). No paid developer account is needed for M9.

## 1. Xcode, once

1. Open Xcode once and let it finish installing its components (if it asks). If `xcodebuild` in
   Terminal prints an error about CoreDevice or "required libraries", run Xcode again and let it
   repair itself.
2. Xcode → **Settings → Accounts → +** → **Apple ID** → sign in. Xcode makes a **Personal Team** for
   you ("Your Name (Personal Team)").
3. Still in Accounts, pick your Apple ID → **Manage Certificates… → + → Apple Development**. This
   makes the signing certificate on this Mac.

Your Apple ID, password and certificate stay in Xcode and the Keychain. Nothing of it goes in the repo.

## 2. Capacitor telemetry is off

The Capacitor command line tool would send usage data by default. Our `ios:*` scripts run
`cap telemetry off` before anything else, and it is already off on this Mac. To check by hand:

```
npx cap telemetry off
```

## 3. Get the code ready

```
npm ci
npm run ios:sync      # web build for the app (--mode native) + copy into ios/ + plugins
```

## 4. Your bundle id and team

These two values are personal, and the repo is public, so they live in a file that git ignores.

1. Copy the example:
   ```
   cp ios/App/Signing.local.xcconfig.example ios/App/Signing.local.xcconfig
   ```
2. In `ios/App/Signing.local.xcconfig` set:
   - `PRODUCT_BUNDLE_IDENTIFIER`: any id that is yours, e.g. `com.yourname.gymclean`. Apple only
     needs it to be unique; a free team can register up to 10 of these per 7 days, so pick one and
     keep it.
   - `DEVELOPMENT_TEAM`: your Personal Team id (10 characters). To see it, run in Terminal:
     ```
     security find-certificate -c "Apple Development" -p | openssl x509 -noout -subject
     ```
     The team id is the `OU=` value.
3. Check that git doesn't see it: `git status` must **not** list `Signing.local.xcconfig`.

**Don't choose a Team in Xcode's "Signing & Capabilities" tab.** Xcode would write your team id into
`project.pbxproj`, which is committed. If it ever happens, undo it with
`git checkout ios/App/App.xcodeproj/project.pbxproj`. Leave "Automatically manage signing" on.

## 5. iPhone: trust this Mac and turn on Developer Mode

1. Plug the iPhone into the Mac, unlock it, tap **Trust** and enter your passcode.
2. On the iPhone: **Settings → Privacy & Security → Developer Mode → On**, then **Restart**. After the
   restart, tap **Turn On** and enter your passcode. (The Developer Mode switch only shows up after the
   iPhone has been connected to Xcode once.)

## 6. First install (from Xcode)

The first install, and each one after the 7 days run out, goes through Xcode, because that is where
Xcode creates the free provisioning profile for your bundle id.

1. `npm run ios:open` (opens `ios/App/App.xcodeproj`).
2. At the top, pick the **App** scheme and your **iPhone** as the run destination.
3. Press **Run ▶**. The first build fetches the Capacitor Swift package from GitHub (build time only;
   the app itself never goes online).
4. The first launch on the iPhone says the developer isn't trusted: **Settings → General → VPN & Device
   Management → Apple Development: (your Apple ID) → Trust**. Then open Gym Clean again.
5. The first time you open the camera page, iOS asks for the camera ("Counts your reps on this phone.
   Video never leaves it."). Allow it.

## 7. Apple Health (M11, read-only)

The app can read a few Apple Health types so the coach can suggest a lighter day. It **only reads**,
never writes, and nothing leaves the phone. WHOOP's data reaches the app through Apple Health (WHOOP →
Health → Gym Clean), so the WHOOP app must already be sharing into Health.

1. In the **WHOOP** app: Settings → Integrations → Apple Health → connected, with sleep, heart rate,
   HRV and workouts turned on for writing to Health.
2. In Gym Clean: Settings → Health → **Connect**. iOS shows its Health sheet with the sentence "Reads
   sleep, heart rate, workouts and weight so the coach can suggest a lighter day. Stays on this phone."
3. The sheet should list **only** these six under "Allow Gym Clean to read": Active Energy, Heart Rate
   Variability, Resting Heart Rate, Sleep, Weight, Workouts. There is **no** "Allow Gym Clean to write"
   list. Turn on the ones you want (Turn On All is fine) and tap **Allow**.
4. Change it later in the Health app → your picture → Apps → Gym Clean (or iPhone Settings → Health →
   Data Access & Devices → Gym Clean). Turning a type off there just makes it look empty to the app:
   iOS never tells an app that you said no.
5. Health data can only be read while the iPhone is unlocked. If the app reads while it's locked, it
   skips that read quietly and tries again next time you open it.

The HealthKit capability is in `ios/App/App/App.entitlements` (just `com.apple.developer.healthkit`:
no background delivery, no clinical records, no team id). It works with the free Personal Team
(checked 2026-11-16).

## 8. Updates

After you pull new code, while your 7 days are still running:

```
npm run ios:run
```

It rebuilds the web app, syncs it, builds the iOS app and asks which device to install on (pick your
iPhone). If it fails with a signing or "No profiles" error, the profile has expired or doesn't exist
yet: do step 6 again (`npm run ios:sync`, then Run ▶ in Xcode).

The iPhone app's version follows `package.json`: `node scripts/sync-ios-version.mjs` writes it into the Xcode project (`MARKETING_VERSION`, plus a build number that only goes up), and `npm run check` fails if they differ.

## Free Apple ID limits (checked 2026-11-15)

- **7 days:** an app signed with a free Personal Team stops opening after 7 days. Re-install it from
  Xcode (step 6). Your workout data stays on the phone as long as you don't delete the app.
- **3 devices:** a free team can have up to 3 registered devices (they also expire after 7 days).
- **3 apps per device** and **10 App IDs per 7 days.** Keep one bundle id and you won't get close.
- The paid Apple Developer Program (US$99/year) removes the 7-day re-install and allows TestFlight.
  Whether that's worth it is your call at Checkpoint G; nothing in M9 needs it.

## Privacy, in the app

- The web app is bundled in the app: no `server.url`, no remote config, no analytics, no crash
  reporting, no push. Same rules as the PWA: video and pose inference stay on the phone.
- Permissions: the camera (text above), from M11 **Apple Health read-only** (step 7), and from M12
  slice 2 the **microphone**, asked the first time you hold the coach's mic button ("Lets you talk
  to the coach. Audio stays on this phone."). Speech is turned into text on the phone; no audio is
  saved or sent. No location, motion, Health writing or background modes. Health values go from HealthKit
  to the app's own storage on the phone as per-day summaries; the plugin itself keeps nothing and
  makes no network request.
- **Web Inspector** (Safari → Develop → your iPhone) works only for Debug builds, which is what Xcode's
  Run and `npm run ios:run` make. Use it to check that a session makes no network requests.
- What git never sees: `ios/App/Signing.local.xcconfig`, `ios/App/App/public/` (the copied web build),
  `ios/DerivedData/`, `xcuserdata/`, and backup files (`*.gymclean-backup.json`).

## On-device checklist: Apple Health (M11 task 4)

Report each line as pass / fail plus anything odd (types and yes/no only, never your values):

1. Settings → Health → Connect shows the iOS Health sheet with the sentence from step 7.
2. The sheet lists only Active Energy, Heart Rate Variability, Resting Heart Rate, Sleep, Weight and
   Workouts, all under "read". Nothing under "write".
3. After **Allow**, Settings → Health → Read now fills in last night's sleep, resting heart rate and
   HRV from WHOOP (the source name shows as WHOOP).
4. A weight you added in the Health app shows up in Fuel as a weigh-in marked "from Health".
5. Lock the phone right after tapping Read now (or wait for auto-lock): no error screen; unlock and
   open the app again, and the read works.
6. Turn off one type in the Health app (Apps → Gym Clean), Read now: that type just stays empty, no
   error.
7. Safari → Develop → your iPhone → Gym Clean → Network: no request goes out during Connect or Read
   now.

## On-device checklist: coach microphone (M12 slice 2 task 10)

Only on your iPhone, once the mic button is wired into the Coach tab (slice 2 task 20). Play music
from another app in your AirPods while you do it.

1. Open the app and the Coach tab: **no** permission prompt appears.
2. Hold the mic button: iOS asks for the **microphone** with "Lets you talk to the coach. Audio stays
   on this phone." Only this one prompt appears (no "Speech Recognition" prompt). Tap Allow.
3. Hold again and talk: the text appears while you speak; release and the finished text is there.
4. Your music keeps playing while you hold, at normal quality, and comes back to full volume after.
5. Turn on Airplane Mode and repeat step 3: it still works (nothing leaves the phone).
6. Hold, then swipe to the Home Screen: listening stops and nothing is sent.
7. If the mic says the speech model isn't installed, tell me; the app can ask iOS to download it.
8. Settings → Privacy & Security → Microphone shows Gym Clean; Speech Recognition does not.

## On-device checklist (task 3)

Report each line as pass / fail plus anything odd:

1. `npm run ios:sync` and Run ▶ from Xcode install the app on your iPhone; it shows up as "Gym Clean".
2. It opens to **Today** with the dark background (no white flash) and the status bar text is light.
3. Close it, turn on **Airplane Mode**, open it again: Today still loads.
4. It stays in portrait when you turn the phone.
5. Open the camera page once: iOS asks for the camera with the sentence above (camera rep counting
   itself is checked in task 4).
6. `git status` on the Mac does not list `Signing.local.xcconfig` or anything with your team id.

## For developers (simulator)

```
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Health plugin unit tests (unit mapping and sleep-stage summing; pure Swift, no Health data needed):

```
cd ios/App/App/Plugins/GymHealth/GymHealthCore
xcodebuild -scheme GymHealthCore -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
# or on the Mac itself: swift test
```

Speech plugin unit tests (session rules with a fake recognizer; no microphone needed):

```
cd ios/App/App/Plugins/GymSpeech/GymSpeechCore
xcodebuild -scheme GymSpeechCore -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
# or on the Mac itself: swift test
```

Brain plugin unit tests (availability and error mapping, the generated tools, parallel tool-call
recording, read-only results, timeout and prewarm, all with a fake session; no model needed). The
iOS 27 error family is only tested on an iOS 27 simulator (on a macOS 26 Mac `swift test` skips it):

```
cd ios/App/App/Plugins/GymBrain/GymBrainCore
xcodebuild -scheme GymBrainCore -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

The brain's tools are generated: after `src/core/trainer/tools.contract.json` changes, run
`node scripts/gen-trainer-tools.mjs` (`npm run check` fails while the Swift file is stale).

Notes:
- Local plugins: `ios/App/App/AppViewController.swift` (a `CAPBridgeViewController` subclass) registers
  them in `capacitorDidLoad()` with `bridge?.registerPluginInstance(...)`. `GymHealthPlugin` (jsName
  `GymHealth`) lives in `ios/App/App/Plugins/GymHealth/`; its pure part is the local Swift package
  `GymHealthCore` next to it, linked to the App target. `GymSpeechPlugin` (jsName `GymSpeech`,
  M12 slice 2) follows the same pattern in `ios/App/App/Plugins/GymSpeech/` with `GymSpeechCore`.
  `GymBrainPlugin` (jsName `GymBrain`, M12 slice 2) likewise in `ios/App/App/Plugins/GymBrain/` with
  `GymBrainCore` (which also holds the generated `TrainerTools.generated.swift`).
- GymHealth also reads body fat percentage and lean body mass (M12 slice 1b), each only after its
  own switch is turned on; the Health sheet lists them only then.
- Deployment target is **iOS 26.0** (M9-q3), iPhone only, portrait only.
- Swift Package Manager (Capacitor 8 default), no CocoaPods. `cap sync` rewrites
  `ios/App/CapApp-SPM/Package.swift`; `capacitor.config.ts` sets its tools version to 6.2 because
  `.iOS(.v26)` needs it.
- App icon and launch screen: Capacitor's placeholder art (white splash, Capacitor logo) is replaced
  with the app's own logo on `#0d0f12` (1024 px, opaque, same glyph as `scripts/icons.mjs`) and a
  plain `#0d0f12` splash, so launch never flashes white.
- Signing: the App target's Debug and Release configurations use `ios/App/Signing.xcconfig` as their
  base; it sets the placeholder bundle id `com.example.gymclean` and then
  `#include? "Signing.local.xcconfig"`, so the local file wins when it exists.

## Slice 2 API notes (M12 slice 2 task 1, checked 2026-11-17)

Checked against Apple's documentation and the Swift interface files of the installed SDK (Xcode 27.2,
iOS 27.2 SDK; the app's deployment target stays iOS 26.0). "iOS 26.0" below means "available from".
Everything here runs on the phone. Sources are listed at the end.

### 1. Apple's on-device model (FoundationModels, iOS 26.0)

Availability (`import FoundationModels`):

```swift
SystemLanguageModel.default                       // static var `default`: SystemLanguageModel
model.availability                                // SystemLanguageModel.Availability
//   case available
//   case unavailable(SystemLanguageModel.Availability.UnavailableReason)
//        .deviceNotEligible | .appleIntelligenceNotEnabled | .modelNotReady
model.isAvailable                                 // Bool
model.supportsLocale(_ locale: Locale = .current) // Bool
model.contextSize                                 // Int: 4096 on iOS 26.x; the real value on iOS 27
model.tokenCount(for:) async throws -> Int        // iOS 26.4+: prompt, Instructions, [any Tool], schema, transcript entries
```

`UnavailableReason` is not frozen, so the switch needs `@unknown default`.

| Apple | `BrainUnavailableReason` |
|---|---|
| `.unavailable(.deviceNotEligible)` ("The device does not support Apple Intelligence.") | `deviceNotEligible` |
| `.unavailable(.appleIntelligenceNotEnabled)` ("Apple Intelligence is not enabled on the system.") | `appleIntelligenceNotEnabled` |
| `.unavailable(.modelNotReady)` ("The models aren't available on the user's device."; still downloading) | `modelNotReady` |
| `@unknown default`, or `supportsLocale(Locale(identifier: "en"))` is false | `unsupported` |
| not the iPhone app (PWA) | `notNative` (TypeScript side) |

Session and replies:

```swift
LanguageModelSession(model: SystemLanguageModel = .default, tools: [any Tool] = [], instructions: String? = nil)
session.respond(to: String, options: GenerationOptions = GenerationOptions()) async throws
    -> LanguageModelSession.Response<String>      // .content: String, .transcriptEntries: ArraySlice<Transcript.Entry>
session.streamResponse(to: String, options:)      // -> LanguageModelSession.ResponseStream<String>
session.isResponding                              // Bool; one request at a time per session
session.prewarm(promptPrefix: Prompt? = nil)
GenerationOptions(temperature: Double?, maximumResponseTokens: Int?)   // + samplingMode
Transcript.Entry: .instructions, .prompt, .toolCalls, .toolOutput, .response
Transcript.ToolCall: id, toolName, arguments (GeneratedContent)
```

Tools and guided generation:

```swift
protocol Tool<Arguments, Output>: Sendable {
    associatedtype Output: PromptRepresentable                 // String works
    associatedtype Arguments: ConvertibleFromGeneratedContent  // an @Generable struct
    var name: String { get }
    var description: String { get }
    var parameters: GenerationSchema { get }                   // default from Arguments
    var includesSchemaInInstructions: Bool { get }             // has a default
    @concurrent func call(arguments: Arguments) async throws -> Output
}
@Generable(description: String? = nil)            // on a struct or enum
@Guide(description: String)                       // on a property
@Guide(description: String? = nil, _ guides: GenerationGuide<T>...)   // e.g. .range(1...6), .anyOf([...])
```

- The model decides whether to call a tool; it may call one several times, and calls can run **in
  parallel**, so the tool-call recorder must be thread-safe (a lock or an actor) and the app must
  expect more than one recorded call.
- A tool that throws makes `respond` throw `LanguageModelSession.ToolCallError` (`tool`,
  `underlyingError`). Our tools never throw; they return a short string.
- `GenerationOptions(toolCallingMode: .allowed | .required | .disallowed)` is **iOS 27 only**.

Context window: **4,096 tokens per session**, counting instructions, every prompt, every reply, tool
schemas, tool inputs and tool outputs. Apple: one token is about three or four characters of English.

Errors thrown by `respond`:

| iOS 26 (`LanguageModelSession.GenerationError`, deprecated in iOS 27) | iOS 27 replacement | `BrainErrorCode` |
|---|---|---|
| `.guardrailViolation`, `.refusal` | `LanguageModelError.guardrailViolation`, `.refusal` | `guardrail` |
| `.exceededContextWindowSize` | `LanguageModelError.contextSizeExceeded` (has `contextSize`, `tokenCount`) | `contextTooLong` |
| `.unsupportedLanguageOrLocale` | `LanguageModelError.unsupportedLanguageOrLocale` | `unsupportedLanguage` |
| (none; our own 15 s timer) | `LanguageModelError.timeout` | `timeout` |
| `.assetsUnavailable`, `.unsupportedGuide`, `.decodingFailure`, `.rateLimited`, `.concurrentRequests` | `SystemLanguageModel.Error.assetsUnavailable`, `LanguageModelError.unsupportedGenerationGuide` / `.rateLimited` / `.unsupportedCapability` / `.unsupportedTranscriptContent`, `LanguageModelSession.Error.concurrentRequests`, `GeneratedContent.ParsingError` | `other` |
| `LanguageModelSession.ToolCallError` | same | `other` |

Prewarm: Apple says to call `prewarm` only with a strong signal that a request comes within a few
seconds and at least 1 second before `respond`. Recommendation: prewarm when the text box gets focus
or the mic button goes down, not on every Coach-tab open.

**What differs from the plan's assumptions:**

1. **Two error families.** The app targets iOS 26.0 but the SDK is iOS 27: `GymBrainCore` has to map
   both `LanguageModelSession.GenerationError` and (inside `if #available(iOS 27, *)`)
   `LanguageModelError`. `LanguageModelError` is non-exhaustive: unknown cases map to `other`.
2. **The budget is tight.** 4,096 tokens hold the instructions, the context (the provisional 6,000
   characters are about 1,500 to 2,000 tokens), the last 8 turns, **the schemas of all 14 tools**, the
   read-tool outputs and the reply. One session per `respond` call (no reuse), short `@Guide` texts,
   and a measured budget: on iOS 26.4+ the dev eval screen should log `tokenCount(for:)` of the
   instructions and the tools. If the tools cost too much, the four read-only results can go into the
   context text instead of being tools (same TypeScript contract; main's call).
3. **A cloud model exists in the iOS 27 SDK** (`PrivateCloudComputeLanguageModel`). Never use it:
   `GymBrain` always passes `SystemLanguageModel.default`. Reviewer: grep for `PrivateCloudCompute`.
4. **JS round trip for read tools:** possible (`call(arguments:)` is async, so it could wait for the
   web view), but it adds latency and a second failure path, and tools may run in parallel. Keep the
   plan: results computed before `respond` and passed in.
5. Supported devices: Apple Intelligence phones only (iPhone 15 Pro and later). The simulator reports
   whatever the Mac supports; the real check is on the iPhone.

**GymBrain plugin (tasks 6-7), as built.** jsName `GymBrain`; TypeScript in `src/native/gymBrain.ts`.

| Method | Shape |
|---|---|
| `availability()` | `{ available: true }` or `{ available: false, reason }` (`deviceNotEligible`, `appleIntelligenceNotEnabled`, `modelNotReady`, `unsupported`). Never prompts. |
| `respond(GymBrainRequest)` | `{ text, toolCalls: [{ name, args }], latencyMs }`; rejects with code `guardrail`, `contextTooLong`, `unsupportedLanguage`, `timeout` (15 s) or `other` (`invalidRequest` without instructions or a user message), data `{ code, latencyMs }`. |
| `prewarm({ instructions })` | Builds the session the next `respond` with the same instructions uses (once, within 120 s). Only when available. |
| `measure(GymBrainRequest)` | iOS 26.4+: `{ instructions, tools, prompt, contextSize }` tokens; `{}` before 26.4 or when unavailable. |

- One `LanguageModelSession(model: SystemLanguageModel.default, tools: 14 tools, instructions:)` per
  `respond`; the prompt is `context + "\n\nUser: " + the last user message`. Reply capped at 600 tokens.
- Generated tools: string enums use `.anyOf`, integers `.range` / `.minimum` / `.maximum`, arrays
  `.minimumCount` / `.maximumCount` / `.element(...)`. Patterned strings (dates, exercise ids) get
  their description only, no regex guide (TypeScript validates every argument; an unsatisfiable
  guide would fail the whole reply). `uniqueItems` is checked in TypeScript too.
- Propose tools record `{ name, args }` (thread-safe; absent optional arguments are left out) and
  return "Proposed; the app will ask the user to confirm." Read-only tools return `toolResults[name]`
  (`exerciseInfo`: `exerciseInfo:<id>`, then `exerciseInfo`, then "Not in your plan this week.";
  others without a result: "No data right now.") and are not in `toolCalls`.
- Token budget check (Checkpoint J): the dev eval calls `measure` once and logs the counts; at
  3 chars/token the planned split was instructions ~300, tools ~1,580, context ≤ 1,070 tokens.

### 2. Speech to text: SpeechAnalyzer + SpeechTranscriber (Speech framework, iOS 26.0)

**Choice: `SpeechAnalyzer` with `SpeechTranscriber`. `SFSpeechRecognizer` is not used, and there is
no fallback: where `SpeechTranscriber.isAvailable` is false the mic is unavailable.**

Why: Apple's "Asking Permission to Use Speech Recognition" says "SpeechAnalyzer transcriber modules
don't send audio data of the user's voice to Apple's servers." `SFSpeechRecognizer` sends audio to
Apple by default; `requiresOnDeviceRecognition = true` stops that only when
`supportsOnDeviceRecognition` is also true ("The request only honors this setting if ..."), so it is
a setting to get right, not a guarantee of the API. If a phone has no on-device English model, the
mic is unavailable there and typing still works. (`DictationTranscriber`, the SpeechAnalyzer module
for older devices, falls under the same Apple sentence and could be added later as a fallback.)

```swift
SpeechTranscriber.isAvailable                                   // static Bool: this device can run it
SpeechTranscriber.supportedLocale(equivalentTo: Locale) async   // -> Locale? (use this, not Locale(identifier:), to match)
SpeechTranscriber(locale:, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
transcriber.results          // AsyncSequence of Result: .text (AttributedString), .isFinal (false = live partial)
AssetInventory.status(forModules:) async                        // .unsupported | .supported | .downloading | .installed
AssetInventory.assetInstallationRequest(supporting:) async throws   // -> AssetInstallationRequest?; .downloadAndInstall()
SpeechAnalyzer(modules: [any SpeechModule], options: SpeechAnalyzer.Options? = nil)
SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith:) async  // -> AVAudioFormat?
analyzer.start(inputSequence:) async throws                     // an AsyncSequence of AnalyzerInput(buffer: AVAudioPCMBuffer)
analyzer.finalizeAndFinishThroughEndOfInput() async throws      // release: finish the text
analyzer.cancelAndFinishNow() async                             // background / cancel
```

- Live partials: results with `isFinal == false` ("volatile") replace each other; final ones are
  appended. The text so far = all final text + the latest volatile text.
- Permissions: the **microphone** only (`AVAudioApplication.shared.recordPermission`,
  `AVAudioApplication.requestRecordPermission()`, Info.plist `NSMicrophoneUsageDescription`). Apple's
  speech-recognition consent ("This process only applies to speech recognition using
  SFSpeechRecognizer") is not requested. `NSSpeechRecognitionUsageDescription` is in Info.plist as
  planned, but nothing calls `SFSpeechRecognizer.requestAuthorization`, so iOS should show **one**
  prompt. Some third-party guides say the speech permission is still needed; this is a line on the
  phone checklist.
- The English model is a system asset. If it isn't installed, iOS downloads it from Apple (a model
  download; no audio or text is sent). The plugin never does this by itself: `availability()` says
  `modelNotInstalled` and the app calls `installModel()` when the user asks.

**GymSpeech plugin (task 10), as built.** jsName `GymSpeech`; TypeScript in `src/native/speech.ts`.

| Method / event | Shape |
|---|---|
| `availability()` | `{ available: true }` or `{ available: false, reason }` with reason `unsupported`, `modelNotInstalled`, `modelDownloading` or `permissionDenied`. Never prompts. |
| `start({ locale: 'en' })` | Asks for the microphone on the first call only, then listens. Rejects with code `PERMISSION_DENIED`, `UNAVAILABLE`, `BUSY` or `FAILED`. |
| `stop()` | Finishes the text; resolves `{ text }` and sends `final`. |
| `installModel()` | Starts the system download of the English model; resolves `{ installed }`. |
| event `partial` | `{ text }`: the whole text so far |
| event `level` | `{ rms }`: 0 to 1, about 10 per second |
| event `final` | `{ text }` (also after the 60 s cap, with `capped: true`) |
| event `error` | `{ code }`: `permissionDenied`, `unavailable`, `interrupted` (app went to the background or a call came in; nothing is sent), `failed` |

Audio goes from the microphone tap straight into the analyzer in memory. Nothing is written to a
file, kept after `stop`, or sent anywhere. The audio session is `.playAndRecord` with
`.mixWithOthers`, without the Bluetooth hands-free option, so music from another app keeps playing in
the AirPods at full quality and the **iPhone's own microphone** is used (to be confirmed on the phone).

### 3. Reminders: `@capacitor/local-notifications`

**Choice: the npm plugin, pinned to `@capacitor/local-notifications@8.3.1`** (npm `latest` on
2026-11-17; peer dependency `@capacitor/core >=8.0.0`; ships a `Package.swift` that depends on
`capacitor-swift-pm` `from: "8.0.0"`, so it resolves against the app's 8.6.2 through SPM, no
CocoaPods). It is a thin wrapper around `UNUserNotificationCenter`; a custom plugin would add nothing.
`npx cap sync ios` adds it to `ios/App/CapApp-SPM/Package.swift`.

```ts
LocalNotifications.checkPermissions(): Promise<{ display: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' }>
LocalNotifications.requestPermissions(): Promise<{ display: ... }>      // the only call that prompts
LocalNotifications.schedule({ notifications: [{ id: number, title, body, schedule: { at: Date } }] })
LocalNotifications.getPending(): Promise<{ notifications: [...] }>
LocalNotifications.cancel({ notifications: [{ id }] })
```

- `id` is a number (32-bit integer), so `src/native/reminders.ts` maps the plan's stable string ids to
  numbers.
- No capability, entitlement or Info.plist key is needed for plain local notifications, and nothing
  uses the network. iOS keeps at most 64 pending local notifications per app (from Apple's older
  notification guide; not re-checked today); a 14-day plan is at most 30.

### Sources

- https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel
- https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/availability-swift.enum/unavailablereason
- https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models
- https://developer.apple.com/documentation/foundationmodels/expanding-generation-with-tool-calling
- https://developer.apple.com/documentation/foundationmodels/languagemodelsession/prewarm(promptprefix:)
- https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window
- https://developer.apple.com/documentation/speech/speechanalyzer
- https://developer.apple.com/documentation/speech/speechtranscriber
- https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition
- https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition
- https://capacitorjs.com/docs/apis/local-notifications
- https://www.npmjs.com/package/@capacitor/local-notifications (version and peer dependency via `npm view`)
- Exact signatures: `FoundationModels.framework` and `Speech.framework` `.swiftinterface` files in
  the iOS 27.2 SDK of Xcode 27.2 on this Mac.
