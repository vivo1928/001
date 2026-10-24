#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/vivo1928/001.git"
APP_DIR="${HOME}/lx-music-mobile"
SDK="${HOME}/android/android-sdk"
NDK="${HOME}/android/android-ndk-r29"
OUT_DIR="/sdcard/Download"
GHFAST="https://ghfast.top/"
MODE="${1:-release}"
case "${MODE}" in
  release|debug|sync) ;;
  *)
    echo "用法: $0 [release|debug|sync]（默认 release）"
    echo "收到无效参数: ${MODE}"
    exit 1
    ;;
esac

export JAVA_HOME="${PREFIX}/lib/jvm/java-17-openjdk"
export ANDROID_HOME="${SDK}"
export ANDROID_SDK_ROOT="${SDK}"
export ANDROID_NDK_HOME="${NDK}"
export PATH="${JAVA_HOME}/bin:${SDK}/platform-tools:${PATH}"

echo ""
echo "============================================="
echo "  LX Music Termux 本地编译，模式: ${MODE}"
echo "============================================="

send_notify() {
  local title="$1"
  local content="$2"
  if command -v termux-notification >/dev/null 2>&1; then
    termux-notification --id lx-build --title "${title}" --content "${content}" --priority high 2>/dev/null || true
  else
    echo "（提示：安装 termux-api 后可在编译完成时收到系统通知）"
  fi
  if command -v termux-tts-speak >/dev/null 2>&1; then
    termux-tts-speak "${title}，${content}" 2>/dev/null || true
  fi
}
trap 'send_notify "LX Music 构建失败" "编译出错，请打开 Termux 查看日志"' ERR

git config --global url."${GHFAST}https://github.com/".insteadOf "https://github.com/"
git config --global url."${GHFAST}https://github.com/".insteadOf "ssh://git@github.com/"
git config --global url."${GHFAST}https://github.com/".insteadOf "git@github.com:"
npm config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[1/7] 首次运行，克隆仓库..."
  git clone --depth 1 "${GHFAST}${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
echo "[2/7] 同步最新代码..."
git fetch --depth 1 origin
git reset --hard origin/HEAD
git clean -fd -e android/local.properties -e android/keystore.properties -e android/app/*.keystore

if [ "${MODE}" = "sync" ]; then
  echo "代码已同步到: ${APP_DIR}"
  exit 0
fi

echo "[3/7] 安装依赖..."
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

# Termux 为 arm64 环境，无法运行桌面版 hermesc（x86_64），但 Hermes 引擎本身可以执行纯 JS bundle
# 显式用 react-native bundle（纯 Node 实现）预生成纯 JS bundle，再让 Gradle 打包
# 保留 hermesEnabled=true 让 App 链接 Hermes 库（JSC 不支持命名捕获组等现代正则特性）
echo "[4/7] 生成 JS bundle（纯 Node，绕过 hermesc）..."
mkdir -p android/app/src/main/assets
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
echo "JS bundle 生成完成: $(ls -lh android/app/src/main/assets/index.android.bundle | awk '{print $5}')"

echo "[5/7] 签名检查..."
if [ "${MODE}" = "release" ]; then
  if [ ! -f android/keystore.properties ]; then
    echo "ERROR: 缺少签名配置 android/keystore.properties"
    exit 1
  fi
  KS_FILE="${APP_DIR}/android/app/my-release.keystore"
  if [ -f "${KS_FILE}" ]; then
    STORE_PATH="$(readlink -f "${KS_FILE}")"
    sed -i "s|^storeFile=.*|storeFile=${STORE_PATH}|" android/keystore.properties
    echo "签名: ${STORE_PATH}"
  else
    echo "ERROR: 未找到 ${KS_FILE}"
    exit 1
  fi
else
  echo "（debug 模式使用内置调试签名）"
fi

echo "[6/7] 开始 Gradle 编译（模式: ${MODE}，手机端约 2-5 分钟，请保持亮屏）..."
cd android
chmod +x gradlew
if [ "${MODE}" = "release" ]; then
  echo ">>> ./gradlew assembleRelease"
  ./gradlew assembleRelease --init-script init.gradle --no-daemon -PusePrebuiltBundle -PreactNativeArchitectures=arm64-v8a
  APK_SRC="app/build/outputs/apk/release"
else
  echo ">>> ./gradlew assembleDebug"
  ./gradlew assembleDebug --init-script init.gradle --no-daemon -PusePrebuiltBundle -PreactNativeArchitectures=arm64-v8a
  APK_SRC="app/build/outputs/apk/debug"
fi

echo "[7/7] 复制 APK 到下载目录..."
if ! compgen -G "${APK_SRC}/*.apk" >/dev/null; then
  echo "ERROR: 未找到构建产物 ${APK_SRC}/*.apk"
  exit 1
fi
mkdir -p "${OUT_DIR}"
cp -f "${APK_SRC}"/*.apk "${OUT_DIR}/"

echo "构建完成！"
echo "============================================="
APK_DEST=""
for f in "${APK_SRC}"/*.apk; do
  APK_DEST="${OUT_DIR}/$(basename "$f")"
  echo "变体: ${MODE}"
  echo "APK: ${APK_DEST}"
  ls -lh "${APK_DEST}"
done
if command -v aapt2 >/dev/null 2>&1 && [ -n "${APK_DEST}" ]; then
  echo "---------------------------------------------"
  echo "APK 属性校验:"
  aapt2 dump badging "${APK_DEST}" 2>/dev/null \
    | grep -E "^(package|application-debuggable)" || true
  echo "（未出现 application-debuggable 即为正式 release 包）"
fi
echo "============================================="
trap - ERR
send_notify "LX Music 构建完成" "${MODE} 构建成功，APK 已保存到 ${OUT_DIR}"