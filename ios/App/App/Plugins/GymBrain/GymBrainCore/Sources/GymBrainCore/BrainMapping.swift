import Foundation
import FoundationModels

// MARK: Availability

/// Why Apple's on-device model can't answer. Matches `BrainUnavailableReason` in src/core/types.ts
/// (minus `notNative`, which only TypeScript knows).
public enum BrainUnavailableReason: String, Sendable, Equatable, CaseIterable {
    case deviceNotEligible
    case appleIntelligenceNotEnabled
    case modelNotReady
    case unsupported
}

public enum BrainAvailability: Sendable, Equatable {
    case available
    case unavailable(BrainUnavailableReason)

    /// Pure mapping of Apple's availability (docs/ios-setup.md "Slice 2 API notes" §1). The model
    /// must also support English; otherwise the coach can't use it ("unsupported").
    public static func map(
        _ availability: SystemLanguageModel.Availability, supportsEnglish: Bool
    ) -> BrainAvailability {
        switch availability {
        case .available:
            return supportsEnglish ? .available : .unavailable(.unsupported)
        case .unavailable(let reason):
            return .unavailable(map(reason))
        }
    }

    static func map(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> BrainUnavailableReason {
        switch reason {
        case .deviceNotEligible: return .deviceNotEligible
        case .appleIntelligenceNotEnabled: return .appleIntelligenceNotEnabled
        case .modelNotReady: return .modelNotReady
        @unknown default: return .unsupported
        }
    }

    /// The plugin's `availability()` reply.
    public var bridgeDictionary: [String: Any] {
        switch self {
        case .available: ["available": true]
        case .unavailable(let reason): ["available": false, "reason": reason.rawValue]
        }
    }
}

// MARK: Errors

/// A failed `respond`. Matches `BrainErrorCode` in src/core/types.ts.
public enum BrainErrorCode: String, Sendable, Equatable, CaseIterable {
    case guardrail
    case contextTooLong
    case unsupportedLanguage
    case timeout
    case other
}

/// Our own timer ran out (Apple's iOS 26 API has no timeout of its own).
public struct BrainTimeoutError: Error, Equatable, Sendable {
    public init() {}
}

/// Maps both of Apple's error families to `BrainErrorCode`: `LanguageModelSession.GenerationError`
/// (iOS 26, deprecated in 27) and `LanguageModelError` (iOS 27). Anything else, including a
/// throwing tool (`ToolCallError`; ours never throw), is `other`.
public func brainErrorCode(for error: any Error) -> BrainErrorCode {
    if error is BrainTimeoutError { return .timeout }
    if #available(iOS 27.0, macOS 27.0, *), let e = error as? LanguageModelError {
        return languageModelErrorCode(e)
    }
    if let e = error as? LanguageModelSession.GenerationError {
        return generationErrorCode(e)
    }
    return .other
}

@available(iOS 27.0, macOS 27.0, *)
private func languageModelErrorCode(_ e: LanguageModelError) -> BrainErrorCode {
    switch e {
    case .guardrailViolation, .refusal: return .guardrail
    case .contextSizeExceeded: return .contextTooLong
    case .unsupportedLanguageOrLocale: return .unsupportedLanguage
    case .timeout: return .timeout
    case .rateLimited, .unsupportedCapability, .unsupportedTranscriptContent, .unsupportedGenerationGuide:
        return .other
    @unknown default: return .other
    }
}

private func generationErrorCode(_ e: LanguageModelSession.GenerationError) -> BrainErrorCode {
    switch e {
    case .guardrailViolation, .refusal: return .guardrail
    case .exceededContextWindowSize: return .contextTooLong
    case .unsupportedLanguageOrLocale: return .unsupportedLanguage
    default: return .other  // assetsUnavailable, unsupportedGuide, decodingFailure, rateLimited, concurrentRequests, unknown
    }
}

// MARK: Error kinds (log only)

/// The specific Apple error behind a failed `respond`, for the one `os.Logger` line (category
/// "GymBrain"). Finer than `BrainErrorCode`, which stays the bridge contract. Only this fixed
/// name is logged (never the error's description, the prompt, the reply or tool text). Both
/// error families use the same name for the same failure, so one console filter finds either.
public enum BrainErrorKind: String, Sendable, Equatable, CaseIterable {
    /// Our own 15 s timer.
    case timeout
    /// Apple's own timeout (`LanguageModelError.timeout`, iOS 27).
    case modelTimeout
    case guardrailViolation
    case refusal
    case contextSizeExceeded
    case unsupportedLanguageOrLocale
    case assetsUnavailable
    case unsupportedGuide
    case decodingFailure
    case rateLimited
    case concurrentRequests
    case unsupportedCapability
    case unsupportedTranscriptContent
    case transcriptMutationWhileResponding
    case toolCallError
    case cancelled
    case unknownGenerationError
    case unknownLanguageModelError
    case unknown
}

/// Pure: which `BrainErrorKind` an error is. Independent of `brainErrorCode(for:)`.
public func brainErrorKind(for error: any Error) -> BrainErrorKind {
    if error is BrainTimeoutError { return .timeout }
    if error is CancellationError { return .cancelled }
    if error is LanguageModelSession.ToolCallError { return .toolCallError }
    if #available(iOS 27.0, macOS 27.0, *), let kind = ios27ErrorKind(error) {
        return kind
    }
    if let e = error as? LanguageModelSession.GenerationError {
        return generationErrorKind(e)
    }
    return .unknown
}

@available(iOS 27.0, macOS 27.0, *)
private func ios27ErrorKind(_ error: any Error) -> BrainErrorKind? {
    if let e = error as? LanguageModelError {
        switch e {
        case .guardrailViolation: return .guardrailViolation
        case .refusal: return .refusal
        case .contextSizeExceeded: return .contextSizeExceeded
        case .unsupportedLanguageOrLocale: return .unsupportedLanguageOrLocale
        case .timeout: return .modelTimeout
        case .rateLimited: return .rateLimited
        case .unsupportedCapability: return .unsupportedCapability
        case .unsupportedTranscriptContent: return .unsupportedTranscriptContent
        case .unsupportedGenerationGuide: return .unsupportedGuide
        @unknown default: return .unknownLanguageModelError
        }
    }
    if let e = error as? LanguageModelSession.Error {
        switch e {
        case .concurrentRequests: return .concurrentRequests
        case .transcriptMutationWhileResponding: return .transcriptMutationWhileResponding
        @unknown default: return .unknownLanguageModelError
        }
    }
    if error is SystemLanguageModel.Error { return .assetsUnavailable }
    if error is GeneratedContent.ParsingError { return .decodingFailure }
    return nil
}

private func generationErrorKind(_ e: LanguageModelSession.GenerationError) -> BrainErrorKind {
    switch e {
    case .guardrailViolation: return .guardrailViolation
    case .refusal: return .refusal
    case .exceededContextWindowSize: return .contextSizeExceeded
    case .unsupportedLanguageOrLocale: return .unsupportedLanguageOrLocale
    case .assetsUnavailable: return .assetsUnavailable
    case .unsupportedGuide: return .unsupportedGuide
    case .decodingFailure: return .decodingFailure
    case .rateLimited: return .rateLimited
    case .concurrentRequests: return .concurrentRequests
    @unknown default: return .unknownGenerationError
    }
}
