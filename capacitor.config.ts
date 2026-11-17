import type { CapacitorConfig } from '@capacitor/cli';

// M9 native iOS shell (SPEC M9, PROGRESS Decision "M9 native shell plan").
// - The web app is bundled (`npm run build:native` -> dist/), so there is deliberately no `server`
//   block: no `server.url`, nothing is loaded from the network at launch, and it works offline.
// - appId is a public placeholder. His real bundle id and Apple team live only in the gitignored
//   ios/App/Signing.local.xcconfig (see docs/ios-setup.md); Xcode's PRODUCT_BUNDLE_IDENTIFIER
//   comes from there, not from this file.
// - Web Inspector: `ios.webContentsDebuggingEnabled` is left unset on purpose. Capacitor then turns
//   it on for Debug builds only (CAPInstanceDescriptor: `#if DEBUG`, or Info.plist CAPACITOR_DEBUG
//   = "true", which the App target sets from the Debug configuration), and off for Release.
const config: CapacitorConfig = {
  appId: 'com.example.gymclean',
  appName: 'Gym Clean',
  webDir: 'dist',
  // The app's dark page token (--bg in src/styles.css), so launch and overscroll never flash white.
  backgroundColor: '#0d0f12',
  ios: {
    backgroundColor: '#0d0f12',
    // Keep the default capacitor://localhost origin (no custom port; WebKit bug 259304).
    loggingBehavior: 'debug',
  },
  experimental: {
    ios: {
      spm: {
        // `cap sync` writes ios/App/CapApp-SPM/Package.swift with the app's deployment target
        // (iOS 26.0, M9-q3) as `.iOS(.v26)`, which PackageDescription only knows from tools 6.2
        // (Xcode 26). The default 5.9 header fails package resolution with "'v26' is unavailable".
        swiftToolsVersion: '6.2',
      },
    },
  },
};

export default config;
