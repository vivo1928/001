<p align="center"><a href="https://github.com/vivo1928/001"><img width="200" src="https://github.com/vivo1928/001/raw/main/doc/images/icon.png" alt="lx-music logo"></a></p>

<h1 align="center">LX Music 移动版（个人 fork）</h1>

<p align="center">
  <a href="https://github.com/vivo1928/001/releases"><img src="https://img.shields.io/github/v/release/vivo1928/001?include_prereleases&label=release" alt="Release version"></a>
  <a href="https://github.com/vivo1928/001/actions/workflows/release.yml"><img src="https://github.com/vivo1928/001/actions/workflows/release.yml/badge.svg" alt="Build status"></a>
  <a href="https://github.com/vivo1928/001/actions/workflows/build-release.yml"><img src="https://github.com/vivo1928/001/actions/workflows/build-release.yml/badge.svg" alt="Build Release status"></a>
  <a href="https://github.com/vivo1928/001/actions/workflows/build-debug.yml"><img src="https://github.com/vivo1928/001/actions/workflows/build-debug.yml/badge.svg" alt="Build Debug status"></a>
  <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/github/package-json/dependency-version/vivo1928/001/react-native/main" alt="React native version"></a>
  <a href="https://github.com/vivo1928/001/blob/main/LICENSE"><img src="https://img.shields.io/github/license/vivo1928/001" alt="License"></a>
</p>

<p align="center">一个基于 React Native 开发的音乐软件</p>

> [!IMPORTANT]
> **本项目是 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 的个人 fork（仓库：<https://github.com/vivo1928/001>），由个人维护，与上游作者无关。**
>
> - 这里发布的安装包、构建产物、Issue 与 PR 都只针对本仓库，**上游项目不受理本 fork 的问题**；
> - 问题、建议、构建失败请提交到本仓库的 [Issues](https://github.com/vivo1928/001/issues)；
> - 代码基于上游，采用 [Apache License 2.0](https://github.com/vivo1928/001/blob/main/LICENSE) 发行，并沿用上游的补充协议（见文末「项目协议」）；上游版权与致谢归 [lyswhut](https://github.com/lyswhut) 及 LX Music 贡献者所有。

## 说明

本项目是 [LX Music 移动版](https://github.com/lyswhut/lx-music-mobile) 的个人 fork，保留上游的全部功能与协议说明，在此基础上补充个人化的构建与发版流程（见「[构建与发版](#构建与发版)」）。感谢上游作者 [lyswhut](https://github.com/lyswhut) 与所有贡献者的工作，上游项目地址：<https://github.com/lyswhut/lx-music-mobile>。

所用技术栈：

- React Native
- Redux

已支持的平台：

- Android 5 及以上

***注：目前没有计划支持 iOS 和 HarmonyOS NEXT**。*<br>
*桌面版项目地址：<https://github.com/lyswhut/lx-music-desktop>*<br>
*LX Music 项目发展调整与新项目计划：https://github.com/lyswhut/lx-music-desktop/issues/1912*

软件变化请查看[更新日志](https://github.com/vivo1928/001/blob/main/CHANGELOG.md)。

软件下载请查看本仓库的 [GitHub Releases](https://github.com/vivo1928/001/releases)；想一直用最新构建也可以直接下载 [固定链接的 latest 包](https://github.com/vivo1928/001/releases/tag/latest)（文件名固定为 `lx-music-mobile-latest.apk`）。

使用常见问题请参阅上游的[移动版常见问题](https://lyswhut.github.io/lx-music-doc/mobile/faq)。

本 fork 的发布地址只有 [**GitHub**](https://github.com/vivo1928/001/releases)，其他渠道的转载包与本仓库无关；上游的原始发布地址是 [lyswhut/lx-music-mobile releases](https://github.com/lyswhut/lx-music-mobile/releases)。

为了提高使用门槛，本软件内的默认设置、UI 操作不以新手友好为目标，所以使用前建议先根据你的喜好浏览调整一遍软件设置，阅读一遍[音乐播放列表机制](https://lyswhut.github.io/lx-music-doc/mobile/faq/playlist)。

### 数据同步服务

从 v1.0.0 起，我们发布了一个独立的[数据同步服务](https://github.com/lyswhut/lx-music-sync-server#readme)。如果你有服务器，可以将其部署到服务器上作为私人多端同步服务使用，详情看该项目说明。

## 构建与发版

本 fork 的安装包全部由 GitHub Actions 构建，同时在手机 Termux 里保留了一条本地构建通道。

### 版本号来源

版本号只有一处来源：[`package.json`](https://github.com/vivo1928/001/blob/main/package.json) 的 `version`（版本名，如 `1.9.2`）与 `versionCode`（Android 内部递增号）。`android/app/build.gradle` 直接读取这两个字段生成 `versionName`/`versionCode`，发版 tag、APK 文件名也都由 `version` 拼接。改版本时只需改 `package.json`，不要手改 `build.gradle`。

### CI 触发与产物

向 `main` 分支 push（或在 Actions 页面手动 `workflow_dispatch`）会同时触发三条流水线，同一分支的旧任务会被自动取消：

| 流水线（文件） | 作用 | 产物 |
| --- | --- | --- |
| `Build`（`.github/workflows/release.yml`） | 编译 release 包，`arm64-v8a` 与 `universal` 两个变体 | Actions Artifacts：`app-v{version}-arm64-v8a-release`、`app-v{version}-universal-release` |
| `Build Release APK`（`.github/workflows/build-release.yml`） | 编译并**自动发 prerelease** | 以 tag `v{version}-{run_number}` 发布的 `lx-music-mobile-v{version}-arm64-v8a-release.apk`（标为 pre-release，不设为 latest） |
| `Build Debug APK`（`.github/workflows/build-debug.yml`） | 编译 debug 包，仅用于测试 | Actions Artifacts：`app-debug`（`*.apk`） |

每次 release 构建还会覆盖更新一个**固定下载 release**：tag 固定为 `latest`，文件名固定为 `lx-music-mobile-latest.apk`，链接永远指向最新构建，适合放在书签或稳定分发的地址里：

- 固定下载页：<https://github.com/vivo1928/001/releases/tag/latest>
- 固定下载文件：<https://github.com/vivo1928/001/releases/download/latest/lx-music-mobile-latest.apk>

CI 签名需要在仓库 Secrets 中配置 `KEYSTORE_STORE_FILE_BASE64`、`KEYSTORE_KEY_ALIAS`、`KEYSTORE_PASSWORD`、`KEYSTORE_KEY_PASSWORD`；缺少签名密钥时 release 包无法正常签名。

### 手机端本地构建（termux-build.sh）

如果手边没有电脑，可以在 Android 手机的 [Termux](https://termux.dev/) 里用仓库根目录的 [`termux-build.sh`](https://github.com/vivo1928/001/blob/main/termux-build.sh) 直接编译：

```bash
bash termux-build.sh           # 不带参数会弹出中文菜单
bash termux-build.sh all       # 正式包 + 调试包
bash termux-build.sh release   # 只打正式包
bash termux-build.sh debug     # 只打调试包
bash termux-build.sh sync      # 只同步代码，不编译
```

脚本会自动克隆/更新本仓库（`git reset --hard` 到最新提交）、`npm ci`、打依赖补丁、预生成 JS bundle（绕过 Termux 无法运行的 x86_64 hermesc），然后只编译 `arm64-v8a`。产物与构建日志输出到 `/sdcard/Download`，文件名带递增的构建序号；正式包首次构建会在设备本地生成签名密钥 `android/app/my-release.keystore`，并备份到 `/sdcard/Download/lx-music-signing-backup/`，请勿删除，否则无法覆盖安装升级。

编译环境要求：Termux 安装 JDK 17、Android SDK（build-tools 37、platform arm64）与 NDK r29，脚本内已按该路径（`~/android/android-sdk`、`~/android/android-ndk-r29`）写好变量，路径不同时自行调整脚本顶部的变量。手机端完整构建约 2–5 分钟，建议保持亮屏，磁盘至少留 2GB。

## 贡献代码

本项目欢迎 PR，但为了 PR 能顺利合并，需要注意以下几点：

- 对于添加新功能的 PR，建议在提交 PR 前先创建 Issue 进行说明，以确认该功能是否确实需要；
- 对于修复 bug 的 PR，请提供修复前后的说明及重现方式；
- 对于其他类型的 PR，则适当附上说明。

贡献代码步骤：

1. 参照上游的[源码使用方法](https://lyswhut.github.io/lx-music-doc/mobile/use-source-code)设置开发环境；
2. 克隆本仓库（`https://github.com/vivo1928/001.git`）并基于 `main` 分支进行开发；
3. 提交 PR 至本仓库的 `main` 分支；想合并到上游的改动请另外向 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 提 PR。

<!--
## 用户界面

<p><img width="100%" src="https://github.com/lyswhut/lx-music-mobile/blob/master/doc/images/app.png" alt="lx-music mobile UI"></p> -->

## 项目协议

本 fork 完全沿用上游的许可与补充协议：本项目基于 [Apache License 2.0](https://github.com/vivo1928/001/blob/main/LICENSE) 许可证发行，以下协议是对于 Apache License 2.0 的补充，如有冲突，以以下协议为准（原协议来自 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile/blob/master/LICENSE)）。

---

*词语约定：本协议中的“本项目”指 LX Music（洛雪音乐）移动版项目；“使用者”指签署本协议的使用者；“官方音乐平台”指对本项目内置的包括酷我、酷狗、咪咕等音乐源的官方平台统称；“版权数据”指包括但不限于图像、音频、名字等在内的他人拥有所属版权的数据。*

### 一、数据来源

1.1 本项目的各官方平台在线数据来源原理是从其公开服务器中拉取数据（与未登录状态在官方平台 APP 获取的数据相同），经过对数据简单地筛选与合并后进行展示，因此本项目不对数据的合法性、准确性负责。

1.2 本项目本身没有获取某个音频数据的能力，本项目使用的在线音频数据来源来自软件设置内“自定义源”设置所选择的“源”返回的在线链接。例如播放某首歌，本项目所做的只是将希望播放的歌曲名、艺术家等信息传递给“源”，若“源”返回了一个链接，则本项目将认为这就是该歌曲的音频数据而进行使用，至于这是不是正确的音频数据本项目无法校验其准确性，所以使用本项目的过程中可能会出现希望播放的音频与实际播放的音频不对应或者无法播放的问题。

1.3 本项目的非官方平台数据（例如“我的列表”内列表）来自使用者本地系统或者使用者连接的同步服务，本项目不对这些数据的合法性、准确性负责。

### 二、版权数据

2.1 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 **24 小时内** 清除使用本项目的过程中所产生的版权数据。

### 三、音乐平台别名

3.1 本项目内的官方音乐平台别名为本项目内对官方音乐平台的一个称呼，不包含恶意。如果官方音乐平台觉得不妥，可联系本项目更改或移除。

### 四、资源使用

4.1 本项目内使用的部分包括但不限于字体、图片等资源来源于互联网。如果出现侵权可联系本项目移除。

### 五、免责声明

5.1 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。

### 六、使用限制

6.1 本项目完全免费，且开源发布于 GitHub 面向全世界人用作对技术的学习交流。本项目不对项目内的技术可能存在违反当地法律法规的行为作保证。

6.2 **禁止在违反当地法律法规的情况下使用本项目。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。

### 七、版权保护

7.1 音乐平台不易，请尊重版权，支持正版。

### 八、非商业性质

8.1 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。

### 九、接受协议

9.1 若你使用了本项目，即代表你接受本协议。

---

以上协议原文出自上游项目，若对此有疑问可通过上游邮箱联系上游作者：lyswhut+qq.com (请将 `+` 替换成 `@`)；与本 fork 的代码、构建、安装包相关的问题，请提交到本仓库的 [Issues](https://github.com/vivo1928/001/issues)，不要打扰上游维护者。
