import Foundation
import HealthKit
import XCTest
@testable import GymHealthCore

// M13d task 6. Made-up numbers only.
final class GymHealthProfileTests: XCTestCase {
    // MARK: Height

    func testHeightInCentimetresFromMetresInchesAndCentimetres() {
        XCTAssertEqual(GymHealthMapping.centimeters(HKQuantity(unit: .meter(), doubleValue: 1.7)), 170)
        XCTAssertEqual(GymHealthMapping.centimeters(HKQuantity(unit: .inch(), doubleValue: 67)), 170.2)
        XCTAssertEqual(GymHealthMapping.centimeters(HKQuantity(unit: .meterUnit(with: .centi), doubleValue: 163.44)), 163.4)
        XCTAssertEqual(GymHealthMapping.centimeters(HKQuantity(unit: .foot(), doubleValue: 6)), 182.9)
    }

    func testHeightWithWrongUnitOrJunkIsNil() {
        XCTAssertNil(GymHealthMapping.centimeters(HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: 170)))
        XCTAssertNil(GymHealthMapping.centimeters(HKQuantity(unit: .meter(), doubleValue: .nan)))
        XCTAssertNil(GymHealthMapping.centimeters(HKQuantity(unit: .meter(), doubleValue: 0)))
    }

    func testLatestHeightWins() {
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        let samples: [(start: Date, quantity: HKQuantity)] = [
            (t0, HKQuantity(unit: .meterUnit(with: .centi), doubleValue: 168)),
            (t0.addingTimeInterval(86_400 * 30), HKQuantity(unit: .meterUnit(with: .centi), doubleValue: 171)),
            (t0.addingTimeInterval(86_400), HKQuantity(unit: .meterUnit(with: .centi), doubleValue: 169)),
        ]
        XCTAssertEqual(GymHealthMapping.latestHeightCm(samples), 171)
    }

    func testNoHeightSampleIsNil() {
        XCTAssertNil(GymHealthMapping.latestHeightCm([]))
    }

    // MARK: Date of birth → year only

    func testBirthYearKeepsOnlyTheYear() {
        let dob = DateComponents(calendar: Calendar(identifier: .gregorian), year: 1990, month: 7, day: 14)
        XCTAssertEqual(GymHealthMapping.birthYear(dob), 1990)
        let dict = GymHealthProfile(birthYear: GymHealthMapping.birthYear(dob)).bridgeDictionary
        XCTAssertEqual(dict.count, 1)
        XCTAssertEqual(dict["birthYear"] as? Int, 1990)
        XCTAssertNil(dict["month"])
        XCTAssertNil(dict["day"])
    }

    func testNoDateOfBirthIsNil() {
        // HealthKit hands back empty components when no birthday is set.
        XCTAssertNil(GymHealthMapping.birthYear(DateComponents()))
        XCTAssertNil(GymHealthMapping.birthYear(DateComponents(month: 7, day: 14)))
    }

    // MARK: Sex

    func testSexFemaleAndMale() {
        XCTAssertEqual(GymHealthMapping.sexName(.female), "female")
        XCTAssertEqual(GymHealthMapping.sexName(.male), "male")
    }

    func testSexOtherAndNotSetAreLeftOut() {
        XCTAssertNil(GymHealthMapping.sexName(.other))
        XCTAssertNil(GymHealthMapping.sexName(.notSet))
        XCTAssertTrue(GymHealthProfile(sex: GymHealthMapping.sexName(.other)).bridgeDictionary.isEmpty)
        XCTAssertTrue(GymHealthProfile(sex: GymHealthMapping.sexName(.notSet)).bridgeDictionary.isEmpty)
    }

    // MARK: Bridge shape

    func testFullProfileDictionary() {
        let dict = GymHealthProfile(heightCm: 170, birthYear: 1990, sex: "female").bridgeDictionary
        XCTAssertEqual(Set(dict.keys), ["heightCm", "birthYear", "sex"])
        XCTAssertEqual(dict["heightCm"] as? Double, 170)
        XCTAssertEqual(dict["birthYear"] as? Int, 1990)
        XCTAssertEqual(dict["sex"] as? String, "female")
    }

    func testEmptyProfileIsEmptyDictionary() {
        XCTAssertTrue(GymHealthProfile().bridgeDictionary.isEmpty)
    }

    // MARK: Read types

    func testProfileReadTypesAreHeightBirthdayAndSexOnly() {
        let types = Set(GymHealthMapping.profileReadTypes)
        XCTAssertEqual(types, [
            HKQuantityType(.height),
            HKCharacteristicType(.dateOfBirth),
            HKCharacteristicType(.biologicalSex),
        ])
    }
}
