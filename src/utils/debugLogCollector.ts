import Clipboard from '@react-native-clipboard/clipboard'
import { toast } from '@/utils/tools'

let logs: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null

// ── 播放缓冲监控 ──
let stallTimer: ReturnType<typeof setTimeout> | null = null
let stallTriggered = false
let sessionStart = 0
let stateSeq = 0
let lastState = ''
const STALL_TIMEOUT = 15000

export const clearDebugLogs = () => {
  logs = []
  stallTriggered = false
  stateSeq = 0
  lastState = ''
}

const formatArg = (a: any): string => {
  if (a == null) return String(a)
  if (typeof a == 'string') return a
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

const elapsed = () => (sessionStart ? `+${Date.now() - sessionStart}ms` : '')

export const collectDebugLog = (tag: string, ...args: any[]) => {
  const line = `[${tag}] ${elapsed()} ${args.map(formatArg).join(' ')}`.trimEnd()
  logs.push(line)
  console.log(line)
}

export const flushDebugLogs = (showToast = false) => {
  if (!logs.length) return
  const content = logs.join('\n')
  logs = []
  Clipboard.setString(content)
  if (showToast) toast('播放/缓冲日志已复制到剪贴板，请粘贴发送', 'long')
  return content
}

export const scheduleCopyDebugLogs = (delay = 1600) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flushDebugLogs()
  }, delay)
}

// 开始一次播放会话的缓冲监控（在开始获取 URL 前调用）
export const startPlaybackBufferWatch = () => {
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
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = null
  sessionStart = 0
}
