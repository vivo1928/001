const { fetchJson } = require('./http')
const { formatSingerName } = require('../utils')

const filterData = (rawList) => {
  return rawList.map(item => ({
    id: item.albumMID || item.album_mid || item.mid,
    name: item.albumName || item.album_name || item.name,
    singer: formatSingerName(item.singer_list || item.singers || item.singer || [], 'name'),
    img: (item.albumMID || item.album_mid) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albumMID || item.album_mid}.jpg` : (item.albumPic || ''),
    source: 'tx',
    song_count: item.song_count || item.total || 0,
    publish_date: item.publicTime || item.publish_date || ''
  }))
}

const handleResult = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  const seen = new Set()
  return rawList.filter(item => {
    const key = item.albumMID || item.album_mid || item.mid
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const backoffMs = (attempt) => 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300)

const desktopSearch = (str, page, limit, host = 'https://u.y.qq.com/cgi-bin/musicu.fcg') => {
  return fetchJson(host, {
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
          search_type: 2,  // 2 = album
        }
      }
    },
    timeout: 8000,
  })
}

const parseResponse = (body, limit) => {
  if (!body || body.code !== 0 || !body.req_1 || body.req_1.code !== 0) throw new Error('album search invalid response')
  const data = body.req_1.data
  const resultBody = data.body || data
  const rawList = resultBody.album?.list || resultBody.album_list || []
  const list = filterData(handleResult(rawList))
  const total = (data.meta && data.meta.estimate_sum) || 0
  return { list, allPage: Math.ceil(total / limit), limit, total, source: 'tx' }
}

const search = async (str, page = 1, limit = 20) => {
  const empty = { list: [], allPage: 0, limit, total: 0, source: 'tx' }
  const hosts = [
    'https://u.y.qq.com/cgi-bin/musicu.fcg',
    'https://c.y.qq.com/cgi-bin/musicu.fcg',
  ]
  for (let hi = 0; hi < hosts.length; hi++) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await desktopSearch(str, page, limit, hosts[hi])
        return parseResponse(res.body, limit)
      } catch (err) {
        if (attempt < 2) await sleep(backoffMs(attempt))
      }
    }
  }
  // 两个入口都失败：返回空结果而不是抛错（列表显示空态，UI 层还有自动重试）
  return empty
}

module.exports = { search }