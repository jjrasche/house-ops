const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const factoredUiRoot = path.resolve(monorepoRoot, '..', 'factoredui');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root and factoredui source for live changes
config.watchFolders = [monorepoRoot, factoredUiRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force factoredui subpath imports to resolve from the source repo, not the stale hoisted copy
config.resolver.extraNodeModules = {
  factoredui: factoredUiRoot,
};

module.exports = config;
