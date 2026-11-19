import { Alert } from 'react-native'
// import { exitApp } from '@/utils/common'
import { setJSExceptionHandler, setNativeExceptionHandler } from 'react-native-exception-handler'
import { log } from '@/utils/log'
import { toast } from './tools'
import { appendFile, externalStorageDirectoryPath, privateStorageDirectoryPath } from '@/utils/fs'

// 把崩溃信息写到用户可取到的位置，便于无 adb 环境排查
const persistCrash = (title: string, text: string) => {
  const content = `\n===== ${new Date().toISOString()} ${title} =====\n${text}\n`
  try {
    void appendFile(`${externalStorageDirectoryPath}/lx-crash.log`, content).catch(() => {
      void appendFile(`${privateStorageDirectoryPath}/lx-crash.log`, content).catch(() => {})
    })
  } catch (_) { /* ignore */ }
}

const errorHandler = (e: Error, isFatal: boolean) => {
  const excludedErrors = [
    'Failed to construct \'Response\'',
  ]
  if (isFatal) {
    if (excludedErrors.some((excludedError) => e.message.includes(excludedError))) {
      toast('应用遇到了错误，如果你有固定的复现方式，请截图并在 GitHub 反馈（并附上具体的操作步骤，以及“设置-错误日志”的内容）')
    } else {
      Alert.alert(
        '💥Unexpected error occurred💥',
        `
  应用出 bug 了😭，以下是错误异常信息。请截图并在 GitHub 反馈（并附上刚才你进行了什么操作，以及附上“设置-错误日志”的内容）。现在应用可能会出现异常，若出现异常请尝试强制结束应用后重新启动！

  Error:
  ${isFatal ? 'Fatal:' : ''} ${e.name} ${e.message}
  `,
        [{
          text: '关闭 (Close)',
          onPress: () => {
            // exitApp()
          },
        }],
      )
    }
  }
  log.error(e.stack)
  persistCrash('JS crash', `${e.name} ${e.message}\n${e.stack ?? ''}`)
}

if (process.env.NODE_ENV !== 'development') {
  setJSExceptionHandler(errorHandler)

  setNativeExceptionHandler((errorString) => {
    log.error(errorString)
    persistCrash('Native crash', String(errorString))
    console.log('+++++', errorString, '+++++')
  }, false)

  // 未处理的 Promise 拒绝也落盘，避免静默失败无迹可查
  const globalAny = global as any
  if (typeof globalAny.addEventListener === 'function') {
    globalAny.addEventListener('unhandledrejection', (e: any) => {
      const reason = e?.reason
      log.error(`Unhandled promise rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`)
    })
  }
}
