import Foundation
import XCTest
@testable import GymSpeechCore

// Made-up text only. The recognizer and the device are fakes (Fakes.swift).
final class SpeechSessionTests: XCTestCase {
    private var engine: FakeEngine!
    private var environment: FakeEnvironment!
    private var events: Events!

    override func setUp() {
        engine = FakeEngine()
        environment = FakeEnvironment()
        events = Events()
    }

    private func makeSession(
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) -> SpeechSession {
        let events = self.events!
        return SpeechSession(engine: engine, environment: environment, sleep: sleep) { events.add($0) }
    }

    // MARK: partial → final

    func testPartialsThenFinalOnStop() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        let state = await session.state
        XCTAssertEqual(state, .listening)

        engine.send(.transcript(text: "move my", isFinal: false))
        engine.send(.transcript(text: "move my leg day", isFinal: false))
        engine.send(.transcript(text: "Move my leg day ", isFinal: true))
        engine.send(.transcript(text: "to fri", isFinal: false))
        engine.onFinish.set("to Friday.")
        let text = await session.stop()

        XCTAssertEqual(text, "Move my leg day to Friday.")
        XCTAssertEqual(events.text, [
            .partial(text: "move my"),
            .partial(text: "move my leg day"),
            .partial(text: "Move my leg day"),
            .partial(text: "Move my leg day to fri"),
            .partial(text: "Move my leg day to Friday."),
            .final(text: "Move my leg day to Friday.", capped: false),
        ])
        XCTAssertEqual(engine.finishes.get(), 1)
        XCTAssertEqual(engine.cancels.get(), 0)
    }

    func testPartialsArriveWhileStillListening() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        engine.send(.transcript(text: "hello", isFinal: false))
        await eventually("the live text") { [events] in events!.text == [.partial(text: "hello")] }
        await session.stop()
    }

    func testAnUnchangedResultSendsNoSecondPartial() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        engine.send(.transcript(text: "hello", isFinal: false))
        engine.send(.transcript(text: "hello", isFinal: false))
        engine.send(.transcript(text: " hello ", isFinal: true))
        await session.stop()
        XCTAssertEqual(events.text, [.partial(text: "hello"), .final(text: "hello", capped: false)])
    }

    func testLevelsAreClampedAndOnlySentWhileListening() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        engine.send(.level(0.25))
        engine.send(.level(7))
        engine.send(.level(-.infinity))
        await eventually("three levels") { [events] in events!.all.count == 3 }
        await session.stop()
        XCTAssertEqual(events.all, [.level(rms: 0.25), .level(rms: 1), .level(rms: 0), .final(text: "", capped: false)])
    }

    // MARK: stop

    func testStopEndsTheSessionAndANewOneCanStart() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        await session.stop()
        var state = await session.state
        XCTAssertEqual(state, .idle)

        // Text of the first session never leaks into the second.
        try await session.start(locale: "en")
        engine.send(.transcript(text: "second", isFinal: true))
        let text = await session.stop()
        XCTAssertEqual(text, "second")
        state = await session.state
        XCTAssertEqual(state, .idle)
        XCTAssertEqual(engine.starts.get(), 2)
        XCTAssertEqual(engine.finishes.get(), 2)
    }

    func testStopWithoutStartDoesNothing() async {
        let session = makeSession()
        let text = await session.stop()
        XCTAssertEqual(text, "")
        XCTAssertEqual(events.all, [])
        XCTAssertEqual(engine.finishes.get(), 0)
    }

    func testStartWhileListeningIsBusy() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        do {
            try await session.start(locale: "en")
            XCTFail("expected busy")
        } catch {
            XCTAssertEqual(error as? SpeechStartError, .busy)
            XCTAssertEqual((error as? SpeechStartError)?.bridgeCode, "BUSY")
        }
        XCTAssertEqual(engine.starts.get(), 1)
        await session.stop()
    }

    func testReleaseWhileTheEngineIsStartingStillFinishes() async throws {
        let gate = Gate()
        engine.startGate.set(gate)
        let session = makeSession()
        let starting = Task { try await session.start(locale: "en") }
        await eventually("engine start") { await gate.waiting == 1 }
        await session.stop() // button up before the microphone is open
        await gate.release()
        try await starting.value
        await eventually("final") { [events] in events!.text == [.final(text: "", capped: false)] }
        XCTAssertEqual(engine.finishes.get(), 1)
        let state = await session.state
        XCTAssertEqual(state, .idle)
    }

    // MARK: permission

    func testNothingAsksForPermissionBeforeTheFirstStart() async {
        environment.permission.set(.undetermined)
        let session = makeSession()
        let availability = await session.availability(locale: "en")
        XCTAssertEqual(availability, .available) // "not asked yet" is available: start will ask
        await session.stop()
        await session.interrupt()
        XCTAssertEqual(environment.requests.get(), 0)
        XCTAssertEqual(engine.starts.get(), 0)
    }

    func testFirstStartAsksOnceThenNeverAgain() async throws {
        environment.permission.set(.undetermined)
        let session = makeSession()
        try await session.start(locale: "en")
        await session.stop()
        try await session.start(locale: "en")
        await session.stop()
        XCTAssertEqual(environment.requests.get(), 1)
        XCTAssertEqual(engine.starts.get(), 2)
    }

    func testPermissionDeniedInThePrompt() async {
        environment.permission.set(.undetermined)
        environment.grant.set(false)
        let session = makeSession()
        do {
            try await session.start(locale: "en")
            XCTFail("expected permissionDenied")
        } catch {
            XCTAssertEqual(error as? SpeechStartError, .permissionDenied)
            XCTAssertEqual((error as? SpeechStartError)?.bridgeCode, "PERMISSION_DENIED")
        }
        XCTAssertEqual(events.all, [.error(code: .permissionDenied)])
        XCTAssertEqual(engine.starts.get(), 0, "the microphone never opens")
        let state = await session.state
        XCTAssertEqual(state, .idle)
        let availability = await session.availability(locale: "en")
        XCTAssertEqual(availability, .unavailable(.permissionDenied))
    }

    func testAlreadyDeniedDoesNotPromptAgain() async {
        environment.permission.set(.denied)
        let session = makeSession()
        do {
            try await session.start(locale: "en")
            XCTFail("expected permissionDenied")
        } catch {
            XCTAssertEqual(error as? SpeechStartError, .permissionDenied)
        }
        XCTAssertEqual(environment.requests.get(), 0)
        XCTAssertEqual(engine.starts.get(), 0)
    }

    func testReleaseWhileThePromptIsUpNeverOpensTheMicrophone() async throws {
        environment.permission.set(.undetermined)
        let gate = Gate()
        environment.requestGate.set(gate)
        let session = makeSession()
        let starting = Task { try await session.start(locale: "en") }
        await eventually("prompt") { await gate.waiting == 1 }
        await session.stop()
        await gate.release() // he taps Allow
        try await starting.value
        XCTAssertEqual(engine.starts.get(), 0)
        XCTAssertEqual(events.all, [.final(text: "", capped: false)])
    }

    // MARK: not on-device → unavailable

    func testNoOnDeviceRecognizerIsUnavailableAndNeverPromptsOrListens() async {
        environment.supportValue.set(.unsupported)
        environment.permission.set(.undetermined)
        let session = makeSession()
        let availability = await session.availability(locale: "en")
        XCTAssertEqual(availability, .unavailable(.unsupported))
        do {
            try await session.start(locale: "en")
            XCTFail("expected unavailable")
        } catch {
            XCTAssertEqual(error as? SpeechStartError, .unavailable(.unsupported))
            XCTAssertEqual((error as? SpeechStartError)?.bridgeCode, "UNAVAILABLE")
        }
        XCTAssertEqual(events.all, [.error(code: .unavailable)])
        XCTAssertEqual(environment.requests.get(), 0)
        XCTAssertEqual(engine.starts.get(), 0)
    }

    func testModelNotInstalledOrDownloadingIsUnavailable() async {
        let session = makeSession()
        for (support, reason) in [
            (SpeechSupport.modelNotInstalled, SpeechUnavailableReason.modelNotInstalled),
            (.modelDownloading, .modelDownloading),
        ] {
            environment.supportValue.set(support)
            let availability = await session.availability(locale: "en")
            XCTAssertEqual(availability, .unavailable(reason))
            do {
                try await session.start(locale: "en")
                XCTFail("expected unavailable")
            } catch {
                XCTAssertEqual(error as? SpeechStartError, .unavailable(reason))
            }
        }
        XCTAssertEqual(engine.starts.get(), 0)
    }

    // MARK: background / interruption

    func testBackgroundStopsNowWithoutAFinal() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        engine.send(.transcript(text: "move my", isFinal: false))
        await eventually("partial") { [events] in events!.text.count == 1 }

        await session.interrupt()
        XCTAssertEqual(engine.cancels.get(), 1)
        XCTAssertEqual(engine.finishes.get(), 0)
        let state = await session.state
        XCTAssertEqual(state, .idle)

        // Anything the recognizer still says is dropped, and a later stop sends nothing.
        engine.send(.transcript(text: "move my leg day", isFinal: true))
        let text = await session.stop()
        XCTAssertEqual(text, "")
        try? await Task.sleep(for: .milliseconds(20))
        XCTAssertEqual(events.text, [.partial(text: "move my"), .error(code: .interrupted)])
    }

    func testBackgroundWhileIdleDoesNothing() async {
        let session = makeSession()
        await session.interrupt()
        XCTAssertEqual(events.all, [])
        XCTAssertEqual(engine.cancels.get(), 0)
    }

    func testBackgroundWhileTheEngineIsStarting() async {
        let gate = Gate()
        engine.startGate.set(gate)
        let session = makeSession()
        let starting = Task { try await session.start(locale: "en") }
        await eventually("engine start") { await gate.waiting == 1 }
        await session.interrupt()
        await gate.release()
        do {
            try await starting.value
            XCTFail("expected interrupted")
        } catch {
            XCTAssertEqual(error as? SpeechStartError, .interrupted)
        }
        XCTAssertEqual(events.all, [.error(code: .interrupted)])
        XCTAssertGreaterThanOrEqual(engine.cancels.get(), 1, "the microphone is closed again")
        let state = await session.state
        XCTAssertEqual(state, .idle)
    }

    // MARK: 60 s cap

    func testDefaultCapIs60Seconds() {
        XCTAssertEqual(SpeechSession.defaultMaxDuration, .seconds(60))
    }

    func testTheCapFinishesTheTextLikeARelease() async throws {
        let gate = Gate()
        let asked = Locked<[Duration]>([])
        let session = makeSession(sleep: { duration in
            asked.update { $0.append(duration) }
            await gate.wait()
            try Task.checkCancellation()
        })
        try await session.start(locale: "en")
        engine.send(.transcript(text: "a very long story", isFinal: true))
        await gate.release() // 60 s are over
        await eventually("capped final") { [events] in
            events!.text.last == .final(text: "a very long story", capped: true)
        }
        XCTAssertEqual(asked.get(), [.seconds(60)])
        XCTAssertEqual(engine.finishes.get(), 1)
        let state = await session.state
        XCTAssertEqual(state, .idle)
    }

    func testStopBeforeTheCapCancelsIt() async throws {
        let gate = Gate()
        let session = makeSession(sleep: { _ in
            await gate.wait()
            try Task.checkCancellation()
        })
        try await session.start(locale: "en")
        await session.stop()
        await gate.release()
        try? await Task.sleep(for: .milliseconds(20))
        XCTAssertEqual(events.all, [.final(text: "", capped: false)])
        XCTAssertEqual(engine.finishes.get(), 1)
    }

    // MARK: failures

    func testEngineThatCannotStart() async {
        engine.failStart.set(true)
        let session = makeSession()
        do {
            try await session.start(locale: "en")
            XCTFail("expected failed")
        } catch {
            XCTAssertEqual(error as? SpeechStartError, .failed)
            XCTAssertEqual((error as? SpeechStartError)?.bridgeCode, "FAILED")
        }
        XCTAssertEqual(events.all, [.error(code: .failed)])
        let state = await session.state
        XCTAssertEqual(state, .idle)
    }

    func testRecognizerFailureMidSession() async throws {
        let session = makeSession()
        try await session.start(locale: "en")
        engine.send(.transcript(text: "move", isFinal: false))
        engine.send(.failed)
        await eventually("error") { [events] in events!.text.last == .error(code: .failed) }
        XCTAssertEqual(engine.cancels.get(), 1)
        let state = await session.state
        XCTAssertEqual(state, .idle)
        XCTAssertEqual(events.text, [.partial(text: "move"), .error(code: .failed)])
    }
}
