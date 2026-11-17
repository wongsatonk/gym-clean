import Foundation

/// One hold-to-talk session at a time: `start` (button down) → live `partial` events → `stop`
/// (button up) → `final`. Pure state: the recognizer and the device checks are injected.
///
/// Rules (M12 slice 2 task 10):
/// - Nothing prompts before the first `start`. `availability()` only reads.
/// - Listening ends on `stop`, on `interrupt` (app in the background, audio interruption) and
///   after `maxDuration` (60 s).
/// - An interrupted session sends `error(interrupted)` and no `final`, so half a sentence is never
///   sent as a message.
/// - No audio passes through here, only text and a loudness number.
public actor SpeechSession {
    public enum State: Sendable, Equatable {
        case idle, starting, listening, stopping
    }

    public static let defaultMaxDuration: Duration = .seconds(60)

    private let engine: any SpeechEngine
    private let environment: any SpeechEnvironment
    private let maxDuration: Duration
    private let sleep: @Sendable (Duration) async throws -> Void
    private let emit: @Sendable (SpeechEvent) -> Void

    public private(set) var state: State = .idle
    /// Bumped whenever a session ends early, so late events of an old session are dropped.
    private var generation = 0
    private var assembler = TranscriptAssembler()
    private var lastPartial = ""
    private var lastFinal = ""
    private var capped = false
    private var stopRequested = false
    private var consumer: Task<Void, Never>?
    private var capTask: Task<Void, Never>?

    public init(
        engine: any SpeechEngine,
        environment: any SpeechEnvironment,
        maxDuration: Duration = SpeechSession.defaultMaxDuration,
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
        emit: @escaping @Sendable (SpeechEvent) -> Void
    ) {
        self.engine = engine
        self.environment = environment
        self.maxDuration = maxDuration
        self.sleep = sleep
        self.emit = emit
    }

    /// Reads device support and the stored permission. Never prompts.
    public func availability(locale: String) async -> SpeechAvailability {
        let support = await environment.support(locale: locale)
        guard support == .ready else { return .resolve(support: support, permission: .undetermined) }
        return .resolve(support: support, permission: await environment.micPermission())
    }

    /// Button down. Asks for the microphone if it was never asked, then listens.
    public func start(locale: String) async throws {
        guard state == .idle else { throw SpeechStartError.busy }
        state = .starting
        generation += 1
        let gen = generation
        assembler = TranscriptAssembler()
        lastPartial = ""
        lastFinal = ""
        capped = false
        stopRequested = false

        let support = await environment.support(locale: locale)
        try checkStillStarting(gen)
        if case .unavailable(let reason) = SpeechAvailability.resolve(support: support, permission: .granted) {
            state = .idle
            emit(.error(code: .unavailable))
            throw SpeechStartError.unavailable(reason)
        }

        var permission = await environment.micPermission()
        try checkStillStarting(gen)
        if permission == .undetermined {
            permission = await environment.requestMicPermission() ? .granted : .denied
            try checkStillStarting(gen)
        }
        guard permission == .granted else {
            state = .idle
            emit(.error(code: .permissionDenied))
            throw SpeechStartError.permissionDenied
        }

        // Released while the prompt was up: don't open the microphone at all.
        if stopRequested {
            state = .idle
            emit(.final(text: "", capped: false))
            return
        }

        let stream: AsyncStream<SpeechEngineEvent>
        do {
            stream = try await engine.start(locale: locale)
        } catch {
            if generation == gen {
                state = .idle
                emit(.error(code: .failed))
            }
            throw SpeechStartError.failed
        }
        guard generation == gen else {
            // Interrupted while the engine was starting.
            await engine.cancel()
            throw SpeechStartError.interrupted
        }

        state = .listening
        consumer = Task { [weak self] in
            for await event in stream {
                await self?.handle(event, gen)
            }
            await self?.streamEnded(gen)
        }
        let limit = maxDuration
        let sleep = self.sleep
        capTask = Task { [weak self] in
            guard (try? await sleep(limit)) != nil else { return }
            await self?.capReached(gen)
        }
        if stopRequested { _ = await stop() }
    }

    /// Button up. Finishes the text, sends `final` and returns it.
    @discardableResult
    public func stop() async -> String {
        switch state {
        case .idle:
            return ""
        case .starting:
            stopRequested = true
            return ""
        case .listening:
            state = .stopping
            capTask?.cancel()
            capTask = nil
            let running = consumer
            await engine.finish()
            await running?.value
            return lastFinal
        case .stopping:
            await consumer?.value
            return lastFinal
        }
    }

    /// The app went to the background or the audio session was interrupted: stop now, no `final`.
    public func interrupt() async {
        guard state != .idle else { return }
        await end(with: .interrupted)
    }

    // MARK: Internals

    private func checkStillStarting(_ gen: Int) throws {
        if generation != gen { throw SpeechStartError.interrupted }
    }

    private func handle(_ event: SpeechEngineEvent, _ gen: Int) async {
        guard gen == generation, state == .listening || state == .stopping else { return }
        switch event {
        case .transcript(let text, let isFinal):
            assembler.apply(text: text, isFinal: isFinal)
            let current = assembler.text
            if current != lastPartial {
                lastPartial = current
                emit(.partial(text: current))
            }
        case .level(let value):
            if state == .listening { emit(.level(rms: Double(AudioLevel.clamp(value)))) }
        case .failed:
            await end(with: .failed)
        }
    }

    private func streamEnded(_ gen: Int) {
        guard gen == generation, state != .idle else { return }
        capTask?.cancel()
        capTask = nil
        consumer = nil
        lastFinal = assembler.text
        state = .idle
        emit(.final(text: lastFinal, capped: capped))
    }

    private func capReached(_ gen: Int) async {
        guard gen == generation, state == .listening else { return }
        capped = true
        capTask = nil // this is the cap task: don't cancel it from stop()
        await stop()
    }

    private func end(with code: SpeechErrorCode) async {
        generation += 1
        state = .idle
        capTask?.cancel()
        capTask = nil
        consumer = nil
        await engine.cancel()
        emit(.error(code: code))
    }
}
