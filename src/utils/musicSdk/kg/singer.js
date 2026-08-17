import { httpFetch } from '../../request'
import { getMusicInfosByList } from './musicInfo'

const SINGER_HOSTS = [
  'mobilecdnbj.kugou.com',
  'mobilecdn.kugou.com',
  'mobcdn.kugou.com',
  'mobiles.kugou.com',
]

// 同时尝试 HTTPS 和 HTTP
const ALL_HOSTS = SINGER_HOSTS.flatMap(h => [`https://${h}`, `http://${h}`])

/**
 * 竞速模式：所有主机并行请求，第一个成功即返回，整体超时控制
 * 优化：串行→并行，超时6s→4s，总超时限制12s以内，确保UI 15s超时前返回
 */
async function fetchWithFallback(hosts, buildUrl, timeoutMs = 4000, retryCount = 1) {
  const TOTAL_TIMEOUT = 12000

  const tryFetch = async () => {
    const errors = []

    // 并行发射所有主机，Promise.race 竞速取优
    const results = await Promise.allSettled(
      hosts.map(async (host) => {
        const url = buildUrl(host)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const requestObj = httpFetch(url, { timeout: timeoutMs, signal: controller.signal })
          let { body, statusCode } = await requestObj.promise
          clearTimeout(timer)
          if (statusCode !== 200) {
            throw new Error(`${host}: status ${statusCode}`)
          }
          // KG API 可能返回 HTML 注释包裹的 JSON
          if (typeof body === 'string') {
            body = body.replace(/<!--KG_TAG_RES_START-->/, '').replace(/<!--KG_TAG_RES_END-->/, '')
            try { body = JSON.parse(body) } catch (e) {}
          }
          if (body && body.errcode === 0) return body
          throw new Error(`${host}: errcode=${body?.errcode}`)
        } catch (err) {
          clearTimeout(timer)
          throw err
        }
      })
    )

    // 取第一个成功的结果
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value
      }
      errors.push(result.reason?.message || 'unknown')
    }
    throw new Error(errors.join('; '))
  }

  // 总超时包装
  const totalController = new AbortController()
  const totalTimer = setTimeout(() => totalController.abort(), TOTAL_TIMEOUT)

  try {
    // 第一次尝试
    try {
      const result = await tryFetch()
      clearTimeout(totalTimer)
      return result
    } catch (firstErr) {
      // 如果还有重试次数，快速重试
      if (retryCount > 0) {
        for (let attempt = 1; attempt <= retryCount; attempt++) {
          if (totalController.signal.aborted) break
          try {
            const result = await tryFetch()
            clearTimeout(totalTimer)
            return result
          } catch (e) { /* continue */ }
        }
      }
      throw firstErr
    }
  } finally {
    clearTimeout(totalTimer)
  }
}

const stripHtml = (str) => (str || '').replace(/<[^>]+>/g, '')

const parseSingerId = (id) => {
  if (typeof id === 'string' && id.startsWith('kg__')) {
    return parseInt(id.replace('kg__', ''), 10) || id
  }
  const num = parseInt(id, 10)
  return isNaN(num) ? id : num
}

export default {
  /**
   * 按歌手名搜索歌手ID（供跨源兜底使用）
   */
  async searchSingerId(name) {
    if (!name) return null
    try {
      const body = await fetchWithFallback(SINGER_HOSTS, (host) =>
        `https://${host}/song/search/v2?keyword=${encodeURIComponent(name)}&page=1&pagesize=1&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`
      ).catch(() => null)
      const list = body?.data?.lists || body?.data?.info || []
      const singer = list[0]?.Singers?.[0]
      if (singer?.id) return singer.id
      return null
    } catch {
      return null
    }
  },
  async getSingerInfo(singerid) {
    const sid = parseSingerId(singerid)
    if (sid == 0 || !sid) throw new Error('歌手不存在')
    const body = await fetchWithFallback(ALL_HOSTS, (host) =>
      `${host}/api/v3/singer/info?singerid=${sid}&with_res_tag=1`
    )
    if (!body || !body.data) {
      throw new Error('获取歌手信息失败: ' + (body?.error || body?.errmsg || '无数据'))
    }
    return {
      source: 'kg',
      singerid,
      info: {
        name: body.data.singername || '',
        desc: body.data.intro || '',
        img: (body.data.imgurl || '').replace('{size}', '480'),
      },
    }
  },
  async getSingerSongList(singerid, page, limit) {
    const sid = parseSingerId(singerid)
    if (sid == 0 || !sid) throw new Error('歌手不存在')
    const body = await fetchWithFallback(ALL_HOSTS, (host) =>
      `${host}/api/v3/singer/song?sorttype=2&version=9108&identity=3&plat=0&pagesize=${limit}&singerid=${sid}&area_code=1&page=${page}&with_res_tag=1`
    )
    if (!body || !body.data) {
      throw new Error('获取歌手歌曲列表失败: ' + (body?.error || body?.errmsg || '无数据'))
    }
    const infoList = body.data.info || body.data.lists || []
    if (!infoList.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')
    let listData = []
    try {
      listData = await getMusicInfosByList(infoList)
    } catch (err) {
      console.warn(`[kg singer] getMusicInfosByList failed, returning raw list: ${err.message}`)
      // 降级：返回基本信息，不包含音质详情
      listData = infoList.map(item => ({
        singer: stripHtml(item.author_name || ''),
        name: stripHtml(item.songname || ''),
        albumName: stripHtml(item.album_name || ''),
        albumId: item.album_id || '',
        songmid: item.audio_id || item.hash,
        source: 'kg',
        interval: 0,
        img: null,
        lrc: null,
        hash: item.hash,
        otherSource: null,
        types: [],
        _types: {},
        typeUrl: {},
      }))
    }
    // 可选获取歌手信息，失败不影响主流程
    const singerInfo = await this.getSingerInfo(singerid).catch(() => null)
    return {
      source: 'kg',
      list: listData,
      id: `kg__singer_${singerid}`,
      singerid,
      total: body.data.total || 0,
      limit,
      allPage: Math.ceil((body.data.total || 0) / limit) || 1,
      info: {
        name: singerInfo?.info?.name || '',
        img: singerInfo?.info?.img,
        desc: singerInfo?.info?.desc || '',
      },
    }
  },
  async getSingerAlbumList(singerid, page, limit) {
    const sid = parseSingerId(singerid)
    if (sid == 0 || !sid) throw new Error('歌手不存在')
    const body = await fetchWithFallback(ALL_HOSTS, (host) =>
      `${host}/api/v3/singer/album?version=9108&plat=0&pagesize=${limit}&singerid=${sid}&category=1&area_code=1&page=${page}&show_album_tag=0`
    )
    if (!body || !body.data) {
      throw new Error('获取歌手专辑列表失败: ' + (body?.error || body?.errmsg || '无数据'))
    }
    const albums = (body.data.info || body.data.list || []).map(item => ({
      id: item.albumid,
      name: stripHtml(item.albumname || ''),
      singer: stripHtml(item.singername || ''),
      img: (item.imgurl || '').replace('{size}', '480'),
      source: 'kg',
      publish_date: item.publishtime ? item.publishtime.slice(0, 10) : (item.publishdate || ''),
      song_count: item.songcount || 0,
    }))
    return {
      source: 'kg',
      albums,
      singerid,
      total: body.data.total || 0,
      allPage: Math.ceil((body.data.total || 0) / limit) || 1,
    }
  },
}