// Expo config plugin — links PencilKit.framework into the iOS app target.
//
// react-native-pencil-kit is a Fabric / Objective-C++ module, which blocks
// Clang's automatic framework module-linking. Without an explicit link the
// app fails at link time with undefined PencilKit symbols. (Per the library
// README; not needed only if the project uses `use_frameworks!`, which this
// one does not.) Re-applied automatically on every `expo prebuild`.

const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withPencilKitFramework(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    if (!project.hasFile('PencilKit.framework')) {
      project.addFramework('PencilKit.framework', { weak: false });
    }
    return cfg;
  });
};
