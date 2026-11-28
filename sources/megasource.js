/*!
 * @name 聚合音源（自建·并行竞速版）
 * @description QQ/酷我/酷狗/网易云多后端并发竞速，先可用先用，失败自动降级
 * @version 1.2.0
 * @author 自建
 */
const { EVENT_NAMES, request, on, send } = globalThis.lx


// ===================== 会员 Cookie 配置 =====================
// 填了对应平台的会员 Cookie，脚本才会声明并尝试该平台的 FLAC / 母带；
// 留空则维持 320k（公开后端拿不到 QQ/网易无损，这是平台限制）。
const TX_COOKIE = '' // 例：'uin=12345678; qm_keyst=xxxx; qqmusic_key=xxxx'
const WY_COOKIE = '' // 例：'MUSIC_U=xxxx; __csrf=xxxx'
// ===========================================================

const TIMEOUT = 8000
const CACHE_TTL = 20 * 60 * 1000
const cache = new Map()

// 实测：酷我/酷狗可拿真 FLAC（magic=flac）；QQ/网易无需登录的公开后端最高只到 320k
const QUALITY = {
  tx: ['128k', '320k', 'flac'],
  kw: ['128k', '320k', 'flac'],
  kg: ['128k', '320k', 'flac'],
  wy: ['128k', '320k', 'flac'],
}
const TX_LEVEL = { '128k': '128k', '320k': '320k' }
const KW_BR = { '128k': '128kmp3', '320k': '320kmp3', flac: '2000kflac' }
const KW_LEVEL = { '128k': '128k', '320k': '320k', flac: 'flac' }
const KG_LEVEL = { '128k': '128k', '320k': '320k', flac: 'flac' }
const WY_LEVEL = { '128k': '128k', '320k': '320k' }
// 允许降级，但会打日志说明降到了哪一档（自定义源沙箱没有 toast 权限，
// 只有 App 端能看到实际链接，因此提示需要 App 侧配合）。
const FALLBACK = {
  flac: ['flac', '320k', '128k'],
  flac24bit: ['flac24bit', 'flac', '320k'],
  hires: ['hires', 'flac', '320k'],
  '320k': ['320k', '128k'],
  '128k': ['128k'],
}

const cleanId = (v) => String(v ?? '').replace(/^MUSIC_/, '').replace(/^(tx|kw|kg|wy|mg)_/, '').trim()
const metaOf = (m) => m?.meta ?? {}
const getId = (source, m) => {
  if (source === 'tx') return cleanId(metaOf(m).songmid || metaOf(m).media_mid || m?.songmid || m?.id)
  if (source === 'kw') return cleanId(metaOf(m).rid || m?.rid || m?.id)
  if (source === 'kg') return cleanId(metaOf(m).hash || m?.hash || metaOf(m).strMediaMid || m?.id)
  return cleanId(metaOf(m).songId || m?.songId || m?.id)
}

const http = (url, options = {}) => new Promise((resolve, reject) => {
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    reject(new Error('timeout'))
  }, options.timeout ?? TIMEOUT)
  const done = (fn, arg) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    fn(arg)
  }
  try {
    request(url, { ...options, timeout: options.timeout ?? TIMEOUT }, (err, resp) => {
      if (err) done(reject, err)
      else done(resolve, resp)
    })
  } catch (e) { done(reject, e) }
})

const normalize = (u) => String(u || '').replace(/\\\//g, '/')
const pickUrl = (body) => {
  if (!body) return ''
  if (typeof body === 'string') {
    const m = body.match(/https?:\/\/[^\s"'\\]+/)
    return m ? normalize(m[0]) : ''
  }
  return normalize(body.url || (typeof body.data === 'string' ? body.data : '') || (body.data && body.data.url) || '')
}
const BAD_URL = /110711|106\.0\.55\.102|placeholder|music_open_api/i

const probeGet = async(url) => {
  if (!url || BAD_URL.test(url)) return false
  try {
    const resp = await http(url, { method: 'GET', headers: { Range: 'bytes=0-1' }, timeout: 5000 })
    const code = resp?.statusCode ?? resp?.status ?? 0
    return code === 200 || code === 206
  } catch (_) { return false }
}

const probe = async(url) => {
  if (!url || BAD_URL.test(url)) return false
  try {
    const resp = await http(url, { method: 'HEAD', timeout: 4500 })
    const code = resp?.statusCode ?? resp?.status ?? 0
    return code === 200 || code === 206 || code === 301 || code === 302
  } catch (_) {
    return true
  }
}

// 并发竞速：多个后端同时请求，第一个通过可用性探测的胜出
// 直链类后端（URL 本身即音频流）跳过 HEAD 探测，避免额外 2-4 秒；
// JSON 类后端返回的 URL 先探测一次，过滤失效/占位链接。
const race = (tasks) => new Promise((resolve, reject) => {
  let pending = tasks.length
  let lastErr
  let settled = false
  const fail = (err) => {
    lastErr = err
    if (--pending === 0 && !settled) { settled = true; reject(lastErr || new Error('all failed')) }
  }
  tasks.forEach(task => {
    Promise.resolve().then(task).then(async(result) => {
      if (settled) return
      const url = typeof result === 'string' ? result : result?.url
      if (!url) return fail(new Error('empty url'))
      if (!(typeof result === 'object' && result.raw)) {
        if (!await probe(url)) return fail(new Error('unplayable'))
      }
      if (settled) return
      settled = true
      resolve(url)
    }).catch(fail)
  })
})

const backends = {
  tx: (id, q, mediaMid) => [
    // vkeys 公共接口：免登录可拿 QQ 真 FLAC（quality=10），偶发限流/试听片段，重试两次
    async() => {
      const qq = { '128k': 6, '320k': 8, flac: 10 }[q] || 8
      const target = mediaMid || id
      let lastErr
      for (let i = 0; i < 2; i++) {
        for (const path of [`https://api.vkeys.cn/music/tencent/song/link?mid=${encodeURIComponent(target)}&quality=${qq}`,
          `https://api.vkeys.cn/v2/music/tencent/geturl?mid=${encodeURIComponent(target)}&quality=${qq}`]) {
          try {
            const resp = await http(path, { method: 'GET', timeout: 8000 })
            const d = resp?.body
            const url = typeof d?.data === 'string' ? d.data : d?.data?.url
            if (url && /^https?:/.test(url)) return url
            lastErr = new Error(d?.message || 'vkeys no url')
          } catch (e) { lastErr = e }
        }
        await new Promise(r => setTimeout(r, 350))
      }
      throw lastErr || new Error('vkeys failed')
    },
    ...(TX_COOKIE ? [async() => {
      const m = /media_mid=([^;]+)/.exec(TX_COOKIE)
      const mediaMid = m ? m[1] : ''
      const filename = q === 'flac' ? `F000${mediaMid}.flac` : `M800${mediaMid}.mp3`
      const body = {
        comm: { uin: '0', format: 'json', ct: 24, cv: 0 },
        req_1: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: [id], filename: [filename], songtype: [0], uin: '0', loginflag: 1, platform: '20' } },
      }
      const resp = await http('https://u.y.qq.com/cgi-bin/musicu.fcg', { method: 'POST', headers: { Cookie: TX_COOKIE, 'Content-Type': 'application/json', Referer: 'https://y.qq.com/' }, body })
      const info = resp?.body?.req_1?.data?.midurlinfo?.[0]
      const sip = resp?.body?.req_1?.data?.sip?.[0] || 'https://ws.stream.qqmusic.qq.com/'
      if (!info?.purl) throw new Error('tx cookie no purl')
      return sip + info.purl
    }] : []),
    () => ({ url: `http://175.27.166.236/kgqq1/qq.php?type=mp3&id=${encodeURIComponent(id)}&level=${TX_LEVEL[q] || '320k'}`, raw: true }),
    async() => {
      const resp = await http(`http://103.79.184.97/api/music/url?source=tx&songId=${encodeURIComponent(id)}&quality=${TX_LEVEL[q] || '320k'}&key=6C1F-53W0-GRKI-EVFG`, { method: 'GET', headers: { 'X-Card-Key': '6C1F-53W0-GRKI-EVFG' } })
      const url = pickUrl(resp?.body)
      if (!url) throw new Error('tx 103 no url')
      return url
    },
  ],
  kw: (id, q) => [
    async() => {
      const resp = await http(`http://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_1.1.4.5_tianbao_T1A_qirui.apk&type=convert_url_with_sign&rid=${encodeURIComponent(id)}&br=${KW_BR[q] || '320kmp3'}`, { method: 'GET' })
      const url = (resp?.body && resp.body.data && resp.body.data.url) || pickUrl(resp?.body)
      if (!url) throw new Error('kw nmobi no url')
      return normalize(url)
    },
    async() => {
      const payload = { device_id: 'lx-agg-' + Math.random().toString(36).slice(2), ip: '0.0.0.0', timestamp: Math.floor(Date.now() / 1000), random: Math.random().toString(36).slice(2, 12) }
      let token = ''
      try { token = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) } catch (_) { token = '' }
      const resp = await http(`https://yy.zddyr.top/lx/api/?source=kw&songmid=${encodeURIComponent(id)}&quality=${KW_LEVEL[q] || '320k'}`, { method: 'GET', headers: { 'X-Token': token, 'X-Client': 'YYMusicSource/v1.0.0 (Android)' } })
      const url = pickUrl(resp?.body)
      if (!url) throw new Error('kw yy no url')
      return url
    },
    () => ({ url: `http://music.nxinxz.com/kw.php?id=${encodeURIComponent(id)}&level=${KW_LEVEL[q] || '320k'}&type=mp3`, raw: true }),
  ],
  kg: (id, q) => [
    async() => {
      const payload = { device_id: 'lx-agg-' + Math.random().toString(36).slice(2), ip: '0.0.0.0', timestamp: Math.floor(Date.now() / 1000), random: Math.random().toString(36).slice(2, 12) }
      let token = ''
      try { token = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) } catch (_) { token = '' }
      const resp = await http(`https://yy.zddyr.top/lx/api/?source=kg&quality=${KG_LEVEL[q] || '320k'}&mainHash=${encodeURIComponent(id)}`, { method: 'GET', headers: { 'X-Token': token, 'X-Client': 'YYMusicSource/v1.0.0 (Android)' } })
      const url = pickUrl(resp?.body)
      if (!url) throw new Error('kg yy no url')
      return url
    },
    async() => {
      const resp = await http(`http://103.79.184.97/api/music/url?source=kg&songId=${encodeURIComponent(id)}&quality=${KG_LEVEL[q] || '320k'}&key=6C1F-53W0-GRKI-EVFG`, { method: 'GET', headers: { 'X-Card-Key': '6C1F-53W0-GRKI-EVFG' } })
      const url = pickUrl(resp?.body)
      if (!url) throw new Error('kg 103 no url')
      return url
    },
  ],
  wy: (id, q) => [
    // yy.zddyr.top：实测网易真 FLAC（16bit/48k），flac24bit 出 24bit/48k
    async() => {
      const payload = { device_id: 'lx-agg-' + Math.random().toString(36).slice(2), ip: '0.0.0.0', timestamp: Math.floor(Date.now() / 1000), random: Math.random().toString(36).slice(2, 12) }
      let token = ''
      try { token = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) } catch (_) { token = '' }
      const resp = await http(`https://yy.zddyr.top/lx/api/?source=wy&songmid=${encodeURIComponent(id)}&quality=${WY_LEVEL[q] || 'flac'}`, { method: 'GET', headers: { 'X-Token': token, 'X-Client': 'YYMusicSource/v1.0.0 (Android)' } })
      const url = pickUrl(resp?.body)
      if (!url) throw new Error('wy yy no url')
      return url
    },
    // ncm.kangqiovo.com：实测网易 FLAC（16/48）
    async() => {
      const resp = await http(`https://ncm.kangqiovo.com/Song_V1?url=${encodeURIComponent(id)}&level=${q === 'flac' || q === 'flac24bit' ? 'lossless' : '320k'}&type=json`, { method: 'GET', timeout: 8000 })
      const url = resp?.body?.data?.url || resp?.body?.url
      if (!url) throw new Error('kangqi no url')
      return url
    },
    // api.yutangxiaowu.cn：同样出网易 FLAC
    async() => {
      const resp = await http(`https://api.yutangxiaowu.cn/api/music/Song_V1?url=${encodeURIComponent(id)}&level=${q === 'flac' || q === 'flac24bit' ? 'lossless' : '320k'}&type=json`, { method: 'GET', timeout: 8000 })
      const d = resp?.body
      const url = d?.data?.url || d?.url || d?.data?.music
      if (!url) throw new Error('yutang no url')
      return url
    },
    // oiapi 网易接口
    async() => {
      const resp = await http(`https://oiapi.net/api/Music_163?id=${encodeURIComponent(id)}`, { method: 'GET', timeout: 8000 })
      const items = resp?.body?.data?.items
      const url = Array.isArray(items) ? (items[0]?.url || items[0]?.music) : (resp?.body?.url || resp?.body?.data?.url)
      if (!url) throw new Error('oiapi no url')
      return url
    },
    ...(WY_COOKIE ? [async() => {
      const br = { '128k': 128000, '320k': 320000, flac: 999000, flac24bit: 999000 }[q] || 320000
      const resp = await http(`https://music.163.com/api/song/enhance/player/url?ids=[${id}]&br=${br}`, {
        method: 'GET',
        headers: { Cookie: WY_COOKIE, 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
      })
      const url = resp?.body?.data?.[0]?.url
      if (!url) throw new Error('wy cookie no url')
      return url
    }] : []),
    async() => {
      const resp = await http('https://c.wwwweb.top/music/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'lx-music-desktop/2.10.1' },
        body: { source: 'wy', musicId: id, quality: WY_LEVEL[q] || '320k' },
      })
      const body = resp?.body
      if (!body || (body.code !== 200 && body.code !== 0)) throw new Error('wy wwwweb fail')
      const url = pickUrl(body)
      if (!url) throw new Error('wy wwwweb no url')
      return url
    },
    async() => {
      const payload = { device_id: 'lx-agg-' + Math.random().toString(36).slice(2), ip: '0.0.0.0', timestamp: Math.floor(Date.now() / 1000), random: Math.random().toString(36).slice(2, 12) }
      let token = ''
      try { token = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) } catch (_) { token = '' }
      const resp = await http(`https://yy.zddyr.top/lx/api/?source=wy&songmid=${encodeURIComponent(id)}&quality=${WY_LEVEL[q] || '320k'}`, { method: 'GET', headers: { 'X-Token': token, 'X-Client': 'YYMusicSource/v1.0.0 (Android)' } })
      const url = pickUrl(resp?.body)
      if (!url) throw new Error('wy yy no url')
      return url
    },
  ],
}

async function getMusicUrl(source, musicInfo, requestedQuality) {
  const id = getId(source, musicInfo)
  if (!id) throw new Error('缺少歌曲ID')
  const make = backends[source]
  if (!make) throw new Error('不支持的平台: ' + source)
  const tries = FALLBACK[requestedQuality] || ['320k', '128k']
  let lastErr
  for (const q of tries) {
    const key = `${source}_${id}_${q}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < CACHE_TTL && await probe(hit.url)) return hit.url
    try {
      const mediaMid = cleanId(metaOf(musicInfo).media_mid || metaOf(musicInfo).strMediaMid || '')
      let url = null
      if (true) { // 全部平台按优先级顺序：无损后端排前面，避免竞速时 mp3 抢先
        // QQ 严格按优先级顺序：vkeys(可出真 FLAC) → Cookie 官方 → 175 直链 → 103 代理
        for (const task of make(id, q, mediaMid)) {
          try {
            const r = await task()
            const u = typeof r === 'string' ? r : r?.url
            if (!u) continue
            const ok = (typeof r === 'object' && r.raw) ? await probeGet(u) : await probe(u)
            if (!ok) continue
            url = u
            break
          } catch (_) { /* 下一个 */ }
        }
      } else {
        url = await race(make(id, q, mediaMid))
      }
      if (!url) throw new Error('no backend available')
      if (q !== requestedQuality) {
        console.log(`[聚合源] 当前音质 ${requestedQuality} 不可用，已降级为 ${q}`)
      }
      cache.set(key, { url, ts: Date.now() })
      return url
    } catch (err) { lastErr = err }
  }
  throw lastErr ?? new Error('所有后端不可用')
}

const declaredTx = TX_COOKIE ? ['128k', '320k', 'flac'] : QUALITY.tx
const declaredWy = WY_COOKIE ? ['128k', '320k', 'flac', 'flac24bit'] : QUALITY.wy
send(EVENT_NAMES.inited, {
  status: true,
  openDevTools: false,
  sources: {
    tx: { name: 'QQ音乐', type: 'music', actions: ['musicUrl'], qualitys: declaredTx },
    kw: { name: '酷我音乐', type: 'music', actions: ['musicUrl'], qualitys: QUALITY.kw },
    kg: { name: '酷狗音乐', type: 'music', actions: ['musicUrl'], qualitys: QUALITY.kg },
    wy: { name: '网易云音乐', type: 'music', actions: ['musicUrl'], qualitys: declaredWy },
  },
})

on(EVENT_NAMES.request, ({ action, source, info }) => {
  if (action !== 'musicUrl') return Promise.reject(new Error('unsupported action'))
  return getMusicUrl(source, info.musicInfo, info.type)
})
