import { httpFetch } from '../../request'
import { decodeName } from '../../index'

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawList) {
    return rawList.map(item => {
      const picPath = item.pic || item.picpath || ''
      const basePicPath = item.BASEPICPATH || 'http://img1.kuwo.cn/star/albumcover/'
      const artistPic = item.artistpic || ''
      const artistPicBase = 'http://img1.kuwo.cn/star/starheads/'
      return {
        id: String(item.albumid || item.album_id || item.id),
        name: decodeName(item.album || item.albumname || item.name || ''),
        singer: decodeName(item.artist || item.ARTIST || ''),
        img: picPath ? (picPath.startsWith('http') ? picPath : basePicPath + picPath) : (artistPic ? (artistPic.startsWith('http') ? artistPic : artistPicBase + artistPic) : ''),
        source: 'kw',
        song_count: parseInt(item.songnum || item.total || item.musiccnt || 0) || 0,
        publish_date: item.releaseDate || item.publish_date || item.publicTime || '',
      }
    })
  },

  programSearch(str, page, limit) {
    return httpFetch(`http://search.kuwo.cn/r.s?all=${encodeURIComponent(str)}&pn=${page - 1}&rn=${limit}&ft=album&newver=1&rformat=json&encoding=utf8&mobi=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        'Referer': 'http://www.kuwo.cn/',
      },
    }).promise.then(({ body }) => body)
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.programSearch(str, page, limit).then(result => {
      if (!result || (result.TOTAL !== '0' && result.SHOW === '0')) return this.search(str, page, limit, retryNum)
      const rawList = result.albumlist || []
      if (!rawList.length) return this.search(str, page, limit, retryNum)
      const basePicPath = result.BASEPICPATH || ''
      const enrichedList = rawList.map(item => ({ ...item, BASEPICPATH: basePicPath }))
      let list = this.filterData(enrichedList)
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = parseInt(result.TOTAL) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kw' })
    })
  },
}