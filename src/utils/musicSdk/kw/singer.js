import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import musicSearch from './musicSearch'

/**
 * 带重试和延迟的酷我API请求
 */
async function fetchWithRetry(url, retryCount = 2) {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const requestObj = httpFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
          'Referer': 'https://www.kuwo.cn/',
        },
      })
      const { body, statusCode } = await requestObj.promise
      if (statusCode === 200 && body && body.code === 200 && body.data) return body
      if (attempt < retryCount) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
      }
    } catch (err) {
      if (attempt < retryCount) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  throw new Error('获取歌手专辑列表失败: 请求重试耗尽')
}

// 解码 HTML 实体（&nbsp;、&lt; 等）
const decodeHtml = (str) => String(str || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
  .replace(/&amp;/g, '&')

// 从歌手详情页 __NUXT__ 数据中解析歌手信息（简介/头像）
const parseSingerInfo = (html) => {
  const block = html.match(/singerInfo:\{[^}]*\}/s)?.[0]
  if (!block) return null
  const extract = (str, key) => {
    const re = new RegExp(key + ':"((?:[^"\\\\]|\\\\.)*)"')
    const m = str.match(re)
    if (!m) return ''
    try { return JSON.parse('"' + m[1] + '"') } catch { return m[1] }
  }
  return {
    name: extract(block, 'name'),
    img: extract(block, 'pic300') || extract(block, 'pic'),
    desc: decodeHtml(extract(block, 'info')),
  }
}

// 歌手信息缓存，避免分页时重复解析歌手详情页
const singerInfoCache = new Map()

// 酷我曲库会收录资讯站/专访/纯伴奏等非正规歌曲资源，过滤避免混入歌手单曲列表
const isNoiseItem = (item) => {
  const artist = decodeName(item.ARTIST || '')
  const name = decodeName(item.SONGNAME || '')
  if (/资讯站/.test(artist)) return true
  if (/专访/.test(name)) return true
  if (/伴奏/.test(name)) return true
  return false
}

export default {
  async getSingerInfo(singerid) {
    if (!singerid) throw new Error('歌手不存在')
    const requestObj = httpFetch(`https://www.kuwo.cn/singer_detail/${singerid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        'Referer': 'https://www.kuwo.cn/',
      },
    })
    const { body } = await requestObj.promise
    const html = typeof body === 'string' ? body : JSON.stringify(body || '')
    const info = parseSingerInfo(html)
    if (!info) throw new Error('获取歌手信息失败: 无法解析歌手简介')
    singerInfoCache.set(singerid, info)
    return {
      source: 'kw',
      singerid,
      info,
    }
  },
  async getSingerSongList(singerid, page, limit) {
    if (!singerid) throw new Error('歌手不存在')
    let singerInfo = singerInfoCache.get(singerid)
    if (!singerInfo) {
      singerInfo = (await this.getSingerInfo(singerid).catch(() => null))?.info || null
      if (singerInfo) singerInfoCache.set(singerid, singerInfo)
    }
    const singerName = singerInfo?.name || ''
    const searchParams = singerName
      ? `all=${encodeURIComponent(singerName)}&artistid=${singerid}`
      : `artistid=${singerid}`
    const requestObj = httpFetch(`https://search.kuwo.cn/r.s?client=kt&${searchParams}&pn=${page - 1}&rn=${limit}&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        'Referer': 'https://www.kuwo.cn/',
      },
    })
    const { body } = await requestObj.promise
    if (!body || (body.TOTAL !== '0' && body.SHOW === '0')) throw new Error('获取歌手歌曲列表失败: 无数据')
    const rawList = body.abslist || []
    if (!rawList.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')
    const total = Math.max(0, parseInt(body.TOTAL) || 0)
    const filteredList = rawList.filter(item => !isNoiseItem(item))
    const filteredCount = rawList.length - filteredList.length
    const list = musicSearch.handleResult(filteredList)
    if (!list.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')
    return {
      source: 'kw',
      list,
      id: `kw__singer_${singerid}`,
      singerid,
      total: filteredCount ? Math.max(0, total - filteredCount) : total,
      limit,
      allPage: Math.ceil((filteredCount ? Math.max(0, total - filteredCount) : total) / limit) || 1,
      info: {
        name: singerInfo?.name || '',
        img: singerInfo?.img || '',
        desc: singerInfo?.desc || '',
      },
    }
  },
  async getSingerAlbumList(singerid, page, limit) {
    if (!singerid) throw new Error('歌手不存在')
    const body = await fetchWithRetry(`https://www.kuwo.cn/api/www/artist/artistAlbum?artistid=${singerid}&pn=${page}&rn=${limit}&httpsStatus=1`)
    const rawList = body.data.albumList || []
    const albums = rawList.map(item => ({
      id: item.albumId || item.albumid,
      name: decodeName(item.albumName || item.name || ''),
      singer: decodeName(item.artist || item.ARTIST || ''),
      img: (item.pic || item.picpath || '') ? `https://img1.kuwo.cn/star/albumcover/${item.pic || item.picpath}` : '',
      source: 'kw',
      publish_date: item.pubTime || item.publish_date || item.releaseDate || '',
      song_count: item.song_count || item.total || 0,
    }))
    return {
      source: 'kw',
      albums,
      singerid,
      total: body.data.total || 0,
      allPage: Math.ceil((body.data.total || 0) / limit) || 1,
    }
  },
}