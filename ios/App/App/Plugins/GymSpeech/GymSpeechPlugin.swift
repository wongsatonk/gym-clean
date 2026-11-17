import AVFAudio
import Capacitor
import Foundation
import GymSpeechCore
import Speech
import UIKit

/// M12 slice 2 task 10: hold-to-talk speech-to-text for the coach chat.
///
/// - On-device only, English, live partial text. See GymSpeechEngine.swift for the recognizer and
///   docs/ios-setup.md ("Slice 2 API notes") for the API choice.
/// - Swift stays thin: session rules (when to ask, when to stop, the 60 s cap, what the text is)
///   live in the GymSpeechCore package and are tested with a fake recognizer. Where the mic may be
///   used (never in a set, never on the camera) is TypeScript's call (src/core/trainer/speakRules).
/// - The microphone prompt appears on the first `start` only. Loading the plugin and
///   `availability()` never prompt.
/// - No audio is written to disk, kept or sent. The plugin makes no network request.
///
/// Events: `partial { text }`, `level { rms }`, `final { text, capped? }`, `error { code }`.
@objc(GymSpeechPlugin)
public class GymSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GymSpeechPlugin"
    public let jsName = "GymSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "installModel", returnType: CAPPluginReturnPromise),
    ]

    private static let defaultLocale = "en"

    private lazy var session = SpeechSession(
        engine: AnalyzerSpeechEngine(), environment: SystemSpeechEnvironment()
    ) { [weak self] event in
        self?.notifyListeners(event.name, data: event.bridgeDictionary)
    }
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        // Stop listening when the app leaves the foreground or another app takes the audio (a call).
        let center = NotificationCenter.default
        observers.append(
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) {
                [weak self] _ in self?.interrupt()
            })
        observers.append(
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) {
                [weak self] note in
                let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                if raw == AVAudioSession.InterruptionType.began.rawValue { self?.interrupt() }
            })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    private func interrupt() {
        let session = self.session
        Task { await session.interrupt() }
    }

    // MARK: Methods

    @objc func availability(_ call: CAPPluginCall) {
        let locale = call.getString("locale") ?? Self.defaultLocale
        let session = self.session
        Task {
            call.resolve(await session.availability(locale: locale).bridgeDictionary)
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let locale = call.getString("locale") ?? Self.defaultLocale
        let session = self.session
        Task {
            do {
                try await session.start(locale: locale)
                call.resolve()
            } catch let error as SpeechStartError {
                call.reject("Speech did not start", error.bridgeCode)
            } catch {
                call.reject("Speech did not start", SpeechStartError.failed.bridgeCode)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        let session = self.session
        Task {
            call.resolve(["text": await session.stop()])
        }
    }

    /// Asks iOS to download the on-device English speech model (a system asset from Apple; no
    /// audio or text is sent). Only called when the user asks for it.
    @objc func installModel(_ call: CAPPluginCall) {
        let locale = call.getString("locale") ?? Self.defaultLocale
        Task {
            guard let transcriber = await GymSpeechModules.transcriber(for: locale) else {
                call.resolve(["installed": false])
                return
            }
            do {
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    try await request.downloadAndInstall()
                }
                let status = await AssetInventory.status(forModules: [transcriber])
                call.resolve(["installed": status == .installed])
            } catch {
                call.resolve(["installed": false])
            }
        }
    }
}
