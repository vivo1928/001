import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import { getToken, tokenRequest, wbdCrypto } from './util'

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
