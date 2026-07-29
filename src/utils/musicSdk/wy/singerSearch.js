const { eapiRequest } = require('./utils/index')

const filterData = (rawList) => {
  return rawList.map(item => ({
    id: item.id,
    name: item.name,
    img: item.picUrl || item.img1v1Url || '',
    source: 'wy',
    song_count: item.musicSize || 0,
    album_count: item.albumSize || 0,
    alias: (item.alias || []).join('、')
  }))
}

const handleResult = (rawList) => {
  return rawList
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'wy' }

  try {
    const requestObj = eapiRequest('/api/search/artist/list/page', {
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

    if (result.code !== 200) {
      return { list: [], allPage: 0, limit, total: 0, source: 'wy' }
    }

    const body = result
    const rawList = body.data ? body.data.resources || [] : (body.result ? body.result.artists || [] : [])
    const filteredList = handleResult(rawList)
    const list = filterData(filteredList)
    const total = body.data ? body.data.totalCount || 0 : (body.result ? body.result.artistCount || 0 : 0)
    const allPage = Math.ceil(total / limit)

    return { list, allPage, limit, total, source: 'wy' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }