import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import { formatSinger, objStr2JSON } from './util'

export default {
  limit_list: 36,
  limit_song: 1000,
  filterListDetail(rawList, albumName, albumId) {
    return rawList.map((item, inedx) => {
      let formats = item.formats.split('|')
      let types = []
      let _types = {}
      if (formats.includes('MP3128')) {
        types.push({ type: '128k', size: null })
        _types['128k'] = {
          size: null,
        }
      }
      if (formats.includes('MP3H')) {
        types.push({ type: '320k', size: null })
        _types['320k'] = {
          size: null,
        }
      }
      if (formats.includes('ALFLAC')) {
        types.push({ type: 'flac', size: null })
        _types.flac = {
          size: null,
        }
      }
      if (formats.includes('HIRFLAC')) {
        types.push({ type: 'flac24bit', size: null })
        _types.flac24bit = {
          size: null,
        }
      }
      return {
        singer: formatSinger(decodeName(item.artist)),
        name: decodeName(item.name),
        albumName,
        albumId,
        songmid: item.id,
        source: 'kw',
        interval: null,
        img: item.pic,
        lrc: null,
        otherSource: null,
        types,
        _types,
        typeUrl: {},
      }
    })
  },
  formatPlayCount(num) {
    if (num > 100000000) return parseInt(num / 10000000) / 10 + '亿'
    if (num > 10000) return parseInt(num / 1000) / 10 + '万'
    return num
  },
  /**
   * 新版 API: 尝试使用 www.kuwo.cn 的接口
   */
  async getAlbumListDetailNew(id, page, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('try max num'))
    try {
      const requestObj = httpFetch(`https://www.kuwo.cn/api/www/album/albumInfo?albumId=${id}&pn=${page}&rn=${this.limit_song}&httpsStatus=1`, {
        headers: {
          'Referer': 'https://www.kuwo.cn/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'csrf': '1',
          'Cookie': 'kw_token=1',
        },
      })
      const { statusCode, body } = await requestObj.promise
      if (statusCode !== 200 || !body || body.code !== 200) {
        return this.getAlbumListDetailNew(id, page, ++retryNum)
      }
      const data = body.data
      if (!data || !data.musicList) {
        return this.getAlbumListDetailNew(id, page, ++retryNum)
      }
      return {
        list: this.filterListDetail(data.musicList, data.album, data.albumId),
        page,
        limit: this.limit_song,
        total: data.total || 0,
        source: 'kw',
        info: {
          name: data.album || '',
          img: data.pic || '',
          desc: data.albuminfo || '',
          author: data.artist || '',
        },
      }
    } catch (err) {
      return this.getAlbumListDetailNew(id, page, ++retryNum)
    }
  },
  /**
   * 旧版 API: 使用 search.kuwo.cn 的接口（作为降级）
   */
  getAlbumListDetail(id, page, retryNum = 0) {
    // 优先尝试新版 API
    return this.getAlbumListDetailNew(id, page, retryNum).catch(() => {
      // 新版 API 失败，降级到旧版
      return this._getAlbumListDetailOld(id, page, retryNum)
    })
  },
  _getAlbumListDetailOld(id, page, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('try max num'))
    const requestObj_listDetail = httpFetch(`https://search.kuwo.cn/r.s?pn=${page - 1}&rn=${this.limit_song}&stype=albuminfo&albumid=${id}&show_copyright_off=0&encoding=utf&vipver=MUSIC_9.1.0`)
    return requestObj_listDetail.promise.then(({ statusCode, body }) => {
      if (statusCode !== 200) return this._getAlbumListDetailOld(id, page, ++retryNum)
      body = objStr2JSON(body)
      if (!body.musiclist) return this._getAlbumListDetailOld(id, page, ++retryNum)
      body.name = decodeName(body.name)
      return {
        list: this.filterListDetail(body.musiclist, body.name, body.albumid),
        page,
        limit: this.limit_song,
        total: parseInt(body.songnum),
        source: 'kw',
        info: {
          name: body.name,
          img: body.img || body.hts_img,
          desc: decodeName(body.info),
          author: decodeName(body.artist),
        },
      }
    })
  },
}