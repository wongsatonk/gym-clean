import Foundation
import HealthKit

/// The six read-only types (SPEC M11). Raw values match `HealthType` in src/core/types.ts.
public enum GymHealthKind: String, CaseIterable, Sendable {
    case bodyMass, workouts, activeEnergy, sleep, restingHr, hrv

    /// Known kinds from the JS array, in order, without duplicates.
    public static func parse(_ names: [String]) -> [GymHealthKind] {
        var out: [GymHealthKind] = []
        for name in names {
            if let kind = GymHealthKind(rawValue: name), !out.contains(kind) { out.append(kind) }
        }
        return out
    }
}

/// One sleep-analysis category sample, reduced to what the summing needs.
public struct SleepSegment: Sendable, Equatable {
    public let start: Date
    public let end: Date
    /// `HKCategoryValueSleepAnalysis` raw value.
    public let value: Int
    public let source: String
    public let bundleId: String

    public init(start: Date, end: Date, value: Int, source: String, bundleId: String) {
        self.start = start
        self.end = end
        self.value = value
        self.source = source
        self.bundleId = bundleId
    }
}

/// One sleep session from one source: the asleep stages (core, deep, REM, unspecified) summed.
public struct SleepSession: Sendable, Equatable {
    public let start: Date
    public let end: Date
    public let asleepMinutes: Double
    public let source: String
    public let bundleId: String

    /// The shape `src/native/health.ts` reads (`HealthSleepSession`).
    public var bridgeDictionary: [String: Any] {
        [
            "start": GymHealthMapping.epochMs(start),
            "end": GymHealthMapping.epochMs(end),
            "asleepMin": asleepMinutes,
            "source": source,
            "bundleId": bundleId,
        ]
    }
}

/// Pure mapping from HealthKit values to app units: kg, bpm, ms, kcal, minutes, epoch ms.
/// HealthKit's own `HKUnit` conversion does the unit maths; this rounds and guards.
public enum GymHealthMapping {
    public static var kilogramUnit: HKUnit { .gramUnit(with: .kilo) }
    public static var beatsPerMinuteUnit: HKUnit { .count().unitDivided(by: .minute()) }
    public static var millisecondUnit: HKUnit { .secondUnit(with: .milli) }
    public static var kilocalorieUnit: HKUnit { .kilocalorie() }

    /// Two asleep periods of one source closer than this belong to the same session.
    public static let sessionGap: TimeInterval = 90 * 60

    public static func round(_ value: Double, places: Int) -> Double {
        let f = pow(10, Double(places))
        return (value * f).rounded() / f
    }

    private static func convert(_ q: HKQuantity, to unit: HKUnit, places: Int) -> Double? {
        guard q.is(compatibleWith: unit) else { return nil }
        let v = q.doubleValue(for: unit)
        return v.isFinite ? round(v, places: places) : nil
    }

    public static func kilograms(_ q: HKQuantity) -> Double? { convert(q, to: kilogramUnit, places: 2) }
    public static func beatsPerMinute(_ q: HKQuantity) -> Double? { convert(q, to: beatsPerMinuteUnit, places: 1) }
    public static func milliseconds(_ q: HKQuantity) -> Double? { convert(q, to: millisecondUnit, places: 1) }
    public static func kilocalories(_ q: HKQuantity) -> Double? { convert(q, to: kilocalorieUnit, places: 1) }

    public static func minutes(_ seconds: TimeInterval) -> Double {
        seconds.isFinite && seconds > 0 ? round(seconds / 60, places: 1) : 0
    }

    public static func epochMs(_ date: Date) -> Double {
        (date.timeIntervalSince1970 * 1000).rounded(.down)
    }

    /// Local calendar date `YYYY-MM-DD` in the calendar's time zone.
    public static func localDate(_ date: Date, calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Asleep stages: core, deep, REM, unspecified (and the deprecated `.asleep`, raw 1).
    public static func isAsleep(_ rawValue: Int) -> Bool {
        guard let v = HKCategoryValueSleepAnalysis(rawValue: rawValue) else { return false }
        return HKCategoryValueSleepAnalysis.allAsleepValues.contains(v)
    }

    /// Groups asleep segments into sessions per source and sums them. Overlaps are merged, so a
    /// minute is never counted twice; in-bed and awake segments are left out.
    public static func sleepSessions(_ segments: [SleepSegment], maxGap: TimeInterval = sessionGap) -> [SleepSession] {
        let asleep = segments.filter { isAsleep($0.value) && $0.end > $0.start }
        let bySource = Dictionary(grouping: asleep) { $0.bundleId + "\u{1F}" + $0.source }
        var sessions: [SleepSession] = []
        for (_, group) in bySource {
            let sorted = group.sorted { $0.start < $1.start }
            guard let first = sorted.first else { continue }
            var start = first.start
            var runStart = first.start // current merged interval
            var runEnd = first.end
            var total: TimeInterval = 0
            func close() {
                total += runEnd.timeIntervalSince(runStart)
                sessions.append(SleepSession(
                    start: start, end: runEnd, asleepMinutes: minutes(total),
                    source: first.source, bundleId: first.bundleId))
            }
            for seg in sorted.dropFirst() {
                if seg.start <= runEnd {
                    runEnd = max(runEnd, seg.end) // overlap: extend
                } else if seg.start.timeIntervalSince(runEnd) <= maxGap {
                    total += runEnd.timeIntervalSince(runStart) // same session, new interval
                    runStart = seg.start
                    runEnd = seg.end
                } else {
                    close()
                    start = seg.start
                    runStart = seg.start
                    runEnd = seg.end
                    total = 0
                }
            }
            close()
        }
        return sessions.sorted { ($0.start, $0.source) < ($1.start, $1.source) }
    }

    public static func isOwnSource(_ bundleId: String, appBundleId: String?) -> Bool {
        guard let app = appBundleId, !app.isEmpty else { return false }
        return bundleId == app
    }

    /// Stable camelCase name of a workout type (the Swift case name), e.g. "running".
    public static func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .americanFootball: "americanFootball"
        case .archery: "archery"
        case .australianFootball: "australianFootball"
        case .badminton: "badminton"
        case .baseball: "baseball"
        case .basketball: "basketball"
        case .bowling: "bowling"
        case .boxing: "boxing"
        case .climbing: "climbing"
        case .cricket: "cricket"
        case .crossTraining: "crossTraining"
        case .curling: "curling"
        case .cycling: "cycling"
        case .elliptical: "elliptical"
        case .equestrianSports: "equestrianSports"
        case .fencing: "fencing"
        case .fishing: "fishing"
        case .functionalStrengthTraining: "functionalStrengthTraining"
        case .golf: "golf"
        case .gymnastics: "gymnastics"
        case .handball: "handball"
        case .hiking: "hiking"
        case .hockey: "hockey"
        case .hunting: "hunting"
        case .lacrosse: "lacrosse"
        case .martialArts: "martialArts"
        case .mindAndBody: "mindAndBody"
        case .paddleSports: "paddleSports"
        case .play: "play"
        case .preparationAndRecovery: "preparationAndRecovery"
        case .racquetball: "racquetball"
        case .rowing: "rowing"
        case .rugby: "rugby"
        case .running: "running"
        case .sailing: "sailing"
        case .skatingSports: "skatingSports"
        case .snowSports: "snowSports"
        case .soccer: "soccer"
        case .softball: "softball"
        case .squash: "squash"
        case .stairClimbing: "stairClimbing"
        case .surfingSports: "surfingSports"
        case .swimming: "swimming"
        case .tableTennis: "tableTennis"
        case .tennis: "tennis"
        case .trackAndField: "trackAndField"
        case .traditionalStrengthTraining: "traditionalStrengthTraining"
        case .volleyball: "volleyball"
        case .walking: "walking"
        case .waterFitness: "waterFitness"
        case .waterPolo: "waterPolo"
        case .waterSports: "waterSports"
        case .wrestling: "wrestling"
        case .yoga: "yoga"
        case .barre: "barre"
        case .coreTraining: "coreTraining"
        case .crossCountrySkiing: "crossCountrySkiing"
        case .downhillSkiing: "downhillSkiing"
        case .flexibility: "flexibility"
        case .highIntensityIntervalTraining: "highIntensityIntervalTraining"
        case .jumpRope: "jumpRope"
        case .kickboxing: "kickboxing"
        case .pilates: "pilates"
        case .snowboarding: "snowboarding"
        case .stairs: "stairs"
        case .stepTraining: "stepTraining"
        case .wheelchairWalkPace: "wheelchairWalkPace"
        case .wheelchairRunPace: "wheelchairRunPace"
        case .taiChi: "taiChi"
        case .mixedCardio: "mixedCardio"
        case .handCycling: "handCycling"
        case .discSports: "discSports"
        case .fitnessGaming: "fitnessGaming"
        case .cardioDance: "cardioDance"
        case .socialDance: "socialDance"
        case .pickleball: "pickleball"
        case .cooldown: "cooldown"
        case .underwaterDiving: "underwaterDiving"
        default: "other"
        }
    }
}
