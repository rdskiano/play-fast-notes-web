import ExpoModulesCore
import UIKit

// A near-invisible view that becomes first responder and reports hardware
// key presses to JS via the `onArrowKey` event. A Bluetooth foot pedal
// pairs as a keyboard, so its presses arrive through UIResponder's
// `pressesBegan` — which, unlike a React Native TextInput, surfaces the
// arrow keys that pedals (and apps like forScore) use.
class KeyCaptureView: ExpoView {
  let onArrowKey = EventDispatcher()
  private var focusTimer: Timer?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
  }

  override var canBecomeFirstResponder: Bool { true }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      DispatchQueue.main.async { [weak self] in
        _ = self?.becomeFirstResponder()
      }
      // A modal or other view can steal first-responder status; re-assert
      // it periodically so the pedal keeps working through a session.
      focusTimer?.invalidate()
      focusTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
        guard let self = self, self.window != nil, !self.isFirstResponder else { return }
        _ = self.becomeFirstResponder()
      }
    } else {
      focusTimer?.invalidate()
      focusTimer = nil
    }
  }

  deinit {
    focusTimer?.invalidate()
  }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    var handled = false
    for press in presses {
      guard let key = press.key else { continue }
      switch key.keyCode {
      case .keyboardDownArrow:
        onArrowKey(["key": "down"]); handled = true
      case .keyboardUpArrow:
        onArrowKey(["key": "up"]); handled = true
      case .keyboardLeftArrow:
        onArrowKey(["key": "left"]); handled = true
      case .keyboardRightArrow:
        onArrowKey(["key": "right"]); handled = true
      case .keyboardReturnOrEnter, .keypadEnter:
        onArrowKey(["key": "enter"]); handled = true
      case .keyboardSpacebar:
        onArrowKey(["key": "space"]); handled = true
      default:
        break
      }
    }
    if !handled {
      super.pressesBegan(presses, with: event)
    }
  }
}
