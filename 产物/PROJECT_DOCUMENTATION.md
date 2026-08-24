# lx-music-mobile 二次开发版 — 开发者文档

> 项目名称：lx-music-mobile
> 版本：1.8.4
> 包名：cn.toside.music.mobile
> 技术栈：React Native (TypeScript) + Android Native (Java) + react-native-navigation + react-native-track-player + ExoPlayer

---

## 目录

1. [项目概述](#1-项目概述)
2. [项目结构](#2-项目结构)
3. [架构设计](#3-架构设计)
4. [初始化流程](#4-初始化流程)
5. [播放器链路](#5-播放器链路)
6. [音质系统](#6-音质系统)
7. [下载管理器](#7-下载管理器)
8. [播放缓存](#8-播放缓存)
9. [自定义源插件系统](#9-自定义源插件系统)
10. [均衡器系统](#10-均衡器系统)
11. [主题系统](#11-主题系统)
12. [国际化](#12-国际化)
13. [状态管理](#13-状态管理)
14. [事件系统](#14-事件系统)
15. [存储层](#15-存储层)
16. [Android 原生模块](#16-android-原生模块)
17. [CI/CD 流水线](#17-cicd-流水线)
18. [二次开发功能详解](#18-二次开发功能详解)
19. [构建与调试](#19-构建与调试)

---

## 1. 项目概述

基于 lx-music-mobile 二次开发的第三方聚合音乐播放器 Android 版，支持以下音乐源：

- **kw** 酷我音乐
- **kg** 酷狗音乐
- **tx** QQ音乐
- **wy** 网易云音乐
- **mg** 咪咕音乐

核心理念：不直接提供音乐内容，通过解析各音乐平台公开 API 获取音乐信息、播放链接和歌词，实现聚合搜索与播放。

### 二次开发特色功能

- 音质扩展：支持 master / hires / atmos / atmos_plus 高品质音质
- 软件均衡器：基于 VLC 算法的 10 段 DSP 均衡器，兼容所有 Android 设备
- 播放缓存：后台全量下载到本地缓存，解决流式缓冲慢问题
- 播放详情页音质切换：随时切换当前歌曲音质
- tempPlayQuality 临时音质覆盖机制
- EqualizerAudioProcessor 支持 PCM_FLOAT / PCM_24BIT / PCM_32BIT 格式
- 播放缓存大小限制（可配置）

---

## 2. 项目结构

```
/workspace/
├── index.js                    # 应用入口
├── app.json
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── .nvmrc                      # Node.js 版本锁定（CI 读取）
├── .eslintrc.cjs               # ESLint 代码检查规则
├── .editorconfig               # 编辑器代码风格统一
├── .gitignore                  # Git 忽略规则
├── .ncurc.js                   # npm-check-updates 配置
├── .gitlab-ci.yml              # GitLab CI 流水线（备选）
├── CHANGELOG.md                # 更新日志
├── FAQ.md                      # 常见问题解答
├── LICENSE                     # 开源许可证
├── README.md                   # 项目 README
├── Gemfile                     # Ruby Gem 依赖（CocoaPods）
├── shim.js                     # 应用 shim（polyfill、全局补丁）
├── test.js                     # 测试脚本
├── download_apk.sh             # APK 下载辅助脚本
├── 更新文档.md                  # 二次开发更新累计记录
├── dependencies-patch.js       # 依赖修补脚本（均衡器注入、按钮中文等）
├── shim.js                      # 应用 shim（polyfill、全局补丁）
├── src/
│   ├── app.ts                  # App 根组件
│   ├── types/                  # 全局 TypeScript 类型定义
│   │   ├── app.d.ts            # 全局变量 (global.lx, global.app_event 等)
│   │   ├── app_setting.d.ts    # 应用设置类型 (LX.AppSetting)
│   │   ├── common.d.ts         # 通用类型 (Source, Quality, VersionInfo)
│   │   ├── music.d.ts          # 音乐信息类型 (MusicInfo, LyricInfo, MusicUrlInfo)
│   │   ├── player.d.ts         # 播放器类型 (PlayMusicInfo, Track, PlayInfo)
│   │   ├── list.d.ts           # 列表类型
│   │   ├── download_list.d.ts  # 下载列表类型
│   │   ├── dislike_list.d.ts   # 不喜欢列表类型
│   │   ├── theme.d.ts          # 主题类型
│   │   ├── sync.d.ts           # 同步类型
│   │   ├── user_api.d.ts       # 自定义 API 类型
│   │   └── ...
│   ├── config/                 # 应用配置
│   │   ├── constant.ts         # 常量 (LIST_IDS, COMPONENT_IDS, 存储前缀)
│   │   ├── defaultSetting.ts   # 默认设置值
│   │   ├── globalData.ts       # 全局变量初始化 (global.lx, 事件总线)
│   │   ├── setting.ts          # 设置读取/持久化
│   │   ├── migrate.ts          # 设置迁移
│   │   ├── migrateSetting.ts   # 设置迁移逻辑
│   │   └── index.js
│   ├── core/                   # 核心业务逻辑层
│   │   ├── common.ts           # 应用级操作 (initSetting, exitApp, setFontSize, setLanguage)
│   │   ├── apiSource.ts        # API 源切换管理
│   │   ├── list.ts             # 列表管理 API
│   │   ├── lyric.ts            # 歌词引擎 (播放器歌词 + 桌面歌词同步)
│   │   ├── theme.ts            # 主题应用
│   │   ├── version.ts          # 版本更新检查
│   │   ├── sync.ts             # 多设备同步
│   │   ├── dislikeList.ts      # 不喜欢列表
│   │   ├── userApi.ts          # 自定义 API 管理
│   │   ├── desktopLyric.ts     # 桌面歌词管理
│   │   ├── hotSearch.ts        # 热搜
│   │   ├── leaderboard.ts      # 排行榜
│   │   ├── search/             # 搜索模块（目录）
│   │   │   ├── search.ts       # 搜索入口
│   │   │   ├── music.ts        # 音乐搜索
│   │   │   ├── album.ts        # 专辑搜索
│   │   │   ├── singer.ts       # 歌手搜索
│   │   │   └── songlist.ts     # 歌单搜索
│   │   ├── syncSourceList.ts   # 同步源列表管理
│   │   ├── songlist.ts         # 歌单
│   │   ├── singerDetail.ts     # 歌手详情
│   │   ├── singerAlbum.ts      # 歌手专辑
│   │   ├── playbackCache.ts    # 播放缓存
│   │   ├── player/             # 播放器核心
│   │   │   ├── player.ts       # 播放/暂停/切歌/URL获取
│   │   │   ├── playInfo.ts     # 播放信息管理
│   │   │   ├── progress.ts     # 播放进度管理
│   │   │   ├── playStatus.ts   # 播放状态
│   │   │   ├── playedList.ts   # 已播放列表
│   │   │   ├── tempPlayList.ts # 稍后播放列表
│   │   │   ├── timeoutExit.ts  # 定时退出
│   │   │   └── utils.ts        # 列表过滤工具
│   │   ├── music/              # 音乐资源获取
│   │   │   ├── index.ts        # 统一入口 (路由到 online/download/local)
│   │   │   ├── online.ts       # 在线音乐 URL/图片/歌词
│   │   │   ├── download.ts     # 下载项音乐资源
│   │   │   ├── local.ts        # 本地音乐资源
│   │   │   └── utils.ts        # 音质选择、源切换、资源获取
│   │   ├── download/           # 下载管理器
│   │   │   └── manager.ts      # DownloadManager 类
│   │   └── init/               # 初始化流程
│   │       ├── index.ts        # 主入口
│   │       ├── common.ts       # 通用状态初始化
│   │       ├── dataInit.ts     # 数据初始化 (音乐SDK, 列表, 不喜欢列表)
│   │       ├── i18n.ts         # 国际化初始化
│   │       ├── theme.ts        # 主题初始化
│   │       ├── sync.ts         # 同步初始化
│   │       ├── userApi.ts      # 自定义API初始化
│   │       ├── player/         # 播放器初始化
│   │       │   ├── index.ts
│   │       │   ├── player.ts          # TrackPlayer 初始化
│   │       │   ├── playInfo.ts        # 播放信息恢复
│   │       │   ├── playStatus.ts      # 播放状态监听
│   │       │   ├── playerEvent.ts     # 播放器事件绑定
│   │       │   ├── watchList.ts       # 列表变化监听
│   │       │   ├── playProgress.ts    # 进度更新
│   │       │   ├── preloadNextMusic.ts # 预加载下一首
│   │       │   └── lyric.ts           # 歌词绑定
│   │       └── deeplink/      # 深度链接
│   ├── plugins/                # 第三方库封装层
│   │   ├── player/             # react-native-track-player 封装
│   │   │   ├── index.ts        # 导出 (initial, setResource, setPlay, 等)
│   │   │   ├── service.ts      # TrackPlayer 事件服务 (RemotePlay/Pause/Next/Prev)
│   │   │   ├── playList.ts     # Track 构建与管理 (playMusic, updateMetaData, buildTracks)
│   │   │   ├── hook.ts         # React Hooks (useProgress, useBufferProgress)
│   │   │   └── utils.ts        # 工具函数 (setResource, setPlay, updateOptions, migratePlayerCache)
│   │   ├── lyric.ts            # lrc-file-parser 封装
│   │   ├── storage.ts          # AsyncStorage 封装 (大键分片存储)
│   │   └── sync/               # 多设备同步插件
│   │       ├── constants.ts    # 同步常量定义
│   │       ├── data.ts         # 同步数据管理
│   │       ├── dislikeEvent.ts # 不喜欢列表同步事件
│   │       ├── listEvent.ts    # 列表同步事件
│   │       ├── log.ts          # 同步日志
│   │       ├── utils.ts        # 同步工具函数
│   │       └── client/         # 同步客户端
│   │           ├── auth.ts     # 认证
│   │           ├── client.ts   # 客户端连接
│   │           ├── index.ts
│   │           ├── sync/       # 同步核心处理器
│   │           │   ├── handler.ts
│   │           │   └── index.ts
│   │           └── modules/    # 同步模块分发
│   │               ├── list/   # 列表同步
│   │               │   ├── handler.ts
│   │               │   ├── index.ts
│   │               │   └── localEvent.ts
│   │               └── dislike/ # 不喜欢列表同步
│   │                   ├── handler.ts
│   │                   ├── index.ts
│   │                   └── localEvent.ts
│   ├── store/                  # 状态管理 (Reactive 模式)
│   │   ├── index.ts
│   │   ├── player/             # 播放器状态
│   │   │   ├── state.ts        # 状态定义
│   │   │   ├── action.ts       # 状态更新 action
│   │   │   └── hook.ts         # React Hook 订阅状态
│   │   ├── setting/            # 设置状态
│   │   │   ├── state.ts
│   │   │   ├── action.ts
│   │   │   └── hook.ts
│   │   ├── list/               # 列表状态
│   │   │   ├── state.ts
│   │   │   ├── action.ts
│   │   │   └── hook.ts
│   │   ├── common/             # 通用状态 (字体, 状态栏高度, 导航ID)
│   │   │   └── hook.ts
│   │   ├── theme/              # 主题状态
│   │   │   └── hook.ts
│   │   ├── dislikeList/        # 不喜欢列表状态
│   │   │   ├── index.ts        # 模块导出入口
│   │   │   ├── event.ts        # 状态事件定义
│   │   │   ├── state.ts
│   │   │   ├── action.ts
│   │   │   └── hook.ts
│   │   ├── sync/               # 同步状态
│   │   │   └── hook.ts
│   │   ├── version/            # 版本更新状态
│   │   │   └── hook.ts
│   │   ├── search/             # 搜索状态
│   │   │   ├── music/          # 音乐搜索状态
│   │   │   │   ├── state.ts
│   │   │   │   └── action.ts
│   │   │   ├── album/          # 专辑搜索状态
│   │   │   ├── singer/         # 歌手搜索状态
│   │   │   └── songlist/       # 歌单搜索状态
│   │   ├── songlist/           # 歌单状态
│   │   ├── leaderboard/        # 排行榜状态
│   │   ├── singerDetail/       # 歌手详情状态
│   │   ├── hotSearch/          # 热搜状态
│   │   ├── userApi/            # 自定义API状态
│   │   │   ├── index.ts
│   │   │   ├── event.ts
│   │   │   └── hook.ts
│   │   └── Provider/           # React Context Provider
│   │       ├── Provider.tsx    # 全局状态 Provider
│   │       └── ThemeProvider.tsx # 主题 Provider
│   ├── components/             # 公共组件
│   │   ├── common/             # 基础组件 (StatusBar, ImageBackground, 等)
│   │   ├── player/             # 播放栏组件
│   │   ├── OnlineList/         # 在线列表组件
│   │   ├── MusicAddModal/      # 添加歌曲弹窗
│   │   ├── MusicMultiAddModal/ # 批量添加弹窗
│   │   ├── DownloadFailedModal/ # 下载失败弹窗
│   │   ├── DownloadProgressModal/ # 下载进度弹窗
│   │   ├── DownloadQualityModal/ # 音质选择弹窗
│   │   ├── MetadataEditModal/  # 元数据编辑弹窗
│   │   ├── SearchTipList/      # 搜索提示列表
│   │   ├── RangeSelectModal/   # 范围选择弹窗
│   │   ├── SourceSelector.tsx  # 音源选择器
│   │   ├── PageContent.tsx     # 页面容器
│   │   └── SizeView.tsx        # 尺寸组件
│   ├── screens/                # 页面
│   │   ├── Home/               # 首页 (包含导航菜单、设置页)
│   │   ├── PlayDetail/         # 播放详情页
│   │   │   ├── Vertical/       # 竖屏布局
│   │   │   │   ├── index.tsx
│   │   │   │   ├── Lyric.tsx   # 歌词组件
│   │   │   │   ├── Pic.tsx     # 封面组件
│   │   │   │   └── Player/     # 播放控制
│   │   │   ├── Horizontal/     # 横屏布局
│   │   │   └── components/     # 通用组件
│   │   │       ├── PlayLine.tsx          # 播放进度条
│   │   │       └── SettingPopup/         # 设置弹窗
│   │   │           ├── index.tsx
│   │   │           └── settings/         # 弹窗内设置项
│   │   │               ├── SettingPlayQuality.tsx  # 音质切换
│   │   │               ├── QualitySelectPopup.tsx  # 音质选择弹窗
│   │   │               ├── SettingEqualizer.tsx    # 均衡器
│   │   │               ├── EqualizerPopup.tsx      # 均衡器控制弹窗
│   │   │               ├── SettingVolume.tsx       # 音量
│   │   │               ├── SettingPlaybackRate.tsx # 播放速率
│   │   │               ├── SpeedPopup.tsx
│   │   │               ├── SettingLrcAlign.tsx     # 歌词对齐
│   │   │               ├── SettingLrcFontSize.tsx  # 歌词字体大小
│   │   │               └── SettingLyricProgress.tsx # 歌词进度
│   │   ├── AlbumDetail/       # 专辑详情
│   │   ├── SingerDetail/      # 歌手详情
│   │   ├── SingerIntro/       # 歌手简介
│   │   ├── SonglistDetail/    # 歌单详情
│   │   └── Comment/           # 评论
│   ├── event/                  # 事件总线
│   │   ├── Event.ts            # 基础 Event 类
│   │   ├── appEvent.ts         # 应用事件 (AppEvent)
│   │   ├── listEvent.ts        # 列表事件 (ListEvent)
│   │   ├── dislikeEvent.ts     # 不喜欢事件 (DislikeEvent)
│   │   └── stateEvent.ts       # 状态事件 (StateEvent)
│   ├── navigation/             # 导航系统 (react-native-navigation)
│   │   ├── index.ts             # 导航模块入口
│   │   ├── screenNames.ts       # 页面名称常量（如 "Player", "Setting", "Search"）
│   │   ├── registerScreens.tsx   # 注册所有页面到导航系统
│   │   ├── regLaunchedEvent.ts   # 启动事件注册
│   │   ├── navigation.ts        # 导航工具函数（push/pop/showModal 等）
│   │   ├── event.ts             # 导航事件处理
│   │   ├── hooks.ts             # 导航相关 hooks
│   │   ├── utils.ts             # 导航工具
│   │   └── components/          # 导航相关组件
│   ├── lang/                   # 国际化
│   │   ├── i18n.ts             # i18n 引擎实现
│   │   ├── index.ts            # 语言列表与消息导出
│   │   ├── zh-cn.json          # 简体中文
│   │   ├── zh-tw.json          # 繁体中文
│   │   └── en-us.json          # 英文
│   ├── theme/                  # 主题
│   │   ├── Colors.js           # 颜色常量
│   │   ├── Typography.js       # 字体/边框常量
│   │   ├── index.js            # 导出
│   │   └── themes/             # 主题定义
│   │       ├── themes.ts       # 内置主题列表
│   │       ├── index.ts        # 主题管理 (getTheme, getAllThemes, buildActiveThemeColors)
│   │       ├── createThemes.js # 主题生成脚本
│   │       ├── colorUtils.js   # 颜色工具
│   │       ├── utils.js
│   │       └── images/         # 主题背景图
│   ├── utils/                  # 工具函数
│   │   ├── musicSdk/           # 音乐源 SDK
│   │   │   ├── index.js        # SDK 入口 (搜索/匹配)
│   │   │   ├── api-source.js   # API 源管理
│   │   │   ├── api-source-info.ts # API 源信息
│   │   │   ├── options.js
│   │   │   ├── utils.js        # 音质工具 (extendQualityTypes, getMusicType)
│   │   │   ├── kw/             # 酷我音乐源
│   │   │   ├── kg/             # 酷狗音乐源
│   │   │   ├── tx/             # QQ音乐源
│   │   │   ├── wy/             # 网易云音乐源
│   │   │   ├── mg/             # 咪咕音乐源
│   │   │   ├── bd/             # 百度音乐源（第 6 个音乐源）
│   │   │   └── ww/             # 预留音乐源（空目录）
│   │   ├── localMediaMetadata.ts # 本地媒体元数据管理（读写本地音乐标签）
│   │   ├── simplify-chinese-main/ # 简繁转换工具库
│   │   ├── nativeModules/      # Android Native Module 包装
│   │   │   ├── cache.ts        # 缓存清除
│   │   │   ├── crypto.ts       # 加密 (RSA/AES)
│   │   │   ├── equalizer.ts    # 均衡器控制
│   │   │   ├── lyricDesktop.ts # 桌面歌词
│   │   │   ├── userApi.ts      # 自定义API运行时
│   │   │   └── utils.ts        # 工具 (exitApp, 通知权限, 等)
│   │   ├── hooks/              # React Hooks（键盘、方向、拖拽、窗口尺寸等）
│   │   │   ├── index.js
│   │   │   ├── useKeyboard.js   # 键盘弹出/收起检测
│   │   │   ├── useDeviceOrientation.js # 设备方向监听
│   │   │   ├── useHorizontalMode.js # 横屏模式判断
│   │   │   ├── useDrag.ts       # 拖拽手势
│   │   │   ├── useWindowSize.ts # 窗口尺寸变化监听
│   │   │   ├── useBackHandler.ts # Android 返回键处理
│   │   │   ├── useAnimateColor.ts / useAnimateNumber.ts # 动画工具
│   │   │   ├── useAssertApiSupport.js # API 支持断言
│   │   │   ├── usePlayTime.js   # 播放时间格式化
│   │   │   ├── useLayout.tsx    # 布局计算
│   │   │   └── useUnmounted.tsx # 组件卸载检测
│   │   ├── music.ts            # 音乐工具
│   │   ├── lrcTools.ts         # 歌词解析工具
│   │   ├── data.ts             # 数据持久化
│   │   ├── listManage.ts       # 列表管理
│   │   ├── dislikeManage.ts    # 不喜欢列表管理
│   │   ├── fs.ts               # 文件系统 (react-native-fs 封装)
│   │   ├── log.ts              # 日志
│   │   ├── bootLog.ts          # 启动日志
│   │   ├── message.ts          # 请求消息
│   │   ├── tools.ts            # 通用工具
│   │   ├── common.ts           # 通用函数
│   │   ├── index.ts            # 导出
│   │   ├── permissions.ts      # 权限管理
│   │   ├── pixelRatio.ts       # 像素比
│   │   ├── request.js          # HTTP 请求（fetch 封装，带超时/重试/大小限制）
│   │   ├── scroll.ts           # 滚动工具
│   │   ├── errorHandle.ts      # 全局错误处理（JS Error + Promise rejection）
│   │   ├── version.js          # 版本信息获取
│   │   └── windowSizeTools.ts  # 窗口尺寸
│   └── resources/              # 资源文件
├── android/                    # Android 原生代码
│   ├── build.gradle            # 根构建脚本
│   ├── settings.gradle
│   ├── gradle.properties
│   ├── init.gradle
│   ├── app/
│   │   ├── build.gradle        # 应用构建脚本
│   │   ├── proguard-rules.pro
│   │   ├── debug.keystore
│   │   └── src/main/java/cn/toside/music/mobile/
│   │       ├── MainApplication.java   # 应用入口, 注册 Native Module
│   │       ├── MainActivity.java
│   │       ├── equalizer/             # 均衡器模块
│   │       │   ├── EqualizerModule.java   # React Native 桥接
│   │       │   └── EqualizerPackage.java
│   │       ├── cache/                 # 缓存管理
│   │       │   ├── CacheModule.java
│   │       │   ├── CachePackage.java
│   │       │   ├── CacheClearAsyncTask.java
│   │       │   └── Utils.java
│   │       ├── lyric/                 # 桌面歌词
│   │       │   ├── LyricModule.java
│   │       │   ├── LyricPackage.java
│   │       │   ├── Lyric.java / LyricPlayer.java
│   │       │   ├── LyricView.java / LyricTextView.java / LyricSwitchView.java
│   │       │   └── LyricEvent.java / Utils.java
│   │       ├── userApi/               # 自定义 API 运行时
│   │       │   ├── UserApiModule.java
│   │       │   ├── UserApiPackage.java
│   │       │   ├── QuickJS.java
│   │       │   ├── JavaScriptThread.java
│   │       │   ├── JsHandler.java
│   │       │   ├── Console.java
│   │       │   ├── HandlerWhat.java
│   │       │   └── UtilsEvent.java
│   │       ├── crypto/                # 加密
│   │       │   ├── CryptoModule.java
│   │       │   ├── CryptoPackage.java
│   │       │   ├── AES.java
│   │       │   └── RSA.java
│   │       └── utils/                 # 工具
│   │           ├── UtilsModule.java
│   │           ├── UtilsPackage.java
│   │           ├── Utils.java / UtilsEvent.java
│   │           ├── AsyncTask.java
│   │           ├── BatteryOptimizationUtil.java
│   │           └── NotificationPermissionUtil.java
│   └── equalizer-lib/           # 均衡器 DSP 库
│       ├── SoftwareEqualizer.java      # 10段软件均衡器
│       ├── EqualizerAudioProcessor.java # ExoPlayer AudioProcessor
│       ├── EqRenderersFactory.java     # 自定义渲染器工厂
│       └── BiquadFilter.java          # 双二阶滤波器 (当前未直接使用)
├── .github/workflows/          # CI/CD 流水线
│   ├── build-debug.yml         # Debug APK 构建
│   ├── build-release.yml       # Release APK 构建
│   ├── build-test.yml          # PR 测试构建
│   ├── beta-pack.yml           # Beta 版本构建
│   ├── release.yml             # 正式发布构建
│   └── publish-version-info.yml # 版本信息发布
├── dependencies-patch.js       # 依赖修补脚本
├── kw-decrypt-proxy/           # 酷我解密代理（PHP）
│   ├── Dockerfile              # Docker 部署配置
│   ├── docker-compose.yml      # Docker Compose 配置
│   ├── decrypt.php             # mflac/mgg 解密服务端
│   └── README.md               # 部署说明
├── doc/                        # 文档目录
├── publish/                    # 发布脚本
│   ├── index.js                # 发布主脚本
│   ├── utils/                  # 发布工具
│   ├── version.json            # 版本信息
│   └── changeLog.md            # 发布更新日志
├── ios/                        # iOS 平台代码（Podfile, Xcode 工程等）
└── 产物/                       # 文档输出目录
```

---

## 3. 架构设计

### 3.1 分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI Layer (screens / components)                                    │
│  PlayDetail / Home / SonglistDetail / AlbumDetail / SingerDetail   │
├─────────────────────────────────────────────────────────────────────┤
│  State Management (store/)                                          │
│  player / setting / list / common / theme / sync / ...             │
├─────────────────────────────────────────────────────────────────────┤
│  Event Bus (event/)                                                 │
│  app_event / list_event / dislike_event / state_event              │
├─────────────────────────────────────────────────────────────────────┤
│  Core Business Logic (core/)                                        │
│  player / music / download / list / lyric / sync / theme / ...     │
├─────────────────────────────────────────────────────────────────────┤
│  Plugin Layer (plugins/)                                            │
│  TrackPlayer wrapper / lrc-file-parser / AsyncStorage wrapper      │
├─────────────────────────────────────────────────────────────────────┤
│  Native Bridge (android/ + utils/nativeModules/)                   │
│  Equalizer / Cache / Lyric / Crypto / UserApi / Utils              │
├─────────────────────────────────────────────────────────────────────┤
│  Music SDK (utils/musicSdk/)                                        │
│  kw / kg / tx / wy / mg — 各平台 API 封装                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户操作 → UI 组件 → store/action → global.state_event → core/ 模块
                                                      → 持久化存储
                                                      → UI 更新 (通过 store/state)
```

核心原则：`core/` 层负责所有业务逻辑，`store/` 层负责状态持有与通知，`plugins/` 层封装第三方库接口，UI 层只负责渲染和用户交互。

### 3.3 全局变量架构

`global.lx` 对象（在 `src/config/globalData.ts` 中初始化）持有全局运行时状态：

```typescript
global.lx = {
  fontSize: 1,
  playerStatus: { isInitialized, isRegisteredService, isIniting },
  restorePlayInfo: null,     // 恢复播放信息
  isScreenKeepAwake: false,
  isPlayedStop: false,       // 是否播放完后退出
  isEnableSyncLog: false,
  isEnableUserApiLog: false,
  playerTrackId: '',
  gettingUrlId: '',          // 正在获取 URL 的歌曲 ID
  qualityList: {},           // 各音源支持的音质列表
  apis: {},                  // 自定义 API 实例
  apiInitPromise: [Promise, boolean, resolve],
  jumpMyListPosition: false,
  settingActiveId: 'basic',
  homePagerIdle: true,
}
```

全局事件总线：`global.app_event` / `global.list_event` / `global.dislike_event` / `global.state_event`

---

## 4. 初始化流程

初始化流程在 `src/core/init/index.ts` 中定义，按顺序执行：

```
1. commonActions.setFontSize()          → 设置全局字号
2. initSetting()                         → 从 AsyncStorage 读取设置
3. initTheme(setting)                    → 加载主题并应用
4. initI18n(setting)                     → 创建 i18n 实例，设置语言
5. initUserApi(setting)                  → 初始化自定义 API 列表
6. setApiSource(setting)                 → 设置 API 源（内置/自定义）
7. registerPlaybackService()             → 注册 TrackPlayer 后台服务
8. initPlayer(setting)                   → 初始化播放器各子模块
   ├── initPlayer()                      → TrackPlayer.setupPlayer()
   ├── initLyric()                       → 歌词引擎初始化
   ├── initPlayInfo()                    → 恢复上次播放信息
   ├── initPlayStatus()                  → 监听播放状态变化
   ├── initPlayerEvent()                 → 绑定播放器事件
   ├── initWatchList()                   → 监听列表变化
   ├── initPlayProgress()                → 定时更新播放进度
   └── initPreloadNextMusic()            → 预加载下一首 URL
9. dataInit(setting)                     → 初始化音乐 SDK、用户列表、不喜欢列表
10. initCommonState(setting)             → 动态背景等通用状态
11. initSync(setting)                    → 初始化多设备同步（异步不阻塞）
12. handlePushedHomeScreen()             → 检查更新、深度链接
```

### 4.1 TrackPlayer 初始化参数

```typescript
TrackPlayer.setupPlayer({
  maxCacheSize: cacheSize * 1024,  // 最大缓存大小 (KB)
  minBuffer: 20,                   // 最小缓冲 (秒)
  maxBuffer: 60,                   // 最大缓冲 (秒)
  playBuffer: 1.5,                 // 播放缓冲 (秒) — 快速出声
  waitForBuffer: true,
  handleAudioFocus: isHandleAudioFocus,
  audioOffload: isEnableAudioOffload, // 注意：二次开发中恒为 false
  autoUpdateMetadata: false,       // 手动更新元数据
})
```

---

## 5. 播放器链路

### 5.1 播放流程

```
playList(listId, index) 或 playListById(listId, id)
  → setPlayMusicInfo(listId, musicInfo)    // 设置播放信息
  → handlePlay()
    → playerInitial()                      // 首次初始化 TrackPlayer
    → setStop() + clearDelayNextTimeout()
    → debouncePlay(musicInfo)              // 200ms 防抖
      → setMusicUrl(musicInfo)
        → getMusicPlayUrl()               // 获取播放 URL
          → getMusicUrl()                  // 路由到 core/music/online.ts
            → getPlaybackCachePath()       // 检查播放缓存命中
            → 缓存未命中: 获取在线 URL (音质降级)
            → 获取失败: 源切换 (toggle source)
          → setResource()                  // 设置到 TrackPlayer
          → 并行: cachePlaybackMusic()     // 后台下载到本地缓存
            → 下载完成后若仍在缓冲状态 → 切换为本地文件
      → getPicPath()                       // 获取封面
      → getLyricInfo()                     // 获取歌词
```

### 5.2 TrackPlayer Track 结构

每个 Track 是一个包含两个项目的队列：

```
Track[0]: 真实 URL 轨道 (id: `${musicId}__//${random}__//${url}`)
Track[1]: 默认空轨道 (id: `${musicId}__//${random}__//default`, url: defaultUrl)
```

当 Track[0] 播放结束时自动切换到 Track[1]（空轨道），触发 `PlaybackTrackChanged` 事件，播放器检测到空轨道后自动切到下一首。

### 5.3 切歌逻辑

`playNext()` / `playPrev()` 在 `src/core/player/player.ts` 中实现：

1. 检查 `tempPlayList`（稍后播放列表），优先播放
2. 检查 `playedList`（已播放列表），移除已删除的歌曲
3. 从列表过滤已播放歌曲，得到 `filteredList`
4. 根据 `togglePlayMethod` 计算下一首索引：
   - `listLoop`：列表循环（到末尾回到开头）
   - `random`：随机
   - `list`：顺序播放（到末尾停止）
   - `singleLoop`：单曲循环
   - `none`：禁用

### 5.4 播放状态机

```
Connecting → Buffering → Playing → Paused → Stopped → None
                                         → Buffering (seek 时)
```

TrackPlayer 状态通过 `service.ts` 中的 `PlaybackState` 事件监听到，转换为应用事件：

```typescript
State.Ready/Stopped/Paused → app_event.playerPause() + app_event.pause()
State.Playing              → app_event.playerPlaying() + app_event.play()
State.Buffering            → app_event.pause() + app_event.playerWaiting()
State.Connecting           → app_event.playerLoadstart()
```

### 5.5 远程控制事件

`service.ts` 中注册以下 TrackPlayer 远程事件：

| 事件 | 处理 |
|------|------|
| RemotePlay | play() |
| RemotePause | pause() |
| RemoteNext | playNext() |
| RemotePrevious | playPrev() |
| RemoteStop | exitApp() |
| RemoteSeek | setProgress() |
| RemoteJumpForward | 快进 10s |
| RemoteJumpBackward | 快退 10s |
| remote-set-speed | 设置播放速率 |
| PlaybackError | app_event.error() |
| PlaybackTrackChanged | 切歌检测 |

### 5.6 音质降级与源切换

`getMusicUrl()` 在 `src/core/music/online.ts` 中实现音质降级：

1. 首选音质 → 检查缓存 URL → 检查播放缓存
2. 首选音质 → 获取在线 URL，失败则降级
3. 降级顺序：从首选音质向更低音质遍历
4. 所有音质失败 → 源切换（toggle source）
5. 源切换通过 `findMusic()` 在 `src/utils/musicSdk/index.js` 中跨源搜索

### 5.5 播放设置面板（SettingPopup）

播放详情页的设置面板包含 7 个设置项，位于 `src/screens/PlayDetail/components/SettingPopup/settings/`：

| 设置项 | 文件 | 说明 |
|--------|------|------|
| 歌词进度 | `SettingLyricProgress.tsx` | 允许通过拖拽歌词调整播放进度 |
| 音量 | `SettingVolume.tsx` | 音量滑块调节 |
| 播放速率 | `SettingPlaybackRate.tsx` | 倍速选择（0.5x ~ 2x），含 SpeedPopup 弹窗 |
| **音质** | **`SettingPlayQuality.tsx`** | **当前歌曲实际音质显示 + 音质切换弹窗（二次开发新增）** |
| 歌词字体大小 | `SettingLrcFontSize.tsx` | 歌词字号调节 |
| 歌词对齐 | `SettingLrcAlign.tsx` | 居左/居中/居右 |
| 均衡器 | `SettingEqualizer.tsx` | 10 段均衡器开关 + 预设选择，含 EqualizerPopup 弹窗 |

音质切换项（SettingPlayQuality）是二次开发新增，点击后弹出 QualitySelectPopup，展示当前歌曲可用音质列表，选择后立即切换并续播，仅对当前歌曲生效。

---

## 6. 音质系统

### 6.1 音质枚举

```typescript
type Quality = '128k' | '320k' | 'flac' | 'flac24bit' | '192k' | 'ape' | 'wav'
              | '64k' | '32k' | 'hires' | 'master' | 'atmos' | 'atmos_plus'
```

### 6.2 音质扩展机制

`extendQualityTypes()` 在 `src/utils/musicSdk/utils.js` 中实现：

```typescript
export const QUALITYS = ['master', 'atmos_plus', 'atmos', 'flac24bit', 'flac', 'wav', 'ape', '320k', '192k', '128k']
```

当 `global.lx.qualityList[source]` 包含扩展音质（如 `master`/`hires`/`atmos`/`atmos_plus`）时，自动将这些音质补入 `musicInfo.meta._qualitys` 和 `musicInfo.meta.qualitys`，确保 UI 可选。

条件：只补高品质（320k 以上），128k/192k/320k 由 SDK 原生处理。

### 6.3 音质选择逻辑

`getPlayQuality()` 在 `src/core/music/utils.ts` 中实现：

1. 优先检查 `tempPlayQuality`（临时音质覆盖）
2. 检查 `player.playQuality` 设置值
3. 检查 `musicInfo.meta._qualitys` 确认该音质可用
4. 不可用时降级到更低音质
5. QAULITYS 常量定义降级顺序

### 6.4 tempPlayQuality 临时覆盖机制

```typescript
// src/core/music/utils.ts
let tempPlayQuality: LX.Quality | null = null
export const setTempPlayQuality = (q: LX.Quality | null) => { tempPlayQuality = q }
export const getTempPlayQuality = (): LX.Quality | null => tempPlayQuality
export const clearTempPlayQuality = () => { tempPlayQuality = null }
```

- 播放详情页手动切换音质时设置
- 切歌时清空（在 `playInfo.ts` 的 `setPlayMusicInfo` 中调用 `clearTempPlayQuality()`）
- 临时覆盖在 `getPlayQuality()` 中优先于全局设置

### 6.5 音质降级路径

`buildQualityFallbackOrder()` 在 `src/core/music/online.ts` 中：

```typescript
const qualityOrder = [targetQuality, ...lowerQualities]
```

从 `qualityList[source]` 中按顺序排列，从首选音质开始向更低音质逐个尝试。

### 6.6 下载音质映射

```typescript
const QUALITY_EXT_MAP: Record<string, LX.Download.FileExt> = {
  '128k': 'mp3', '320k': 'mp3', 'flac': 'flac',
  'flac24bit': 'flac', 'hires': 'flac', 'master': 'flac',
  'atmos': 'flac', 'atmos_plus': 'flac', 'ape': 'ape', 'wav': 'wav',
}
```

---

## 7. 下载管理器

### 7.1 架构

`DownloadManager` 类在 `src/core/download/manager.ts` 中实现，单队列顺序下载。

### 7.2 核心特性

- **单队列顺序执行**：同一时间只下载一个任务
- **自动重试**：最多 3 次，指数退避 (1s, 2s, 4s)
- **音质降级**：下载时首选音质不可用自动降级（降级前等待 5s，智能跳转到 _qualitys 中可用的最高音质）
- **文件已存在检查**：跳过已下载文件
- **存储权限检查**：下载前请求 MANAGE_EXTERNAL_STORAGE 权限
- **取消支持**：支持取消单个/全部任务
- **进度回调**：实时进度通知

### 7.3 下载流程

```
addToQueue(musicInfo, quality, subDir)
  → 生成任务 ID，计算文件路径
  → 入队
  → processQueue() 处理队列
    → downloadSingleTask()
      → 请求存储权限
      → 创建下载目录
      → fetchDownloadUrl() 获取下载 URL
        → 音质降级循环
      → 检查文件已存在
      → downloadFile() 下载
      → 验证结果
```

### 7.4 下载路径

```
基础目录: {externalStorageDirectoryPath}/音乐下载
最终路径: {基础目录}/{子目录名}/{文件名}.{ext}
文件名格式: 由 download.fileName 设置决定 (默认"歌名 - 歌手")
```

---

## 8. 播放缓存

### 8.1 架构

`playbackCache.ts` 在 `src/core/playbackCache.ts` 中实现，提供在线歌曲的本地缓存能力。

### 8.2 缓存目录

```
{系统临时目录}/lx-playback-cache/
```

### 8.3 核心流程

```
播放 URL 获取后 → 判断为远程链接 → cachePlaybackMusic(musicInfo, url)
  → 检查内存索引（cacheIndex）是否已有缓存
  → 检查缓存大小限制（enforceCacheLimit）
  → 下载完整文件到缓存目录
  → 更新内存索引
  → 下载完成后若播放器仍在缓冲状态 → 切换为本地文件路径
```

### 8.4 缓存限制

缓存大小通过 `player.cacheSize` 设置控制（单位 MB，默认 1024MB）。

`cachePlaybackMusic()` 函数增加 `maxSizeMB` 参数，由调用方（`player.ts`）传入：

```typescript
// player.ts 调用处
const cacheSize = settingState.setting['player.cacheSize']
  ? parseInt(settingState.setting['player.cacheSize']) : 0
cachePlaybackMusic(musicInfoOnline, url, cacheSize)
```

- 设为 0 时禁用播放缓存，立即返回 null
- 超出限制时 `enforceCacheLimit(maxSizeMB)` 按添加顺序淘汰最旧文件
- 缓存大小检查在每次下载前执行

### 8.5 内存索引

`cacheIndex: Map<string, { path, size }>` 缓存所有已缓存文件的路径和大小，启动时通过 `scanCacheDir()` 从文件系统重建。

### 8.6 与播放的集成

在 `core/player/player.ts` 的 `setMusicUrl()` 中：
1. 获取远程 URL 后立即发起后台缓存下载
2. 下载完成后检查播放器状态（Buffering/Connecting/Ready）
3. 若仍在缓冲中，通过 `setResource()` 切换为本地文件路径
4. 在 `core/music/online.ts` 的 `getMusicUrl()` 中，优先检查播放缓存

---

## 9. 自定义源插件系统

### 9.1 架构

自定义 API 系统允许用户编写 JavaScript 脚本作为自定义音乐源，运行在独立的 QuickJS 引擎中。

### 9.2 Native 端 (Android)

- **QuickJS.java**：QuickJS 引擎封装，加载用户脚本，通过 `__lx_native_call__` 桥接原生方法
- **JavaScriptThread.java**：独立 HandlerThread 运行 JS 脚本
- **UserApiModule.java**：React Native 桥接模块，提供 `loadScript()` / `sendAction()` / `destroy()` 方法

### 9.3 JS 端

- `src/utils/nativeModules/userApi.ts`：包装原生模块
- `src/core/userApi.ts`：管理 API 列表与状态
- `src/core/apiSource.ts`：切换 API 源（内置 ↔ 自定义）

### 9.4 加载流程

```
setApiSource('user_api_xxx')
  → setUserApi(apiId)
    → 从 AsyncStorage 读取脚本
    → loadScript({ id, name, script })
      → Native: UserApiModule.loadScript()
        → JavaScriptThread 创建
        → QuickJS 加载脚本
        → 执行初始化
  → 脚本通过 `__lx_native_call__` 调用原生方法获取音乐信息
```

---

## 10. 均衡器系统

### 10.1 架构

```
┌─────────────────────────────────────────────────┐
│ JS 层 (src/utils/nativeModules/equalizer.ts)    │
│ EqualizerModule Native Bridge 封装              │
├─────────────────────────────────────────────────┤
│ Native 桥接 (EqualizerModule.java)              │
│ setEnabled / getEnabled / setBandLevel / ...    │
├─────────────────────────────────────────────────┤
│ EqualizerAudioProcessor.java                    │
│ ExoPlayer AudioProcessor 实现                   │
│ 支持 PCM_16BIT / PCM_FLOAT / PCM_24BIT / PCM_32BIT│
├─────────────────────────────────────────────────┤
│ SoftwareEqualizer.java                          │
│ VLC 并联带通结构 10 段均衡器                    │
│ 31/62/125/250/500/1k/2k/4k/8k/16k Hz           │
└─────────────────────────────────────────────────┘
```

### 10.2 depenencies-patch 注入机制

`dependencies-patch.js` 在 `npm postinstall` 时执行，将均衡器代码注入到 `react-native-track-player` 模块中：

1. 复制 `android/equalizer-lib/*.java` → `node_modules/react-native-track-player/android/.../equalizer/`
2. 修改 `MusicManager.java`：
   - 将 `DefaultRenderersFactory` 替换为 `EqRenderersFactory`
   - 禁用硬件 offload（`audioOffload = false`）
   - 添加 `currentPlayer` 静态引用
3. 修改 `ButtonEvents.java`：添加 `onSetPlaybackSpeed` 支持
4. 修改 `MusicEvents.java`：添加 `BUTTON_SET_PLAYBACK_SPEED` 常量
5. 修改 `MetadataManager.java`：按钮文字中文化

### 10.3 EqualizerAudioProcessor 的 PCM 格式支持

支持 4 种 PCM 编码格式（二次开发新增）：

```java
// configure() 中接受以下 encoding:
C.ENCODING_PCM_16BIT  → 直接 short 处理
C.ENCODING_PCM_FLOAT  → float → short 转换
C.ENCODING_PCM_24BIT  → 3字节 → int → short 转换
C.ENCODING_PCM_32BIT  → int → short 转换

// queueInput() 中处理完成后：
short → 还原为原始格式输出
```

`isActive()` 恒返回 `true`：均衡器处理器常驻音频链，避免 `isActive` 翻转导致 media3 反复重建 AudioTrack。

### 10.4 SoftwareEqualizer 算法

采用 VLC 参考实现的并联带通结构：

```
out = EQZ_OUT_FACTOR * (EQZ_IN_FACTOR * x + Σ(带通_i * amp_i))
```

- 输入预衰减 0.25x (-12dB)，输出补偿 4x (+12dB)
- 0dB 频段 amp=0 完全旁路
- 不使用 tanh/限幅器，避免非线性削波
- 频率点：31 / 62 / 125 / 250 / 500 / 1k / 2k / 4k / 8k / 16k Hz
- 增益范围：-12dB ~ +12dB (millibel)
- Preamp 输出增益：0.1 ~ 2.0 (线性倍率)

### 10.5 AudioTrack 缓冲区优化

在 `EqRenderersFactory.java` 中自定义 `AudioTrackBufferSizeProvider`：

```java
// 默认 PCM 缓冲上限仅 750ms，提升到 1.5s
// 吸收写入抖动，减少欠载卡顿
long targetUs = 1_500_000L;
long bufferSize = (long) sampleRate * pcmFrameSize * targetUs / 1_000_000L;
```

### 10.6 状态持久化

均衡器状态通过 `SharedPreferences` 持久化：
- key: `equalizer_settings`
- 存储: `eq_enabled` (boolean), `eq_levels` (逗号分隔字符串), `eq_preamp` (float)
- 应用启动时自动恢复

---

## 11. 主题系统

### 11.1 架构

```
themes.ts       → 内置主题列表
index.ts        → 主题管理 (getTheme, getAllThemes, buildActiveThemeColors)
createThemes.js → 从 JSON 生成主题代码
colorsUtils.js  → 颜色操作工具
```

### 11.2 主题结构

```typescript
interface LX.Theme {
  id: string
  name: string
  isDark: boolean
  isCustom: boolean
  config: {
    themeColors: Record<string, string>  // 颜色变量
    extInfo: Record<string, string>      // 扩展信息 (背景图等)
  }
}
```

### 11.3 主题变量

`buildActiveThemeColors()` 将主题变量展开为扁平颜色映射：

```typescript
'c-850' / 'c-450'            → 字体颜色
'c-primary'                   → 主色调
'c-primary-alpha-300'         → 主色调透明度变体
'c-primary-light-400-alpha-700' → 主色调浅色透明度变体
'c-primary-dark-100-alpha-200'  → 主色调深色透明度变体
'c-button-font'               → 按钮字体
'c-button-background'         → 按钮背景
'c-content-background'        → 内容背景
'c-border-background'         → 边框背景
'bg-image'                    → 背景图
```

### 11.4 主题切换

```
setTheme(id) → updateSetting → getTheme() → applyTheme(theme)
  → themeActions.setTheme(theme)
  → global.state_event.themeUpdated(theme)
  → StatusBar 样式更新
```

支持自动暗色模式（跟随系统）。

---

## 12. 国际化

### 12.1 架构

```
i18n.ts → i18n 引擎 (createI18n, useI18n hook)
index.ts → 语言列表与消息导出
zh-cn.json / zh-tw.json / en-us.json → 翻译文件
```

### 12.2 i18n 引擎

```typescript
interface I18n {
  locale: Langs
  fallbackLocale: Langs          // 'zh_cn'
  availableLocales: Langs[]
  messages: Messages
  message: Message
  setLanguage(locale): void
  fillMessage(msg, vals): string // 变量替换 {key}
  getMessage(key, vals): string  // 获取翻译，支持 fallback
  t(key, vals): string           // 简写
}
```

### 12.3 使用方式

```typescript
global.i18n.t('player__getting_url')           // 简单翻译
global.i18n.t('player__getting_url_delay_retry', { time: 5 })  // 带变量
```

React Hook 方式：

```typescript
const t = useI18n()
t('key_name')
```

### 12.4 语言检测

初始化时检测设备语言，支持自动回退到 `en_us`。

---

## 13. 状态管理

### 13.1 架构模式

采用简单的 Reactive 模式，不依赖 Redux/MobX：

```
store/
├── player/state.ts    → 状态定义
├── player/action.ts   → 状态更新方法 (修改 state 后触发 state_event)
```

每个模块包含 `state.ts`（定义初始状态）和 `action.ts`（定义状态更新方法）。

### 13.2 状态模块

| 模块 | 核心状态 |
|------|---------|
| player | playMusicInfo, musicInfo, isPlay, progress, playedList, tempPlayList |
| setting | setting (LX.AppSetting) |
| list | userList, defaultList, loveList, activeListId |
| common | fontSize, statusbarHeight, navActiveId, bgPic |
| theme | theme, shouldUseDarkColors |
| sync | status, serverInfo |
| version | versionInfo, showModal |
| songlist | songList, tagList |
| search | searchResult, history |
| dislikeList | dislikeInfo (names, musicNames, singerNames) |
| userApi | list, status |
| leaderboard | boardList, boardData |
| singerDetail | singerInfo, hotSongs |

### 13.3 状态变更通知

每个 action 在修改 state 后通过 `global.state_event` 发出通知：

```typescript
playerActions.setPlayMusicInfo(listId, musicInfo, isTempPlay)
  → state.playMusicInfo = { listId, musicInfo, isTempPlay }
  → global.state_event.playMusicInfoChanged(state.playMusicInfo)
```

---

## 14. 事件系统

### 14.1 架构

```
Event.ts          → 基础 Event 类 (on/off/emit)
appEvent.ts       → 应用级事件 (AppEvent)
listEvent.ts      → 列表操作事件 (ListEvent)
dislikeEvent.ts   → 不喜欢列表事件 (DislikeEvent)
stateEvent.ts     → 状态变更事件 (StateEvent)
```

### 14.2 AppEvent 事件列表

| 事件 | 触发时机 |
|------|---------|
| focus | 应用获得焦点 |
| mylistUpdated | 我的列表更新 |
| musicToggled | 切换歌曲 |
| setProgress | 手动设置进度 |
| setVolume | 设置音量 |
| setPlaybackRate | 设置播放速率 |
| play / pause / stop | 播放/暂停/停止 |
| error | 播放错误 |
| playerPlaying / playerPause | TrackPlayer 原生状态 |
| playerError / playerEnded | 播放错误/结束 |
| playerLoadstart / playerWaiting | 加载中/缓冲中 |
| playerEmptied | 播放源清空 |
| picUpdated | 封面更新 |
| lyricUpdated | 歌词更新 |
| lyricOffsetUpdate | 歌词偏移更新 |
| downloadListUpdate | 下载列表更新 |
| selectSyncMode | 选择同步模式 |

### 14.3 StateEvent 事件列表

| 事件 | 触发时机 |
|------|---------|
| playInfoChanged | 播放信息变化 (listId, index) |
| playMusicInfoChanged | 当前播放歌曲变化 |
| playerMusicInfoChanged | 歌曲元数据变化 |
| playStateChanged | 播放状态变化 (isPlay) |
| playStateTextChanged | 状态文字变化 |
| playProgressChanged | 播放进度变化 |
| playPlayedListChanged | 已播放列表变化 |
| playTempPlayListChanged | 稍后播放列表变化 |
| themeUpdated | 主题更新 |
| configUpdated | 设置更新 |
| languageChanged | 语言变更 |
| apiSourceUpdated | API 源变更 |

---

## 15. 存储层

### 15.1 存储引擎

`src/plugins/storage.ts` 封装 `@react-native-async-storage/async-storage`，支持大键分片存储（单键超过 500KB 自动分片）。

### 15.2 存储前缀

```
@setting_v1            → 设置
@list__{id}            → 列表数据
@lyric__{id}           → 歌词缓存
@music_url__{id}_{q}   → 音乐 URL 缓存
@play_info             → 播放信息
@user_list             → 用户列表
@dislike_list          → 不喜欢列表
@theme                 → 自定义主题
@font_size             → 字体大小
@search_history_list   → 搜索历史
@user_api__{id}        → 自定义 API 脚本
```

### 15.3 数据管理

`src/utils/data.ts` 是数据持久化的核心模块，提供所有数据的读写方法。

---

## 16. Android 原生模块

### 16.1 模块列表

| 模块 | 包名 | 功能 |
|------|------|------|
| CacheModule | cache | 获取/清除应用缓存 |
| CryptoModule | crypto | RSA 密钥生成、AES 加解密 |
| EqualizerModule | equalizer | 软件均衡器控制 |
| LyricModule | lyric | 桌面歌词悬浮窗 |
| UserApiModule | userApi | 自定义 API 脚本引擎 |
| UtilsModule | utils | 系统工具 (exitApp, 通知权限, 屏幕常亮等) |

### 16.2 CacheModule

- `getAppCacheSize()` - 获取缓存大小（内部 + 外部缓存目录）
- `clearAppCache()` - 清除所有缓存（WebView 数据库 + 文件缓存）

### 16.3 CryptoModule

- `generateRsaKey()` - 生成 RSA 密钥对
- 内部使用 AES/RSA 加解密，用于音乐 API 请求参数加密

### 16.4 EqualizerModule

详见第 10 节。提供以下 React Native 方法：

```
isAvailable()          → 始终返回 true
setEnabled(bool)       → 启用/禁用均衡器
getEnabled()           → 获取启用状态
getNumberOfBands()     → 获取频段数量 (10)
getBandInfo()          → 获取所有频段信息
setBandLevel(band, mb) → 设置单个频段增益
setBandLevels([mb])    → 批量设置频段增益
getBandLevels()        → 获取所有频段增益
reset()                → 重置所有频段为 0dB
getSampleRate()        → 获取当前采样率
setPreamp(preamp)      → 设置 Preamp
getPreamp()            → 获取 Preamp
```

### 16.5 LyricModule

桌面歌词悬浮窗实现：

- `showDesktopLyricView(config)` - 显示悬浮窗 (位置、颜色、大小、行数)
- `hideDesktopLyricView()` - 隐藏悬浮窗
- `setLyric(lyric, translation, roma)` - 设置歌词内容
- `play(position)` - 从指定位置播放歌词
- `pause()` - 暂停歌词
- `setPlaybackRate(rate)` - 设置播放速率
- `setColor(type, color)` - 设置颜色
- `setAlpha(alpha)` - 设置透明度
- `setTextSize(size)` - 设置字体大小
- `setPosition(x, y)` - 设置位置
- `setWidth(width)` / `setMaxLineNum(num)` - 设置宽度/行数
- `setSingleLine(bool)` - 单行显示
- `setShowToggleAnima(bool)` - 切换动画
- `setLock(bool)` - 锁定
- `checkOverlayPermission()` - 检查悬浮窗权限
- `openOverlayPermissionActivity()` - 打开权限设置
- `onPositionChange(callback)` - 位置变化监听

### 16.6 UserApiModule

详见第 9 节。使用 QuickJS 引擎在独立线程中运行用户脚本。

### 16.7 UtilsModule

- `exitApp()` - 退出应用
- `getDeviceLanguage()` - 获取设备语言
- `getAppVersion()` - 获取应用版本
- `getScreenWidth()` / `getScreenHeight()` - 屏幕尺寸
- `getStatusBarHeight()` - 状态栏高度
- `setScreenKeepAwake(bool)` - 屏幕常亮
- `checkNotificationPermission()` - 检查通知权限
- `checkIgnoringBatteryOptimization()` - 检查电池优化
- `requestIgnoreBatteryOptimization()` - 请求忽略电池优化
- 广播接收器：屏幕开关监听、耳机插入/拔出

---

## 17. CI/CD 流水线

### 17.1 流水线概述

`.github/workflows/` 下定义了 6 个流水线，全部使用 GitHub Actions：

| 流水线 | 触发条件 | 产物 |
|--------|---------|------|
| `build-release.yml` | **push to main** + workflow_dispatch | Release APK + GitHub Release |
| `build-debug.yml` | push to main + workflow_dispatch | Debug APK (artifacts) |
| `build-test.yml` | PR to dev | ESLint 检查 + 构建测试 |
| `beta-pack.yml` | push to beta | Beta Release APK |
| `release.yml` | push to main/master + workflow_dispatch | Release APK |
| `publish-version-info.yml` | Release published + workflow_dispatch | 通知版本信息仓库 |

### 17.2 触发构建的方式

**方式一：推送代码到 main 分支**
```bash
git push origin main
```
触发 `build-release.yml`，自动构建 Release APK 并创建 GitHub Release。

**方式二：手动触发**
在 GitHub 仓库页面 → Actions → 选择对应 workflow → "Run workflow"。

### 17.3 build-release.yml（主力流水线）

这是最常用的流水线，负责构建签名 Release APK 并发布到 GitHub Releases。

**触发条件**：`push → main` 或 `workflow_dispatch`

**完整步骤详解**：

```yaml
步骤详解:
  1. checkout @v4
     # 检出代码

  2. Setup Node.js
     # 从 .nvmrc 读取 Node.js 版本

  3. Setup Java 17 (Microsoft JDK)
     # 配置 Java 17，启用 Gradle 缓存

  4. Cache node_modules
     # 按 package-lock.json 的 hash 缓存 node_modules
     # 命中则跳过 npm ci

  5. npm ci
     # 安装依赖（锁定版本）

  6. node dependencies-patch.js
     # 核心步骤！修补依赖源码：
     #   - 复制 equalizer-lib/ 到 react-native-track-player
     #   - 修改 MusicManager.java 禁用 audio offload
     #   - 修改 MetadataManager.java 按钮文字为中文
     #   - 添加 onSetPlaybackSpeed 支持
     #   - 添加 BUTTON_SET_PLAYBACK_SPEED 事件

  7. Set Gradle heap to 8GB
     # sed 修改 android/gradle.properties 的 org.gradle.jvmargs

  8. Decode Keystore
     # 从 GitHub Secrets 读取 KEYSTORE_STORE_FILE_BASE64
     # Base64 解码后写入 android/app/keystore.jks

  9. Build Release APK
     cd android
     ./gradlew assembleRelease \
       --init-script init.gradle \          # 使用 init.gradle（配置 CPU 架构等）
       -PMYAPP_UPLOAD_STORE_FILE='keystore.jks' \
       -PMYAPP_UPLOAD_KEY_ALIAS='${{ secrets.KEYSTORE_KEY_ALIAS }}' \
       -PMYAPP_UPLOAD_STORE_PASSWORD='${{ secrets.KEYSTORE_PASSWORD }}' \
       -PMYAPP_UPLOAD_KEY_PASSWORD='${{ secrets.KEYSTORE_KEY_PASSWORD }}' \
       --no-daemon --stacktrace

  10. Clean Keystore
      # 删除 keystore.jks，防止泄露

  11. Get package version
      PACKAGE_VERSION=$(node -p "require('./package.json').version")

  12. Generate file MD5
      # 生成 APK 的 MD5 校验值

  13. Rename APK
      cp .../release/lx-music-mobile-v{version}-universal.apk \
         lx-music-mobile-v{version}-arm64-v8a-release.apk

  14. Create Release and Upload APK
      # 使用 softprops/action-gh-release@v2
      # tag: v{version}-{run_number}  (如 v1.8.4-361)
      # name: v{version} (build #{run_number})
      # prerelease: true（标记为预发布）
      # make_latest: false（不覆盖最新版本标记）
```

**关于 Keystore**：
- 签名文件 `keystore.jks` 以 Base64 编码存储在 `secrets.KEYSTORE_STORE_FILE_BASE64`
- 别名、密码分别存储在 `KEYSTORE_KEY_ALIAS`、`KEYSTORE_PASSWORD`、`KEYSTORE_KEY_PASSWORD` 中
- 构建过程中解码使用，构建完成后立即删除
- 如需更换签名文件，在 GitHub 仓库 Settings → Secrets and variables → Actions 中更新

**关于 init.gradle**：
- 位于 `android/init.gradle`，配置 `reactNativeArchitectures=arm64-v8a`
- 只构建 arm64-v8a 架构，加快构建速度，减小 APK 体积

### 17.4 build-debug.yml

```yaml
触发: push to main + workflow_dispatch
步骤:
  1. Checkout
  2. Setup Node.js (从 .nvmrc 读取版本)
  3. Setup Java 17 (Microsoft JDK)
  4. 缓存 node_modules (按 package-lock.json hash)
  5. npm ci
  6. node dependencies-patch.js
  7. sed 设置 Gradle heap 4GB
  8. react-native bundle (生成 JS Bundle)
  9. 解码 Keystore (Base64)
  10. ./gradlew assembleDebug
  11. 清理 Keystore
  12. 上传 Debug APK 到 artifacts
```

### 17.5 build-test.yml (PR 检查)

```yaml
触发: pull_request → dev
步骤:
  1. Checkout
  2. Node.js 20
  3. npm ci
  4. npm run lint (ESLint)
  5. npm run build-test (JS Bundle 构建测试)
```

### 17.6 beta-pack.yml

```yaml
触发: push to beta
步骤:
  1. Checkout
  2. Setup Env (复用 .github/actions/setup)
  3. DISABLE_SVG=1 环境变量
  4. ./gradlew assembleRelease
  5. 生成 MD5
  6. 上传产物 (自定义 action)
```

### 17.7 release.yml

```yaml
触发: push to main/master + workflow_dispatch
步骤:
  1. Checkout
  2. Setup Env
  3. dependencies-patch.js
  4. Gradle heap 8GB
  5. DISABLE_SVG=1
  6. ./gradlew assembleRelease (带 keystore)
  7. 生成 MD5
  8. 上传产物
```

### 17.8 publish-version-info.yml

```yaml
触发: release published + workflow_dispatch
步骤:
  - Repository Dispatch → lyswhut/lx-music-mobile-version-info
  - 使用 PAT (Personal Access Token)
```

### 17.12 GitHub 辅助文件

`.github/` 目录下除 workflows 外的辅助文件：

| 文件 | 用途 |
|------|------|
| `.github/actions/setup/action.yml` | 可复用的 CI 环境设置 Action（安装 Node、Java、缓存依赖） |
| `.github/actions/upload-artifact/action.yml` | 可复用的 CI 产物上传 Action |
| `.github/ISSUE_TEMPLATE/bug.yml` | Bug 报告模板（结构化表单） |
| `.github/ISSUE_TEMPLATE/feature.yml` | 功能请求模板（结构化表单） |

以下流水线复用这些自定义 Action：
- `beta-pack.yml` 使用 `./.github/actions/setup` 和 `./.github/actions/upload-artifact`

### 17.13 其他平台流水线配置

`/.gitlab-ci.yml` 是 GitLab CI 流水线配置（备选 CI 方案，当前主要使用 GitHub Actions 构建）。

### 17.14 构建产物产物

| 产物 | 位置 | 用途 |
|------|------|------|
| Release APK | GitHub Releases → Assets | 用户下载安装 |
| Debug APK | GitHub Actions → Artifacts | 开发调试 |

Release APK 命名规则：`lx-music-mobile-v{version}-arm64-v8a-release.apk`
Release tag 格式：`v{version}-{run_number}`（如 `v1.8.4-361`）

### 17.10 dependencies-patch.js 详解

`dependencies-patch.js` 在 `npm install` 后自动执行，或在 CI 中手动执行。它负责：

**1. 复制均衡器源码**
```javascript
// 将 android/equalizer-lib/ 中的 4 个 Java 文件复制到
// node_modules/react-native-track-player/.../equalizer/
const eqFiles = [
  'BiquadFilter.java',      // 双二阶滤波器（低通/高通/带通/带阻/峰值）
  'SoftwareEqualizer.java',  // 10 段均衡器 DSP 算法
  'EqualizerAudioProcessor.java', // ExoPlayer AudioProcessor 实现
  'EqRenderersFactory.java', // 自定义 RenderersFactory，注入均衡器
]
```

**2. 修改 MusicManager.java**
- 使用 `EqRenderersFactory` 替代 `DefaultRenderersFactory`
- 始终禁用硬件 audio offload（均衡器需要软件处理）
- 添加 `setAudioOffloadEnabled()` 静态方法
- 保留 `ExoPlayer` 静态引用 `currentPlayer`

**3. 修改 MetadataManager.java**
- 通知栏按钮文字从英文改为中文："Previous" → "上一首"、"Next" → "下一首"等

**4. 添加播放速率控制**
- `ButtonEvents.java`：添加 `onSetPlaybackSpeed()` 方法
- `MusicEvents.java`：添加 `BUTTON_SET_PLAYBACK_SPEED` 常量

### 17.11 构建流程总结

```
开发者推送代码到 main
       ↓
GitHub Actions 触发 build-release.yml
       ↓
Checkout → Setup Node/Java → npm ci → dependencies-patch.js
       ↓
解码 Keystore → ./gradlew assembleRelease
       ↓
生成 MD5 → 重命名 APK → 创建 GitHub Release
       ↓
产物: lx-music-mobile-v{version}-arm64-v8a-release.apk
```

---

## 18. 二次开发功能详解

### 18.1 音质扩展 (master / hires / atmos / atmos_plus)

**修改文件**：
- `src/types/common.d.ts` — 在 `Quality` 类型中新增 `hires` / `master` / `atmos` / `atmos_plus`
- `src/utils/musicSdk/utils.js` — 在 `QUALITYS` 数组中添加扩展音质，`extendQualityTypes()` 函数自动补全
- `src/core/music/utils.ts` — `TRY_QUALITYS_LIST` 包含扩展音质
- `src/core/download/manager.ts` — `QUALITY_EXT_MAP` 映射扩展音质到 flac 扩展名

**工作原理**：

1. `extendQualityTypes()` 检查 `global.lx.qualityList[source]` 是否包含扩展音质
2. 如果包含，自动将缺失的高品质补入 `musicInfo.meta._qualitys` 和 `musicInfo.types`
3. 播放时 `getPlayQuality()` 通过音质降级循环选择可用音质
4. 下载时 `QUALITY_EXT_MAP` 将扩展音质映射到 `.flac` 扩展名

### 18.2 EqualizerAudioProcessor 的 PCM 格式支持

**修改文件**：`android/equalizer-lib/EqualizerAudioProcessor.java`

原生 ExoPlayer AudioProcessor 只处理 `PCM_16BIT`。二次开发扩展为支持 4 种格式：

```java
// 支持的 encoding
C.ENCODING_PCM_16BIT  → 直接 short 处理，效率最高
C.ENCODING_PCM_FLOAT  → float → short → 处理 → float 还原
C.ENCODING_PCM_24BIT  → 3字节小端 → int → short → 处理 → 3字节还原
C.ENCODING_PCM_32BIT  → int → short (高16位) → 处理 → int 还原
```

每种格式的处理流程：
1. 从 `ByteBuffer` 读取原始采样
2. 统一转换为 16-bit short 数组
3. 调用 `SoftwareEqualizer.processStereo()` / `processMono()`
4. 将处理后的 16-bit short 还原为原始格式写入输出

### 18.3 playbackCache 缓存限制

**修改文件**：`src/core/playbackCache.ts`

新增 `enforceCacheLimit()` 函数：

```typescript
// 在 cachePlaybackMusic() 下载前调用
await enforceCacheLimit()

// 逻辑：
// 1. 读取 player.cacheSize 设置值 (MB)
// 2. 累加 cacheIndex 中所有文件大小
// 3. 超出限制时按添加顺序淘汰最旧文件
// 4. 删除文件 + 更新内存索引
```

缓存限制在 `cachePlaybackMusic()` 入口处检查（`maxSizeMB <= 0` 时返回 null，禁用缓存）。

### 18.4 播放详情页音质切换

**新增文件**：
- `src/screens/PlayDetail/components/SettingPopup/settings/SettingPlayQuality.tsx`
- `src/screens/PlayDetail/components/SettingPopup/settings/QualitySelectPopup.tsx`

**交互流程**：

1. 用户点击播放详情页设置 → 音质切换
2. 弹出 `QualitySelectPopup`，显示当前歌曲所有可用音质
3. 用户选择音质 → 调用 `setTempPlayQuality(quality)`
4. 触发 `setMusicUrl()` 重新获取新音质的 URL
5. 切歌时 `clearTempPlayQuality()` 自动清空临时覆盖

### 18.5 tempPlayQuality 临时覆盖机制

**修改文件**：`src/core/music/utils.ts`

```typescript
// 单歌临时音质覆盖
let tempPlayQuality: LX.Quality | null = null

// 设置临时音质（播放详情页切换时调用）
export const setTempPlayQuality = (q: LX.Quality | null) => { tempPlayQuality = q }

// 获取临时音质（在 getPlayQuality 中优先检查）
export const getTempPlayQuality = (): LX.Quality | null => tempPlayQuality

// 切歌时清空（在 playInfo.ts 的 setPlayMusicInfo 中调用）
export const clearTempPlayQuality = () => { tempPlayQuality = null }
```

在 `getPlayQuality()` 中，`tempPlayQuality` 优先于全局设置 `player.playQuality`，允许用户临时为当前歌曲选择不同音质，不影响后续歌曲。

### 18.6 下载音质降级优化

**修改文件**：`src/core/download/manager.ts`

原版降级策略：从首选音质逐级向下尝试，每级等待 30 秒，速度极慢。

优化后：用 `_qualitys`（API 实际返回的音质）过滤降级顺序，跳过不可用的音质：

```typescript
// 构建完整降级顺序
const qualityOrder = buildQualityFallbackOrder(task.quality, task.musicInfo)
// 只保留 API 实际返回的音质
const _qualitys = task.musicInfo.meta?._qualitys ?? {}
const availableOrder = qualityOrder.filter(q => _qualitys[q] != null)
// 用过滤后的列表尝试
const fallbackOrder = availableOrder.length > 0 ? availableOrder : qualityOrder
```

**效果**：选母带但歌曲只有 FLAC 时，跳过 atmos_plus / atmos / hires / flac24bit，直接尝试 FLAC。降级间隔从 30 秒改为 5 秒。

### 18.7 下载音质列表去重

**修改文件**：`src/components/DownloadQualityModal/index.tsx`

`getAvailableQualities()` 只显示 `_qualitys` 中 API 实际返回的音质，并补充插件声明的高级音质（flac24bit 以上：hires / atmos / atmos_plus / master），避免出现两个"高品音质"（192k 和 320k 都映射到同一标签）的问题。

### 18.8 快速切歌防崩溃

**修改文件**：`src/plugins/player/playList.ts`

回退 `TrackPlayer.reset()` 的改动，恢复原始 `handlePlayMusic` 逻辑。`reset()` 会导致 ExoPlayer 进入不稳定状态，快速切歌时更容易触发播放错误。

### 18.9 播放器缓冲超时优化

**修改文件**：`src/core/init/player/playerEvent.ts`

- 新增 `refreshUrl()` 函数，统一 URL 刷新逻辑
- 长音频（10 分钟以上）允许最多 5 次自动刷新 URL 续播，普通音频最多 2 次
- 修复 `handleError` 中 `retryNum` 未正确递增的问题

### 18.10 其他二次开发修改

**均衡器注入**（`dependencies-patch.js`）：
- 将 `android/equalizer-lib/` 中的 Java 文件复制到 `react-native-track-player` 模块源码目录
- 修改 `MusicManager.java` 使用 `EqRenderersFactory` 而非 `DefaultRenderersFactory`
- 禁用硬件 audio offload（均衡器需要软件处理）
- 保留 `ExoPlayer` 静态引用以支持运行时设置播放速率

**均衡器状态持久化**：
- 均衡器开关和频段增益值保存到 SharedPreferences，App 重启后自动恢复
- `enabled` 字段声明为 `volatile` 保证跨线程可见性
- 读方法加 `synchronized` 避免数据竞争

**播放速率控制**：
- `dependencies-patch.js` 修改 `ButtonEvents.java` 添加 `onSetPlaybackSpeed` 方法
- 修改 `MusicEvents.java` 添加 `BUTTON_SET_PLAYBACK_SPEED` 常量
- 支持 Android 通知栏/蓝牙设备控制播放速率

**通知栏按钮中文**：
- `dependencies-patch.js` 修改 `MetadataManager.java` 将按钮文字替换为中文

**播放器缓冲策略优化**：
- `minBuffer: 20s` / `maxBuffer: 60s` — 播放中持续预载
- `playBuffer: 1.5s` — 快速出声
- 避免 `maxBuffer: 1000s` 导致的 OOM

**首轮播放强制刷新绕过缓存**（`player.ts:150-151`）：
- `setMusicUrl()` 中首次播放时强制 `isRefresh=true`，避免读取过期缓存 URL 导致播放缓冲
- 后续切歌或重试时 `isRefresh` 由调用方控制

**getPlayQuality qualityList 优先逻辑**（`src/core/music/utils.ts:226-260`）：
- 优先使用 `global.lx.qualityList[source]` 作为音质优先级列表
- 当首选音质不在 `qualityList` 中时，从设置档位向下遍历取可用音质
- 扩展音质列表：将 `qualityList` 中缺失的高品质补入 `_qualitys`，确保播放时能正确选用

**播放详情页音质切换**（v1.8.4-354）：
- 新增 `SettingPlayQuality.tsx` + `QualitySelectPopup.tsx`
- 显示当前歌曲实际音质（`getTempPlayQuality()` 优先）
- 切换后续播不重置进度；切歌时 `clearTempPlayQuality()` 自动恢复全局默认

**tempPlayQuality 临时音质覆盖机制**（`src/core/music/utils.ts`）：
- 单歌临时音质覆盖，切歌时清空，不影响全局设置

**EqualizerAudioProcessor PCM 全格式支持**（`android/equalizer-lib/EqualizerAudioProcessor.java`）：
- 支持 PCM_16BIT / PCM_FLOAT / PCM_24BIT / PCM_32BIT
- float/24/32 与 16-bit 互相转换处理
- `isActive()` 恒返回 `true`：均衡器处理器常驻音频链，避免 media3 反复重建 AudioTrack

**EqualizerAudioProcessor 修复 320k 缓冲**（v1.8.4-352~353）：
- 根因：MP3 解码器输出 PCM_FLOAT，原处理器只接受 PCM_16BIT 导致拒绝后管线卡住
- 修复：接受全部 PCM 格式 + queueInput 按格式转换

**播放缓存大小限制**（`src/core/playbackCache.ts`，v1.8.4-356~357）：
- `enforceCacheLimit(maxSizeMB)` 淘汰最旧文件，超出限制时自动清理
- `cacheSize=0` 时完全禁用播放缓存，立即返回 null
- `cachePlaybackMusic()` 改为由 `player.ts` 传入 `maxSizeMB` 参数（避免循环引用）

**下载音质降级优化**（`src/core/download/manager.ts`，v1.8.4-358~361）：
- 用 `_qualitys`（API 实际返回）过滤降级顺序，跳过不可用音质直接尝试最高可用
- 降级间隔从 30 秒缩短为 5 秒
- 降级时 toast 提示用户实际下载品质

**下载音质列表去重**（`src/components/DownloadQualityModal/index.tsx`，v1.8.4-358~359）：
- 只显示 `_qualitys` 实际返回 + 插件声明的高级音质（flac24bit 以上）
- 修复两个"高品音质"重复问题

**快速切歌防崩溃**（`src/plugins/player/playList.ts`，v1.8.4-355~358）：
- 回退 `TrackPlayer.reset()` 改动，恢复原始 `handlePlayMusic` 逻辑
- `reset()` 会导致 ExoPlayer 进入不稳定状态，快速切歌时更容易触发播放错误

**播放器缓冲超时优化**（`src/core/init/player/playerEvent.ts`，v1.8.4-349）：
- 新增 `refreshUrl()` 函数，统一 URL 刷新逻辑
- 长音频（10 分钟以上）允许最多 5 次自动刷新 URL 续播，普通音频最多 2 次
- 修复 `handleError` 中 `retryNum` 未正确递增的问题

**歌手简介独立阅读页**（`src/screens/SingerIntro/`）：
- 公众号风格独立阅读页，通过 `pushSingerIntroScreen()` 导航打开
- 五源歌手简介获取链路：本源优先 + 跨源兜底补齐
- 并行拉取所有源的歌手简介，取最长的一条作为最终结果（`Promise.allSettled`）
- 简介长度低于阈值视为不完整，触发跨源兜底
- 酷我源移除 `getSingerSongList` 改用 `musicSearch` 降级，超时时间区分
- 传递 `singerName` 避免额外 API 调用
- tx 源改用开源 GetSingerDetail(wiki) 接口，失败降级旧接口
- kw 源恢复 `getToken/tokenRequest` 鉴权机制，优先获取最新歌手简介
- 全量下载遇空页停止拉取，网易云歌手歌曲补全音质
- 修复分页 `sourcePage` 序号错乱问题，过滤翻唱等杂质内容

**歌手歌曲列表音质补全**：
- 所有音乐源歌手歌曲列表补全音质信息，避免播放降级到慢 CDN
- kg 源降级时补默认 128k 音质，修复播放缓冲
- wy 源歌手歌曲列表补全 `otherSource` 字段，对齐 `musicDetail` 格式

**无障碍优化**：
- 歌曲列表多选手势及横屏菜单无障碍朗读修复
- 进度滑块改用 `@react-native-community/slider`（底层 `AppCompatSeekBar`），替换自定义 PanResponder
- 通用滑块（音量/倍速/歌词字号/均衡器）同步替换，统一 RangeInfo 和手势处理
- 搜索建议列表用稳定 key，音乐列表主区显式 `accessible`
- 全面优化屏幕阅读器焦点跟手度
- 搜索列表、排行榜布局对齐，修复屏幕阅读器焦点错乱

**歌词点击跳转**：
- 竖屏和横屏歌词组件中歌词行从 `View` 改为 `TouchableOpacity`
- 点击后通过 `global.app_event.setProgress(line.time / 1000)` 跳转到对应时间播放

**导出列表修复**：
- `ChoosePath/index.tsx` 修复 SAF 文件夹选择器写入失败问题
- `listAction.ts` 和 `Backup/actions.ts` 移除吞错误的 `try/catch`，让错误正常传播

**.so 压缩打包**：
- 恢复 `useLegacyPackaging`，压缩 .so 文件减小 APK 体积

**下载进度精确到 1%**：
- `progressDivider` 从 10 改为 1，进度回调频率从 10% 提升到 1%
- 修复取消下载弹窗问题

**音质分级原始修改**：
- 所有音乐源统一补齐完整音质分级：kg/tx/mg/wy 补齐 flac24bit/flac/320k/128k
- wy/singer.js 从 privileges 提取音质，补 otherSource 字段
- 歌手详情接口超时调整为 10 秒，音乐搜索超时 8 秒
- extendQualityTypes 不再添加 320k/192k/128k 到 `_types`，只补高品质
- 徽章显示增加 size 检查，避免虚标

**preload 脚本 supportQualitys 扩展**：
- `user-api-preload.js` 中 `supportQualitys` 加入 master/hires/atmos/atmos_plus

### 18.11 自定义源预加载脚本（user-api-preload.js）

`android/app/src/main/assets/script/user-api-preload.js`（594 行）是自定义源插件的运行环境，在 QuickJS 引擎中加载：

**核心 API**（通过 `globalThis.lx` 暴露）：
| API | 说明 |
|-----|------|
| `lx.request(url, options, callback)` | HTTP 请求，支持 method/timeout/headers/body/form/binary，返回取消函数 |
| `lx.send(eventName, data)` | 发送事件（inited / updateAlert），Promise 封装 |
| `lx.on(eventName, handler)` | 注册事件监听器（request） |
| `lx.utils.crypto` | AES 加密（CBC/ECB）、RSA 加密、randomBytes、MD5 |
| `lx.utils.buffer` | from / bufToString 编解码 |
| `lx.version` | `'2.0.0'` |
| `lx.env` | `'mobile'` |

**请求处理流程**：
1. `lx.on('request', handler)` 注册处理函数
2. `handler` 返回 `{ url, type }` 或 `{ lyric, tlyric }` 或图片 URL
3. 预加载脚本验证返回值格式和长度限制（URL 最长 2048 字符）
4. 通过 `nativeCall()` 返回结果给 Native 层

**安全加固**：
- `eval()` 被替换为抛出异常
- `Function.prototype.constructor` 被 Proxy 劫持，阻止动态代码执行
- `freezeObjectProperty()` 递归冻结 `globalThis`，所有属性 writable=false, configurable=false

### 18.12 自定义源加载流程（src/core/init/userApi/index.ts）

**初始化流程**：
1. Native 层（QuickJS.java）加载插件脚本 → 调用 `lx_setup()` → 插件执行 `send(EVENT_NAMES.inited, { sources })`
2. Native 层通过 `onScriptAction` 事件分发 `init` action
3. `handleStateChange()` 收到初始化事件 → 构建 `global.lx.apis[source]` 和 `global.lx.qualityList`
4. `apiInitPromise` 通过 Promise 通知 App 初始化完成

**API 构建**（`apis[source].getMusicUrl`）：
```typescript
apis[source].getMusicUrl = (songInfo, type) => {
  return {
    promise: sendUserApiRequest({ source, action: 'musicUrl', info: { type, musicInfo: songInfo } })
      .then(res => ({ type, url: res.data.url }))
  }
}
```

**请求超时**：20 秒（BackgroundTimer），超时自动 reject。

### 18.13 问题排查工作流

在开发过程中遇到问题时，遵循以下流程：

```
1. 确认问题现象
   ├── 用户描述具体表现（如"一直缓冲中"、"音频加载出错"）
   └── 确认是否跨音源（wy/tx/kw/kg/mg）→ 共性规律比单源现象更重要

2. 定位问题范围
   ├── 是否为 App 层问题（所有插件/音源都出现）
   ├── 是否为插件层问题（特定插件出现）
   └── 是否为音源层问题（特定音源出现）

3. 分析代码
   ├── 对比原始仓库（lyswhut/lx-music-mobile）找出差异
   ├── 检查二次开发修改是否引入了新问题
   └── 检查日志输出

4. 实施修复
   ├── 最小化修改，不引入无关改动
   ├── 修改后审查是否引发新问题
   └── 提交推送触发 CI 构建

5. 验证修复
   ├── 确认原问题已解决
   ├── 检查是否有新的副作用
   └── 更新文档记录修复内容
```

**核心原则**：
- 排查时必须覆盖全部 5 个音源，不能只测一个
- 找到的共性规律比单个音源的现象更重要
- 修改后必须审查是否引发新问题
- 修复后更新文档的更新日志

---

## 19. 构建与调试

### 19.1 环境要求

- Node.js >= 18
- Java 17 (JDK)
- Android SDK (compileSdk 36, buildTools 35.0.0, minSdk 23, targetSdk 29)
- NDK 26.1.10909125

### 19.2 常用命令

```bash
# 安装依赖（自动执行 dependencies-patch.js）
npm install

# 开发运行
npm run dev

# 启动 Metro bundler
npm run start

# 清除缓存启动
npm run sc

# 生成 JS Bundle
npm run bundle-android

# 构建 Debug APK
npm run pack:android:debug

# 构建 Release APK
npm run pack:android

# 清理构建
npm run clear

# Lint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix
```

### 19.3 构建流程

1. `npm install` → 自动执行 `dependencies-patch.js`（注入均衡器、打补丁）
2. `react-native bundle` → 生成 JS Bundle 到 `android/app/src/main/assets/`
3. `cd android && ./gradlew assembleRelease` → 编译原生代码 + 打包 APK

### 19.4 调试技巧

- `global.lx.isEnableSyncLog = true` — 开启同步日志
- `global.lx.isEnableUserApiLog = true` — 开启自定义 API 日志
- 启动日志通过 `bootLog()` 输出，使用 `src/utils/bootLog.ts`
- 通用日志通过 `src/utils/log.ts` 输出

### 19.5 提交到仓库触发 CI 构建

本项目使用 GitHub Actions 作为 CI/CD，push 到 `main` 分支自动触发构建。

**标准工作流**：

```bash
# 1. 查看当前改动
git status

# 2. 添加改动文件
git add <文件路径>

# 3. 提交
git commit -m "feat: 描述你的改动"

# 4. 推送到 main 分支 → 自动触发 CI 构建
git push origin main
```

**push 后**：
1. GitHub Actions 自动运行 `build-release.yml` 流水线
2. 构建完成后在仓库 Releases 页面生成 APK 下载链接
3. 可在 Actions 标签页查看构建进度和日志

**查看构建状态**：
```bash
# 查看最近 5 次构建状态
gh run list --repo vivo1928/001 --branch main --limit 5

# 获取最新 Release 的 APK 下载链接
gh release view $(gh release list --repo vivo1928/001 --limit 1 --json tagName | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['tagName'])") --repo vivo1928/001 --json assets
```

### 19.6 凭据存储

构建 Release APK 需要签名，签名文件和相关凭据存储在 GitHub Secrets 中：

| Secret 名称 | 用途 | 存储位置 |
|-------------|------|---------|
| `KEYSTORE_STORE_FILE_BASE64` | 签名文件 keystore.jks 的 Base64 编码 | GitHub → Settings → Secrets and variables → Actions |
| `KEYSTORE_KEY_ALIAS` | 签名密钥别名 | 同上 |
| `KEYSTORE_PASSWORD` | 密钥库密码 | 同上 |
| `KEYSTORE_KEY_PASSWORD` | 密钥密码 | 同上 |

**在 CI 中使用**：
```yaml
- name: Decode Keystore
  run: echo "$KEYSTORE_BASE64" | base64 --decode > android/app/keystore.jks
  env:
    KEYSTORE_BASE64: ${{ secrets.KEYSTORE_STORE_FILE_BASE64 }}

- name: Build Release APK
  run: |
    ./gradlew assembleRelease \
      -PMYAPP_UPLOAD_STORE_FILE='keystore.jks' \
      -PMYAPP_UPLOAD_KEY_ALIAS='${{ secrets.KEYSTORE_KEY_ALIAS }}' \
      -PMYAPP_UPLOAD_STORE_PASSWORD='${{ secrets.KEYSTORE_PASSWORD }}' \
      -PMYAPP_UPLOAD_KEY_PASSWORD='${{ secrets.KEYSTORE_KEY_PASSWORD }}'
```

**安全说明**：
- 签名文件 keystore.jks 以 Base64 编码存储在 GitHub Secrets 中，不会出现在代码仓库里
- 构建过程中解码使用，构建完成后立即 `rm -f android/app/keystore.jks` 删除
- 如需更换签名文件，在 GitHub 仓库 Settings → Secrets and variables → Actions 中更新对应值
- 本地开发时调试 APK 使用 Android Studio 的 debug 签名，无需配置这些凭据

### 19.7 本地构建 APK 输出位置

```
android/app/build/outputs/apk/debug/   → Debug APK
android/app/build/outputs/apk/release/ → Release APK
```

APK 命名规则：`lx-music-mobile-v{version}-{arch}.apk` 或 `lx-music-mobile-v{version}-universal.apk`

---

## 20. 自定义源插件与开发环境知识

### 20.1 自定义源插件（音乐源）

本应用通过"自定义源"功能加载第三方音乐源脚本（JavaScript），核心来源包括：

| 插件 | 说明 | 存储位置 |
|------|------|---------|
| 星海音乐源 (xinghai) | 主力插件，支持五源全音质（含 master/atmos/atmos_plus/hires），后端 `yy.zddyr.top` / `zrcdy.dpdns.org` | `产物/xinghai-music-sourcev2.3.13.js` |
| yibai 酷我流式 | 酷我专属，支持全音质，服务端已解密（`kwdec.942240.xyz`），已集成进星海脚本 | `产物/lx-source-yibai酷我流式V4.js` |

**星海源特性**：
- 后端已配 QQ SVIP 账号，可直接返回 master（`AI00` 前缀）和 atmos_plus（`Q001` 前缀）链接
- 酷我链路：yibai 流式优先（已解密）→ 自建后端兜底
- 认证：脚本生成 `X-Token`（base64 编码的 device_id + ip + timestamp），后端校验
- QQ 链路：chksz(apikey) → 自建后端 → 落月API（已废弃，返回 30s 试听预览）

**注意**：
- 落月API (`api.vkeys.cn`) 已从脚本中移除，因为它会返回"音乐试听"预览链接（只播 30 秒）
- 星海后端返回的 master/atmos_plus 链接已验证可下载（HTTP 200，真实 FLAC）

### 20.2 构建环境坑（开发环境）

记录在 `.monkeycode/MEMORY.md` 中的环境知识：

| 问题 | 解决方案 |
|------|---------|
| node_modules 长期缺失 | `npm install` 因 4 个 github 源依赖拉取缓慢，需用 background terminal 后台执行（设长超时） |
| 本地无法编译 TypeScript | 用 npx 临时 typescript：`npx tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx --esModuleInterop --moduleResolution bundler --target esnext --module esnext --noResolve` |
| `--noResolve` 模式的报错 | `@/` 别名、`global`、`LX` namespace 报 TS2307/2304/2503 属环境噪音，非真实代码错误 |
| Android Java 无法本地编译 | 本地无 javac/gradle/java，改动只能靠静态审查 |
| 构建一律走 CI | 不用本地构建，本地仅做静态审查 |

### 20.3 问题排查覆盖规则

排查播放/下载问题时，必须同时覆盖全部 5 个音源（wy/tx/kw/kg/mg），不能只测一个。找到的共性规律（如"换其他插件也一样"）比单个音源的现象更重要，说明问题在 App 层而非插件层。

---

## 附录：关键文件路径速查

| 功能 | 路径 |
|------|------|
| 应用入口 | `/workspace/index.js` |
| 全局类型定义 | `/workspace/src/types/` |
| 播放器核心 | `/workspace/src/core/player/player.ts` |
| 音乐资源获取（在线） | `/workspace/src/core/music/online.ts` |
| 音乐资源获取（统一入口） | `/workspace/src/core/music/index.ts` |
| 音质选择与源切换 | `/workspace/src/core/music/utils.ts` |
| 播放缓存 | `/workspace/src/core/playbackCache.ts` |
| 下载管理器 | `/workspace/src/core/download/manager.ts` |
| TrackPlayer 封装 | `/workspace/src/plugins/player/` |
| 音质选择 UI | `/workspace/src/screens/PlayDetail/components/SettingPopup/settings/SettingPlayQuality.tsx` |
| 均衡器 UI | `/workspace/src/screens/PlayDetail/components/SettingPopup/settings/SettingEqualizer.tsx` |
| 均衡器 DSP | `/workspace/android/equalizer-lib/SoftwareEqualizer.java` |
| 均衡器 AudioProcessor | `/workspace/android/equalizer-lib/EqualizerAudioProcessor.java` |
| 均衡器 Native Bridge | `/workspace/android/app/src/main/java/cn/toside/music/mobile/equalizer/EqualizerModule.java` |
| 依赖修补脚本 | `/workspace/dependencies-patch.js` |
| 音乐 SDK 入口 | `/workspace/src/utils/musicSdk/index.js` |
| 音质扩展工具 | `/workspace/src/utils/musicSdk/utils.js` |
| 初始化流程 | `/workspace/src/core/init/index.ts` |
| 事件总线 | `/workspace/src/event/` |
| 状态管理 | `/workspace/src/store/` |
| 国际化 | `/workspace/src/lang/` |
| 主题系统 | `/workspace/src/theme/` |
| 自定义 API 引擎 | `/workspace/android/app/src/main/java/cn/toside/music/mobile/userApi/QuickJS.java` |
| 自定义源预加载脚本 | `/workspace/android/app/src/main/assets/script/user-api-preload.js` |
| 自定义源加载流程 | `/workspace/src/core/init/userApi/index.ts` |
| 桌面歌词 | `/workspace/android/app/src/main/java/cn/toside/music/mobile/lyric/` |
| 应用配置 | `/workspace/android/app/build.gradle` |
| CI/CD 流水线 | `/workspace/.github/workflows/` |

---

## 更新日志

### v1.8.4-362 (当前最新)

**播放详情页音质面板修复**：
- 修复设置面板音质标签与实际歌曲可用音质不一致的问题
- 原问题：全局设置选"母带"时，即使当前歌曲只有 320k，面板仍显示"母带"
- 修复逻辑：面板现根据当前歌曲的 `_qualitys` 判断实际可用音质
  - 优先检查临时覆盖音质（`tempPlayQuality`）是否在该歌曲中可用
  - 其次检查全局设置音质是否在该歌曲中可用
  - 都不支持时，取当前歌曲实际可用的最高音质
  - 仅在无 `_qualitys` 数据时回退到全局设置显示

**下载优化**：
- 下载音质降级策略优化：用 `_qualitys` 过滤降级顺序，跳过不可用音质直接尝试最高可用
- 降级间隔从 30 秒缩短为 5 秒
- 降级时 toast 提示用户实际下载品质

**播放缓存**：
- 新增播放缓存大小限制（`enforceCacheLimit`），超出时按添加顺序淘汰最旧文件
- 缓存大小设为 0 时完全禁用播放缓存
- `cachePlaybackMusic()` 改为由 `player.ts` 传入 `maxSizeMB` 参数

**播放详情页音质切换**（v1.8.4-354）：
- 新增播放详情页音质切换功能（`SettingPlayQuality.tsx` + `QualitySelectPopup.tsx`）
- 显示当前歌曲实际音质（`getTempPlayQuality()` 优先于全局设置）
- 切换后续播不重置进度；切歌自动恢复全局默认音质

**均衡器 PCM 格式支持**（v1.8.4-352~353）：
- `EqualizerAudioProcessor` 支持 PCM_FLOAT / PCM_24BIT / PCM_32BIT（解决 320k 缓冲问题）
- 修复 `isActive()` 恒返回 true，避免 media3 反复重建 AudioTrack

**快速切歌修复**（v1.8.4-355~358）：
- 回退 `TrackPlayer.reset()` 改动，恢复原始 `handlePlayMusic` 逻辑
- `reset()` 会导致 ExoPlayer 进入不稳定状态，快速切歌时更容易触发播放错误

**音质列表去重**（v1.8.4-358~359）：
- 修复下载音质列表出现两个"高品音质"的问题
- 恢复插件声明的高级音质显示（hires/atmos/atmos_plus/master）
- `extendQualityTypes` 不再添加 320k/192k/128k 到 `_types`，只补高品质
- 徽章显示增加 size 检查，避免虚标

**preload 脚本扩展**（v1.8.4-350）：
- `supportQualitys` 加入 master/hires/atmos/atmos_plus

**播放器缓冲超时优化**（v1.8.4-349）：
- 新增 `refreshUrl()` 统一 URL 刷新逻辑
- 长音频（10 分钟以上）允许最多 5 次自动刷新 URL 续播，普通音频最多 2 次
- 首轮播放强制 `isRefresh=true` 绕过缓存，修复下载可播但播放缓冲

**歌手简介与歌曲列表优化**：
- 新增歌手简介独立阅读页（`src/screens/SingerIntro/`，公众号风格）
- 五源歌手简介获取链路：本源优先 + 跨源兜底补齐（并行拉取取最长简介）
- 所有音乐源歌手歌曲列表补全音质信息，避免播放降级到慢 CDN
- kg 源降级时补默认 128k 音质；wy 源补全 `otherSource` 字段
- tx 源改用开源 GetSingerDetail(wiki) 接口，失败降级旧接口
- kw 源恢复 `getToken/tokenRequest` 鉴权机制
- 全量下载遇空页停止拉取；修复分页 `sourcePage` 序号错乱

**无障碍优化**：
- 进度滑块改用 `@react-native-community/slider`（底层 `AppCompatSeekBar`）
- 搜索建议列表用稳定 key；音乐列表主区显式 `accessible`
- 全面优化屏幕阅读器焦点跟手度

**其他**：
- 下载进度精确到 1%；修复取消下载弹窗问题
- 恢复 `.so` 压缩打包，减小 APK 体积
- 歌词点击跳转功能（竖屏和横屏歌词行改为 `TouchableOpacity`）
- 导出列表 SAF 写入失败修复
- 均衡器状态持久化到 SharedPreferences（重启后自动恢复，`enabled` 字段 `volatile`，读方法 `synchronized`）
- 播放速率控制（通知栏/蓝牙设备支持）
- 通知栏按钮文字中文化