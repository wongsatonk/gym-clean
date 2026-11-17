import Foundation
import XCTest
@testable import GymSpeechCore

final class SpeechMappingTests: XCTestCase {
    // MARK: Availability

    func testAvailabilityMapping() {
        XCTAssertEqual(SpeechAvailability.resolve(support: .ready, permission: .granted), .available)
        XCTAssertEqual(SpeechAvailability.resolve(support: .ready, permission: .undetermined), .available)
        XCTAssertEqual(
            SpeechAvailability.resolve(support: .ready, permission: .denied), .unavailable(.permissionDenied))
        // Device support wins over permission.
        for permission in [MicPermission.granted, .undetermined, .denied] {
            XCTAssertEqual(
                SpeechAvailability.resolve(support: .unsupported, permission: permission), .unavailable(.unsupported))
            XCTAssertEqual(
                SpeechAvailability.resolve(support: .modelNotInstalled, permission: permission),
                .unavailable(.modelNotInstalled))
            XCTAssertEqual(
                SpeechAvailability.resolve(support: .modelDownloading, permission: permission),
                .unavailable(.modelDownloading))
        }
    }

    func testAvailabilityBridgeShape() {
        XCTAssertEqual(SpeechAvailability.available.bridgeDictionary as NSDictionary, ["available": true])
        XCTAssertEqual(
            SpeechAvailability.unavailable(.modelNotInstalled).bridgeDictionary as NSDictionary,
            ["available": false, "reason": "modelNotInstalled"])
    }

    // MARK: Events

    func testEventNamesAndPayloads() {
        XCTAssertEqual(SpeechEvent.partial(text: "hi").name, "partial")
        XCTAssertEqual(SpeechEvent.partial(text: "hi").bridgeDictionary as NSDictionary, ["text": "hi"])
        XCTAssertEqual(SpeechEvent.level(rms: 0.5).name, "level")
        XCTAssertEqual(SpeechEvent.level(rms: 0.5).bridgeDictionary as NSDictionary, ["rms": 0.5])
        XCTAssertEqual(SpeechEvent.final(text: "done", capped: false).name, "final")
        XCTAssertEqual(
            SpeechEvent.final(text: "done", capped: false).bridgeDictionary as NSDictionary, ["text": "done"])
        XCTAssertEqual(
            SpeechEvent.final(text: "done", capped: true).bridgeDictionary as NSDictionary,
            ["text": "done", "capped": true])
        XCTAssertEqual(SpeechEvent.error(code: .interrupted).name, "error")
        XCTAssertEqual(
            SpeechEvent.error(code: .interrupted).bridgeDictionary as NSDictionary, ["code": "interrupted"])
    }

    // MARK: Text

    func testAssemblerAppendsFinalsAndReplacesLiveText() {
        var t = TranscriptAssembler()
        XCTAssertEqual(t.text, "")
        t.apply(text: "go", isFinal: false)
        t.apply(text: "go easy", isFinal: false)
        XCTAssertEqual(t.text, "go easy")
        t.apply(text: "Go easy ", isFinal: true)
        XCTAssertEqual(t.text, "Go easy")
        t.apply(text: " on  my\nshoulders", isFinal: false)
        XCTAssertEqual(t.text, "Go easy on my shoulders")
        t.apply(text: "on my shoulder today.", isFinal: true)
        XCTAssertEqual(t.text, "Go easy on my shoulder today.")
    }

    // MARK: Loudness

    func testRms() {
        XCTAssertEqual(AudioLevel.rms([]), 0)
        XCTAssertEqual(AudioLevel.rms([0, 0, 0]), 0)
        XCTAssertEqual(AudioLevel.rms([0.5, -0.5, 0.5, -0.5]), 0.5, accuracy: 1e-6)
        XCTAssertEqual(AudioLevel.rms([3, -3]), 1, "clamped")
        XCTAssertEqual(AudioLevel.rms([.nan, 0.1]), 0)
        XCTAssertEqual(AudioLevel.clamp(-0.2), 0)
    }

    func testNormalizedLevelIsADecibelScale() {
        XCTAssertEqual(AudioLevel.normalized(rms: 0), 0)
        XCTAssertEqual(AudioLevel.normalized(rms: .nan), 0)
        XCTAssertEqual(AudioLevel.normalized(rms: 0.001), 0, "below the -50 dB floor")
        XCTAssertEqual(AudioLevel.normalized(rms: 0.1), 0.6, accuracy: 1e-5) // -20 dB
        XCTAssertEqual(AudioLevel.normalized(rms: 1), 1)
        XCTAssertEqual(AudioLevel.normalized(rms: 4), 1)
    }
}
