const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const auxiRoot = path.resolve(monorepoRoot, '..', 'auxi');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root and auxi source for live changes
config.watchFolders = [monorepoRoot, auxiRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force auxi subpath imports to resolve from the source repo, not the stale hoisted copy
config.resolver.extraNodeModules = {
  auxi: auxiRoot,
};

module.exports = config;
