import Foundation
import FoundationModels
import Synchronization

// MARK: Request and replies

/// `GymBrainRequest` from src/core/types.ts. Per Decision "M12 slice 2, G1 build calls" the last
/// 8 turns are inside `context`; `messages` carries only the new user message.
public struct BrainRequest: Sendable, Equatable {
    public let instructions: String
    public let context: String
    public let message: String
    public let toolResults: [String: String]

    public init(instructions: String, context: String, message: String, toolResults: [String: String] = [:]) {
        self.instructions = instructions
        self.context = context
        self.message = message
        self.toolResults = toolResults
    }

    /// Parses the bridge object. Nil without instructions or a user message. Non-string tool
    /// results are dropped.
    public init?(bridge object: [String: Any]) {
        guard let instructions = object["instructions"] as? String, !instructions.isEmpty else { return nil }
        let messages = object["messages"] as? [[String: Any]] ?? []
        let last = messages.last { ($0["role"] as? String) == "user" }
        guard let text = last?["text"] as? String,
            !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        let raw = object["toolResults"] as? [String: Any] ?? [:]
        self.init(
            instructions: instructions,
            context: object["context"] as? String ?? "",
            message: text,
            toolResults: raw.compactMapValues { $0 as? String }
        )
    }

    /// What the session is asked: the context, then the new message.
    public var prompt: String {
        let ctx = context.trimmingCharacters(in: .whitespacesAndNewlines)
        return ctx.isEmpty ? "User: \(message)" : "\(ctx)\n\nUser: \(message)"
    }
}

public struct BrainReply: Sendable, Equatable {
    public let text: String
    public let toolCalls: [RecordedToolCall]
    public let latencyMs: Int

    /// `GymBrainResponse` for the bridge.
    public var bridgeDictionary: [String: Any] {
        ["text": text, "toolCalls": toolCalls.map(\.bridgeDictionary), "latencyMs": latencyMs]
    }
}

public struct BrainFailure: Error, Sendable, Equatable {
    public let code: BrainErrorCode
    public let latencyMs: Int
}

/// Measured on the phone (iOS 26.4+) so the dev eval / Checkpoint J can check the 3-chars/token
/// budget estimate. Nil where `tokenCount(for:)` isn't available.
public struct BrainTokenCounts: Sendable, Equatable {
    public let instructions: Int
    public let tools: Int
    public let prompt: Int
    public let contextSize: Int

    public init(instructions: Int, tools: Int, prompt: Int, contextSize: Int) {
        self.instructions = instructions
        self.tools = tools
        self.prompt = prompt
        self.contextSize = contextSize
    }

    public var bridgeDictionary: [String: Any] {
        ["instructions": instructions, "tools": tools, "prompt": prompt, "contextSize": contextSize]
    }
}

// MARK: The model, behind protocols (faked in the tests)

public protocol BrainSession: Sendable {
    func respond(to prompt: String) async throws -> String
    func prewarm()
}

public protocol BrainModel: Sendable {
    func availability() -> BrainAvailability
    func makeSession(instructions: String, tools: [any Tool]) -> any BrainSession
    func measure(instructions: String, tools: [any Tool], prompt: String) async -> BrainTokenCounts?
}

// MARK: Service

/// One `respond` = one fresh session with fresh tools (no reuse; the 4,096-token window is too
/// small to carry a conversation). Nothing leaves the phone.
public final class GymBrainService: Sendable {
    /// Data: how long a reply may take.
    public static let defaultTimeout: Duration = .seconds(15)
    /// Data: a prewarmed session older than this is dropped instead of used.
    public static let prewarmMaxAge: Duration = .seconds(120)

    private struct Warm: Sendable {
        let instructions: String
        let session: any BrainSession
        let recorder: ToolCallRecorder
        let results: ReadToolResults
        let createdAt: ContinuousClock.Instant
    }

    private let model: any BrainModel
    private let timeout: Duration
    private let clock = ContinuousClock()
    private let warm = Mutex<Warm?>(nil)

    public init(model: any BrainModel, timeout: Duration = GymBrainService.defaultTimeout) {
        self.model = model
        self.timeout = timeout
    }

    public func availability() -> BrainAvailability {
        model.availability()
    }

    /// Apple: prewarm only with a strong signal that a request comes soon (text box focus, mic
    /// down). Builds the session `respond` will use if the instructions match. No-op when the
    /// model is unavailable.
    public func prewarm(instructions: String) {
        guard model.availability() == .available, !instructions.isEmpty else { return }
        let recorder = ToolCallRecorder()
        let results = ReadToolResults()
        let session = model.makeSession(
            instructions: instructions, tools: TrainerTools.make(recorder: recorder, results: results))
        session.prewarm()
        warm.withLock {
            $0 = Warm(
                instructions: instructions, session: session, recorder: recorder, results: results,
                createdAt: clock.now)
        }
    }

    /// True while a prewarmed session is waiting (tests).
    public var hasPrewarmedSession: Bool { warm.withLock { $0 != nil } }

    public func respond(_ request: BrainRequest) async -> Result<BrainReply, BrainFailure> {
        let start = clock.now
        let (session, recorder) = takeSession(for: request)
        let elapsed = { [clock] in Self.milliseconds(clock.now - start) }
        do {
            let text = try await Self.race(timeout: timeout) { try await session.respond(to: request.prompt) }
            return .success(BrainReply(text: text, toolCalls: recorder.recorded, latencyMs: elapsed()))
        } catch {
            return .failure(BrainFailure(code: brainErrorCode(for: error), latencyMs: elapsed()))
        }
    }

    /// Token counts of the instructions, the 14 tool schemas and the prompt (iOS 26.4+).
    public func measure(_ request: BrainRequest) async -> BrainTokenCounts? {
        let tools = TrainerTools.make(recorder: ToolCallRecorder(), results: ReadToolResults())
        return await model.measure(instructions: request.instructions, tools: tools, prompt: request.prompt)
    }

    // MARK: Internals

    private func takeSession(for request: BrainRequest) -> (any BrainSession, ToolCallRecorder) {
        let now = clock.now
        let reusable = warm.withLock { slot -> Warm? in
            defer { slot = nil }  // a prewarmed session is used once or dropped
            guard let w = slot, w.instructions == request.instructions,
                now - w.createdAt <= Self.prewarmMaxAge
            else { return nil }
            return w
        }
        if let w = reusable {
            w.results.set(request.toolResults)
            return (w.session, w.recorder)
        }
        let recorder = ToolCallRecorder()
        let results = ReadToolResults(request.toolResults)
        let session = model.makeSession(
            instructions: request.instructions, tools: TrainerTools.make(recorder: recorder, results: results))
        return (session, recorder)
    }

    static func milliseconds(_ d: Duration) -> Int {
        let (s, atto) = d.components
        return Int(s) * 1000 + Int(atto / 1_000_000_000_000_000)
    }

    /// Runs `work`, or throws `BrainTimeoutError` after `timeout`, whichever comes first. Returns
    /// promptly on timeout even if `work` ignores cancellation (it is cancelled and left behind).
    static func race(
        timeout: Duration, _ work: @escaping @Sendable () async throws -> String
    ) async throws -> String {
        let state = RaceState()
        return try await withCheckedThrowingContinuation { continuation in
            state.begin(continuation)
            let worker = Task {
                do { state.finish(.success(try await work())) } catch { state.finish(.failure(error)) }
            }
            let timer = Task {
                try? await Task.sleep(for: timeout)
                if !Task.isCancelled { state.finish(.failure(BrainTimeoutError())) }
            }
            state.attach(worker: worker, timer: timer)
        }
    }
}

/// The once-only resume behind `GymBrainService.race`.
private final class RaceState: Sendable {
    private struct Inner {
        var continuation: CheckedContinuation<String, any Error>?
        var outcome: Result<String, any Error>?
        var worker: Task<Void, Never>?
        var timer: Task<Void, Never>?
    }
    private let inner = Mutex(Inner())

    func begin(_ c: CheckedContinuation<String, any Error>) {
        inner.withLock { $0.continuation = c }
    }

    func attach(worker: Task<Void, Never>, timer: Task<Void, Never>) {
        let done = inner.withLock { s -> Bool in
            s.worker = worker
            s.timer = timer
            return s.outcome != nil
        }
        if done { worker.cancel(); timer.cancel() }
    }

    func finish(_ result: Result<String, any Error>) {
        let (continuation, worker, timer) = inner.withLock { s -> (CheckedContinuation<String, any Error>?, Task<Void, Never>?, Task<Void, Never>?) in
            guard s.outcome == nil else { return (nil, nil, nil) }
            s.outcome = result
            defer { s.continuation = nil }
            return (s.continuation, s.worker, s.timer)
        }
        guard let continuation else { return }
        worker?.cancel()
        timer?.cancel()
        continuation.resume(with: result)
    }
}
