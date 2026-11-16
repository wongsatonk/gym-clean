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

## 7. Updates

After you pull new code, while your 7 days are still running:

```
npm run ios:run
```

It rebuilds the web app, syncs it, builds the iOS app and asks which device to install on (pick your
iPhone). If it fails with a signing or "No profiles" error, the profile has expired or doesn't exist
yet: do step 6 again (`npm run ios:sync`, then Run ▶ in Xcode).

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
- The only permission is the camera, with the text above. No microphone, location, Health, motion or
  background modes.
- **Web Inspector** (Safari → Develop → your iPhone) works only for Debug builds, which is what Xcode's
  Run and `npm run ios:run` make. Use it to check that a session makes no network requests.
- What git never sees: `ios/App/Signing.local.xcconfig`, `ios/App/App/public/` (the copied web build),
  `ios/DerivedData/`, `xcuserdata/`, and backup files (`*.gymclean-backup.json`).

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

Notes:
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
