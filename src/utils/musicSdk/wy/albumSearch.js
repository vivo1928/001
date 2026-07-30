const { eapiRequest } = require('./utils/index')

const filterData = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map(item => ({
    id: String(item.id),
    name: item.name || '',
    singer: (item.artist || item.artists || []).map ? (item.artist || item.artists || []).map(a => typeof a === 'string' ? a : a.name).join('、') : (item.artistName || ''),
    img: item.picUrl || item.coverImgUrl || item.blurPicUrl || '',
    source: 'wy',
    song_count: item.size || 0,
    publish_date: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : ''
  }))
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'wy' }

  try {
    const requestObj = eapiRequest('/api/search/album/list/page', {
      keyword: str,
      needCorrect: '1',
      channel: 'typing',
      offset: limit * (page - 1),
      scene: 'normal',
      total: page == 1,
      limit
    })
    const resp = await requestObj.promise
    const result = resp.body

    if (!result || result.code !== 200) {
      return search(str, page, limit, retryNum + 1)
    }

    const rawList = result.data ? (result.data.resources || []) : []
    const list = filterData(rawList)
    const total = result.data ? (result.data.totalCount || 0) : 0
    const allPage = Math.ceil(total / limit)

    if (!list.length && retryNum < 2) return search(str, page, limit, retryNum + 1)

    return { list, allPage, limit, total, source: 'wy' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }