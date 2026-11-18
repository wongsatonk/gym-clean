// swift-tools-version: 6.2
import PackageDescription

// M12 slice 2 tasks 6-7: the testable part of the GymBrain plugin (Apple's on-device model).
// Availability and error mapping, the generated tools (TrainerTools.generated.swift, from
// scripts/gen-trainer-tools.mjs), the thread-safe tool-call recorder, read-only results, and the
// respond flow with its timeout behind a `BrainModel` protocol. No Capacitor and no network. The
// App target links the library; the tests run with a fake session: `xcodebuild test` on an iOS
// simulator (docs/ios-setup.md, "For developers") or `swift test` on a Mac with macOS 26.
let package = Package(
    name: "GymBrainCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "GymBrainCore", targets: ["GymBrainCore"])
    ],
    targets: [
        .target(name: "GymBrainCore"),
        .testTarget(name: "GymBrainCoreTests", dependencies: ["GymBrainCore"]),
    ]
)
