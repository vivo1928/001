import { appLog } from './appLog'

// 捕获全部 console 输出：源码里的调试日志、第三方库的告警、原生桥接错误都会进入全量日志。
// 必须在入口最前面引入，才能覆盖后续模块初始化阶段的日志。
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const
const originals: Record<string, (...args: any[]) => void> = {}
let capturing = false

for (const level of LEVELS) {
  const original = (console as any)[level]
  if (typeof original !== 'function') continue
  originals[level] = original.bind(console)
  ;(console as any)[level] = (...args: any[]) => {
    // 防止日志组件自身的输出再次被捕获造成递归
    if (!capturing) {
      capturing = true
      try {
        const first = args[0]
        if (!(typeof first === 'string' && first.startsWith('%c'))) {
          appLog(`console:${level}`, args.length === 1 ? args[0] : args)
        }
      } catch (_) { /* 忽略日志失败 */ }
      capturing = false
    }
    try {
      originals[level](...args)
    } catch (_) { /* 忽略 */ }
  }
}
