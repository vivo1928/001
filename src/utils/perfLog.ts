import { appLog } from './appLog'

// 性能计时统一写入全量日志（tag 前缀 perf:）
export const perfLog = (tag: string, data?: any) => {
  if (data === undefined) appLog(`perf:${tag}`)
  else appLog(`perf:${tag}`, data)
}

/** 记录从调用到回调的耗时（毫秒），data 会与 ms 合并写入 */
export const perfTimer = (tag: string) => {
  const start = Date.now()
  return (data?: Record<string, any>) => {
    perfLog(tag, data ? { ms: Date.now() - start, ...data } : { ms: Date.now() - start })
  }
}
