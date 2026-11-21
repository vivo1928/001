import '@/utils/errorHandle'
import { init as initLog } from '@/utils/log'
import { bootLog, getBootLog } from '@/utils/bootLog'
import '@/config/globalData'
import { getFontSize } from '@/utils/data'
import { exitApp } from './utils/nativeModules/utils'
import { windowSizeTools } from './utils/windowSizeTools'
import { listenLaunchEvent } from './navigation/regLaunchedEvent'
import { tipDialog } from './utils/tools'
import { initScreenReaderState } from './utils/a11y'
import { appLog, initAppLog } from './utils/appLog'

// 高频进度类事件不落盘，其余事件（切页/播放/配置/列表增删/音源切换等）全部记录
const IGNORE_LOG_EVENTS = new Set([
  'playProgressChanged',
  'versionDownloadProgressUpdated',
  'fetchingListStatusUpdated',
])
;(global as any).lxLogEvent = (name: string, args: any[]) => {
  if (IGNORE_LOG_EVENTS.has(name)) return
  if (args.length === 0) appLog(`event:${name}`)
  else if (args.length === 1) appLog(`event:${name}`, args[0])
  else appLog(`event:${name}`, args)
}
void initAppLog()

console.log('starting app...')
void initScreenReaderState()
listenLaunchEvent()

void Promise.all([getFontSize(), windowSizeTools.init()]).then(async([fontSize]) => {
  global.lx.fontSize = fontSize
  bootLog('Font size setting loaded.')

  let isInited = false
  let handlePushedHomeScreen: () => void | Promise<void>

  const tryGetBootLog = () => {
    try {
      return getBootLog()
    } catch (err) {
      return 'Get boot log failed.'
    }
  }

  const handleInit = async() => {
    if (isInited) return
    void initLog()
    const { default: init } = await import('@/core/init')
    try {
      handlePushedHomeScreen = await init()
    } catch (err: any) {
      void tipDialog({
        title: '初始化失败 (Init Failed)',
        message: `Boot Log:\n${tryGetBootLog()}\n\n${(err.stack ?? err.message) as string}`,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => {
        exitApp()
      })
      return
    }
    isInited ||= true
  }
  const { init: initNavigation, navigations } = await import('@/navigation')

  initNavigation(async() => {
    await handleInit()
    if (!isInited) return
    // import('@/utils/nativeModules/cryptoTest')

    await navigations.pushHomeScreen().then(() => {
      void handlePushedHomeScreen()
    }).catch((err: any) => {
      void tipDialog({
        title: 'Error',
        message: err.message,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => {
        exitApp()
      })
    })
  })
}).catch((err) => {
  void tipDialog({
    title: '初始化失败 (Init Failed)',
    message: `Boot Log:\n\n${(err.stack ?? err.message) as string}`,
    btnText: 'Exit',
    bgClose: false,
  }).then(() => {
    exitApp()
  })
})
