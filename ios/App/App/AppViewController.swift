import Capacitor
import UIKit

/// The app's Capacitor view controller. Local (in-app) plugins are registered here, as
/// Capacitor's "Custom Native iOS Code" guide describes: `capacitorDidLoad` +
/// `bridge?.registerPluginInstance(...)`. npm plugins (Haptics) register themselves.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // M13d task 28: no WebKit back/forward swipe. The app's own left-edge swipe handles Back
        // (it is a single page with no browser history), so a left-edge pan must reach the page.
        // WKWebView's default is already false; this states it so a later change can't flip it
        // silently. capacitorDidLoad runs after Capacitor has created the web view and before
        // the page loads. There is no UINavigationController (the scene's root is this view
        // controller), so no interactive-pop edge recognizer exists either.
        webView?.allowsBackForwardNavigationGestures = false

        bridge?.registerPluginInstance(GymHealthPlugin()) // M11: read-only Apple Health
        bridge?.registerPluginInstance(GymSpeechPlugin()) // M12 slice 2: on-device speech to text
        bridge?.registerPluginInstance(GymBrainPlugin()) // M12 slice 2: Apple's on-device model
    }
}
