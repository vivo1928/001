#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/vivo1928/001.git"
APP_DIR="${HOME}/lx-music-mobile"
SDK="${HOME}/android/android-sdk"
NDK="${HOME}/android/android-ndk-r29"
OUT_DIR="/sdcard/Download"
GHFAST="https://ghfast.top/"
MODE="${1:-debug}"

export JAVA_HOME="${PREFIX}/lib/jvm/java-17-openjdk"
export ANDROID_HOME="${SDK}"
export ANDROID_SDK_ROOT="${SDK}"
export ANDROID_NDK_HOME="${NDK}"
export PATH="${JAVA_HOME}/bin:${SDK}/platform-tools:${PATH}"

git config --global url."${GHFAST}https://github.com/".insteadOf "https://github.com/"
git config --global url."${GHFAST}https://github.com/".insteadOf "ssh://git@github.com/"
git config --global url."${GHFAST}https://github.com/".insteadOf "git@github.com:"
npm config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true

if [ ! -d "${APP_DIR}/.git" ]; then
  git clone --depth 1 "${GHFAST}${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
git fetch --depth 1 origin
git reset --hard origin/HEAD
git clean -fd -e android/local.properties -e android/keystore.properties -e android/app/*.keystore

npm ci
node dependencies-patch.js

printf 'sdk.dir=%s\n' "${SDK}" > android/local.properties

python3 - <<'PY'
from pathlib import Path
p = Path("android/build.gradle")
t = p.read_text()
t = t.replace('buildToolsVersion = "35.0.0"', 'buildToolsVersion = "37.0.0"')
t = t.replace('ndkVersion = "26.1.10909125"', 'ndkVersion = "29.0.14206865"')
p.write_text(t)
p = Path("android/gradle.properties")
t = p.read_text()
t = t.replace("hermesEnabled=true", "hermesEnabled=false")
t = t.replace("AsyncStorage_useNextStorage=true", "AsyncStorage_useNextStorage=false")
p.write_text(t)
PY

mkdir -p "${SDK}/ndk" "${SDK}/cmake/3.22.1.bak/bin" "${SDK}/cmake/3.22.1.bak/share"
ln -sfn "${NDK}" "${SDK}/ndk/29.0.14206865"
ln -sfn "${NDK}" "${SDK}/ndk/26.1.10909125"
if [ -x "${SDK}/cmake/bin/cmake" ]; then
  cp -f "${SDK}/cmake/bin/cmake" "${SDK}/cmake/3.22.1.bak/bin/cmake"
  cp -f "${SDK}/cmake/bin/ninja" "${SDK}/cmake/3.22.1.bak/bin/ninja"
  ln -sfn "${SDK}/cmake/share/cmake-4.2" "${SDK}/cmake/3.22.1.bak/share/cmake-4.2"
fi

AAPT2="$(command -v aapt2)"
if [ -n "${AAPT2}" ] && [ -d "${HOME}/.gradle" ]; then
  find "${HOME}/.gradle" -type f -name aapt2 -exec cp "${AAPT2}" {} \;
  python3 - <<PY
import os, zipfile, shutil
aapt2 = shutil.which("aapt2")
data = open(aapt2, "rb").read()
root = os.path.expanduser("~/.gradle")
for dirpath, _, files in os.walk(root):
    for f in files:
        if f.startswith("aapt2") and f.endswith("-linux.jar"):
            jar = os.path.join(dirpath, f)
            tmp = jar + ".tmp"
            with zipfile.ZipFile(jar, "r") as zin, zipfile.ZipFile(tmp, "w") as zout:
                for item in zin.infolist():
                    name = item.filename.split("/")[-1]
                    zout.writestr(item, data if name == "aapt2" else zin.read(item.filename))
            os.replace(tmp, jar)
PY
fi

cd android
chmod +x gradlew
if [ "${MODE}" = "release" ]; then
  if [ ! -f keystore.properties ]; then
    echo "ERROR: release 构建需要 android/keystore.properties，请先生成签名（见说明）"
    exit 1
  fi
  ./gradlew assembleRelease --init-script init.gradle --no-daemon -PreactNativeArchitectures=arm64-v8a
  APK_SRC="app/build/outputs/apk/release"
else
  ./gradlew assembleDebug --init-script init.gradle --no-daemon -PreactNativeArchitectures=arm64-v8a
  APK_SRC="app/build/outputs/apk/debug"
fi

mkdir -p "${OUT_DIR}"
cp -f "${APK_SRC}"/*.apk "${OUT_DIR}/"
ls -lh "${OUT_DIR}"/*.apk
echo "APK: ${OUT_DIR}/lx-music-mobile-v1.9.1-universal.apk"
echo "构建完成，模式: ${MODE}"
