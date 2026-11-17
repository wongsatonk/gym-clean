import Capacitor
import UIKit

/// The app's Capacitor view controller. Local (in-app) plugins are registered here, as
/// Capacitor's "Custom Native iOS Code" guide describes: `capacitorDidLoad` +
/// `bridge?.registerPluginInstance(...)`. npm plugins (Haptics) register themselves.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GymHealthPlugin()) // M11: read-only Apple Health
        bridge?.registerPluginInstance(GymSpeechPlugin()) // M12 slice 2: on-device speech to text
    }
}
