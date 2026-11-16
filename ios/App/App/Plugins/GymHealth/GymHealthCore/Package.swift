// swift-tools-version: 6.2
import PackageDescription

// M11 task 4: the pure part of the GymHealth plugin (unit mapping, sleep-stage summing, workout
// names, own-source filter). No Capacitor, no HealthKit store queries, nothing stored. The App
// target links the library; the tests run with `swift test` (macOS) or `xcodebuild test` on an
// iOS simulator (see docs/ios-setup.md, "For developers").
let package = Package(
    name: "GymHealthCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "GymHealthCore", targets: ["GymHealthCore"])
    ],
    targets: [
        .target(name: "GymHealthCore"),
        .testTarget(name: "GymHealthCoreTests", dependencies: ["GymHealthCore"]),
    ]
)
