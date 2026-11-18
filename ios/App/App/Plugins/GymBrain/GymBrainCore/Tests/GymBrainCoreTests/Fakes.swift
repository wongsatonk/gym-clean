import Foundation
import FoundationModels
import Synchronization
@testable import GymBrainCore

/// Thread-safe box for test state.
final class Locked<Value: Sendable>: Sendable {
    private let m: Mutex<Value>
    init(_ value: Value) { m = Mutex(value) }
    func get() -> Value { m.withLock { $0 } }
    func set(_ new: Value) { m.withLock { $0 = new } }
    func update(_ body: (inout Value) -> Void) { m.withLock { body(&$0) } }
}

/// What the fake model does for one `respond`: it gets the prompt and the session's tools (to
/// call them like the real model would, with JSON arguments) and returns the reply text.
typealias FakeBehaviour = @Sendable (_ prompt: String, _ tools: [any Tool]) async throws -> String

struct FakeSession: BrainSession {
    let instructions: String
    let tools: [any Tool]
    let behaviour: Locked<FakeBehaviour>
    let prewarms: Locked<Int>
    let prompts: Locked<[String]>

    func respond(to prompt: String) async throws -> String {
        prompts.update { $0.append(prompt) }
        return try await behaviour.get()(prompt, tools)
    }

    func prewarm() { prewarms.update { $0 += 1 } }
}

final class FakeModel: BrainModel {
    let availabilityValue: Locked<BrainAvailability>
    let behaviour: Locked<FakeBehaviour>
    let sessions = Locked<[FakeSession]>([])
    let prewarms = Locked(0)
    let prompts = Locked<[String]>([])
    let counts = Locked<BrainTokenCounts?>(nil)
    let measuredToolNames = Locked<[String]>([])

    init(
        availability: BrainAvailability = .available,
        behaviour: @escaping FakeBehaviour = { _, _ in "OK." }
    ) {
        availabilityValue = Locked(availability)
        self.behaviour = Locked(behaviour)
    }

    func availability() -> BrainAvailability { availabilityValue.get() }

    func makeSession(instructions: String, tools: [any Tool]) -> any BrainSession {
        let s = FakeSession(
            instructions: instructions, tools: tools, behaviour: behaviour, prewarms: prewarms, prompts: prompts)
        sessions.update { $0.append(s) }
        return s
    }

    func measure(instructions: String, tools: [any Tool], prompt: String) async -> BrainTokenCounts? {
        measuredToolNames.set(tools.map(\.name))
        return counts.get()
    }
}

struct NoSuchTool: Error {}

/// Calls a tool by name with JSON arguments, the way the model's output reaches `call(arguments:)`.
func callTool(_ tools: [any Tool], _ name: String, _ json: String = "{}") async throws -> String {
    guard let tool = tools.first(where: { $0.name == name }) else { throw NoSuchTool() }
    return try await invoke(tool, json: json)
}

private func invoke<T: Tool>(_ tool: T, json: String) async throws -> String {
    let arguments = try T.Arguments(GeneratedContent(json: json))
    let output = try await tool.call(arguments: arguments)
    return (output as? String) ?? String(describing: output)
}

/// A session that never answers and ignores cancellation (to test that the timeout still returns).
let neverAnswers: FakeBehaviour = { _, _ in
    let deadline = ContinuousClock.now + .seconds(5)
    while ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(20)) }
    return "too late"
}

func request(
    instructions: String = "Be brief.", context: String = "Today's plan: Pull A.", message: String = "Hi",
    toolResults: [String: String] = [:]
) -> BrainRequest {
    BrainRequest(instructions: instructions, context: context, message: message, toolResults: toolResults)
}
