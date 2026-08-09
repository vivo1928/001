import { httpFetch } from '../../request'
import { decodeName } from '../../index'

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

export default {
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