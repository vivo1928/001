import { Platform } from 'react-native'
import { appendFile, externalStorageDirectoryPath, privateStorageDirectoryPath, stat, writeFile } from '@/utils/fs'
import { version } from '../../package.json'
import { isSensitiveKey, redactText } from '@/utils/redact'

// 全量诊断日志：所有用户操作、网络请求、自定义源交互、播放事件、错误都会写到这里。
// 文件放在用户可直接取回的根目录，便于无 adb 时排查问题。
const LOG_NAME = 'lx-app.log'
const MAX_SIZE = 4 * 1024 * 1024
const MAX_STRING = 500
const MAX_ARRAY = 20
const MAX_KEYS = 40
const MAX_DEPTH = 3
// 歌词/列表正文等大字段只记长度，避免日志被正文占满
const BULKY_KEYS = new Set(['lrc', 'tlrc', 'rlrc', 'lxlrc', 'rawlrc', 'rawLrc', 'musicInfos', 'list', 'lists', 'body', 'script'])

const extPath = `${externalStorageDirectoryPath}/${LOG_NAME}`
const privPath = `${privateStorageDirectoryPath}/${LOG_NAME}`

let size = 0
let queue: Promise<void> = Promise.resolve()
let sessionStarted = false

const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch(() => {})
}

const byteLength = (text: string) => {
  try {
    return typeof Buffer !== 'undefined' ? Buffer.byteLength(text, 'utf8') : text.length * 3
  } catch (_) {
    return text.length * 3
  }
}

const truncate = (text: string) =>
  text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…(+${text.length - MAX_STRING})` : text

const sanitize = (value: any, depth: number, seen: WeakSet<object>): any => {
  if (value == null) return value
  switch (typeof value) {
    case 'string':
      return truncate(redactText(value))
    case 'number':
    case 'boolean':
      return value
    case 'function':
      return '[function]'
    case 'symbol':
    case 'bigint':
      return String(value)
  }
  if (depth >= MAX_DEPTH) return '[deep]'
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(redactText(value.message)),
      stack: truncate(redactText(value.stack ?? '')),
    }
  }
  try {
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) {
      const out = value.slice(0, MAX_ARRAY).map(item => sanitize(item, depth + 1, seen))
      if (value.length > MAX_ARRAY) out.push(`…(+${value.length - MAX_ARRAY})`)
      return out
    }
    const out: Record<string, any> = {}
    let count = 0
    for (const key of Object.keys(value)) {
      if (count++ >= MAX_KEYS) {
        out['…'] = 'more'
        break
      }
      if (isSensitiveKey(key)) out[key] = '***'
      else if (BULKY_KEYS.has(key)) {
        const v = value[key]
        out[key] = `[${Array.isArray(v) || typeof v === 'string' ? v.length : 'obj'}]`
      } else out[key] = sanitize(value[key], depth + 1, seen)
    }
    return out
  } catch (_) {
    return '[unserializable]'
  }
}

const formatArgs = (args: any[]) => {
  const seen = new WeakSet<object>()
  return args.map(arg => {
    if (typeof arg === 'string') {
      // 纯文本行（脚本日志等）直接保留可读性，仅做脱敏
      return truncate(redactText(arg))
    }
    try {
      return JSON.stringify(sanitize(arg, 0, seen))
    } catch (_) {
      return '[unserializable]'
    }
  }).join(' ')
}

const writeLine = (line: string) => {
  const bytes = byteLength(line)
  if (size + bytes > MAX_SIZE) {
    size = 0
    enqueue(async() => {
      await writeFile(extPath, `${Date.now()} --- log truncated, older lines dropped ---\n`).catch(() => {})
    })
  }
  size += bytes
  enqueue(async() => {
    try {
      await appendFile(extPath, line)
    } catch (_) {
      await appendFile(privPath, line).catch(() => {})
    }
  })
}

const RATE_WINDOW = 1000
const RATE_MAX = 300
let windowStart = 0
let windowCount = 0
let droppedCount = 0

export const appLog = (tag: string, ...args: any[]) => {
  const now = Date.now()
  if (now - windowStart >= RATE_WINDOW) {
    windowStart = now
    if (droppedCount > 0) {
      const dropped = droppedCount
      droppedCount = 0
      writeLine(`${now} log rate limited, dropped ${dropped} lines\n`)
    }
    windowCount = 0
  }
  // 日志风暴保护：每秒最多 300 行，超出计数并在下个窗口汇总
  if (windowCount++ >= RATE_MAX) {
    droppedCount++
    return
  }
  const data = args.length ? ` ${formatArgs(args)}` : ''
  writeLine(`${now} ${tag}${data}\n`)
}

export const initAppLog = async() => {
  if (sessionStarted) return
  sessionStarted = true
  try {
    const info = await stat(extPath) as any
    const current = info?.size ?? 0
    if (typeof current === 'number') size = current
  } catch (_) { /* 文件不存在 */ }
  const model = (Platform.constants as any)?.Model ?? 'unknown'
  const rnVersion = (Platform.constants as any)?.reactNativeVersion
    ? Object.values((Platform.constants as any).reactNativeVersion).join('.')
    : 'unknown'
  appLog('session', `app v${version} | ${Platform.OS} api ${String(Platform.Version)} | ${model} | rn ${rnVersion} | start ${Date.now()}`)
}

