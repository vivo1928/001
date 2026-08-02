import { httpFetch } from '../../request'
import { decodeName } from '../../index'

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawList) {
    return rawList.map(item => {
      const picPath = item.PICPATH || item.picpath || ''
      const basePicPath = item.BASEPICPATH || 'http://img1.kuwo.cn/star/starheads/'
      return {
        id: String(item.ARTISTID || item.artistid || item.id),
        name: decodeName(item.ARTIST || item.artist || item.name || ''),
        img: picPath ? (picPath.startsWith('http') ? picPath : basePicPath + picPath) : '',
        source: 'kw',
        song_count: parseInt(item.SONGNUM || item.songnum || item.musicNum || 0) || 0,
        album_count: parseInt(item.ALBUMNUM || item.albumnum || 0) || 0,
      }
    })
  },

  singerSearch(str, page, limit) {
    return httpFetch(`https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(str)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=artist&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        'Referer': 'https://www.kuwo.cn/',
      },
    }).promise.then(({ body }) => body)
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.singerSearch(str, page, limit).catch(() => {
      // 网络错误（超时/连接失败等），通过延迟重试机制重试
      return this.delayRetry(str, page, limit, retryNum)
    }).then(result => {
      if (!result || (result.TOTAL !== '0' && result.SHOW === '0')) return this.delayRetry(str, page, limit, retryNum)
      const rawList = result.abslist || []
      if (!rawList.length) return this.delayRetry(str, page, limit, retryNum)
      let list = this.filterData(rawList)
      if (list == null || !list.length) return this.delayRetry(str, page, limit, retryNum)
      this.total = parseInt(result.TOTAL) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kw' })
    })
  },

  /** 带延迟的重试，避免立即重试仍失败 */
  delayRetry(str, page, limit, retryNum) {
    return new Promise(resolve => setTimeout(resolve, 300 * retryNum)).then(() => this.search(str, page, limit, retryNum))
  },
}