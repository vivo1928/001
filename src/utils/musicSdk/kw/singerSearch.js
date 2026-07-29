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
      id: item.ARTISTID || item.id,
      name: decodeName(item.ARTIST || item.artist || item.name),
      img: item.PICPATH ? `http://img1.kuwo.cn/star/starheads/${item.PICPATH}` : (item.pic || item.img || ''),
      source: 'kw',
      song_count: parseInt(item.SONGNUM) || 0,
      album_count: parseInt(item.ALBUMNUM) || 0,
    }))
  },

  handleResult(rawList) {
    const ids = new Set()
    const list = []
    rawList.forEach(item => {
      const id = item.ARTISTID || item.id
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
    return httpFetch(`http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(str)}&pn=${page - 1}&rn=${limit}&rformat=json&encoding=utf8&ft=artist`).promise.then(({ body }) => {
      if (typeof body === 'string') body = objStr2JSON(body)
      if (!body || (body.TOTAL == '0' && body.SHOW == '0')) return this.search(str, page, limit, retryNum)
      let list = this.handleResult(body.abslist || [])
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = parseInt(body.TOTAL) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kw' })
    })
  },
}