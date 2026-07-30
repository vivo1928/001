const { eapiRequest } = require('./utils/index')

const filterData = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map(item => {
    // 处理 artist 字段：可能是对象 {name: "xxx"} 或字符串
    let singer = ''
    if (item.artist) {
      if (typeof item.artist === 'string') {
        singer = item.artist
      } else if (item.artist.name) {
        singer = item.artist.name
      }
    }
    return {
      id: String(item.id),
      name: item.name || '',
      singer: singer || item.artistName || '',
      img: item.picUrl || item.coverImgUrl || item.blurPicUrl || '',
      source: 'wy',
      song_count: item.size || 0,
      publish_date: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : ''
    }
  })
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'wy' }

  try {
    const requestObj = eapiRequest('/api/cloudsearch/pc', {
      s: str,
      type: 10, // 10: 专辑
      limit,
      total: page == 1,
      offset: limit * (page - 1),
    })
    const resp = await requestObj.promise
    const result = resp.body

    if (!result || result.code !== 200) {
      return search(str, page, limit, retryNum + 1)
    }

    const rawList = result.result ? (result.result.albums || []) : []
    const list = filterData(rawList)
    const total = result.result ? (result.result.albumCount || 0) : 0
    const allPage = Math.ceil(total / limit)

    if (!list.length && retryNum < 2) return search(str, page, limit, retryNum + 1)

    return { list, allPage, limit, total, source: 'wy' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }