import { appLog } from './appLog'

// 自定义源诊断：统一写入全量日志，tag 前缀 userapi: 便于检索
export const userApiLog = (tag: string, ...args: any[]) => {
  appLog(`userapi:${tag}`, ...args)
}
