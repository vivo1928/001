// 记录自定义源请求时实际使用的请求头（UA/Referer/Cookie），
// 供播放器在拉取同域名音频时复用，避免 CDN 因缺少头信息拒绝（403）。
interface RecordedHeaders { [key: string]: string }

const hostHeaders = new Map<string, RecordedHeaders>()
const keys = ['user-agent', 'referer', 'cookie']

const getHost = (url: string) => {
  try {
    return new URL(url).host.toLowerCase()
  } catch (_) {
    return null
  }
}

export const recordUserApiHeaders = (url: string, headers?: Record<string, string> | null) => {
  if (!headers) return
  const host = getHost(url)
  if (!host) return
  const picked: RecordedHeaders = {}
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase()
    if (!keys.includes(lk) || typeof v !== 'string' || !v) continue
    picked[lk === 'user-agent' ? 'User-Agent' : lk === 'referer' ? 'Referer' : 'Cookie'] = v
  }
  if (Object.keys(picked).length) hostHeaders.set(host, picked)
}

export const getRecordedHeaders = (url: string): RecordedHeaders | undefined => {
  const host = getHost(url)
  if (!host) return undefined
  if (hostHeaders.has(host)) return hostHeaders.get(host)
  for (const [h, v] of hostHeaders) {
    if (host.endsWith(`.${h}`) || h.endsWith(`.${host}`)) return v
  }
  return undefined
}
