import Foundation
import FoundationModels
import XCTest
@testable import GymBrainCore

final class BrainAvailabilityTests: XCTestCase {
    func testAvailableWithEnglish() {
        XCTAssertEqual(BrainAvailability.map(.available, supportsEnglish: true), .available)
    }

    func testAvailableWithoutEnglishIsUnsupported() {
        XCTAssertEqual(BrainAvailability.map(.available, supportsEnglish: false), .unavailable(.unsupported))
    }

    func testDeviceNotEligible() {
        XCTAssertEqual(
            BrainAvailability.map(.unavailable(.deviceNotEligible), supportsEnglish: true),
            .unavailable(.deviceNotEligible))
    }

    func testAppleIntelligenceNotEnabled() {
        XCTAssertEqual(
            BrainAvailability.map(.unavailable(.appleIntelligenceNotEnabled), supportsEnglish: true),
            .unavailable(.appleIntelligenceNotEnabled))
    }

    func testModelNotReady() {
        XCTAssertEqual(
            BrainAvailability.map(.unavailable(.modelNotReady), supportsEnglish: false),
            .unavailable(.modelNotReady))
    }

    func testBridgeDictionary() {
        XCTAssertEqual(BrainAvailability.available.bridgeDictionary["available"] as? Bool, true)
        for reason in BrainUnavailableReason.allCases {
            let d = BrainAvailability.unavailable(reason).bridgeDictionary
            XCTAssertEqual(d["available"] as? Bool, false)
            XCTAssertEqual(d["reason"] as? String, reason.rawValue)
        }
        // The raw values are the TypeScript BrainUnavailableReason strings.
        XCTAssertEqual(
            Set(BrainUnavailableReason.allCases.map(\.rawValue)),
            ["deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady", "unsupported"])
    }

    func testServicePassesAvailabilityThrough() {
        for value in [BrainAvailability.available] + BrainUnavailableReason.allCases.map(BrainAvailability.unavailable) {
            XCTAssertEqual(GymBrainService(model: FakeModel(availability: value)).availability(), value)
        }
    }
}

final class BrainErrorMappingTests: XCTestCase {
    private let ctx = LanguageModelSession.GenerationError.Context(debugDescription: "test")

    func testErrorCodesMatchTypeScript() {
        XCTAssertEqual(
            Set(BrainErrorCode.allCases.map(\.rawValue)),
            ["guardrail", "contextTooLong", "unsupportedLanguage", "timeout", "other"])
    }

    func testIOS26GenerationErrors() {
        typealias E = LanguageModelSession.GenerationError
        XCTAssertEqual(brainErrorCode(for: E.guardrailViolation(ctx)), .guardrail)
        XCTAssertEqual(brainErrorCode(for: E.refusal(E.Refusal(transcriptEntries: []), ctx)), .guardrail)
        XCTAssertEqual(brainErrorCode(for: E.exceededContextWindowSize(ctx)), .contextTooLong)
        XCTAssertEqual(brainErrorCode(for: E.unsupportedLanguageOrLocale(ctx)), .unsupportedLanguage)
        XCTAssertEqual(brainErrorCode(for: E.assetsUnavailable(ctx)), .other)
        XCTAssertEqual(brainErrorCode(for: E.unsupportedGuide(ctx)), .other)
        XCTAssertEqual(brainErrorCode(for: E.decodingFailure(ctx)), .other)
        XCTAssertEqual(brainErrorCode(for: E.rateLimited(ctx)), .other)
        XCTAssertEqual(brainErrorCode(for: E.concurrentRequests(ctx)), .other)
    }

    func testIOS27LanguageModelErrors() throws {
        guard #available(iOS 27.0, macOS 27.0, *) else {
            throw XCTSkip("LanguageModelError needs iOS 27 (run on the iOS 27 simulator)")
        }
        typealias E = LanguageModelError
        XCTAssertEqual(brainErrorCode(for: E.guardrailViolation(.init(debugDescription: "t"))), .guardrail)
        XCTAssertEqual(
            brainErrorCode(for: E.refusal(.init(explanation: "no", debugDescription: "t"))), .guardrail)
        XCTAssertEqual(
            brainErrorCode(for: E.contextSizeExceeded(.init(contextSize: 4096, tokenCount: 5000, debugDescription: "t"))),
            .contextTooLong)
        XCTAssertEqual(
            brainErrorCode(for: E.unsupportedLanguageOrLocale(.init(languageCode: .init("th"), debugDescription: "t"))),
            .unsupportedLanguage)
        XCTAssertEqual(brainErrorCode(for: E.timeout(.init(debugDescription: "t"))), .timeout)
        XCTAssertEqual(brainErrorCode(for: E.rateLimited(.init(resetDate: nil, debugDescription: "t"))), .other)
        XCTAssertEqual(
            brainErrorCode(for: E.unsupportedGenerationGuide(.init(schemaName: nil, debugDescription: "t"))), .other)
        XCTAssertEqual(
            brainErrorCode(for: E.unsupportedTranscriptContent(.init(unsupportedContent: [], debugDescription: "t"))),
            .other)
    }

    func testOurTimeoutAndEverythingElse() {
        XCTAssertEqual(brainErrorCode(for: BrainTimeoutError()), .timeout)
        XCTAssertEqual(brainErrorCode(for: CancellationError()), .other)
        XCTAssertEqual(brainErrorCode(for: NoSuchTool()), .other)
        let toolError = LanguageModelSession.ToolCallError(
            tool: LighterTodayTool(recorder: ToolCallRecorder()), underlyingError: NoSuchTool())
        XCTAssertEqual(brainErrorCode(for: toolError), .other)
    }

    /// Every code reaches the caller through `respond` (with the latency).
    func testRespondMapsEveryErrorCode() async {
        typealias E = LanguageModelSession.GenerationError
        let cases: [(any Error, BrainErrorCode)] = [
            (E.guardrailViolation(ctx), .guardrail),
            (E.exceededContextWindowSize(ctx), .contextTooLong),
            (E.unsupportedLanguageOrLocale(ctx), .unsupportedLanguage),
            (BrainTimeoutError(), .timeout),
            (E.assetsUnavailable(ctx), .other),
        ]
        for (error, code) in cases {
            let model = FakeModel { _, _ in throw error }
            let result = await GymBrainService(model: model).respond(request())
            guard case .failure(let failure) = result else { return XCTFail("expected \(code)") }
            XCTAssertEqual(failure.code, code)
            XCTAssertGreaterThanOrEqual(failure.latencyMs, 0)
        }
    }

    func testTimeoutReturnsPromptlyEvenIfTheModelIgnoresCancellation() async {
        let service = GymBrainService(model: FakeModel(behaviour: neverAnswers), timeout: .milliseconds(100))
        let started = ContinuousClock.now
        let result = await service.respond(request())
        let took = ContinuousClock.now - started
        guard case .failure(let failure) = result else { return XCTFail("expected a timeout") }
        XCTAssertEqual(failure.code, .timeout)
        XCTAssertLessThan(took, .seconds(2))
        XCTAssertGreaterThanOrEqual(failure.latencyMs, 100)
    }

    func testDefaultTimeoutIs15Seconds() {
        XCTAssertEqual(GymBrainService.defaultTimeout, .seconds(15))
    }
}

/// The finer error kind that only goes to the "GymBrain" log line.
final class BrainErrorKindTests: XCTestCase {
    private let ctx = LanguageModelSession.GenerationError.Context(debugDescription: "secret prompt text")

    func testIOS26GenerationErrorKinds() {
        typealias E = LanguageModelSession.GenerationError
        let cases: [(E, BrainErrorKind)] = [
            (E.guardrailViolation(ctx), .guardrailViolation),
            (E.refusal(E.Refusal(transcriptEntries: []), ctx), .refusal),
            (E.exceededContextWindowSize(ctx), .contextSizeExceeded),
            (E.unsupportedLanguageOrLocale(ctx), .unsupportedLanguageOrLocale),
            (E.assetsUnavailable(ctx), .assetsUnavailable),
            (E.unsupportedGuide(ctx), .unsupportedGuide),
            (E.decodingFailure(ctx), .decodingFailure),
            (E.rateLimited(ctx), .rateLimited),
            (E.concurrentRequests(ctx), .concurrentRequests),
        ]
        for (error, kind) in cases {
            XCTAssertEqual(brainErrorKind(for: error), kind)
        }
    }

    func testIOS27ErrorKinds() throws {
        guard #available(iOS 27.0, macOS 27.0, *) else {
            throw XCTSkip("LanguageModelError needs iOS 27 (run on the iOS 27 simulator)")
        }
        typealias E = LanguageModelError
        XCTAssertEqual(brainErrorKind(for: E.guardrailViolation(.init(debugDescription: "t"))), .guardrailViolation)
        XCTAssertEqual(brainErrorKind(for: E.refusal(.init(explanation: "no", debugDescription: "t"))), .refusal)
        XCTAssertEqual(
            brainErrorKind(for: E.contextSizeExceeded(.init(contextSize: 4096, tokenCount: 5000, debugDescription: "t"))),
            .contextSizeExceeded)
        XCTAssertEqual(
            brainErrorKind(for: E.unsupportedLanguageOrLocale(.init(languageCode: .init("th"), debugDescription: "t"))),
            .unsupportedLanguageOrLocale)
        XCTAssertEqual(brainErrorKind(for: E.timeout(.init(debugDescription: "t"))), .modelTimeout)
        XCTAssertEqual(brainErrorKind(for: E.rateLimited(.init(resetDate: nil, debugDescription: "t"))), .rateLimited)
        XCTAssertEqual(
            brainErrorKind(for: E.unsupportedGenerationGuide(.init(schemaName: nil, debugDescription: "t"))),
            .unsupportedGuide)
        XCTAssertEqual(
            brainErrorKind(for: E.unsupportedTranscriptContent(.init(unsupportedContent: [], debugDescription: "t"))),
            .unsupportedTranscriptContent)
        XCTAssertEqual(brainErrorKind(for: LanguageModelSession.Error.concurrentRequests), .concurrentRequests)
        XCTAssertEqual(
            brainErrorKind(for: LanguageModelSession.Error.transcriptMutationWhileResponding),
            .transcriptMutationWhileResponding)
        // GeneratedContent.ParsingError (→ decodingFailure) has no public initializer to test with.
    }

    func testOurTimeoutToolErrorsAndEverythingElse() {
        XCTAssertEqual(brainErrorKind(for: BrainTimeoutError()), .timeout)
        XCTAssertEqual(brainErrorKind(for: CancellationError()), .cancelled)
        XCTAssertEqual(brainErrorKind(for: NoSuchTool()), .unknown)
        let toolError = LanguageModelSession.ToolCallError(
            tool: LighterTodayTool(recorder: ToolCallRecorder()), underlyingError: NoSuchTool())
        XCTAssertEqual(brainErrorKind(for: toolError), .toolCallError)
    }

    /// The kind is a fixed name: nothing from the error's text can reach the log.
    func testKindNamesAreFixedIdentifiers() {
        for kind in BrainErrorKind.allCases {
            XCTAssertTrue(kind.rawValue.allSatisfy { $0.isLetter }, kind.rawValue)
        }
        XCTAssertEqual(Set(BrainErrorKind.allCases.map(\.rawValue)).count, BrainErrorKind.allCases.count)
    }

    /// Logging the kind leaves the bridge code unchanged.
    func testRespondStillReturnsTheSameCode() async {
        let error = LanguageModelSession.GenerationError.concurrentRequests(ctx)
        let model = FakeModel { _, _ in throw error }
        let result = await GymBrainService(model: model).respond(request())
        guard case .failure(let failure) = result else { return XCTFail("expected a failure") }
        XCTAssertEqual(failure.code, .other)
    }
}
