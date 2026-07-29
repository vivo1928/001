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
      id: item.artistid || item.id,
      name: decodeName(item.artist || item.artistname || item.name),
      img: item.pic || item.img || '',
      source: 'kw',
      song_count: parseInt(item.songnum) || 0,
      album_count: parseInt(item.albumnum) || 0,
    }))
  },

  handleResult(rawList) {
    const ids = new Set()
    const list = []
    rawList.forEach(item => {
      if (!ids.has(item.artistid || item.id)) {
        ids.add(item.artistid || item.id)
        list.push(item)
      }
    })
    newList = list
    return this.filterData(newList)
  },

  singerSearch(str, page, limit) {
    const url = `http://search.kuwo.cn/r.s?pn=${page - 1}&rn=${limit}&stype=artist&all=${encodeURIComponent(str)}&show_copyright_off=0&encoding=utf&vipver=MUSIC_9.1.0`
    return httpFetch(url).then(res => objStr2JSON(res.body))
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.singerSearch(str, page, limit).then(result => {
      if (!result || result.error_code !== 0) return this.search(str, page, limit, retryNum)
      let list = this.handleResult(result.data.lists || result.data || [])
      if (list == null) return this.search(str, page, limit, retryNum)
      this.total = result.data.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kw' })
    })
  },
}