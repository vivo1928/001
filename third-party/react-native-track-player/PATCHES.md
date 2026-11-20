# 本地补丁说明

来源: https://github.com/lyswhut/react-native-track-player @ d76fe8ff483548a022f29e8b3e8f33111e9c28b6 (v2.1.2)

## 为什么本地化

RN 0.85 新架构（bridgeless）下 `ReactInstanceManager` 已不可用（构造即抛
`UnsupportedOperationException: ReactInstanceManager.createReactContext is unsupported`），
原库 `HeadlessJsTaskService.startTask` 与 `MusicService.onStartForeground` 直接使用它，
导致 `MusicService` 启动即崩溃（`Unable to start service`）。

## 补丁内容

- `HeadlessJsTaskService`: 新增 `getReactHostCompat()`（反射调用 Application.getReactHost()
  拿 ReactHost）与 `getCurrentReactContextCompat()`；`startTask`/`onDestroy` 优先走
  ReactHost（等待实例就绪后启动 headless task），仅在拿不到 ReactHost 时回退旧架构实现。
- `MusicService.onStartForeground`: 改用 `getCurrentReactContextCompat()` 判断前台 Activity。

升级 RNTP 时需将同样的修改移植到新版本源码。
