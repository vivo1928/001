export const requestMsg = {
  fail: '请求异常😮，可以多试几次，若还是不行就换一首吧。。。',
  unachievable: '哦No😱...接口无法访问了！',
  timeout: '请求超时',
  // unachievable: '哦No😱...接口无法访问了！已帮你切换到临时接口，重试下看能不能播放吧~',
  notConnectNetwork: '无法连接到服务器',
  cancelRequest: '取消http请求',
  tooManyRequests: '服务器繁忙',
} as const

/**
 * 判断错误是否属于"网络不可用"（断网/连接失败/超时）。
 * 用于在线刷新链接失败时回退到旧链接、命中磁盘缓存离线播放。
 */
export const isOfflineError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : '')
  if (!message) return false
  return message === requestMsg.notConnectNetwork ||
    message === requestMsg.timeout ||
    /network request failed|network error|failed to fetch|enotfound|econnrefused|etimedout|offline/i.test(message)
}

