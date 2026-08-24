import Clipboard from '@react-native-clipboard/clipboard'

let logs: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null

export const clearDebugLogs = () => {
  logs = []
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

export const collectDebugLog = (tag: string, ...args: any[]) => {
  const line = `[${tag}] ${args.map(formatArg).join(' ')}`
  logs.push(line)
  console.log(line)
}

export const flushDebugLogs = () => {
  if (!logs.length) return
  const content = logs.join('\n')
  logs = []
  Clipboard.setString(content)
  return content
}

export const scheduleCopyDebugLogs = (delay = 1600) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flushDebugLogs()
  }, delay)
}
