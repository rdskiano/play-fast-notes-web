import ExpoModulesCore
import UIKit
import GameController

// Captures hardware key presses from a Bluetooth foot pedal (which pairs as a
// keyboard) and reports them to JS. A pedal can be mapped to any key, so ANY
// key it sends counts as a pedal press.
//
// Three capture paths, most reliable first:
//   1. GCKeyboard (GameController) — HID-level. Fires no matter which view
//      holds first responder and is immune to the iPad focus system. This is
//      the path that actually works for a pedal.
//   2. UIKeyCommand — `wantsPriorityOverSystemBehavior` keeps the focus system
//      from swallowing the arrow keys before a responder sees them.
//   3. pressesBegan — last-resort fallback.
//
// `onStatus` reports keyboard-connected + first-responder state so the JS side
// can show *why* capture is or isn't working instead of failing silently.
class KeyCaptureView: ExpoView {
  let onArrowKey = EventDispatcher()
  let onStatus = EventDispatcher()
  private var focusTimer: Timer?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    NSLog("[HardwareKeys] view created")
    NotificationCenter.default.addObserver(
      self, selector: #selector(keyboardConnected(_:)),
      name: .GCKeyboardDidConnect, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(emitStatus),
      name: .GCKeyboardDidDisconnect, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(appBecameActive),
      name: UIApplication.didBecomeActiveNotification, object: nil)
    if let keyboard = GCKeyboard.coalesced {
      attachKeyboard(keyboard)
    }
  }

  override var canBecomeFirstResponder: Bool { true }

  // MARK: - Path 1: GCKeyboard (HID level — first-responder independent)

  @objc private func keyboardConnected(_ note: Notification) {
    NSLog("[HardwareKeys] GCKeyboard connected")
    if let keyboard = note.object as? GCKeyboard {
      attachKeyboard(keyboard)
    }
    emitStatus()
  }

  private func attachKeyboard(_ keyboard: GCKeyboard) {
    NSLog("[HardwareKeys] attaching GCKeyboard handler")
    keyboard.keyboardInput?.keyChangedHandler = { [weak self] _, _, keyCode, pressed in
      guard pressed, let self = self else { return }
      let name: String
      switch keyCode {
      case .upArrow: name = "up"
      case .downArrow: name = "down"
      case .leftArrow: name = "left"
      case .rightArrow: name = "right"
      case .returnOrEnter, .keypadEnter: name = "enter"
      case .spacebar: name = "space"
      case .pageUp: name = "pageup"
      case .pageDown: name = "pagedown"
      default: name = "key"
      }
      NSLog("[HardwareKeys] GCKeyboard -> \(name)")
      DispatchQueue.main.async {
        self.onArrowKey(["key": name, "via": "gamepad"])
      }
    }
  }

  // MARK: - Path 2: key commands (priority over the iPad focus system)

  override var keyCommands: [UIKeyCommand]? {
    let inputs = [
      UIKeyCommand.inputUpArrow,
      UIKeyCommand.inputDownArrow,
      UIKeyCommand.inputLeftArrow,
      UIKeyCommand.inputRightArrow,
      "\r", " ",
    ]
    return inputs.map { input in
      let cmd = UIKeyCommand(
        input: input,
        modifierFlags: [],
        action: #selector(handleKeyCommand(_:)))
      cmd.wantsPriorityOverSystemBehavior = true
      return cmd
    }
  }

  @objc private func handleKeyCommand(_ command: UIKeyCommand) {
    let name: String
    switch command.input {
    case UIKeyCommand.inputUpArrow: name = "up"
    case UIKeyCommand.inputDownArrow: name = "down"
    case UIKeyCommand.inputLeftArrow: name = "left"
    case UIKeyCommand.inputRightArrow: name = "right"
    case "\r": name = "enter"
    case " ": name = "space"
    default: name = "key"
    }
    NSLog("[HardwareKeys] keyCommand -> \(name)")
    onArrowKey(["key": name, "via": "command"])
  }

  // MARK: - Path 3: raw key presses (fallback — catches every key)

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    var sawKey = false
    for press in presses {
      guard let key = press.key else { continue }
      sawKey = true
      let name = KeyCaptureView.name(for: key)
      NSLog("[HardwareKeys] pressesBegan keyCode=\(key.keyCode.rawValue) -> \(name)")
      onArrowKey(["key": name, "via": "press"])
    }
    if !sawKey {
      super.pressesBegan(presses, with: event)
    }
  }

  private static func name(for key: UIKey) -> String {
    switch key.keyCode {
    case .keyboardUpArrow: return "up"
    case .keyboardDownArrow: return "down"
    case .keyboardLeftArrow: return "left"
    case .keyboardRightArrow: return "right"
    case .keyboardReturnOrEnter, .keypadEnter: return "enter"
    case .keyboardSpacebar: return "space"
    case .keyboardPageUp: return "pageup"
    case .keyboardPageDown: return "pagedown"
    default:
      let chars = key.charactersIgnoringModifiers
      return chars.isEmpty ? "key#\(key.keyCode.rawValue)" : chars
    }
  }

  // MARK: - First-responder upkeep + status reporting

  @objc private func appBecameActive() {
    DispatchQueue.main.async { [weak self] in self?.claimFocus() }
  }

  private func claimFocus() {
    if window != nil, !isFirstResponder {
      let ok = becomeFirstResponder()
      NSLog("[HardwareKeys] becomeFirstResponder -> \(ok)")
    }
    emitStatus()
  }

  @objc private func emitStatus() {
    onStatus([
      "firstResponder": isFirstResponder,
      "keyboard": GCKeyboard.coalesced != nil,
    ])
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      DispatchQueue.main.async { [weak self] in self?.claimFocus() }
      focusTimer?.invalidate()
      // A modal, WebView, or other view can steal first responder; re-assert
      // it (and refresh the status readout) on a timer.
      focusTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
        self?.claimFocus()
      }
    } else {
      focusTimer?.invalidate()
      focusTimer = nil
    }
  }

  deinit {
    focusTimer?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }
}
