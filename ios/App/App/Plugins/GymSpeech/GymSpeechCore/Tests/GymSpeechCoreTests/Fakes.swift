import Foundation
import XCTest
@testable import GymSpeechCore

/// Thread-safe box for test state.
final class Locked<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value
    init(_ value: Value) { self.value = value }
    func get() -> Value { lock.withLock { value } }
    func set(_ new: Value) { lock.withLock { value = new } }
    func update(_ body: (inout Value) -> Void) { lock.withLock { body(&value) } }
}

/// A fake recognizer: the test pushes results; `finish()` emits an optional last final result and
/// ends the stream, like SpeechAnalyzer does after `finalizeAndFinishThroughEndOfInput()`.
final class FakeEngine: SpeechEngine, @unchecked Sendable {
    let starts = Locked(0)
    let finishes = Locked(0)
    let cancels = Locked(0)
    let failStart = Locked(false)
    /// Sent as a final result when `finish()` is called (the recognizer's last word).
    let onFinish = Locked<String?>(nil)
    /// When set, `start` waits here (to test a release or an interruption during start-up).
    let startGate = Locked<Gate?>(nil)
    private let continuation = Locked<AsyncStream<SpeechEngineEvent>.Continuation?>(nil)

    struct StartFailed: Error {}

    func start(locale: String) async throws -> AsyncStream<SpeechEngineEvent> {
        starts.update { $0 += 1 }
        if let gate = startGate.get() { await gate.wait() }
        if failStart.get() { throw StartFailed() }
        let (stream, continuation) = AsyncStream<SpeechEngineEvent>.makeStream()
        self.continuation.set(continuation)
        return stream
    }

    func finish() async {
        finishes.update { $0 += 1 }
        if let last = onFinish.get() { send(.transcript(text: last, isFinal: true)) }
        continuation.get()?.finish()
    }

    func cancel() async {
        cancels.update { $0 += 1 }
        continuation.get()?.finish()
    }

    func send(_ event: SpeechEngineEvent) {
        continuation.get()?.yield(event)
    }
}

final class FakeEnvironment: SpeechEnvironment, @unchecked Sendable {
    let supportValue = Locked(SpeechSupport.ready)
    let permission = Locked(MicPermission.granted)
    /// What the person answers in the iOS prompt.
    let grant = Locked(true)
    let requests = Locked(0)
    let requestGate = Locked<Gate?>(nil)

    func support(locale: String) async -> SpeechSupport { supportValue.get() }
    func micPermission() async -> MicPermission { permission.get() }
    func requestMicPermission() async -> Bool {
        requests.update { $0 += 1 }
        if let gate = requestGate.get() { await gate.wait() }
        let granted = grant.get()
        permission.set(granted ? .granted : .denied)
        return granted
    }
}

/// Something a test opens by hand.
actor Gate {
    private var open = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private(set) var waiting = 0

    func wait() async {
        if open { return }
        waiting += 1
        await withCheckedContinuation { waiters.append($0) }
    }

    func release() {
        open = true
        waiters.forEach { $0.resume() }
        waiters = []
    }
}

final class Events: @unchecked Sendable {
    private let box = Locked<[SpeechEvent]>([])
    var all: [SpeechEvent] { box.get() }
    /// Everything except loudness.
    var text: [SpeechEvent] {
        all.filter { if case .level = $0 { false } else { true } }
    }
    func add(_ event: SpeechEvent) { box.update { $0.append(event) } }
}

/// Polls until `condition` holds (the session works on its own tasks).
func eventually(
    _ what: String, file: StaticString = #filePath, line: UInt = #line,
    _ condition: @Sendable () async -> Bool
) async {
    for _ in 0..<2000 {
        if await condition() { return }
        try? await Task.sleep(for: .milliseconds(1))
    }
    XCTFail("timed out waiting for: \(what)", file: file, line: line)
}
