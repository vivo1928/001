import { httpFetch } from '../../request'

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawData) {
    const stripHtml = (str) => str.replace(/<[^>]+>/g, '')
    return rawData.map(item => ({
      id: item.albumid || item.specialid || item.id || item.radio_id,
      name: stripHtml(item.albumname || item.specialname || item.name || item.radio_name || ''),
      singer: stripHtml(item.singername || item.username || item.author || item.radio_username || ''),
      img: (item.imgurl || item.img || '').replace('{size}', '480'),
      source: 'kg',
      publish_date: item.publishtime ? item.publishtime.slice(0, 10) : (item.publishdate || ''),
      song_count: item.songcount || item.listen_count || 0,
    }))
  },

  handleResult(rawData) {
    const ids = new Set()
    const list = []
    rawData.forEach(item => {
      const key = item.albumid || item.specialid || item.id || item.radio_id
      if (!key || ids.has(key)) return
      ids.add(key)
      list.push(item)
    })
    return this.filterData(list)
  },

  programSearch(str, page, limit) {
    // 酷狗电台搜索
    const url = `http://msearch.kugou.com/api/v3/search/album?version=9108&iscorrection=1&highlight=em&plat=0&keyword=${encodeURIComponent(str)}&pagesize=${limit}&page=${page}&sver=2&with_res_tag=1`
    return httpFetch(url).promise.then(res => {
      let body = res.body
      if (typeof body === 'string') {
        body = body.replace(/<!--KG_TAG_RES_START-->/, '').replace(/<!--KG_TAG_RES_END-->/, '')
        try { body = JSON.parse(body) } catch(e) {}
      }
      return body
    })
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.programSearch(str, page, limit).then(result => {
      if (!result || result.errcode !== 0) return this.search(str, page, limit, retryNum)
      let list = this.handleResult(result.data.info || result.data.lists || [])
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = result.data.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kg' })
    })
  },
}