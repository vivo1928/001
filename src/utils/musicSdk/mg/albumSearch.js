import { httpFetch } from '../../request'
import { createSignature } from './musicSearch'

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  albumSearch(str, page, limit) {
    const time = Date.now().toString()
    const signData = createSignature(time, str)
    const searchRequest = httpFetch(`https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A0%2C%22album%22%3A1%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22bestShow%22%3A0%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(str)}&pageNo=${page}&sort=0&sid=USS`, {
      headers: {
        uiVersion: 'A_music_3.6.1',
        deviceId: signData.deviceId,
        timestamp: time,
        sign: signData.sign,
        channel: '0146921',
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
      },
    })
    return searchRequest.promise.then(({ body }) => body)
  },

  filterData(rawData) {
    const list = []
    const ids = new Set()
    rawData.forEach(item => {
      if (!item.albumId || ids.has(item.albumId)) return
      ids.add(item.albumId)
      let img = item.img3 || item.img2 || item.img1 || null
      if (img && !/https?:/.test(img)) img = 'http://d.musicapp.migu.cn' + img
      list.push({
        id: item.albumId,
        name: item.albumName || item.name || '',
        singer: item.singerName || item.singer || '',
        img,
        source: 'mg',
        publish_date: item.publishDate || item.publish_date || '',
        song_count: item.songCount || item.song_count || 0,
      })
    })
    return list
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.albumSearch(str, page, limit).then(result => {
      if (!result || result.code !== '000000') return Promise.reject(new Error(result ? result.info : '搜索失败'))
      const albumResultData = result.albumResultData || { resultList: [], totalCount: 0 }
      let list = this.filterData(albumResultData.resultList || [])
      this.total = parseInt(albumResultData.totalCount) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'mg' })
    })
  },
}