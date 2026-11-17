import AVFAudio
import Foundation
import GymSpeechCore
import Speech

// M12 slice 2 task 10: the real microphone + recognizer behind GymSpeechCore's seams.
//
// On-device only: SpeechAnalyzer + SpeechTranscriber (iOS 26). Apple: "SpeechAnalyzer transcriber
// modules don't send audio data of the user's voice to Apple's servers." SFSpeechRecognizer (which
// can use Apple's servers) is not used anywhere. If this phone has no on-device English model, the
// mic is unavailable; there is no fallback that leaves the phone.
//
// Audio goes from the input tap straight into the analyzer, in memory. No file is created, no
// buffer is kept after it is handed over, nothing is sent anywhere.

enum GymSpeechModules {
    /// The on-device English transcriber for this phone, or nil when there is none.
    static func transcriber(for localeId: String) async -> SpeechTranscriber? {
        guard localeId.lowercased().hasPrefix("en"), SpeechTranscriber.isAvailable else { return nil }
        var candidates: [Locale] = []
        if Locale.current.language.languageCode?.identifier == "en" { candidates.append(Locale.current) }
        candidates.append(Locale(identifier: "en-US"))
        for candidate in candidates {
            // Locales must come from the supported list; an equal-looking one made by hand may not match.
            if let locale = await SpeechTranscriber.supportedLocale(equivalentTo: candidate) {
                return SpeechTranscriber(
                    locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults],
                    attributeOptions: [])
            }
        }
        return nil
    }
}

struct SystemSpeechEnvironment: SpeechEnvironment {
    func support(locale: String) async -> SpeechSupport {
        guard let transcriber = await GymSpeechModules.transcriber(for: locale) else { return .unsupported }
        switch await AssetInventory.status(forModules: [transcriber]) {
        case .installed: return .ready
        case .supported: return .modelNotInstalled
        case .downloading: return .modelDownloading
        case .unsupported: return .unsupported
        @unknown default: return .unsupported
        }
    }

    func micPermission() async -> MicPermission {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return .granted
        case .denied: return .denied
        case .undetermined: return .undetermined
        @unknown default: return .denied
        }
    }

    func requestMicPermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }
}

actor AnalyzerSpeechEngine: SpeechEngine {
    enum EngineError: Error { case unsupported, noAudioFormat, noInput }

    private let audioEngine = AVAudioEngine()
    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var events: AsyncStream<SpeechEngineEvent>.Continuation?
    private var resultsTask: Task<Void, Never>?
    private var tapInstalled = false

    func start(locale: String) async throws -> AsyncStream<SpeechEngineEvent> {
        await cancel() // never two microphones
        guard let transcriber = await GymSpeechModules.transcriber(for: locale) else {
            throw EngineError.unsupported
        }
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw EngineError.noAudioFormat
        }
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let (events, eventSink) = AsyncStream<SpeechEngineEvent>.makeStream()
        let (inputs, inputSink) = AsyncStream<AnalyzerInput>.makeStream()

        do {
            // Mix with other apps' audio (his music keeps playing) and keep Bluetooth on A2DP: no
            // hands-free option, so the iPhone's own microphone is used and AirPods stay in
            // full-quality playback.
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker])
            try audioSession.setActive(true)

            let node = audioEngine.inputNode
            let inputFormat = node.outputFormat(forBus: 0)
            guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0,
                let converter = AVAudioConverter(from: inputFormat, to: format)
            else { throw EngineError.noInput }

            node.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
                if let channels = buffer.floatChannelData {
                    let samples = UnsafeBufferPointer(start: channels[0], count: Int(buffer.frameLength))
                    eventSink.yield(.level(AudioLevel.normalized(rms: AudioLevel.rms(samples))))
                }
                if let converted = Self.convert(buffer, with: converter, to: format) {
                    inputSink.yield(AnalyzerInput(buffer: converted))
                }
            }
            tapInstalled = true
            audioEngine.prepare()
            try audioEngine.start()
            try await analyzer.start(inputSequence: inputs)
        } catch {
            inputSink.finish()
            eventSink.finish()
            stopAudio()
            await analyzer.cancelAndFinishNow()
            throw error
        }

        self.analyzer = analyzer
        self.input = inputSink
        self.events = eventSink
        resultsTask = Task {
            do {
                for try await result in transcriber.results {
                    eventSink.yield(.transcript(text: String(result.text.characters), isFinal: result.isFinal))
                }
            } catch {
                if !Task.isCancelled { eventSink.yield(.failed) }
            }
            eventSink.finish()
        }
        return events
    }

    func finish() async {
        stopAudio()
        input?.finish()
        input = nil
        let running = resultsTask
        let sink = events
        if let analyzer {
            do {
                try await analyzer.finalizeAndFinishThroughEndOfInput()
            } catch {
                await analyzer.cancelAndFinishNow()
            }
        }
        // The results sequence ends once the analyzer has finished. Don't let a stuck recognizer
        // hold the session open.
        Task {
            try? await Task.sleep(for: .seconds(3))
            running?.cancel()
            sink?.finish()
        }
        self.analyzer = nil
        self.events = nil
        self.resultsTask = nil
    }

    func cancel() async {
        stopAudio()
        input?.finish()
        input = nil
        resultsTask?.cancel()
        resultsTask = nil
        if let analyzer { await analyzer.cancelAndFinishNow() }
        analyzer = nil
        events?.finish()
        events = nil
    }

    private func stopAudio() {
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        if audioEngine.isRunning { audioEngine.stop() }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Copies one tap buffer into the analyzer's format (the tap reuses its buffer, so always copy).
    private static func convert(
        _ buffer: AVAudioPCMBuffer, with converter: AVAudioConverter, to format: AVAudioFormat
    ) -> AVAudioPCMBuffer? {
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 32
        guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
        var fed = false
        var failure: NSError?
        let status = converter.convert(to: output, error: &failure) { _, inputStatus in
            if fed {
                inputStatus.pointee = .noDataNow
                return nil
            }
            fed = true
            inputStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, failure == nil, output.frameLength > 0 else { return nil }
        return output
    }
}
