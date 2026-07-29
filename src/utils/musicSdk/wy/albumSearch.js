const { eapiRequest } = require('./utils/index')

const filterData = (rawList) => {
  return rawList.map(item => ({
    id: item.id,
    name: item.name,
    singer: (item.artist || item.artists || []).map(a => a.name).join('、') || item.artistName || '',
    img: item.picUrl || item.coverImgUrl || '',
    source: 'wy',
    song_count: item.size || 0,
    publish_date: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : ''
  }))
}

const handleResult = (rawList) => {
  return rawList
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'wy' }

  try {
    const result = await eapiRequest('/api/search/album/list/page', {
      keyword: str,
      needCorrect: '1',
      channel: 'typing',
      offset: limit * (page - 1),
      scene: 'normal',
      total: page == 1,
      limit
    })

    if (result.code !== 200) {
      return { list: [], allPage: 0, limit, total: 0, source: 'wy' }
    }

    const body = result.body || result
    const rawList = body.data ? body.data.resources || [] : (body.result ? body.result.albums || [] : [])
    const filteredList = handleResult(rawList)
    const list = filterData(filteredList)
    const total = body.data ? body.data.totalCount || 0 : (body.result ? body.result.albumCount || 0 : 0)
    const allPage = Math.ceil(total / limit)

    return { list, allPage, limit, total, source: 'wy' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }