import { appendFile, externalStorageDirectoryPath, privateStorageDirectoryPath } from '@/utils/fs'

// 自定义源诊断日志：写入外部存储根目录，便于无 adb 时取回
const format = (args: any[]) => args.map(a => {
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch (_) {
    return String(a)
  }
}).join(' ')

export const userApiLog = (tag: string, ...args: any[]) => {
  const line = `[${new Date().toISOString()}] ${tag} ${format(args)}\n`
  try {
    void appendFile(`${externalStorageDirectoryPath}/lx-userapi.log`, line).catch(() => {
      void appendFile(`${privateStorageDirectoryPath}/lx-userapi.log`, line).catch(() => {})
    })
  } catch (_) { /* ignore */ }
}
