import Capacitor
import Foundation
import GymHealthCore
import HealthKit

/// M11 task 4: read-only Apple Health bridge (SPEC M11, route A).
///
/// - Reads eight types only: body mass, workouts, active energy, sleep, resting heart rate, HRV,
///   and (M12 slice 1b) body fat percentage and lean body mass. The last two are off by default
///   and reach `requestRead` only when their own switch is turned on, so the Health sheet lists
///   them only then. No write methods, no share types, no background delivery, no observer queries.
/// - (M13d task 6) `requestRead({ profile: true })` also asks for height, date of birth and
///   biological sex, and `readProfile` reads them once to pre-fill Set up Fuel: the latest height in
///   cm, the birth **year** only (month and day never leave Swift) and female / male (other and
///   not set are left out). Nothing is stored.
/// - Swift stays thin: it queries HealthKit, converts to app units (GymHealthCore) and hands the
///   values to the web view. It stores nothing and makes no network request. Per-day summaries,
///   baselines and coaching live in TypeScript (src/core/health/**).
/// - HealthKit hides read denial: a denied type just returns no samples.
/// - A locked phone (`errorDatabaseInaccessible`) rejects with code "LOCKED"; the TS side turns
///   every rejection into an empty result.
@objc(GymHealthPlugin)
public class GymHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GymHealthPlugin"
    public let jsName = "GymHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readProfile", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    /// Upper bound per type and read, so a long first read can't balloon memory.
    private let sampleLimit = 5000
    /// Sleep that started up to this long before `since` still belongs to the first night read.
    private let sleepLookBack: TimeInterval = 18 * 60 * 60

    // MARK: Methods

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestRead(_ call: CAPPluginCall) {
        let kinds = GymHealthKind.parse(call.getArray("types", String.self) ?? [])
        var types = Set(kinds.flatMap(Self.readTypes(for:)))
        if call.getBool("profile") == true { types.formUnion(GymHealthMapping.profileReadTypes) }
        guard HKHealthStore.isHealthDataAvailable(), !types.isEmpty else {
            call.resolve(["requested": false])
            return
        }
        Task {
            do {
                // Read only: the share set is always empty (no NSHealthUpdateUsageDescription).
                try await store.requestAuthorization(toShare: [], read: types)
                call.resolve(["requested": true])
            } catch {
                call.resolve(["requested": false])
            }
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        let kinds = GymHealthKind.parse(call.getArray("types", String.self) ?? [])
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device", "UNAVAILABLE")
            return
        }
        guard let sinceMs = call.getDouble("since"), sinceMs.isFinite else {
            call.reject("since is required", "BAD_RANGE")
            return
        }
        let since = Date(timeIntervalSince1970: sinceMs / 1000)
        let until = call.getDouble("until").map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        guard until > since else {
            call.reject("until must be after since", "BAD_RANGE")
            return
        }
        let appBundleId = Bundle.main.bundleIdentifier

        Task {
            var result: [String: Any] = ["appBundleId": appBundleId ?? ""]
            var failed: [String] = []
            for kind in kinds {
                do {
                    result[kind.rawValue] = try await self.read(kind, since: since, until: until, appBundleId: appBundleId)
                } catch let error as HKError where error.code == .errorDatabaseInaccessible {
                    call.reject("Health data is locked until the phone is unlocked", "LOCKED")
                    return
                } catch {
                    // Not determined / other per-type errors: that type is just empty.
                    result[kind.rawValue] = [[String: Any]]()
                    failed.append(kind.rawValue)
                }
            }
            result["failedTypes"] = failed
            call.resolve(result)
        }
    }

    /// M13d task 6: `{ heightCm?, birthYear?, sex? }`, each left out when Health has nothing (or
    /// the type isn't allowed: HealthKit hides that, so it looks the same). A locked phone rejects
    /// with "LOCKED"; the TS side turns every rejection into "no profile".
    @objc func readProfile(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device", "UNAVAILABLE")
            return
        }
        Task {
            var profile = GymHealthProfile()
            do {
                profile.heightCm = try await self.latestHeightCm()
            } catch let error as HKError where error.code == .errorDatabaseInaccessible {
                call.reject("Health data is locked until the phone is unlocked", "LOCKED")
                return
            } catch {
                // Not determined / other errors: no height.
            }
            // Characteristics throw when not allowed or not determined: left out.
            if let dob = try? self.store.dateOfBirthComponents() {
                profile.birthYear = GymHealthMapping.birthYear(dob)
            }
            if let sex = try? self.store.biologicalSex() {
                profile.sex = GymHealthMapping.sexName(sex.biologicalSex)
            }
            call.resolve(profile.bridgeDictionary)
        }
    }

    // MARK: Types

    static func readTypes(for kind: GymHealthKind) -> [HKObjectType] {
        switch kind {
        case .bodyMass: [HKQuantityType(.bodyMass)]
        // Workouts plus the active-energy type, which HKWorkout statistics need for kcal.
        case .workouts: [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned)]
        case .activeEnergy: [HKQuantityType(.activeEnergyBurned)]
        case .sleep: [HKCategoryType(.sleepAnalysis)]
        case .restingHr: [HKQuantityType(.restingHeartRate)]
        case .hrv: [HKQuantityType(.heartRateVariabilitySDNN)]
        case .bodyFat: [HKQuantityType(.bodyFatPercentage)]
        case .leanMass: [HKQuantityType(.leanBodyMass)]
        }
    }

    // MARK: Queries

    private func read(_ kind: GymHealthKind, since: Date, until: Date, appBundleId: String?) async throws -> [[String: Any]] {
        switch kind {
        case .bodyMass:
            return try await quantities(.bodyMass, since: since, until: until, field: "kg", GymHealthMapping.kilograms)
        case .restingHr:
            return try await quantities(.restingHeartRate, since: since, until: until, field: "bpm", GymHealthMapping.beatsPerMinute)
        case .hrv:
            return try await quantities(.heartRateVariabilitySDNN, since: since, until: until, field: "ms", GymHealthMapping.milliseconds)
        case .bodyFat:
            return try await quantities(.bodyFatPercentage, since: since, until: until, field: "pct", GymHealthMapping.percent)
        case .leanMass:
            return try await quantities(.leanBodyMass, since: since, until: until, field: "kg", GymHealthMapping.kilograms)
        case .activeEnergy:
            return try await dailyActiveEnergy(since: since, until: until)
        case .sleep:
            return try await sleep(since: since.addingTimeInterval(-sleepLookBack), until: until)
        case .workouts:
            return try await workouts(since: since, until: until, appBundleId: appBundleId)
        }
    }

    /// The newest few height samples (newest first); the first one that converts wins.
    private func latestHeightCm() async throws -> Double? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.height))],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)],
            limit: 5)
        let samples = try await descriptor.result(for: store)
        return GymHealthMapping.latestHeightCm(samples.map { (start: $0.startDate, quantity: $0.quantity) })
    }

    private func range(_ since: Date, _ until: Date) -> NSPredicate {
        HKQuery.predicateForSamples(withStart: since, end: until, options: [])
    }

    private func source(of sample: HKSample) -> [String: Any] {
        let s = sample.sourceRevision.source
        return ["source": s.name, "bundleId": s.bundleIdentifier]
    }

    private func quantities(
        _ id: HKQuantityTypeIdentifier, since: Date, until: Date, field: String,
        _ convert: (HKQuantity) -> Double?
    ) async throws -> [[String: Any]] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(id), predicate: range(since, until))],
            sortDescriptors: [SortDescriptor(\.startDate)],
            limit: sampleLimit)
        let samples = try await descriptor.result(for: store)
        return samples.compactMap { s in
            guard let value = convert(s.quantity) else { return nil }
            var row = source(of: s)
            row["start"] = GymHealthMapping.epochMs(s.startDate)
            row[field] = value
            return row
        }
    }

    /// One row per local day: HealthKit's cumulative sum, which de-duplicates overlapping sources
    /// (for example WHOOP and iPhone both writing active energy).
    private func dailyActiveEnergy(since: Date, until: Date) async throws -> [[String: Any]] {
        let calendar = Calendar.current
        let anchor = calendar.startOfDay(for: since)
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(.activeEnergyBurned), predicate: range(anchor, until)),
            options: .cumulativeSum,
            anchorDate: anchor,
            intervalComponents: DateComponents(day: 1))
        let collection = try await descriptor.result(for: store)
        var rows: [[String: Any]] = []
        collection.enumerateStatistics(from: anchor, to: until) { stats, _ in
            guard let sum = stats.sumQuantity(), let kcal = GymHealthMapping.kilocalories(sum) else { return }
            rows.append([
                "date": GymHealthMapping.localDate(stats.startDate, calendar: calendar),
                "start": GymHealthMapping.epochMs(stats.startDate),
                "kcal": kcal,
            ])
        }
        return rows
    }

    private func sleep(since: Date, until: Date) async throws -> [[String: Any]] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: range(since, until))],
            sortDescriptors: [SortDescriptor(\.startDate)],
            limit: sampleLimit)
        let samples = try await descriptor.result(for: store)
        let segments = samples.map { s in
            SleepSegment(
                start: s.startDate, end: s.endDate, value: s.value,
                source: s.sourceRevision.source.name, bundleId: s.sourceRevision.source.bundleIdentifier)
        }
        return GymHealthMapping.sleepSessions(segments).map(\.bridgeDictionary)
    }

    private func workouts(since: Date, until: Date, appBundleId: String?) async throws -> [[String: Any]] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(range(since, until))],
            sortDescriptors: [SortDescriptor(\.startDate)],
            limit: sampleLimit)
        let samples = try await descriptor.result(for: store)
        let energyType = HKQuantityType(.activeEnergyBurned)
        return samples.compactMap { w in
            let bundleId = w.sourceRevision.source.bundleIdentifier
            if GymHealthMapping.isOwnSource(bundleId, appBundleId: appBundleId) { return nil }
            var row = source(of: w)
            row["start"] = GymHealthMapping.epochMs(w.startDate)
            row["minutes"] = GymHealthMapping.minutes(w.duration)
            row["kind"] = GymHealthMapping.activityName(w.workoutActivityType)
            if let sum = w.statistics(for: energyType)?.sumQuantity(), let kcal = GymHealthMapping.kilocalories(sum) {
                row["kcal"] = kcal
            }
            // Average heart rate is left out on purpose: it needs the heart-rate read permission,
            // which is not one of the six types (SPEC M11).
            return row
        }
    }
}
