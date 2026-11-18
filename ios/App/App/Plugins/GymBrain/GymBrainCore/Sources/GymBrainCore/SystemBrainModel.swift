import Foundation
import FoundationModels

/// The real model: always `SystemLanguageModel.default`, Apple's on-device model. Never
/// the iOS 27 cloud model: nothing leaves the phone.
public struct SystemBrainModel: BrainModel {
    /// Data: a cap on the reply (instructions ask for ≤ 4 short sentences, `say` ≤ 12 words; the
    /// budget test in context.test.ts reserves 350). Lowered from 600 in 1.15.0 for headroom.
    public static let maximumResponseTokens = 350

    public init() {}

    public func availability() -> BrainAvailability {
        let model = SystemLanguageModel.default
        return BrainAvailability.map(
            model.availability, supportsEnglish: model.supportsLocale(Locale(identifier: "en")))
    }

    public func makeSession(instructions: String, tools: [any Tool]) -> any BrainSession {
        SystemBrainSession(
            session: LanguageModelSession(model: SystemLanguageModel.default, tools: tools, instructions: instructions))
    }

    public func measure(instructions: String, tools: [any Tool], prompt: String) async -> BrainTokenCounts? {
        guard #available(iOS 26.4, macOS 26.4, *) else { return nil }
        let model = SystemLanguageModel.default
        guard model.isAvailable else { return nil }
        do {
            return BrainTokenCounts(
                instructions: try await model.tokenCount(for: Instructions(instructions)),
                tools: try await model.tokenCount(for: tools),
                prompt: try await model.tokenCount(for: prompt),
                contextSize: model.contextSize)
        } catch {
            return nil
        }
    }
}

struct SystemBrainSession: BrainSession {
    let session: LanguageModelSession

    func respond(to prompt: String) async throws -> String {
        let options = GenerationOptions(maximumResponseTokens: SystemBrainModel.maximumResponseTokens)
        return try await session.respond(to: prompt, options: options).content
    }

    func prewarm() {
        session.prewarm()
    }
}
