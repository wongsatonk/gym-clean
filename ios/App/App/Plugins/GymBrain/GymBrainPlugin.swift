import Capacitor
import Foundation
import GymBrainCore

/// M12 slice 2 task 7: Apple's on-device model for the coach chat (M10 phase B, task B4).
///
/// - Always `SystemLanguageModel.default` on the phone (GymBrainCore.SystemBrainModel). Never the
///   iOS 27 cloud model. The plugin makes no network request.
/// - Swift stays thin: availability and error mapping, the generated tools, the tool-call recorder,
///   the 15 s timeout and the prewarm rule live in GymBrainCore and are tested with a fake session.
///   Instructions, context, read-only results, sanitizing and turning tool calls into proposals are
///   TypeScript's (src/core/trainer/**, src/data/brain/apple.ts).
/// - The model only proposes: propose tools record `{ name, args }`; nothing changes without a tap.
///
/// Methods: `availability()`, `respond(GymBrainRequest)` → `{ text, toolCalls, latencyMs }` or a
/// rejection with code = `BrainErrorCode` (`guardrail`, `contextTooLong`, `unsupportedLanguage`,
/// `timeout`, `other`; `invalidRequest` for a malformed request), `prewarm({ instructions })`,
/// `measure(GymBrainRequest)` → token counts on iOS 26.4+ (`{}` where unavailable).
@objc(GymBrainPlugin)
public class GymBrainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GymBrainPlugin"
    public let jsName = "GymBrain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "respond", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prewarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "measure", returnType: CAPPluginReturnPromise),
    ]

    private let service = GymBrainService(model: SystemBrainModel())

    @objc func availability(_ call: CAPPluginCall) {
        call.resolve(service.availability().bridgeDictionary)
    }

    @objc func respond(_ call: CAPPluginCall) {
        guard let request = BrainRequest(bridge: call.options as? [String: Any] ?? [:]) else {
            call.reject("Invalid request", "invalidRequest")
            return
        }
        let service = self.service
        Task {
            switch await service.respond(request) {
            case .success(let reply):
                call.resolve(reply.bridgeDictionary)
            case .failure(let failure):
                call.reject(
                    "The on-device model did not answer", failure.code.rawValue, nil,
                    ["code": failure.code.rawValue, "latencyMs": failure.latencyMs])
            }
        }
    }

    @objc func prewarm(_ call: CAPPluginCall) {
        service.prewarm(instructions: call.getString("instructions") ?? "")
        call.resolve()
    }

    @objc func measure(_ call: CAPPluginCall) {
        guard let request = BrainRequest(bridge: call.options as? [String: Any] ?? [:]) else {
            call.resolve([:])
            return
        }
        let service = self.service
        Task {
            call.resolve(await service.measure(request)?.bridgeDictionary ?? [:])
        }
    }
}
