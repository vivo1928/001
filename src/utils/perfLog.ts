import { appendFile, externalStorageDirectoryPath, privateStorageDirectoryPath, writeFile } from '@/utils/fs'

// 性能诊断日志：与 lx-userapi.log 一样写到用户可取回的位置，
// 用于定位“排行榜/列表加载慢”究竟慢在网络、解析还是渲染。
const LOG_NAME = 'lx-perf.log'
const MAX_SIZE = 512 * 1024

let size = 0
let queue: Promise<void> = Promise.resolve()

const serialize = (data: any) => {
  if (data == null) return ''
  if (typeof data == 'string') return data
  try {
    return JSON.stringify(data)
  } catch (_) {
    return String(data)
  }
}

const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch(() => {})
}

export const perfLog = (tag: string, data?: any) => {
  const line = `${Date.now()} ${tag} ${serialize(data)}\n`
  const externalPath = `${externalStorageDirectoryPath}/${LOG_NAME}`
  const privatePath = `${privateStorageDirectoryPath}/${LOG_NAME}`
  size += line.length
  const needReset = size > MAX_SIZE
  if (needReset) size = 0
  enqueue(async() => {
    if (needReset) await writeFile(externalPath, '').catch(() => {})
    try {
      await appendFile(externalPath, line)
    } catch (_) {
      await appendFile(privatePath, line).catch(() => {})
    }
  })
}

/** 记录从调用到回调的耗时（毫秒），data 会与 ms 合并写入 */
export const perfTimer = (tag: string) => {
  const start = Date.now()
  return (data?: Record<string, any>) => {
    perfLog(tag, data ? { ms: Date.now() - start, ...data } : { ms: Date.now() - start })
  }
}
