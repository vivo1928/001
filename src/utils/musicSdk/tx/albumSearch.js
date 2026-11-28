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

const COMM = {
  _channelid: '0',
  _os_version: '6.2.9200-2',
  ct: '19',
  cv: '2151',
  guid: '1F70E520B2EAA7D25E11760783C53CA9',
  patch: '118',
  psrf_access_token_expiresAt: 0,
  psrf_qqaccess_token: '',
  psrf_qqopenid: '',
  psrf_qqunionid: '',
  tmeAppID: 'qqmusic',
  tmeLoginType: 0,
  uin: '0',
  wid: '7223299733393904640',
}

const stripHtml = (text) => String(text ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const getSearchId = () => {
  let guid = ''
  for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16)
  return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, '0')
}
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
      // 必须带 comm（与歌曲搜索一致）：缺省时服务端会间歇返回 req_1.code=2001
      // （表现为列表一直空、重试多次才偶尔成功），补上后实测稳定返回专辑列表
      comm: COMM,
      req_1: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          num_per_page: limit,
          page_num: page,
          query: str,
          search_type: 2,  // 2 = album
          searchid: getSearchId(),
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

const liteSearch = (str, page, limit, host = 'https://u.y.qq.com/cgi-bin/musicu.fcg') => {
  return fetchJson(host, {
    method: 'post',
    timeout: 8000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://y.qq.com',
      'Content-Type': 'application/json',
    },
    body: {
      comm: COMM,
      req_1: {
        method: 'DoSearchForQQMusicLite',
        module: 'music.search.SearchCgiService',
        param: {
          num_per_page: limit,
          page_num: page,
          query: str,
          search_type: 2,
        },
      },
    },
  })
}

/** Lite 接口（Desktop 被限流 2001 时仍可用）字段 -> 统一结构 */
const parseLite = (body, page, limit) => {
  if (!body || body.code !== 0 || !body.req_1 || body.req_1.code !== 0) throw new Error('lite invalid response')
  const list = body.req_1.data?.body?.item_album
  if (!Array.isArray(list)) throw new Error('lite missing item_album')
  const mapped = list.map(item => ({
    id: item.albummid,
    name: stripHtml(item.name),
    singer: stripHtml(item.singer),
    img: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albummid}.jpg` : '',
    source: 'tx',
    song_count: Number(item.song_num) || 0,
    publish_date: item.publish_date || '',
  }))
  return {
    list: mapped,
    // Lite 不返回总数：整页说明可能还有下一页，不足一页则视为到底
    allPage: mapped.length >= limit ? page + 1 : page,
    limit,
    total: 0,
    source: 'tx',
  }
}

const search = async (str, page = 1, limit = 20) => {
  const empty = { list: [], allPage: page, limit, total: 0, source: 'tx' }
  const attempts = [
    () => desktopSearch(str, page, limit, 'https://u.y.qq.com/cgi-bin/musicu.fcg').then(res => parseResponse(res.body, limit)),
    () => liteSearch(str, page, limit, 'https://u.y.qq.com/cgi-bin/musicu.fcg').then(res => parseLite(res.body, page, limit)),
    () => desktopSearch(str, page, limit, 'https://u6.y.qq.com/cgi-bin/musicu.fcg').then(res => parseResponse(res.body, limit)),
    () => liteSearch(str, page, limit, 'https://u6.y.qq.com/cgi-bin/musicu.fcg').then(res => parseLite(res.body, page, limit)),
  ]
  for (const run of attempts) {
    try {
      const result = await run()
      if (result.list.length || page > 1) return result
    } catch (err) { /* 换下一个入口 */ }
  }
  return empty
}

module.exports = { search }