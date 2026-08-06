const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
// Bake local warthog-ts into the app bundle (in-tree first, then legacy sibling).
const candidates = [
  path.resolve(projectRoot, 'warthog-ts'),
  path.resolve(projectRoot, 'node_modules/warthog-ts'),
  path.resolve(projectRoot, '../warthog-ts'),
];
const warthogTsRoot = fs.realpathSync(
  candidates.find((p) => fs.existsSync(p))
);

const config = getDefaultConfig(projectRoot);

// Allow Metro to bundle the local file: warthog-ts dependency.
config.watchFolders = [warthogTsRoot];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Map warthog-ts explicitly so release/APK bundling follows the real package path.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'warthog-ts': warthogTsRoot,
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
  events: require.resolve('events'),
  process: require.resolve('process/browser'),
};

module.exports = config;
