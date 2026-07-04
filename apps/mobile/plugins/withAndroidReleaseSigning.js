const { withAppBuildGradle } = require("@expo/config-plugins");

/** Injects release signing from env vars after expo prebuild. */
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;

    const keystorePath = process.env.THETEXTAPP_KEYSTORE;
    const storePassword = process.env.THETEXTAPP_KEYSTORE_PASSWORD;
    const keyAlias = process.env.THETEXTAPP_KEY_ALIAS ?? "thetextapp";
    const keyPassword = process.env.THETEXTAPP_KEY_PASSWORD ?? storePassword;

    if (!keystorePath || !storePassword) return cfg;

    const escapedPath = keystorePath.replace(/\\/g, "/");
    const signingBlock = `
android {
    signingConfigs {
        release {
            storeFile file("${escapedPath}")
            storePassword "${storePassword}"
            keyAlias "${keyAlias}"
            keyPassword "${keyPassword}"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`;

    if (!cfg.modResults.contents.includes("signingConfigs.release")) {
      cfg.modResults.contents += `\n${signingBlock}\n`;
    }

    return cfg;
  });
}

module.exports = withAndroidReleaseSigning;
