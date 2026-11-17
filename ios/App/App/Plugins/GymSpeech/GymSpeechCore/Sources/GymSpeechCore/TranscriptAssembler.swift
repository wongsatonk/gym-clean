import Foundation

/// Builds the text heard so far from recognizer results: final results are appended, a live
/// (volatile) result replaces the previous live one.
public struct TranscriptAssembler: Sendable, Equatable {
    private var finalized = ""
    private var volatile = ""

    public init() {}

    public mutating func apply(text: String, isFinal: Bool) {
        if isFinal {
            finalized += text
            volatile = ""
        } else {
            volatile = text
        }
    }

    /// Final + live text, with runs of whitespace collapsed and the ends trimmed.
    public var text: String {
        (finalized + volatile)
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}

/// Loudness of one audio buffer for the mic level ring.
public enum AudioLevel {
    /// Root mean square of the samples, clamped to 0...1. Empty or non-finite input is 0.
    public static func rms(_ samples: UnsafeBufferPointer<Float>) -> Float {
        guard !samples.isEmpty else { return 0 }
        var sum: Float = 0
        for s in samples { sum += s * s }
        return clamp((sum / Float(samples.count)).squareRoot())
    }

    public static func rms(_ samples: [Float]) -> Float {
        samples.withUnsafeBufferPointer(rms)
    }

    /// Quietest loudness the level ring shows, in decibels relative to full scale.
    public static let floorDb: Float = -50

    /// Maps a raw RMS (speech is roughly 0.01...0.3) onto 0...1 on a decibel scale, so normal
    /// talking moves the ring: `floorDb` and below → 0, full scale → 1.
    public static func normalized(rms: Float) -> Float {
        guard rms.isFinite, rms > 0 else { return 0 }
        return clamp((20 * log10(rms) - floorDb) / -floorDb)
    }

    public static func clamp(_ value: Float) -> Float {
        value.isFinite ? min(max(value, 0), 1) : 0
    }
}
