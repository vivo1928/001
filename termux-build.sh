#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/vivo1928/001.git"
APP_DIR="${HOME}/lx-music-mobile"
SDK="${HOME}/android/android-sdk"
NDK="${HOME}/android/android-ndk-r29"
OUT_DIR="/sdcard/Download"
GHFAST="https://ghfast.top/"
MODE="${1:-release}"

# 无参数时弹出中文菜单（也可直接传参数：release/debug/all/sync）
if [ $# -eq 0 ]; then
  echo ""
  echo "============================================="
  echo "          Termux 本地编译助手"
  echo "============================================="
  echo "  输入【开始编译】= 打正式包 (release)"
  echo "  输入【全部构建】= 一次出正式包 + 调试包"
  echo "  输入【调试包】  = 只打调试包 (debug)"
  echo "  输入【同步代码】= 仅更新代码，不编译"
  echo "  输入【退出】    = 退出"
  echo "  直接回车        = 打正式包"
  echo "---------------------------------------------"
  echo ""
  while true; do
    read -r -p ">>> " ANS
    case "${ANS}" in
      *同步*|2)
        MODE="sync"
        break
        ;;
      *调试*|3)
        MODE="debug"
        break
        ;;
      *全部*|4)
        MODE="all"
        break
        ;;
      *退出*|0|*exit*|*quit*)
        echo "已退出。"
        exit 0
        ;;
      *编译*|1|"")
        MODE="release"
        break
        ;;
      *)
        echo "请输入【开始编译】【全部构建】【调试包】【同步代码】【退出】其中一个。"
        ;;
    esac
  done
  echo ""
fi

case "${MODE}" in
  release|debug|all|sync) ;;
  *)
    echo "用法: $0 [release|debug|all|sync]（不带参数会弹出中文菜单）"
    echo "  release: 只打正式包"
    echo "  debug:   只打调试包"
    echo "  all:     同时打正式包和调试包"
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
BUNDLE_SRC="${APP_DIR}/android/app/src/main/assets/index.android.bundle"
echo "JS bundle 生成完成: $(ls -lh "${BUNDLE_SRC}" | awk '{print $5}')"

# Gradle 会合并 build/generated/assets 下旧的 bundle（优先级高于 src/main/assets），
# 用本次生成的 bundle 覆盖，避免把旧的 dev bundle 打进 APK
for d in \
  "android/app/build/generated/assets/createBundleReleaseJsAndAssets" \
  "android/app/build/generated/assets/createBundleDebugJsAndAssets"; do
  mkdir -p "$d"
  cp -f "${BUNDLE_SRC}" "$d/index.android.bundle"
done

echo "[5/7] 签名检查..."
if [ "${MODE}" = "release" ] || [ "${MODE}" = "all" ]; then
  KS_FILE="${APP_DIR}/android/app/my-release.keystore"
  KS_PROPS="${APP_DIR}/android/keystore.properties"
  # 密码和别名固定，保证每次构建签名一致；文件在设备本地且被 git clean 排除，不删就永久复用
  KS_PASS="lxmusic-release-2026"
  KS_ALIAS="lxmusic"

  if [ ! -f "${KS_FILE}" ] || [ ! -f "${KS_PROPS}" ]; then
    echo "首次构建：在设备本地生成签名密钥（之后一直复用，请勿删除 android/app/my-release.keystore）..."
    keytool -genkeypair -v \
      -keystore "${KS_FILE}" \
      -alias "${KS_ALIAS}" \
      -keyalg RSA -keysize 2048 -validity 36500 \
      -storepass "${KS_PASS}" -keypass "${KS_PASS}" \
      -dname "CN=lx-music-mobile, OU=LX, O=LX, L=Beijing, ST=Beijing, C=CN" \
      >/dev/null 2>&1
    cat > "${KS_PROPS}" <<EOF
storeFile=${KS_FILE}
storePassword=${KS_PASS}
keyAlias=${KS_ALIAS}
keyPassword=${KS_PASS}
EOF
    echo "已生成: ${KS_FILE}"
  else
    echo "复用已有签名: ${KS_FILE}"
  fi
  STORE_PATH="$(readlink -f "${KS_FILE}")"
  sed -i "s|^storeFile=.*|storeFile=${STORE_PATH}|" "${KS_PROPS}"
else
  echo "（debug 模式使用内置调试签名）"
fi

build_variant() {
  local variant="$1"
  local task="$2"
  local outdir="$3"

  echo ""
  echo "[6/7] 开始 ${variant} 编译（手机端约 2-5 分钟，请保持亮屏）..."
  echo ">>> ./gradlew ${task}"
  ./gradlew "${task}" --init-script init.gradle --no-daemon -PusePrebuiltBundle -PreactNativeArchitectures=arm64-v8a

  if ! compgen -G "${outdir}/*.apk" >/dev/null; then
    echo "ERROR: 未找到构建产物 ${outdir}/*.apk"
    exit 1
  fi

  local f dest
  for f in "${outdir}"/*.apk; do
    dest="${OUT_DIR}/$(basename "${f%.apk}")-${BUILD_NO}-${variant}.apk"
    cp -f "$f" "$dest"
    echo "---------------------------------------------"
    echo "变体: ${variant}"
    echo "APK: ${dest}"
    ls -lh "$dest"
    if command -v unzip >/dev/null 2>&1; then
      LOCAL_SIZE=$(wc -c < "${BUNDLE_SRC}" | tr -d ' ')
      APK_SIZE=$(unzip -l "$dest" 2>/dev/null | awk '$4 == "assets/index.android.bundle" {print $1}')
      if [ -z "${APK_SIZE}" ]; then
        echo "ERROR: ${variant} 包内缺少 assets/index.android.bundle"
        exit 1
      fi
      echo "bundle 大小: APK 内 $(numfmt --to=iec "${APK_SIZE}" 2>/dev/null || echo "${APK_SIZE}") / 本地 $(numfmt --to=iec "${LOCAL_SIZE}" 2>/dev/null || echo "${LOCAL_SIZE}")"
      if [ "${APK_SIZE}" != "${LOCAL_SIZE}" ]; then
        echo "ERROR: ${variant} 包内 bundle 与本地不一致（被打进了旧 bundle）"
        exit 1
      fi
    fi
    if command -v aapt2 >/dev/null 2>&1; then
      aapt2 dump badging "$dest" 2>/dev/null \
        | grep -E "^(package|application-debuggable)" || true
    fi
  done
}

cd android
chmod +x gradlew
mkdir -p "${OUT_DIR}"

# 构建序号：存放在 $HOME，不被 git clean 清除，每次构建 +1
COUNT_FILE="${HOME}/.lx-build-count"
BUILD_NO=$(cat "${COUNT_FILE}" 2>/dev/null || echo 0)
BUILD_NO=$((BUILD_NO + 1))
BUILD_NO=$(printf '%04d' "${BUILD_NO}")
echo "${BUILD_NO}" > "${COUNT_FILE}"
echo "本次构建序号: ${BUILD_NO}"

case "${MODE}" in
  release)
    build_variant release assembleRelease app/build/outputs/apk/release
    ;;
  debug)
    build_variant debug assembleDebug app/build/outputs/apk/debug
    ;;
  all)
    build_variant release assembleRelease app/build/outputs/apk/release
    build_variant debug assembleDebug app/build/outputs/apk/debug
    ;;
esac

echo ""
echo "[7/7] 构建完成！"
echo "============================================="
ls -lh "${OUT_DIR}"/*.apk
echo "（release 包不应出现 application-debuggable，debug 包会带 debug 后缀包名）"
echo "============================================="
trap - ERR
send_notify "LX Music 构建完成" "${MODE} 构建成功，APK 已保存到 ${OUT_DIR}"