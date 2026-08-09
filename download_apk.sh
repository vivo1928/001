#!/bin/bash
# 下载最新Release APK到产物文件夹
# 用法: ./download_apk.sh

set -e

PRODUCTS_DIR="/workspace/产物"
REPO="vivo1928/001"
MAX_APKS=5
API_URL="https://api.github.com/repos/$REPO/releases"

# 创建产物目录
mkdir -p "$PRODUCTS_DIR"

echo "正在获取Release列表..."
RELEASES_JSON=$(curl -s "$API_URL")

if [ -z "$RELEASES_JSON" ] || [ "$RELEASES_JSON" = "[]" ]; then
    echo "未找到任何Release"
    exit 1
fi

# 获取最新Release信息
LATEST_TAG=$(echo "$RELEASES_JSON" | jq -r '.[0].tag_name')
LATEST_NAME=$(echo "$RELEASES_JSON" | jq -r '.[0].name')
ASSET_URL=$(echo "$RELEASES_JSON" | jq -r '.[0].assets[] | select(.name | endswith(".apk")) | .browser_download_url' | head -1)

if [ -z "$ASSET_URL" ]; then
    echo "未找到APK文件"
    exit 1
fi

# 提取构建序号
BUILD_NUM=$(echo "$LATEST_TAG" | grep -oE '[0-9]+$' || echo "0")
APK_NAME=$(basename "$ASSET_URL")

echo "最新Release: $LATEST_NAME ($LATEST_TAG)"
echo "APK下载链接: $ASSET_URL"
echo ""
echo "正在下载: $APK_NAME (构建 #$BUILD_NUM)..."

# 下载APK
curl -L -o "$PRODUCTS_DIR/$APK_NAME" "$ASSET_URL"

echo "下载完成: $PRODUCTS_DIR/$APK_NAME"
ls -lh "$PRODUCTS_DIR/$APK_NAME"

# 清理旧APK，只保留最近MAX_APKS个
echo ""
echo "清理旧APK，保留最近$MAX_APKS个..."
APK_COUNT=$(ls "$PRODUCTS_DIR"/*.apk 2>/dev/null | wc -l)

if [ "$APK_COUNT" -gt "$MAX_APKS" ]; then
    ls -t "$PRODUCTS_DIR"/*.apk | tail -n +$((MAX_APKS + 1)) | xargs rm -f
    echo "已清理 $((APK_COUNT - MAX_APKS)) 个旧APK"
fi

# 显示当前产物列表
echo ""
echo "当前产物列表 (最近$MAX_APKS个):"
ls -lh "$PRODUCTS_DIR"/*.apk 2>/dev/null | tail -n "$MAX_APKS"
