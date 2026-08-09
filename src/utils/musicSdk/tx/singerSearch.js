const { httpFetch } = require('../../request')

const filterData = (rawList) => {
  return rawList.map(item => ({
    id: item.singerMID || item.singer_mid || item.mid,
    name: item.singerName || item.singer_name || item.name,
    img: (item.singerMID || item.singer_mid) ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${item.singerMID || item.singer_mid}.jpg` : (item.singerPic || ''),
    source: 'tx',
    song_count: item.songNum || item.song_num || item.song_count || 0,
    album_count: item.albumNum || item.album_num || item.album_count || 0
  }))
}

const handleResult = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  const seen = new Set()
  return rawList.filter(item => {
    const key = item.singerMID || item.singer_mid || item.mid
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const desktopSearch = (str, page, limit) => {
  return httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
      'Referer': 'https://y.qq.com',
      'Content-Type': 'application/json',
    },
    body: {
      req_1: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          num_per_page: limit,
          page_num: page,
          query: str,
          search_type: 1,  // 1 = singer
        }
      }
    }
  }).promise
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'tx' }

  try {
    const res = await desktopSearch(str, page, limit)
    const body = res.body

    if (!body || body.code !== 0 || !body.req_1 || body.req_1.code !== 0) {
      return search(str, page, limit, retryNum + 1)
    }

    const data = body.req_1.data
    const resultBody = data.body || data
    // Response has singer.list in the body
    const rawList = resultBody.singer?.list || resultBody.singer_list || []
    const filteredList = handleResult(rawList)
    const list = filterData(filteredList)
    const total = (data.meta && data.meta.estimate_sum) || 0
    const allPage = Math.ceil(total / limit)

    return { list, allPage, limit, total, source: 'tx' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }