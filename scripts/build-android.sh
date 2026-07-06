#!/usr/bin/env bash
# Build TheTextApp Android release APK (ARM, signed when keystore env is set).
# Requires: JDK 17+, Android SDK (ANDROID_HOME), Node 20+

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
ANDROID="$MOBILE/android"
KEYSTORE="${THETEXTAPP_KEYSTORE:-$ROOT/infra/android/thetextapp-release.keystore}"

cd "$MOBILE"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "==> Generating release keystore at infra/android/"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias thetextapp \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass thetextapp \
    -keypass thetextapp \
    -dname "CN=TheTextApp, OU=Mobile, O=TheTextApp, L=London, ST=England, C=GB"
fi

export THETEXTAPP_KEYSTORE="$KEYSTORE"
export THETEXTAPP_KEYSTORE_PASSWORD="${THETEXTAPP_KEYSTORE_PASSWORD:-thetextapp}"
export THETEXTAPP_KEY_ALIAS="${THETEXTAPP_KEY_ALIAS:-thetextapp}"
export THETEXTAPP_KEY_PASSWORD="${THETEXTAPP_KEY_PASSWORD:-thetextapp}"

if [[ -f "$ANDROID/gradlew" ]]; then
  echo "==> stopping Gradle daemons (avoids EBUSY on prebuild --clean)"
  (cd "$ANDROID" && ./gradlew --stop) || true
  sleep 2
fi

echo "==> expo prebuild (android)"
if ! npx expo prebuild --platform android --no-install --clean; then
  echo "==> prebuild --clean failed; retrying without --clean"
  npx expo prebuild --platform android --no-install
fi

echo "==> gradle assembleRelease (arm64 + armeabi-v7a)"
(cd "$ANDROID" && ./gradlew assembleRelease)

APK="$ANDROID/app/build/outputs/apk/release/app-release.apk"
OUT_DIR="$ROOT/dist/android"
mkdir -p "$OUT_DIR"

if [[ -f "$APK" ]]; then
  DEST="$OUT_DIR/thetextapp-release.apk"
  cp "$APK" "$DEST"
  SIZE_MB="$(du -m "$DEST" | cut -f1)"
  echo ""
  echo "BUILD SUCCESSFUL"
  echo "Signed APK: $DEST (${SIZE_MB} MB)"
  echo "Keystore: $KEYSTORE (rotate credentials for production)"
else
  echo "Gradle finished but APK not found at $APK" >&2
  exit 1
fi
