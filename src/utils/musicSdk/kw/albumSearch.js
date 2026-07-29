import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import { objStr2JSON } from './util'

let newList = []

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawList) {
    return rawList.map(item => ({
      id: item.albumid || item.id,
      name: decodeName(item.albumname || item.album || item.name),
      singer: decodeName(item.artist || item.artistname || ''),
      img: item.img || item.hts_img || item.pic || '',
      source: 'kw',
      song_count: parseInt(item.songnum || item.song_count) || 0,
      publish_date: item.publish_date || item.publishDate || '',
    }))
  },

  handleResult(rawList) {
    const ids = new Set()
    const list = []
    rawList.forEach(item => {
      const id = item.albumid || item.id
      if (!ids.has(id)) {
        ids.add(id)
        list.push(item)
      }
    })
    newList = list
    return this.filterData(newList)
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return httpFetch(`http://search.kuwo.cn/r.s?all=${encodeURIComponent(str)}&pn=${page - 1}&rn=${limit}&rformat=json&encoding=utf8&ft=album`).promise.then(({ body }) => {
      if (typeof body === 'string') body = objStr2JSON(body)
      if (!body || (body.TOTAL == '0' && body.SHOW == '0')) return this.search(str, page, limit, retryNum)
      let list = this.handleResult(body.albumlist || body.abslist || [])
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = parseInt(body.TOTAL) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kw' })
    })
  },
}