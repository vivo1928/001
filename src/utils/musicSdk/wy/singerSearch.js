const { eapiRequest } = require('./utils/index')

const filterData = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map(item => ({
    id: String(item.id),
    name: item.name || '',
    img: item.picUrl || item.img1v1Url || item.cover || '',
    source: 'wy',
    song_count: item.musicSize || 0,
    album_count: item.albumSize || 0,
    alias: (item.alias || []).join('、')
  }))
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'wy' }

  try {
    const requestObj = eapiRequest('/api/cloudsearch/pc', {
      s: str,
      type: 100, // 100: 歌手
      limit,
      total: page == 1,
      offset: limit * (page - 1),
    })
    const resp = await requestObj.promise
    const result = resp.body

    if (!result || result.code !== 200) {
      return search(str, page, limit, retryNum + 1)
    }

    const rawList = result.result ? (result.result.artists || []) : []
    const list = filterData(rawList)
    const total = result.result ? (result.result.artistCount || 0) : 0
    const allPage = Math.ceil(total / limit)

    if (!list.length && retryNum < 2) return search(str, page, limit, retryNum + 1)

    return { list, allPage, limit, total, source: 'wy' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }