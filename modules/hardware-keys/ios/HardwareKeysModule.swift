import ExpoModulesCore

// Local Expo module — exposes a native view that captures hardware keyboard
// presses (e.g. a Bluetooth foot pedal) and reports them to JavaScript.
// Built on the Expo Modules API, so it works under the New Architecture
// (unlike the legacy RCTEventEmitter modules that don't register there).
public class HardwareKeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HardwareKeys")

    View(KeyCaptureView.self) {
      Events("onArrowKey", "onStatus")
    }
  }
}
