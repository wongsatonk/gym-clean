import Foundation
import FoundationModels
import Synchronization

/// One propose-tool call the model made. Never applied here: TypeScript turns it into a proposal
/// card and nothing changes without a tap.
public struct RecordedToolCall: Sendable, Equatable {
    public let name: String
    /// The arguments as JSON (`GeneratedContent.jsonString`); absent optionals are left out.
    public let argumentsJSON: String

    public init(name: String, argumentsJSON: String) {
        self.name = name
        self.argumentsJSON = argumentsJSON
    }

    /// `{ name, args }` for the bridge. Unparseable or non-object arguments become `{}`, and
    /// nulls are dropped (TypeScript validates every argument again before a proposal).
    public var bridgeDictionary: [String: Any] {
        var args: [String: Any] = [:]
        if let data = argumentsJSON.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            args = object.filter { !($0.value is NSNull) }
        }
        return ["name": name, "args": args]
    }
}

/// Records propose-tool calls. Thread-safe: the model can run tool calls in parallel.
public final class ToolCallRecorder: Sendable {
    private let calls = Mutex<[RecordedToolCall]>([])

    public init() {}

    public func record(name: String, arguments: GeneratedContent) {
        record(RecordedToolCall(name: name, argumentsJSON: arguments.jsonString))
    }

    public func record(_ call: RecordedToolCall) {
        calls.withLock { $0.append(call) }
    }

    /// The calls so far, in the order they finished.
    public var recorded: [RecordedToolCall] {
        calls.withLock { $0 }
    }
}

/// The read-only tool results the app computed before `respond` (`GymBrainRequest.toolResults`).
/// A box, because a prewarmed session's tools exist before the request does.
public final class ReadToolResults: Sendable {
    /// `exerciseInfo` for an id the app didn't pass (and no bare `exerciseInfo` entry).
    public static let notInPlan = "Not in your plan this week."
    /// Any other read-only tool without a result.
    public static let missing = "No data right now."

    private let values: Mutex<[String: String]>

    public init(_ values: [String: String] = [:]) {
        self.values = Mutex(values)
    }

    public func set(_ new: [String: String]) {
        values.withLock { $0 = new }
    }

    /// `weekSummary`, `progressSummary`, `foodIdeas`: the entry with the tool's name.
    public func text(for tool: String) -> String {
        values.withLock { $0[tool] } ?? Self.missing
    }

    /// `exerciseInfo`: `exerciseInfo:<id>`, else the bare `exerciseInfo` entry, else `notInPlan`.
    public func text(for tool: String, exerciseId: String) -> String {
        values.withLock { v in
            v["\(tool):\(exerciseId)"] ?? v[tool]
        } ?? Self.notInPlan
    }
}
