// 记录自定义源请求时实际使用的请求头，供播放器拉取“同域名”音频时复用，
// 避免 CDN 因缺少 UA/Referer/X-Token 等头信息拒绝（403）。
const hostHeaders = new Map<string, Record<string, string>>()

const getHost = (url: string) => {
  try {
    return new URL(url).host.toLowerCase()
  } catch (_) {
    return null
  }
}

export const recordUserApiHeaders = (url: string, headers?: Record<string, any> | null) => {
  if (!headers) return
  const host = getHost(url)
  if (!host) return
  const picked: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v !== 'string' || !v) continue
    picked[k] = v
  }
  if (Object.keys(picked).length) hostHeaders.set(host, picked)
}

// 仅对完全相同的域名复用，避免把令牌/凭据带到第三方 CDN
export const getRecordedHeaders = (url: string): Record<string, string> | undefined => {
  const host = getHost(url)
  if (!host) return undefined
  return hostHeaders.get(host)
}
