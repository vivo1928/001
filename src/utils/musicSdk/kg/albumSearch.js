import { httpFetch } from '../../request'

let newList = []

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawData) {
    return rawData.map(item => ({
      id: item.albumid,
      name: item.albumname,
      singer: item.singername,
      img: (item.imgurl || '').replace('{size}', '480'),
      source: 'kg',
      publish_date: item.publishdate || '',
      song_count: item.songcount || 0,
    }))
  },

  handleResult(rawData) {
    const ids = new Set()
    const list = []
    rawData.forEach(item => {
      if (!ids.has(item.albumid)) {
        ids.add(item.albumid)
        list.push(item)
      }
    })
    newList = list
    return this.filterData(newList)
  },

  albumSearch(str, page, limit) {
    const url = `http://msearch.kugou.com/api/v3/search/album?version=9108&iscorrection=1&highlight=em&plat=0&keyword=${encodeURIComponent(str)}&pagesize=${limit}&page=${page}&sver=2&with_res_tag=1`
    return httpFetch(url).then(res => res.body)
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.albumSearch(str, page, limit).then(result => {
      if (!result || result.error_code !== 0) return this.search(str, page, limit, retryNum)
      let list = this.handleResult(result.data.lists || result.data || [])
      if (list == null) return this.search(str, page, limit, retryNum)
      this.total = result.data.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kg' })
    })
  },
}