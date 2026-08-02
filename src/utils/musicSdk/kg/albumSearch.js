import { httpFetch } from '../../request'

let newList = []

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawData) {
    const stripHtml = (str) => str.replace(/<[^>]+>/g, '')
    return rawData.map(item => ({
      id: item.albumid,
      name: stripHtml(item.albumname || ''),
      singer: stripHtml(item.singername || ''),
      img: (item.imgurl || '').replace('{size}', '480'),
      source: 'kg',
      publish_date: item.publishtime ? item.publishtime.slice(0, 10) : (item.publishdate || ''),
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
    const url = `https://msearch.kugou.com/api/v3/search/album?version=9108&iscorrection=1&highlight=em&plat=0&keyword=${encodeURIComponent(str)}&pagesize=${limit}&page=${page}&sver=2&with_res_tag=1`
    return httpFetch(url).promise.then(res => {
      let body = res.body
      // KG album search API wraps response in HTML comments
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
    return this.albumSearch(str, page, limit).catch(() => {
      // 网络错误（超时/连接失败等），通过延迟重试机制重试
      return this.delayRetry(str, page, limit, retryNum)
    }).then(result => {
      // 兼容多种错误码字段名：error_code / errcode / err_code
      if (!result || (result.error_code ?? result.errcode ?? result.err_code ?? 0) !== 0) return this.delayRetry(str, page, limit, retryNum)
      let list = this.handleResult(result.data.info || result.data.lists || [])
      if (list == null) return this.delayRetry(str, page, limit, retryNum)
      this.total = result.data.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kg' })
    })
  },

  /** 带延迟的重试，避免立即重试仍失败 */
  delayRetry(str, page, limit, retryNum) {
    return new Promise(resolve => setTimeout(resolve, 300 * retryNum)).then(() => this.search(str, page, limit, retryNum))
  },
}