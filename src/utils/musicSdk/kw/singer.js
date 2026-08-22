import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import { getToken, tokenRequest, wbdCrypto } from './util'
import musicSearch from './musicSearch'

// 解码 HTML 实体
const decodeHtml = (str) => String(str || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
  .replace(/&amp;/g, '&')

// 从歌手详情页 __NUXT__ 数据中解析歌手信息
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

// 通用重试请求（用于 album 等接口）
const fetchWithRetry = async(url, retryCount = 2) => {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const requestObj = httpFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
          Referer: 'https://www.kuwo.cn/',
        },
      })
      const { body } = await requestObj.promise
      if (body && body.success && body.data) return body
      if (attempt < retryCount) {
        await new Promise(_resolve => setTimeout(_resolve, 300 * (attempt + 1)))
      }
    } catch (err) {
      if (attempt < retryCount) {
        await new Promise(_resolve => setTimeout(_resolve, 500 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  throw new Error('KW API request failed')
}

// 通过 wbdCrypto 加密签名调用 token 接口（token 失效时的兜底方案）
async function getSingerInfoViaWbd(singerid) {
  try {
    const params = wbdCrypto.buildParam({
      artistid: singerid,
      pn: 1,
      rn: 1,
    })
    const requestObj = httpFetch('https://wcd.kuwo.cn/wdclient/artists/musicinfo/v1.0?' + params, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        Referer: 'https://www.kuwo.cn/',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    const { body, statusCode } = await requestObj.promise
    if (statusCode === 200 && body && body.success && body.data) {
      const data = body.data
      return {
        name: data.artistName || data.name || '',
        image: data.pic || data.pic300 || data.avatar || '',
        desc: String(data.desc || '').trim(),
        song_count: data.songCount || 0,
        album_count: data.albumCount || 0,
      }
    }
  } catch (err) {
    console.log(`[kw singer] wbd request failed: ${err?.message || err}`)
  }
  return null
}

// 歌手信息缓存，避免分页时重复请求
const singerInfoCache = new Map()

// 过滤酷我曲库中资讯站/专访/纯伴奏等非歌曲杂质
const isNoiseItem = (item) => {
  const artist = decodeName(item.ARTIST || '')
  const name = decodeName(item.SONGNAME || '')
  if (/资讯站/.test(artist)) return true
  if (/专访/.test(name)) return true
  if (/伴奏/.test(name)) return true
  return false
}

export default {
  /**
   * 按歌手名搜索歌手ID（供跨源兜底使用）
   */
  async searchSingerId(name) {
    if (!name) return null
    try {
      const requestObj = httpFetch(`https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(name)}&pn=0&rn=1&ft=artist&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
          Referer: 'https://www.kuwo.cn/',
        },
      })
      const { body } = await requestObj.promise
      const list = body?.abslist || []
      if (list.length && list[0].ARTISTID) return list[0].ARTISTID
      return null
    } catch {
      return null
    }
  },
  /**
   * 获取歌手信息（简介/头像）
   * 优先使用 token 鉴权接口访问最新歌手信息，失败降级 singer_detail 页面解析
   */
  async getSingerInfo(singerid) {
    if (!singerid) throw new Error('歌手不存在')

    // 1. 尝试 token 鉴权接口（可获得最新简介）
    try {
      const token = await getToken()
      if (token) {
        const requestObj = tokenRequest(`https://www.kuwo.cn/api/www/singer/singerInfo?pid=${singerid}&httpsStatus=1`)
        const { statusCode, body } = await requestObj.promise
        if (statusCode === 200 && body && body.success && body.data) {
          const data = body.data
          const desc = String(data.desc || '').trim()
          const name = data.name || data.singerName || ''
          if (desc || name) {
            return {
              source: 'kw',
              singerid,
              info: {
                name,
                img: data.pic || data.pic300 || data.avatar || '',
                desc,
              },
            }
          }
        }
      }
    } catch (err) {
      console.log(`[kw singer] tokenRequest failed, try wbd: ${err?.message || err}`)
    }

    // 2. 兜底：wbdCrypto 加密签名接口
    const wbdData = await getSingerInfoViaWbd(singerid)
    if (wbdData) {
      return {
        source: 'kw',
        singerid,
        info: wbdData,
      }
    }

    // 3. 最终降级：解析 singer_detail 页面
    const requestObj = httpFetch(`https://www.kuwo.cn/singer_detail/${singerid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        Referer: 'https://www.kuwo.cn/',
      },
    })
    const { body } = await requestObj.promise
    const html = typeof body === 'string' ? body : JSON.stringify(body || '')
    const info = parseSingerInfo(html)
    if (!info) throw new Error('获取歌手信息失败: 所有端点均无法获取数据')
    return {
      source: 'kw',
      singerid,
      info,
    }
  },
  async getSingerSongList(singerid, page, limit, singerName) {
    if (!singerid) throw new Error('歌手不存在')
    // singerName 从 singerDetailState 传入，避免额外 API 调用
    if (!singerName) {
      let singerInfo = singerInfoCache.get(singerid)
      singerName = singerInfo?.name || ''
      // 快速路径：用轻量级 artist 搜索 API 获取歌手名
      if (!singerName) {
        try {
          const resp = await httpFetch(`https://search.kuwo.cn/r.s?client=kt&artistid=${singerid}&pn=0&rn=1&ft=artist&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
              Referer: 'https://www.kuwo.cn/',
            },
          })
          const { body } = await resp.promise
          const list = body?.abslist || []
          if (list.length && list[0].ARTIST) {
            singerName = decodeName(list[0].ARTIST)
            singerInfoCache.set(singerid, { name: singerName })
          }
        } catch {}
      }
      // 兜底：getSingerInfo 鉴权链（慢，仅在快速路径失败时使用）
      if (!singerName) {
        const info = (await this.getSingerInfo(singerid).catch(() => null))?.info || null
        if (info) {
          singerName = info.name || ''
          singerInfoCache.set(singerid, info)
        }
      }
    }
    const searchParams = singerName
      ? `all=${encodeURIComponent(singerName)}&artistid=${singerid}`
      : `artistid=${singerid}`
    const requestObj = httpFetch(`https://search.kuwo.cn/r.s?client=kt&${searchParams}&pn=${page - 1}&rn=${limit}&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        Referer: 'https://www.kuwo.cn/',
      },
    })
    const { body } = await requestObj.promise
    if (!body || (body.TOTAL !== '0' && body.SHOW === '0')) throw new Error('获取歌手歌曲列表失败: 无数据')
    const rawList = body.abslist || []
    if (!rawList.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')
    const total = Math.max(0, parseInt(body.TOTAL) || 0)
    const filteredList = rawList.filter(item => {
      if (isNoiseItem(item)) return false
      if (singerName) {
        const artist = decodeName(item.ARTIST || '')
        if (!artist.includes(singerName)) return false
      }
      return true
    })
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
