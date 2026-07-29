import { httpFetch } from '../../request'

let newList = []

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawData) {
    return rawData.map(item => ({
      id: item.singerid,
      name: item.singername,
      img: (item.imgurl || '').replace('{size}', '480'),
      source: 'kg',
      song_count: item.songcount || 0,
      album_count: item.albumcount || 0,
    }))
  },

  handleResult(rawData) {
    const ids = new Set()
    const list = []
    rawData.forEach(item => {
      if (!ids.has(item.singerid)) {
        ids.add(item.singerid)
        list.push(item)
      }
    })
    newList = list
    return this.filterData(newList)
  },

  singerSearch(str, page, limit) {
    const url = `http://msearch.kugou.com/api/v3/search/singer?version=9108&iscorrection=1&highlight=em&plat=0&keyword=${encodeURIComponent(str)}&pagesize=${limit}&page=${page}`
    return httpFetch(url).promise.then(res => res.body)
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.singerSearch(str, page, limit).then(result => {
      if (!result || result.errcode !== 0) return this.search(str, page, limit, retryNum)
      let list = this.handleResult(Array.isArray(result.data) ? result.data : (result.data.lists || []))
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = result.data.total || list.length
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kg' })
    })
  },
}