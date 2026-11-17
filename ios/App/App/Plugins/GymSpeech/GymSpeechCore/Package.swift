// swift-tools-version: 6.2
import PackageDescription

// M12 slice 2 task 10: the pure part of the GymSpeech plugin (hold-to-talk session state, live
// text assembly, availability and error mapping, audio level). No Capacitor, no Speech framework,
// no microphone, nothing stored. The App target links the library; the tests run with a fake
// recognizer: `swift test` (macOS) or `xcodebuild test` on an iOS simulator (docs/ios-setup.md,
// "For developers").
let package = Package(
    name: "GymSpeechCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "GymSpeechCore", targets: ["GymSpeechCore"])
    ],
    targets: [
        .target(name: "GymSpeechCore"),
        .testTarget(name: "GymSpeechCoreTests", dependencies: ["GymSpeechCore"]),
    ]
)
