import Foundation

// MARK: What the phone can do

/// Whether on-device speech-to-text can run for a locale. Checked without prompting.
public enum SpeechSupport: Sendable, Equatable {
    /// An on-device model for the locale is installed.
    case ready
    /// No on-device transcriber for this device or locale. The mic stays off; nothing is sent
    /// to a server instead.
    case unsupported
    /// Supported, but the system model isn't installed yet (the app can ask iOS to download it).
    case modelNotInstalled
    case modelDownloading
}

public enum MicPermission: Sendable, Equatable {
    case undetermined
    case granted
    case denied
}

public enum SpeechUnavailableReason: String, Sendable, Equatable {
    case unsupported
    case modelNotInstalled
    case modelDownloading
    case permissionDenied
}

public enum SpeechAvailability: Sendable, Equatable {
    case available
    case unavailable(SpeechUnavailableReason)

    /// Pure mapping. A permission that was never asked counts as available: the first `start`
    /// asks. Device support wins over permission, so an unsupported phone never shows a prompt.
    public static func resolve(support: SpeechSupport, permission: MicPermission) -> SpeechAvailability {
        switch support {
        case .unsupported: return .unavailable(.unsupported)
        case .modelNotInstalled: return .unavailable(.modelNotInstalled)
        case .modelDownloading: return .unavailable(.modelDownloading)
        case .ready: return permission == .denied ? .unavailable(.permissionDenied) : .available
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

// MARK: Events to the web view

public enum SpeechErrorCode: String, Sendable, Equatable {
    case permissionDenied
    case unavailable
    /// The app went to the background or the audio was interrupted. Nothing is sent as a message.
    case interrupted
    case failed
}

public enum SpeechEvent: Sendable, Equatable {
    /// The whole text heard so far (final parts plus the live, still-changing part).
    case partial(text: String)
    /// Input loudness, 0...1.
    case level(rms: Double)
    /// The finished text after `stop` (or the time cap).
    case final(text: String, capped: Bool)
    case error(code: SpeechErrorCode)

    public var name: String {
        switch self {
        case .partial: "partial"
        case .level: "level"
        case .final: "final"
        case .error: "error"
        }
    }

    public var bridgeDictionary: [String: Any] {
        switch self {
        case .partial(let text): ["text": text]
        case .level(let rms): ["rms": rms]
        case .final(let text, let capped): capped ? ["text": text, "capped": true] : ["text": text]
        case .error(let code): ["code": code.rawValue]
        }
    }
}

/// Why `start` did not begin listening. `bridgeCode` is the plugin's rejection code.
public enum SpeechStartError: Error, Sendable, Equatable {
    case busy
    case unavailable(SpeechUnavailableReason)
    case permissionDenied
    case interrupted
    case failed

    public var bridgeCode: String {
        switch self {
        case .busy: "BUSY"
        case .unavailable: "UNAVAILABLE"
        case .permissionDenied: "PERMISSION_DENIED"
        case .interrupted: "INTERRUPTED"
        case .failed: "FAILED"
        }
    }
}

// MARK: Seams (the app supplies the real ones; tests supply fakes)

public enum SpeechEngineEvent: Sendable, Equatable {
    /// One recognizer result. `isFinal == false` is a live ("volatile") result that the next
    /// result replaces; final results are appended.
    case transcript(text: String, isFinal: Bool)
    /// Loudness of one audio buffer, 0...1.
    case level(Float)
    case failed
}

/// The recognizer + microphone. The real one lives in the App target (SpeechAnalyzer).
public protocol SpeechEngine: Sendable {
    /// Starts the microphone and the recognizer. The stream ends after `finish()` (once the last
    /// final result is out) or `cancel()`.
    func start(locale: String) async throws -> AsyncStream<SpeechEngineEvent>
    /// Stops the microphone and lets the recognizer finish the text.
    func finish() async
    /// Stops everything now and drops unfinished text.
    func cancel() async
}

/// Device checks and the microphone prompt.
public protocol SpeechEnvironment: Sendable {
    func support(locale: String) async -> SpeechSupport
    func micPermission() async -> MicPermission
    /// Shows the iOS microphone prompt. Only `SpeechSession.start` calls this.
    func requestMicPermission() async -> Bool
}
