#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="${ANDROID_SDK_ROOT:-/workspace/scratch/98e09eb1a586/android-sdk}"
BUILD_TOOLS="$SDK_DIR/build-tools/35.0.0"
ANDROID_JAR="$SDK_DIR/platforms/android-35/android.jar"
BUILD_DIR="$PROJECT_DIR/build-preview"
PACKAGE_DIR="id/my/elmahbub/amaliyah"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$BUILD_DIR/out"

"$BUILD_TOOLS/aapt2" compile --dir "$PROJECT_DIR/app/src/main/res" -o "$BUILD_DIR/resources.zip"
"$BUILD_TOOLS/aapt2" link \
  -o "$BUILD_DIR/unsigned.apk" \
  -I "$ANDROID_JAR" \
  -A "$PROJECT_DIR/app/src/main/assets" \
  --manifest "$PROJECT_DIR/tools/preview/AndroidManifest.xml" \
  --java "$BUILD_DIR/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 35 \
  --version-code 10001 \
  --version-name 1.0.1-preview \
  "$BUILD_DIR/resources.zip"

java -m jdk.compiler/com.sun.tools.javac.Main \
  -source 8 -target 8 -encoding UTF-8 \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD_DIR/classes" \
  "$BUILD_DIR/gen/$PACKAGE_DIR/R.java" \
  "$PROJECT_DIR/app/src/main/java/$PACKAGE_DIR/MainActivity.java" \
  "$PROJECT_DIR/app/src/main/java/$PACKAGE_DIR/NotificationHelper.java"

mapfile -t CLASS_FILES < <(find "$BUILD_DIR/classes" -type f -name '*.class' | sort)
"$BUILD_TOOLS/d8" --lib "$ANDROID_JAR" --min-api 23 --output "$BUILD_DIR/dex" "${CLASS_FILES[@]}"
(
  cd "$BUILD_DIR/dex"
  "$BUILD_TOOLS/aapt" add "$BUILD_DIR/unsigned.apk" classes.dex >/dev/null
)
"$BUILD_TOOLS/zipalign" -f 4 "$BUILD_DIR/unsigned.apk" "$BUILD_DIR/aligned.apk"

KEYSTORE="$PROJECT_DIR/tools/signing/preview.keystore"
if [[ ! -f "$KEYSTORE" ]]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -noprompt \
    -keystore "$KEYSTORE" -storepass amaliyah-preview -keypass amaliyah-preview \
    -alias amaliyah-preview -keyalg RSA -keysize 2048 -validity 3650 \
    -dname "CN=Amaliyah Preview, O=Amaliyah, C=ID" >/dev/null 2>&1
fi

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" --ks-pass pass:amaliyah-preview --key-pass pass:amaliyah-preview \
  --out "$BUILD_DIR/out/Amaliyah-1.0.1-preview.apk" "$BUILD_DIR/aligned.apk"
"$BUILD_TOOLS/apksigner" verify --verbose "$BUILD_DIR/out/Amaliyah-1.0.1-preview.apk"
