import { httpFetch } from '../../request'
import { decodeName } from '../../index'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const getRandomCsrf = () => {
  return Array(11).fill(0).map(() => ALPHABET[Math.floor(Math.random() * 36)]).join('')
}

const getHeaders = () => {
  const csrfToken = getRandomCsrf()
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63',
    'Accept': 'application/json, text/plain, */*',
    'csrf': csrfToken,
    'Cookie': `kw_token=${csrfToken}`,
    'Referer': 'http://www.kuwo.cn/',
    'Host': 'www.kuwo.cn',
  }
}

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  filterData(rawList) {
    return rawList.map(item => ({
      id: String(item.albumid || item.id),
      name: decodeName(item.album || item.name || ''),
      singer: decodeName(item.artist || ''),
      img: item.pic || '',
      source: 'kw',
      song_count: parseInt(item.total || item.musiccnt || 0) || 0,
      publish_date: item.releaseDate || item.publish_date || '',
    }))
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    const headers = getHeaders()
    return httpFetch(`http://www.kuwo.cn/api/www/search/searchAlbumBykeyWord?key=${encodeURIComponent(str)}&pn=${page}&rn=${limit}&httpStatus=1`, {
      headers,
    }).promise.then(({ body, statusCode }) => {
      if (statusCode !== 200 || !body || body.code !== 200) return this.search(str, page, limit, retryNum)
      const rawList = body.data && body.data.albumList ? body.data.albumList : []
      if (!rawList.length) return this.search(str, page, limit, retryNum)
      let list = this.filterData(rawList)
      if (list == null || !list.length) return this.search(str, page, limit, retryNum)
      this.total = parseInt(body.data.total) || 0
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({ list, allPage: this.allPage, limit, total: this.total, source: 'kw' })
    })
  },
}