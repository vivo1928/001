import Clipboard from '@react-native-clipboard/clipboard'
import { toast } from '@/utils/tools'

declare const __DEV__: boolean

let logs: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null

// 播放缓冲监控
let stallTimer: ReturnType<typeof setTimeout> | null = null
let stallTriggered = false
let sessionStart = 0
let stateSeq = 0
let lastState = ''
const STALL_TIMEOUT = 15000
const MAX_LOGS = 500

const isDev = () => {
  try { return __DEV__ } catch { return false }
}

export const isDebugLogEnabled = () => isDev()

const formatArg = (a: any): string => {
  if (a == null) return String(a)
  if (typeof a == 'string') return a
  try { return JSON.stringify(a) } catch { return String(a) }
}

const elapsed = () => (sessionStart ? `+${Date.now() - sessionStart}ms` : '')

export const clearDebugLogs = () => {
  if (!isDev()) return
  logs = []
  stallTriggered = false
  stateSeq = 0
  lastState = ''
}

export const collectDebugLog = (tag: string, ...args: any[]) => {
  if (!isDev()) return
  const line = `[${tag}] ${elapsed()} ${args.map(formatArg).join(' ')}`.trimEnd()
  logs.push(line)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  console.log(line)
}

export const getAllLogs = (): string => logs.join('\n')

export const getLogCount = (): number => logs.length

export const copyAllLogsToClipboard = () => {
  if (!isDev()) return
  const content = logs.join('\n')
  if (!content) {
    toast('暂无日志', 'short')
    return
  }
  Clipboard.setString(content)
  toast(`已复制 ${logs.length} 条日志到剪贴板`, 'long')
}

export const flushDebugLogs = (showToast = false) => {
  if (!isDev()) return
  if (!logs.length) return
  const content = logs.join('\n')
  logs = []
  Clipboard.setString(content)
  if (showToast) toast('播放/缓冲日志已复制到剪贴板，请粘贴发送', 'long')
  return content
}

export const scheduleCopyDebugLogs = (delay = 1600) => {
  if (!isDev()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flushDebugLogs()
  }, delay)
}

// 播放缓冲监控
export const startPlaybackBufferWatch = () => {
  if (!isDev()) return
  clearDebugLogs()
  sessionStart = Date.now()
  if (stallTimer) clearTimeout(stallTimer)
  collectDebugLog('pwatch', 'session start', new Date().toLocaleString())
  stallTimer = setTimeout(() => onStallDetected(), STALL_TIMEOUT)
}

const onStallDetected = () => {
  stallTimer = null
  if (stallTriggered) return
  stallTriggered = true
  collectDebugLog('pwatch', `STALL detected! no Playing/Ready within ${STALL_TIMEOUT}ms, last state=${lastState}`)
  flushDebugLogs(true)
}

export const reportPlaybackState = (state: string) => {
  if (!isDev()) return
  if (!stallTimer && !sessionStart) return
  if (!stallTimer) return
  stateSeq++
  lastState = state
  collectDebugLog('pstate', `${state} (seq=${stateSeq})`)
  if (state === 'Playing' || state === 'Ready' || state === 'Paused') {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = null
  }
}

export const stopPlaybackBufferWatch = () => {
  if (!isDev()) return
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = null
  sessionStart = 0
}