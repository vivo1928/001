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
 * 向多个主机依次请求，第一个成功即返回；支持重试整个循环
 */
async function fetchWithFallback(hosts, buildUrl, timeoutMs = 6000, retryCount = 2) {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const errors = []
    for (const host of hosts) {
      try {
        const url = buildUrl(host)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const requestObj = httpFetch(url, { timeout: timeoutMs, signal: controller.signal })
        let { body, statusCode } = await requestObj.promise
        clearTimeout(timer)
        if (statusCode !== 200) {
          errors.push(`${host}: status ${statusCode}`)
          continue
        }
        // KG API 可能返回 HTML 注释包裹的 JSON
        if (typeof body === 'string') {
          body = body.replace(/<!--KG_TAG_RES_START-->/, '').replace(/<!--KG_TAG_RES_END-->/, '')
          try { body = JSON.parse(body) } catch (e) {}
        }
        // 检查业务状态码
        if (body && body.errcode === 0) return body
        errors.push(`${host}: errcode=${body?.errcode}`)
      } catch (err) {
        errors.push(`${host}: ${err.message || err}`)
      }
    }
    if (attempt < retryCount) {
      // 重试前等待一小段时间，避免立即重试仍失败
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new Error('KG API all hosts failed: ' + SINGER_HOSTS.join(', '))
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