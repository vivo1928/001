const { formatPlayTime, sizeFormate } = require('../../index')
const { formatSingerName } = require('../utils')
const { signRequest } = require('./utils')

const filterData = (rawList) => {
  return rawList.map(item => ({
    id: item.album_mid,
    name: item.album_name,
    singer: formatSingerName(item.singers, 'name'),
    img: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.album_mid}.jpg`,
    source: 'tx',
    song_count: item.song_count || 0,
    publish_date: item.publish_date || ''
  }))
}

const handleResult = (rawList) => {
  const seen = new Set()
  return rawList.filter(item => {
    if (seen.has(item.album_mid)) return false
    seen.add(item.album_mid)
    return true
  })
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'tx' }

  try {
    const searchid = Date.now() * 1000
    const res = await signRequest({
      comm: {
        ct: 24,
        cv: 0,
        format: 'json',
        platform: 'yqq',
        uin: 0,
        g_tk: 0,
        g_tk_openkey: 0,
      },
      req: {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicMobile',
        param: {
          search_type: 8,
          searchid,
          query: str,
          page_num: page,
          num_per_page: limit,
          highlight: 0,
          nqc_flag: 0,
          multi_zhida: 0,
          cat: 2,
          grp: 1,
          sin: 0,
          sem: 0
        }
      }
    })

    const body = res.body || res
    const data = body.req && body.req.data && body.req.data.body
    const rawList = data ? data.album_list || [] : []
    const filteredList = handleResult(rawList)
    const list = filterData(filteredList)
    const total = data ? data.total_num || 0 : 0
    const allPage = Math.ceil(total / limit)

    return { list, allPage, limit, total, source: 'tx' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }