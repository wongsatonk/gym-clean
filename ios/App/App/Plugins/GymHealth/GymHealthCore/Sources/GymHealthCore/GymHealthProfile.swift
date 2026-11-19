import Foundation
import HealthKit

/// M13d task 6: what Apple Health knows about you that Set up Fuel can pre-fill (SPEC M13d Goal 2).
///
/// Read once, on demand, only to pre-fill; the plugin stores nothing. The date of birth is cut to
/// the **year** here, in Swift, so the full date never reaches the web view. Sex is passed only
/// when Health says female or male; "other" and "not set" are left out, never guessed.
public struct GymHealthProfile: Sendable, Equatable {
    public var heightCm: Double?
    public var birthYear: Int?
    /// "female" or "male" only.
    public var sex: String?

    public init(heightCm: Double? = nil, birthYear: Int? = nil, sex: String? = nil) {
        self.heightCm = heightCm
        self.birthYear = birthYear
        self.sex = sex
    }

    /// The shape `src/native/health.ts` reads (`HealthProfile`); missing values are left out.
    public var bridgeDictionary: [String: Any] {
        var out: [String: Any] = [:]
        if let heightCm { out["heightCm"] = heightCm }
        if let birthYear { out["birthYear"] = birthYear }
        if let sex { out["sex"] = sex }
        return out
    }
}

extension GymHealthMapping {
    public static var centimeterUnit: HKUnit { .meterUnit(with: .centi) }

    /// The three read-only profile types added to the Health sheet by `requestRead({ profile: true })`:
    /// height, date of birth and biological sex. Nothing here is ever written.
    public static var profileReadTypes: [HKObjectType] {
        [
            HKQuantityType(.height),
            HKCharacteristicType(.dateOfBirth),
            HKCharacteristicType(.biologicalSex),
        ]
    }

    /// Height in centimetres, one decimal (HealthKit converts from m, in, ft).
    public static func centimeters(_ q: HKQuantity) -> Double? {
        guard q.is(compatibleWith: centimeterUnit) else { return nil }
        let v = q.doubleValue(for: centimeterUnit)
        guard v.isFinite, v > 0 else { return nil }
        return round(v, places: 1)
    }

    /// Year only from Health's date of birth; month and day are dropped here.
    public static func birthYear(_ components: DateComponents) -> Int? {
        guard let year = components.year, year > 0 else { return nil }
        return year
    }

    /// "female" / "male"; other and not set → nil (left out, never guessed).
    public static func sexName(_ sex: HKBiologicalSex) -> String? {
        switch sex {
        case .female: "female"
        case .male: "male"
        default: nil
        }
    }

    /// The latest of several height readings (by start date), in cm; nil when there are none
    /// or none convert.
    public static func latestHeightCm(_ samples: [(start: Date, quantity: HKQuantity)]) -> Double? {
        samples
            .sorted { $0.start > $1.start }
            .lazy
            .compactMap { centimeters($0.quantity) }
            .first
    }
}
