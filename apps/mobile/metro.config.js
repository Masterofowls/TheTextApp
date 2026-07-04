const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** Packages with dynamic imports Metro cannot parse — safe to stub on web (WebCodecs native). */
const MOQ_METRO_SHIMS = {
  "@libav.js/variant-opus-af": path.resolve(
    projectRoot,
    "metro-shims/libav-variant-opus-af.js"
  ),
  "@kixelated/libavjs-webcodecs-polyfill": path.resolve(
    projectRoot,
    "metro-shims/libavjs-webcodecs-polyfill.js"
  ),
};

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shimPath = MOQ_METRO_SHIMS[moduleName];
  if (shimPath) {
    return { filePath: shimPath, type: "sourceFile" };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativewind(config, { inlineRem: 16 });
