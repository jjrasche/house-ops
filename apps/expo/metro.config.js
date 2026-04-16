const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root for workspace package changes
config.watchFolders = [monorepoRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// In local dev, resolve factoredui from sibling source repo for live changes.
// In CI (Docker), the sibling doesn't exist — resolve from node_modules instead.
const factoredUiRoot = path.resolve(monorepoRoot, '..', 'factored-ui');
if (fs.existsSync(factoredUiRoot)) {
  config.watchFolders.push(factoredUiRoot);
  config.resolver.extraNodeModules = {
    factoredui: factoredUiRoot,
  };
}

module.exports = config;
