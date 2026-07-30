import { httpFetch } from '../../request'

const getHeaders = (str) => ({
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'Connection': 'keep-alive',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Host': 'm.music.migu.cn',
  'Referer': `https://m.music.migu.cn/v3/search?keyword=${encodeURIComponent(str)}`,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Mobile Safari/537.36 Edg/89.0.774.68',
  'X-Requested-With': 'XMLHttpRequest',
})

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  singerSearch(str, page, limit) {
    const searchRequest = httpFetch(`https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(str)}&type=1&pgc=${page}&rows=${limit}`, {
      headers: getHeaders(str),
    })
    return searchRequest.promise.then(({ body }) => body)
  },

  filterData(rawData) {
    const list = []
    const ids = new Set()
    rawData.forEach(item => {
      if (!item.id || ids.has(item.id)) return
      ids.add(item.id)
      list.push({
        id: String(item.id),
        name: item.title || item.name || '',
        img: item.artistPicM || item.artistPicL || item.artistPic || item.img || null,
        source: 'mg',
        song_count: item.songNum || item.songCount || item.song_count || 0,
        album_count: item.albumNum || item.albumCount || item.album_count || 0,
      })
    })
    return list
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.singerSearch(str, page, limit).then(result => {
      if (!result || !result.artists || !result.artists.length) {
        if (retryNum < 3) return this.search(str, page, limit, retryNum)
        return Promise.resolve({ list: [], allPage: 0, limit, total: 0, source: 'mg' })
      }
      let list = this.filterData(result.artists || [])
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = parseInt(result.pgt) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'mg' })
    })
  },
}