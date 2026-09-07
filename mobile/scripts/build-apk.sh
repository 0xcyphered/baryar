#!/usr/bin/env bash
#
# build-apk.sh — build an installable Baryar APK (final APK, not expo dev client).
#
# Usage (run from mobile/, or `yarn build:apk`):
#   bash scripts/build-apk.sh                  # release APK for real phones (arm64 + armv7)
#   bash scripts/build-apk.sh --universal      # release APK with all 4 ABIs (largest file)
#   bash scripts/build-apk.sh --abi x86_64     # release APK for one ABI (e.g. emulator)
#   bash scripts/build-apk.sh --debug          # debug-signed APK (quick device test)
#   SKIP_PREBUILD=1 bash scripts/build-apk.sh  # reuse existing android/ (faster; only if
#                                              # app.json / packages did not change)
#   SKIP_CLEAN=1 bash scripts/build-apk.sh     # skip `gradlew clean`
#
# Output:  mobile/build/baryar-<version>-<kind>.apk
# Signing: release builds are signed with mobile/keystore/baryar-release.keystore
#          (generated on first run — BACK IT UP, see warning in the summary).
#
# Point the app at your backend (baked into the JS bundle at build time):
#   EXPO_PUBLIC_API_BASE=http://192.168.1.20:4000 bash scripts/build-apk.sh
# Without it the APK keeps the dev defaults (10.0.2.2 / localhost — emulator only).

set -euo pipefail

MOBILE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MOBILE_ROOT"

APP_BUILD_GRADLE="$MOBILE_ROOT/android/app/build.gradle"
KS_DIR="$MOBILE_ROOT/keystore"
KS_FILE="$KS_DIR/baryar-release.keystore"
KS_PROPS="$KS_DIR/keystore.properties"
OUT_DIR="$MOBILE_ROOT/build"

info() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---------------------------------------------------------------- arguments --
KIND="release"
ABI="arm64-v8a,armeabi-v7a"   # real phones; x86/x86_64 are emulators only
UNIVERSAL=0
SKIP_PREBUILD="${SKIP_PREBUILD:-0}"
SKIP_CLEAN="${SKIP_CLEAN:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --debug) KIND="debug" ;;
    --universal) UNIVERSAL=1 ;;
    --abi) [ $# -ge 2 ] || die "--abi needs a value"; ABI="$2"; UNIVERSAL=0; shift ;;
    --skip-prebuild) SKIP_PREBUILD=1 ;;
    --skip-clean) SKIP_CLEAN=1 ;;
    *) die "Unknown option: $1 (use --debug, --universal, --abi <abi>, --skip-prebuild, --skip-clean)" ;;
  esac
  shift
done

# ------------------------------------------------------------- toolchain ------
resolve_java() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    return 0
  fi
  local jbr="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [ -x "$jbr/bin/java" ]; then
    export JAVA_HOME="$jbr"
    return 0
  fi
  if command -v java >/dev/null 2>&1; then
    export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
    return 0
  fi
  die "No JDK found. Install Android Studio — its bundled JBR (JDK 25) is used automatically."
}
resolve_java
JAVA_VER="$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
info "JAVA_HOME=$JAVA_HOME ($JAVA_VER)"
info "API base baked into bundle: ${EXPO_PUBLIC_API_BASE:-<default: emulator 10.0.2.2 / localhost>}"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -d "$ANDROID_HOME/platforms" ] || die "Android SDK not found at $ANDROID_HOME — install via Android Studio."
[ -d "$ANDROID_HOME/ndk" ] || die "NDK missing in $ANDROID_HOME/ndk — install via Android Studio SDK Manager."
[ -d "$ANDROID_HOME/cmake" ] || die "CMake missing in $ANDROID_HOME/cmake — install via Android Studio SDK Manager."
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools:$PATH"
info "ANDROID_HOME=$ANDROID_HOME"

# ------------------------------------------------------------ dependencies ----
if [ ! -d node_modules ]; then
  info "Installing JS dependencies (yarn)…"
  yarn install
fi

# ---------------------------------------------------------------- prebuild ----
if [ "$SKIP_PREBUILD" != "1" ]; then
  info "Regenerating android/ from app.json (expo prebuild --clean)…"
  npx expo prebuild --platform android --clean --no-install
fi
[ -f "$APP_BUILD_GRADLE" ] || die "android/app/build.gradle missing after prebuild."
if [ ! -f android/local.properties ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
fi

# Allow plain-http LAN backends in RELEASE builds (debug builds get this from
# Expo's own src/debug manifest). Needed while the API has no TLS; remove this
# block once the backend serves HTTPS. (app.json android.usesCleartextTraffic is
# NOT applied by SDK 57 prebuild — hence this release source-set manifest.)
if [ "$KIND" = "release" ]; then
  mkdir -p android/app/src/release
  cat > android/app/src/release/AndroidManifest.xml <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:ignore="GoogleAppIndexingWarning" tools:replace="android:usesCleartextTraffic" />
</manifest>
XML
fi

# ------------------------------------------------------------- keystore -------
GRADLE_BAK=""
cleanup() {
  if [ -n "$GRADLE_BAK" ] && [ -f "$GRADLE_BAK" ]; then
    mv -f "$GRADLE_BAK" "$APP_BUILD_GRADLE"
    info "Restored android/app/build.gradle (script-only signing config removed)"
  fi
}

ensure_release_keystore() {
  local keytool="$JAVA_HOME/bin/keytool"
  mkdir -p "$KS_DIR"
  if [ -f "$KS_FILE" ] && [ -f "$KS_PROPS" ]; then
    local pass
    pass="$(sed -n 's/^storePassword=//p' "$KS_PROPS")"
    if ! "$keytool" -list -keystore "$KS_FILE" -storepass "$pass" >/dev/null 2>&1; then
      die "Release keystore $KS_FILE is unreadable (corrupt / password changed). Restore it from backup, or delete the keystore/ directory to generate a new one."
    fi
    info "Using existing release keystore (keystore/baryar-release.keystore)"
    return 0
  fi

  warn "First run: generating a new release keystore (valid 30 years)"
  local pass
  if command -v openssl >/dev/null 2>&1; then
    pass="$(openssl rand -hex 16)"
  else
    pass="baryar-$(date +%s)-$RANDOM"
  fi
  "$keytool" -genkeypair -v \
    -keystore "$KS_FILE" -alias baryar-release \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass "$pass" -keypass "$pass" \
    -dname "CN=Baryar, OU=AminTajeran, O=Taticom, L=Tehran, C=IR" >/dev/null \
    || die "keytool failed to generate the keystore."
  {
    echo "storeFile=baryar-release.keystore"
    echo "storePassword=$pass"
    echo "keyAlias=baryar-release"
    echo "keyPassword=$pass"
  } > "$KS_PROPS"
  chmod 600 "$KS_PROPS"
  warn "Generated mobile/keystore/baryar-release.keystore — BACK UP this directory. If you lose it you can never ship an update of the same release APK."
}

inject_release_signing() {
  cp "$KS_FILE" android/app/baryar-release.keystore
  cp "$KS_PROPS" android/keystore.properties

  cat > android/app/keystore.gradle <<'GRADLE'
// Release signing config — generated by scripts/build-apk.sh. Do not edit here;
// the keystore lives in mobile/keystore/ (outside the generated android/ dir).
def keystoreProps = new Properties()
def keystorePropsFile = rootProject.file("keystore.properties")
if (keystorePropsFile.exists()) {
    keystorePropsFile.withInputStream { keystoreProps.load(it) }
}
android {
    signingConfigs {
        release {
            if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps["storeFile"])
                storePassword keystoreProps["storePassword"]
                keyAlias keystoreProps["keyAlias"]
                keyPassword keystoreProps["keyPassword"]
            } else {
                storeFile file("debug.keystore")
                storePassword "android"
                keyAlias "androiddebugkey"
                keyPassword "android"
            }
        }
    }
}
GRADLE

  GRADLE_BAK="$APP_BUILD_GRADLE.apkbuild.bak"
  trap cleanup EXIT
  cp "$APP_BUILD_GRADLE" "$GRADLE_BAK"

  if ! grep -q 'apply from: "keystore.gradle"' "$APP_BUILD_GRADLE"; then
    perl -pi -e 's/^(apply plugin: "com\.facebook\.react")$/$1\napply from: "keystore.gradle"/' "$APP_BUILD_GRADLE"
  fi
  perl -0pi -e 's/(signed-apk-android\.\n\s+)signingConfig signingConfigs\.debug/$1signingConfig signingConfigs.release/' "$APP_BUILD_GRADLE"

  grep -q 'apply from: "keystore.gradle"' "$APP_BUILD_GRADLE" \
    || die "Could not inject keystore.gradle into android/app/build.gradle (template changed?)."
  grep -q 'signingConfig signingConfigs.release' "$APP_BUILD_GRADLE" \
    || die "Could not switch release signingConfig (build.gradle template changed?)."
  info "Release signing wired: baryar-release keystore"
}

# ------------------------------------------------------------------ build -----
if [ "$KIND" = "release" ]; then
  ensure_release_keystore
  inject_release_signing
fi

GRADLE_TASKS="assemble$KIND"
[ "$SKIP_CLEAN" = "1" ] || GRADLE_TASKS="clean $GRADLE_TASKS"
info "Building $GRADLE_TASKS (ABIs: $ABI)…"
(cd android && ./gradlew $GRADLE_TASKS -PreactNativeArchitectures="$ABI" --console=plain)

# ---------------------------------------------------------------- package -----
APK_PATH="android/app/build/outputs/apk/$KIND/app-$KIND.apk"
[ -f "$APK_PATH" ] || APK_PATH="$(find android/app/build/outputs/apk/$KIND -name '*.apk' | head -1)"
[ -n "$APK_PATH" ] && [ -f "$APK_PATH" ] || die "Gradle finished but no APK found under android/app/build/outputs/apk/$KIND."

VERSION="$(node -p "require('./app.json').expo.version")"
SUFFIX=""
if [ "$UNIVERSAL" != "1" ]; then
  if [ "$ABI" = "arm64-v8a,armeabi-v7a" ]; then
    SUFFIX="-phone"
  else
    SUFFIX="-$(printf '%s' "$ABI" | tr ',' '+')"
  fi
fi
mkdir -p "$OUT_DIR"
FINAL="$OUT_DIR/baryar-$VERSION-$KIND$SUFFIX.apk"
cp -f "$APK_PATH" "$FINAL"

# ---------------------------------------------------------------- summary -----
SIZE="$(du -h "$FINAL" | cut -f1)"
SHA="$(shasum -a 256 "$FINAL" | cut -d' ' -f1)"
info "APK ready: $FINAL"
info "Size: $SIZE"
info "SHA-256: $SHA"

BT_DIR="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
if [ -x "$BT_DIR/apksigner" ]; then
  info "Signing:"
  "$BT_DIR/apksigner" verify --print-certs "$FINAL" 2>/dev/null | sed -n '1,3p' | sed 's/^/  /'
fi

echo
if [ "$KIND" = "release" ]; then
  warn "BACK UP mobile/keystore/ (baryar-release.keystore + keystore.properties)."
  warn "Losing the keystore means you cannot update the same app install later."
fi
echo "Install on a phone:"
echo "  adb install -r \"$FINAL\""
echo "  … or copy the APK to the phone and open it from Files (allow 'Install unknown apps')."
