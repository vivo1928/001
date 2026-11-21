import { appLog } from './appLog'

// 首屏搜索的源主机（取自实测日志）。每个源第一次搜索都要付 DNS + TCP + TLS，
// 实测 connect 60–130ms、TLS 40–95ms；进搜索页时先发一个轻量 HEAD 预热连接池，
// 用户真正发起搜索时就能复用同一 OkHttp 连接，省掉握手时间。
const WARMUP_HOSTS = [
  'https://u.y.qq.com/',
  'https://search.kuwo.cn/',
  'https://songsearch.kugou.com/',
  'https://interface.music.163.com/',
  'https://jadeite.migu.cn/',
  // 咪咕搜索的第二条快接口（双接口竞速用），一并预热
  'https://app.c.nf.migu.cn/',
]
const WARMUP_TIMEOUT = 3000

let warmed = false

export const warmupSearchHosts = () => {
  if (warmed) return
  warmed = true
  const anyGlobal = global as any
  const fetchFn = anyGlobal.fetch
  if (typeof fetchFn != 'function') return
  appLog('search:warmup', { hosts: WARMUP_HOSTS.length })
  for (const url of WARMUP_HOSTS) {
    try {
      const controller = new anyGlobal.AbortController()
      const timer = setTimeout(() => {
        try { controller.abort() } catch (_) { /* ignore */ }
      }, WARMUP_TIMEOUT)
      Promise.resolve(fetchFn(url, { method: 'HEAD', signal: controller.signal }))
        .catch(() => { /* 预热失败不影响搜索 */ })
        .then(() => clearTimeout(timer))
    } catch (_) { /* ignore */ }
  }
}
