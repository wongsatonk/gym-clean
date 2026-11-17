import Foundation
import FoundationModels
import XCTest
@testable import GymBrainCore

private func args(_ call: RecordedToolCall) -> [String: Any] {
    call.bridgeDictionary["args"] as? [String: Any] ?? [:]
}

final class GeneratedToolsTests: XCTestCase {
    func testFourteenToolsFourReadOnly() {
        let tools = TrainerTools.make(recorder: ToolCallRecorder(), results: ReadToolResults())
        XCTAssertEqual(tools.map(\.name), TrainerTools.names)
        XCTAssertEqual(tools.count, 14)
        XCTAssertEqual(TrainerTools.readOnlyNames, ["weekSummary", "progressSummary", "exerciseInfo", "foodIdeas"])
        for tool in tools { XCTAssertFalse(tool.description.isEmpty, tool.name) }
    }

    func testProposeToolRecordsNameAndArgs() async throws {
        let recorder = ToolCallRecorder()
        let tools = TrainerTools.make(recorder: recorder, results: ReadToolResults())
        let reply = try await callTool(tools, "postponeSession", #"{"mode":"useRestDay","to":"2026-11-20"}"#)
        XCTAssertEqual(reply, TrainerTools.proposedReply)
        XCTAssertEqual(reply, "Proposed; the app will ask the user to confirm.")
        XCTAssertEqual(recorder.recorded.count, 1)
        let call = recorder.recorded[0]
        XCTAssertEqual(call.name, "postponeSession")
        XCTAssertEqual(args(call)["mode"] as? String, "useRestDay")
        XCTAssertEqual(args(call)["to"] as? String, "2026-11-20")
        XCTAssertNil(args(call)["from"], "absent optionals are left out")
    }

    func testEveryArgumentKindDecodesAndRecords() async throws {
        let recorder = ToolCallRecorder()
        let tools = TrainerTools.make(recorder: recorder, results: ReadToolResults())
        // integer range + integer array
        _ = try await callTool(tools, "proposeFocusBlock", #"{"group":"arms","weeks":4,"weekdays":[1,3,5]}"#)
        // string arrays of enum values
        _ = try await callTool(tools, "setEasyOn", #"{"add":["legs"],"remove":["arms","core"]}"#)
        // patterned id strings + enum
        _ = try await callTool(tools, "swapExercise", #"{"exerciseId":"Dumbbell_Bench_Press","scope":"today"}"#)
        // no arguments
        _ = try await callTool(tools, "lighterToday")
        // integer
        _ = try await callTool(tools, "shortOnTime", #"{"minutes":30}"#)
        let calls = recorder.recorded
        XCTAssertEqual(calls.map(\.name), ["proposeFocusBlock", "setEasyOn", "swapExercise", "lighterToday", "shortOnTime"])
        XCTAssertEqual(args(calls[0])["weeks"] as? Int, 4)
        XCTAssertEqual(args(calls[0])["weekdays"] as? [Int], [1, 3, 5])
        XCTAssertEqual(args(calls[1])["remove"] as? [String], ["arms", "core"])
        XCTAssertEqual(args(calls[2])["exerciseId"] as? String, "Dumbbell_Bench_Press")
        XCTAssertNil(args(calls[2])["toId"])
        XCTAssertTrue(args(calls[3]).isEmpty)
        XCTAssertEqual(args(calls[4])["minutes"] as? Int, 30)
    }

    func testParallelCallsAreAllRecorded() async throws {
        let recorder = ToolCallRecorder()
        let tools = TrainerTools.make(recorder: recorder, results: ReadToolResults())
        try await withThrowingTaskGroup(of: String.self) { group in
            for i in 0..<200 {
                group.addTask {
                    try await callTool(tools, i.isMultiple(of: 2) ? "lighterToday" : "avoidBodyArea", #"{"area":"back"}"#)
                }
            }
            for try await _ in group {}
        }
        XCTAssertEqual(recorder.recorded.count, 200)
        XCTAssertEqual(recorder.recorded.filter { $0.name == "avoidBodyArea" }.count, 100)
    }

    func testReadOnlyToolsReturnPassedResultsAndRecordNothing() async throws {
        let recorder = ToolCallRecorder()
        let results = ReadToolResults([
            "weekSummary": "2 of 3 sessions done.",
            "progressSummary": "Week score 80.",
            "foodIdeas": "Protein left: 40 g.",
            "exerciseInfo:Goblet_Squat": "Hold the bell at your chest.",
        ])
        let tools = TrainerTools.make(recorder: recorder, results: results)
        let week = try await callTool(tools, "weekSummary")
        XCTAssertEqual(week, "2 of 3 sessions done.")
        let progress = try await callTool(tools, "progressSummary")
        XCTAssertEqual(progress, "Week score 80.")
        let food = try await callTool(tools, "foodIdeas")
        XCTAssertEqual(food, "Protein left: 40 g.")
        let squat = try await callTool(tools, "exerciseInfo", #"{"exerciseId":"Goblet_Squat"}"#)
        XCTAssertEqual(squat, "Hold the bell at your chest.")
        let other = try await callTool(tools, "exerciseInfo", #"{"exerciseId":"Zercher_Squat"}"#)
        XCTAssertEqual(other, "Not in your plan this week.")
        XCTAssertTrue(recorder.recorded.isEmpty)
    }

    func testExerciseInfoFallsBackToTheBareKeyAndMissingResults() async throws {
        let tools = TrainerTools.make(
            recorder: ToolCallRecorder(), results: ReadToolResults(["exerciseInfo": "Ask about today's lifts."]))
        let info = try await callTool(tools, "exerciseInfo", #"{"exerciseId":"Anything"}"#)
        XCTAssertEqual(info, "Ask about today's lifts.")
        let week = try await callTool(tools, "weekSummary")
        XCTAssertEqual(week, ReadToolResults.missing)
    }

    func testBridgeDictionaryDropsNullsAndJunk() {
        XCTAssertTrue(args(RecordedToolCall(name: "x", argumentsJSON: "not json")).isEmpty)
        XCTAssertTrue(args(RecordedToolCall(name: "x", argumentsJSON: "[1,2]")).isEmpty)
        let a = args(RecordedToolCall(name: "x", argumentsJSON: #"{"a":null,"b":"c"}"#))
        XCTAssertNil(a["a"])
        XCTAssertEqual(a["b"] as? String, "c")
    }
}

final class GymBrainServiceTests: XCTestCase {
    func testOneFreshSessionPerRespondWithInstructionsAndPrompt() async {
        let model = FakeModel()
        let service = GymBrainService(model: model)
        _ = await service.respond(request(instructions: "Coach rules.", context: "Ctx line.", message: "Why legs?"))
        _ = await service.respond(request(instructions: "Coach rules.", context: "", message: "Again"))
        let sessions = model.sessions.get()
        XCTAssertEqual(sessions.count, 2)
        XCTAssertEqual(sessions[0].instructions, "Coach rules.")
        XCTAssertEqual(sessions[0].tools.count, 14)
        XCTAssertEqual(model.prompts.get(), ["Ctx line.\n\nUser: Why legs?", "User: Again"])
    }

    func testReplyWithToolCallsAndReadResults() async {
        let model = FakeModel { _, tools in
            let week = try await callTool(tools, "weekSummary")
            _ = try await callTool(tools, "avoidBodyArea", #"{"area":"shoulders"}"#)
            return "Done: \(week)"
        }
        let result = await GymBrainService(model: model).respond(
            request(toolResults: ["weekSummary": "3 sessions."]))
        guard case .success(let reply) = result else { return XCTFail("expected a reply") }
        XCTAssertEqual(reply.text, "Done: 3 sessions.")
        XCTAssertEqual(reply.toolCalls.map(\.name), ["avoidBodyArea"])
        let d = reply.bridgeDictionary
        XCTAssertEqual(d["text"] as? String, "Done: 3 sessions.")
        XCTAssertNotNil(d["latencyMs"] as? Int)
        let calls = d["toolCalls"] as? [[String: Any]]
        XCTAssertEqual(calls?.first?["name"] as? String, "avoidBodyArea")
        XCTAssertEqual((calls?.first?["args"] as? [String: Any])?["area"] as? String, "shoulders")
    }

    func testParallelToolCallsInsideOneRespond() async {
        let model = FakeModel { _, tools in
            try await withThrowingTaskGroup(of: String.self) { group in
                group.addTask { try await callTool(tools, "lighterToday") }
                group.addTask { try await callTool(tools, "swapExercise", #"{"exerciseId":"Push_Up"}"#) }
                group.addTask { try await callTool(tools, "progressSummary") }
                for try await _ in group {}
            }
            return "Two ideas."
        }
        guard case .success(let reply) = await GymBrainService(model: model).respond(request()) else {
            return XCTFail("expected a reply")
        }
        XCTAssertEqual(Set(reply.toolCalls.map(\.name)), ["lighterToday", "swapExercise"])
    }

    func testCallsFromOneRespondDoNotLeakIntoTheNext() async {
        let first = Locked(true)
        let model = FakeModel { _, tools in
            if first.get() {
                first.set(false)
                _ = try await callTool(tools, "deloadWeek")
            }
            return "OK."
        }
        let service = GymBrainService(model: model)
        _ = await service.respond(request())
        guard case .success(let second) = await service.respond(request()) else { return XCTFail() }
        XCTAssertTrue(second.toolCalls.isEmpty)
    }

    func testPrewarmedSessionIsUsedOnceWithTheRequestResults() async {
        let model = FakeModel { _, tools in try await callTool(tools, "foodIdeas") }
        let service = GymBrainService(model: model)
        service.prewarm(instructions: "Coach rules.")
        XCTAssertEqual(model.prewarms.get(), 1)
        XCTAssertTrue(service.hasPrewarmedSession)
        let result = await service.respond(request(instructions: "Coach rules.", toolResults: ["foodIdeas": "Eggs."]))
        guard case .success(let reply) = result else { return XCTFail() }
        XCTAssertEqual(reply.text, "Eggs.", "results reach the prewarmed session's tools")
        XCTAssertEqual(model.sessions.get().count, 1, "the prewarmed session was used")
        XCTAssertFalse(service.hasPrewarmedSession)
        _ = await service.respond(request(instructions: "Coach rules."))
        XCTAssertEqual(model.sessions.get().count, 2, "never reused")
    }

    func testPrewarmWithOtherInstructionsIsDropped() async {
        let model = FakeModel()
        let service = GymBrainService(model: model)
        service.prewarm(instructions: "Old rules.")
        _ = await service.respond(request(instructions: "New rules."))
        XCTAssertEqual(model.sessions.get().map(\.instructions), ["Old rules.", "New rules."])
        XCTAssertFalse(service.hasPrewarmedSession)
    }

    func testNoPrewarmWhenUnavailable() {
        let model = FakeModel(availability: .unavailable(.modelNotReady))
        let service = GymBrainService(model: model)
        service.prewarm(instructions: "Coach rules.")
        XCTAssertEqual(model.prewarms.get(), 0)
        XCTAssertTrue(model.sessions.get().isEmpty)
    }

    func testMeasurePassesAllToolsAndThePrompt() async {
        let model = FakeModel()
        model.counts.set(BrainTokenCounts(instructions: 300, tools: 1500, prompt: 900, contextSize: 4096))
        let counts = await GymBrainService(model: model).measure(request())
        XCTAssertEqual(counts?.tools, 1500)
        XCTAssertEqual(counts?.bridgeDictionary["contextSize"] as? Int, 4096)
        XCTAssertEqual(model.measuredToolNames.get(), TrainerTools.names)
        model.counts.set(nil)
        let none = await GymBrainService(model: model).measure(request())
        XCTAssertNil(none)
    }

    func testRequestFromBridge() {
        let r = BrainRequest(bridge: [
            "instructions": "Rules.",
            "context": "Ctx.",
            "messages": [["role": "coach", "text": "Earlier"], ["role": "user", "text": "Can I skip legs?"]],
            "toolResults": ["weekSummary": "W", "junk": 5],
        ])
        XCTAssertEqual(r, BrainRequest(instructions: "Rules.", context: "Ctx.", message: "Can I skip legs?", toolResults: ["weekSummary": "W"]))
        XCTAssertNil(BrainRequest(bridge: ["instructions": "Rules.", "messages": []]))
        XCTAssertNil(BrainRequest(bridge: ["instructions": "Rules.", "messages": [["role": "user", "text": "  "]]]))
        XCTAssertNil(BrainRequest(bridge: ["messages": [["role": "user", "text": "Hi"]]]))
        XCTAssertNil(BrainRequest(bridge: ["instructions": 5, "messages": [["role": "user", "text": "Hi"]]]))
    }
}
