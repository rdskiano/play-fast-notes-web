// Expo config plugin — wires react-native-key-command into the iOS
// AppDelegate so hardware key presses (e.g. a Bluetooth foot pedal that
// pairs as a keyboard) reach JS.
//
// The library documents an Objective-C AppDelegate.m, but Expo SDK 54
// generates a Swift AppDelegate.swift, so this adapts the integration:
//   1. adds `#import <HardwareShortcuts.h>` to the Swift bridging header,
//   2. adds the `keyCommands` / `handleKeyCommand` responder hooks to the
//      AppDelegate class.
// Both edits live in the (prebuild-generated, git-ignored) ios/ folder, so
// they must be re-applied by this plugin on every `expo prebuild`.

const { withAppDelegate, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const APPDELEGATE_HOOKS = `
  // react-native-key-command — route hardware key presses to JS.
  // Added by plugins/withKeyCommandAppDelegate.js.
  public override var keyCommands: [UIKeyCommand]? {
    return HardwareShortcuts.sharedInstance().keyCommands() as? [UIKeyCommand]
  }

  @objc public func handleKeyCommand(_ keyCommand: UIKeyCommand) {
    HardwareShortcuts.sharedInstance().handleKeyCommand(keyCommand)
  }
`;

const CLASS_ANCHOR = 'public class AppDelegate: ExpoAppDelegate {';
const BRIDGING_IMPORT = '#import <HardwareShortcuts.h>';

function withAppDelegateHooks(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(
        'withKeyCommandAppDelegate: expected a Swift AppDelegate, got ' +
          cfg.modResults.language,
      );
    }
    let contents = cfg.modResults.contents;
    if (contents.includes('handleKeyCommand')) return cfg; // already applied
    if (!contents.includes(CLASS_ANCHOR)) {
      throw new Error(
        'withKeyCommandAppDelegate: could not find the AppDelegate class declaration to patch.',
      );
    }
    cfg.modResults.contents = contents.replace(
      CLASS_ANCHOR,
      CLASS_ANCHOR + '\n' + APPDELEGATE_HOOKS,
    );
    return cfg;
  });
}

function withBridgingHeaderImport(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const headerPath = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName,
        `${cfg.modRequest.projectName}-Bridging-Header.h`,
      );
      if (!fs.existsSync(headerPath)) {
        throw new Error(
          'withKeyCommandAppDelegate: bridging header not found at ' +
            headerPath,
        );
      }
      let header = fs.readFileSync(headerPath, 'utf8');
      if (!header.includes('HardwareShortcuts.h')) {
        fs.writeFileSync(
          headerPath,
          header.trimEnd() + '\n' + BRIDGING_IMPORT + '\n',
        );
      }
      return cfg;
    },
  ]);
}

module.exports = function withKeyCommandAppDelegate(config) {
  config = withAppDelegateHooks(config);
  config = withBridgingHeaderImport(config);
  return config;
};
