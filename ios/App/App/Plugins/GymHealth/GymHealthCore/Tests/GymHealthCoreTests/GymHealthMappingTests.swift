import Foundation
import HealthKit
import XCTest
@testable import GymHealthCore

// Made-up numbers only.
final class GymHealthMappingTests: XCTestCase {
    // MARK: Units

    func testKilogramsFromKilogramsAndPounds() {
        XCTAssertEqual(GymHealthMapping.kilograms(HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: 80.25)), 80.25)
        XCTAssertEqual(GymHealthMapping.kilograms(HKQuantity(unit: .pound(), doubleValue: 176.37)), 80.0)
        XCTAssertEqual(GymHealthMapping.kilograms(HKQuantity(unit: .gram(), doubleValue: 79_901)), 79.9)
    }

    func testIncompatibleUnitIsNil() {
        XCTAssertNil(GymHealthMapping.kilograms(HKQuantity(unit: .count(), doubleValue: 3)))
        XCTAssertNil(GymHealthMapping.beatsPerMinute(HKQuantity(unit: .gram(), doubleValue: 3)))
        XCTAssertNil(GymHealthMapping.milliseconds(HKQuantity(unit: .count(), doubleValue: 3)))
        XCTAssertNil(GymHealthMapping.kilocalories(HKQuantity(unit: .meter(), doubleValue: 3)))
    }

    func testBeatsPerMinute() {
        let perSecond = HKUnit.count().unitDivided(by: .second())
        XCTAssertEqual(GymHealthMapping.beatsPerMinute(HKQuantity(unit: perSecond, doubleValue: 1)), 60)
        let perMinute = HKUnit.count().unitDivided(by: .minute())
        XCTAssertEqual(GymHealthMapping.beatsPerMinute(HKQuantity(unit: perMinute, doubleValue: 52)), 52)
    }

    func testHrvMilliseconds() {
        XCTAssertEqual(GymHealthMapping.milliseconds(HKQuantity(unit: .second(), doubleValue: 0.0615)), 61.5)
        XCTAssertEqual(GymHealthMapping.milliseconds(HKQuantity(unit: .secondUnit(with: .milli), doubleValue: 48)), 48)
    }

    func testKilocalories() {
        XCTAssertEqual(GymHealthMapping.kilocalories(HKQuantity(unit: .kilocalorie(), doubleValue: 640.44)), 640.4)
        XCTAssertEqual(GymHealthMapping.kilocalories(HKQuantity(unit: .jouleUnit(with: .kilo), doubleValue: 1000)), 239.0)
    }

    func testMinutesAndEpoch() {
        XCTAssertEqual(GymHealthMapping.minutes(2490), 41.5)
        XCTAssertEqual(GymHealthMapping.minutes(-5), 0)
        XCTAssertEqual(GymHealthMapping.epochMs(Date(timeIntervalSince1970: 1.5)), 1500)
    }

    func testLocalDateUsesTheGivenTimeZone() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Bangkok")!
        let d = ISO8601DateFormatter().date(from: "2026-11-15T20:00:00Z")!
        XCTAssertEqual(GymHealthMapping.localDate(d, calendar: cal), "2026-11-16")
        cal.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(GymHealthMapping.localDate(d, calendar: cal), "2026-11-15")
    }

    // MARK: Sleep-stage summing

    private let inBed = HKCategoryValueSleepAnalysis.inBed.rawValue
    private let awake = HKCategoryValueSleepAnalysis.awake.rawValue
    private let core = HKCategoryValueSleepAnalysis.asleepCore.rawValue
    private let deep = HKCategoryValueSleepAnalysis.asleepDeep.rawValue
    private let rem = HKCategoryValueSleepAnalysis.asleepREM.rawValue
    private let unspecified = HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue

    private func t(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

    private func seg(_ from: String, _ to: String, _ value: Int, source: String = "WHOOP", bundle: String = "com.example.whoop") -> SleepSegment {
        SleepSegment(start: t(from), end: t(to), value: value, source: source, bundleId: bundle)
    }

    func testSumsAsleepStagesAndSkipsAwakeAndInBed() {
        let night = [
            seg("2026-11-14T22:45:00Z", "2026-11-15T06:45:00Z", inBed),
            seg("2026-11-14T23:00:00Z", "2026-11-15T01:00:00Z", core),
            seg("2026-11-15T01:00:00Z", "2026-11-15T02:00:00Z", deep),
            seg("2026-11-15T02:00:00Z", "2026-11-15T02:10:00Z", awake),
            seg("2026-11-15T02:10:00Z", "2026-11-15T03:00:00Z", rem),
            seg("2026-11-15T03:00:00Z", "2026-11-15T06:30:00Z", core),
        ]
        let sessions = GymHealthMapping.sleepSessions(night.shuffled())
        XCTAssertEqual(sessions.count, 1)
        XCTAssertEqual(sessions[0].asleepMinutes, 440)
        XCTAssertEqual(sessions[0].start, t("2026-11-14T23:00:00Z"))
        XCTAssertEqual(sessions[0].end, t("2026-11-15T06:30:00Z"))
        XCTAssertEqual(sessions[0].source, "WHOOP")
    }

    func testOverlappingSegmentsAreNotCountedTwice() {
        let dup = [
            seg("2026-11-14T23:00:00Z", "2026-11-15T03:00:00Z", core),
            seg("2026-11-15T01:00:00Z", "2026-11-15T05:00:00Z", unspecified),
        ]
        XCTAssertEqual(GymHealthMapping.sleepSessions(dup).first?.asleepMinutes, 360)
    }

    func testDeprecatedAsleepValueCounts() {
        // `.asleep` (deprecated) has raw value 1, the same as `.asleepUnspecified`.
        let old = [seg("2026-11-14T23:00:00Z", "2026-11-15T06:00:00Z", 1)]
        XCTAssertEqual(GymHealthMapping.sleepSessions(old).first?.asleepMinutes, 420)
    }

    func testSourcesStayApart() {
        let both = [
            seg("2026-11-14T23:00:00Z", "2026-11-15T06:00:00Z", core),
            seg("2026-11-14T23:10:00Z", "2026-11-15T06:20:00Z", core, source: "Watch", bundle: "com.example.watch"),
        ]
        let sessions = GymHealthMapping.sleepSessions(both)
        XCTAssertEqual(sessions.count, 2)
        XCTAssertEqual(Set(sessions.map(\.source)), ["WHOOP", "Watch"])
        XCTAssertEqual(sessions.first { $0.source == "Watch" }?.asleepMinutes, 430)
    }

    func testANapAfterALongGapIsItsOwnSession() {
        let day = [
            seg("2026-11-14T23:00:00Z", "2026-11-15T06:00:00Z", core),
            seg("2026-11-15T13:00:00Z", "2026-11-15T13:40:00Z", core),
        ]
        let sessions = GymHealthMapping.sleepSessions(day)
        XCTAssertEqual(sessions.map(\.asleepMinutes), [420, 40])
    }

    func testShortWakeGapsStayInOneSession() {
        let night = [
            seg("2026-11-14T23:00:00Z", "2026-11-15T02:00:00Z", core),
            seg("2026-11-15T03:00:00Z", "2026-11-15T06:00:00Z", core), // 60 min awake, not recorded
        ]
        let sessions = GymHealthMapping.sleepSessions(night)
        XCTAssertEqual(sessions.count, 1)
        XCTAssertEqual(sessions[0].asleepMinutes, 360)
    }

    func testOnlyAwakeOrInBedGivesNoSession() {
        let none = [
            seg("2026-11-14T23:00:00Z", "2026-11-15T06:00:00Z", inBed),
            seg("2026-11-15T02:00:00Z", "2026-11-15T02:30:00Z", awake),
        ]
        XCTAssertTrue(GymHealthMapping.sleepSessions(none).isEmpty)
    }

    func testSleepAcrossDstUsesRealElapsedTime() {
        // US fall-back night (2026-11-01): 00:00 to 06:00 local wall time is 7 real hours.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York")!
        let start = cal.date(from: DateComponents(year: 2026, month: 11, day: 1, hour: 0))!
        let end = cal.date(from: DateComponents(year: 2026, month: 11, day: 1, hour: 6))!
        let s = SleepSegment(start: start, end: end, value: core, source: "WHOOP", bundleId: "com.example.whoop")
        XCTAssertEqual(GymHealthMapping.sleepSessions([s]).first?.asleepMinutes, 420)
    }

    func testSessionDictionaryForTheBridge() {
        let s = GymHealthMapping.sleepSessions([seg("2026-11-14T23:00:00Z", "2026-11-15T06:00:00Z", core)])[0]
        let d = s.bridgeDictionary
        XCTAssertEqual(d["asleepMin"] as? Double, 420)
        XCTAssertEqual(d["start"] as? Double, GymHealthMapping.epochMs(t("2026-11-14T23:00:00Z")))
        XCTAssertEqual(d["end"] as? Double, GymHealthMapping.epochMs(t("2026-11-15T06:00:00Z")))
        XCTAssertEqual(d["source"] as? String, "WHOOP")
        XCTAssertEqual(d["bundleId"] as? String, "com.example.whoop")
    }

    // MARK: Workouts and sources

    func testActivityNames() {
        XCTAssertEqual(GymHealthMapping.activityName(.running), "running")
        XCTAssertEqual(GymHealthMapping.activityName(.traditionalStrengthTraining), "traditionalStrengthTraining")
        XCTAssertEqual(GymHealthMapping.activityName(.soccer), "soccer")
        XCTAssertEqual(GymHealthMapping.activityName(.other), "other")
    }

    func testOwnSourceFilter() {
        XCTAssertTrue(GymHealthMapping.isOwnSource("com.example.gymclean", appBundleId: "com.example.gymclean"))
        XCTAssertFalse(GymHealthMapping.isOwnSource("com.example.whoop", appBundleId: "com.example.gymclean"))
        XCTAssertFalse(GymHealthMapping.isOwnSource("com.example.whoop", appBundleId: nil))
        XCTAssertFalse(GymHealthMapping.isOwnSource("", appBundleId: ""))
    }

    func testTypeNamesMatchTheTypeScriptSide() {
        XCTAssertEqual(GymHealthKind.allCases.map(\.rawValue), ["bodyMass", "workouts", "activeEnergy", "sleep", "restingHr", "hrv"])
        XCTAssertEqual(GymHealthKind.parse(["sleep", "steps", "hrv", "sleep"]), [.sleep, .hrv])
    }
}
