import { httpFetch } from '../../request'
import { toMD5 } from '../utils'

const createSignature = (time, str) => {
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20'
  const signatureMd5 = '6cdc72a439cef99a3418d2a78aa28c73'
  const sign = toMD5(`${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`)
  return { sign, deviceId }
}

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
      if (!item.id || ids.has(item.id)) return
      ids.add(item.id)
      const img = item.imgItems && item.imgItems.length ? item.imgItems[0].img : null
      list.push({
        id: String(item.id),
        name: item.name || '',
        singer: item.singer || '',
        img: img || null,
        source: 'mg',
        publish_date: item.publishDate || '',
        song_count: item.songCount || item.totalSongCount || 0,
      })
    })
    return list
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.albumSearch(str, page, limit).catch(() => {
      // 网络错误（超时/连接失败等），通过延迟重试机制重试
      return this.delayRetry(str, page, limit, retryNum)
    }).then(result => {
      if (!result || result.code !== '000000') {
        return this.delayRetry(str, page, limit, retryNum)
      }
      const albumResultData = result.albumResultData || { result: [], totalCount: 0 }
      const rawList = albumResultData.result || []
      let list = this.filterData(rawList)
      if (list == null) return this.delayRetry(str, page, limit, retryNum)
      this.total = parseInt(albumResultData.totalCount) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'mg' })
    })
  },

  /** 带延迟的重试，避免立即重试仍失败 */
  delayRetry(str, page, limit, retryNum) {
    return new Promise(resolve => setTimeout(resolve, 300 * retryNum)).then(() => this.search(str, page, limit, retryNum))
  },
}