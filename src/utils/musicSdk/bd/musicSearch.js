// import '../../polyfill/array.find'

import { httpFetch } from '../../request'
import { formatPlayTime } from '../../index'
// import { debug } from '../../utils/env'
// import { formatSinger } from './util'

export default {
  limit: 30,
  total: 0,
  page: 0,
  allPage: 1,
  musicSearch(str, page, limit) {
    const searchRequest = httpFetch(`https://tingapi.ting.baidu.com/v1/restserver/ting?from=android&version=5.6.5.6&method=baidu.ting.search.merge&format=json&query=${encodeURIComponent(str)}&page_no=${page}&page_size=${limit}&type=0&data_source=0&use_cluster=1`)
    return searchRequest.promise.then(({ body }) => body)
  },
  handleResult(rawData) {
    let ids = new Set()
    const list = []
    if (!rawData) return list
    rawData.forEach(item => {
      if (ids.has(item.song_id)) return
      ids.add(item.song_id)
      const types = []
      const _types = {}
      let size = null
      let itemTypes = item.all_rate.split(',')
      if (itemTypes.includes('128')) {
        types.push({ type: '128k', size })
        _types['128k'] = {
          size,
        }
      }
      if (itemTypes.includes('320')) {
        types.push({ type: '320k', size })
        _types['320k'] = {
          size,
        }
      }
      if (itemTypes.includes('flac')) {
        types.push({ type: 'flac', size })
        _types.flac = {
          size,
        }
      }
      // types.reverse()

      list.push({
        id: 'bd_' + item.song_id,
        singer: item.author.replace(',', '、'),
        name: item.title,
        albumName: item.album_title,
        albumId: item.album_id,
        source: 'bd',
        interval: formatPlayTime(parseInt(item.file_duration)),
        songmid: item.song_id,
        img: null,
        lrc: null,
        types,
        _types,
        typeUrl: {},
      })
    })
    return list
  },
  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit

    return this.musicSearch(str, page, limit).catch(() => {
      // 网络错误（超时/连接失败等），通过延迟重试机制重试
      return this.delayRetry(str, page, limit, retryNum)
    }).then(result => {
      if (!result || result.error_code !== 22000) return this.delayRetry(str, page, limit, retryNum)
      let list = this.handleResult(result.result.song_info.song_list)

      if (list == null) return this.delayRetry(str, page, limit, retryNum)

      this.total = result.result.song_info.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)

      return Promise.resolve({
        list,
        allPage: this.allPage,
        limit,
        total: this.total,
        source: 'bd',
      })
    })
  },

  /** 带延迟的重试，避免立即重试仍失败 */
  delayRetry(str, page, limit, retryNum) {
    return new Promise(resolve => setTimeout(resolve, 300 * retryNum)).then(() => this.search(str, page, limit, retryNum))
  },
}
