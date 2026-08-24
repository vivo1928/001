import Clipboard from '@react-native-clipboard/clipboard'
import { toast } from '@/utils/tools'

// 调试日志总开关
// 发布正式版时将此值改为 false 即可禁用全部日志功能
const ENABLE_DEBUG_LOG = true

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

const isEnabled = () => ENABLE_DEBUG_LOG

export const isDebugLogEnabled = () => isEnabled()

const formatArg = (a: any): string => {
  if (a == null) return String(a)
  if (typeof a == 'string') return a
  try { return JSON.stringify(a) } catch { return String(a) }
}

const elapsed = () => (sessionStart ? `+${Date.now() - sessionStart}ms` : '')

export const clearDebugLogs = () => {
  if (!isEnabled()) return
  logs = []
  stallTriggered = false
  stateSeq = 0
  lastState = ''
}

export const collectDebugLog = (tag: string, ...args: any[]) => {
  if (!isEnabled()) return
  const line = `[${tag}] ${elapsed()} ${args.map(formatArg).join(' ')}`.trimEnd()
  logs.push(line)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  console.log(line)
}

export const getAllLogs = (): string => logs.join('\n')

export const getLogCount = (): number => logs.length

export const copyAllLogsToClipboard = () => {
  if (!isEnabled()) return
  const content = logs.join('\n')
  if (!content) {
    toast('暂无日志', 'short')
    return
  }
  Clipboard.setString(content)
  toast(`已复制 ${logs.length} 条日志到剪贴板`, 'long')
}

export const flushDebugLogs = (showToast = false) => {
  if (!isEnabled()) return
  if (!logs.length) return
  const content = logs.join('\n')
  logs = []
  Clipboard.setString(content)
  if (showToast) toast('播放/缓冲日志已复制到剪贴板，请粘贴发送', 'long')
  return content
}

export const scheduleCopyDebugLogs = (delay = 1600) => {
  if (!isEnabled()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flushDebugLogs()
  }, delay)
}

// 开始一次播放会话的缓冲监控（在开始获取 URL 前调用）
export const startPlaybackBufferWatch = () => {
  if (!isEnabled()) return
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

// 上报 TrackPlayer 状态，用于判断缓冲是否卡住
export const reportPlaybackState = (state: string) => {
  if (!isEnabled()) return
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

// 停止监控（播放完成/出错等）
export const stopPlaybackBufferWatch = () => {
  if (!isEnabled()) return
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = null
  sessionStart = 0
}
