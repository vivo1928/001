const { httpFetch } = require('../../request')
const { formatSingerName } = require('../utils')
const { formatPlayTime, sizeFormate } = require('../../index')

const API_HOST = 'https://u.y.qq.com'
const API_PATH = '/cgi-bin/musicu.fcg'

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
  'Referer': 'https://y.qq.com',
  'Content-Type': 'application/json',
}

/**
 * 带重试的 QQ Music API 请求
 */
async function fetchWithRetry(body, retryCount = 2) {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const requestObj = httpFetch(`${API_HOST}${API_PATH}`, {
        method: 'post',
        headers: { ...COMMON_HEADERS },
        body,
      })
      const { body: res, statusCode } = await requestObj.promise
      if (statusCode === 200 && res && res.code === 0) return res
      if (attempt < retryCount) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
      }
    } catch (err) {
      if (attempt < retryCount) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  throw new Error('QQ Music API request failed')
}

/**
 * 格式化歌曲列表（与 musicSearch.handleResult 保持一致）
 */
const formatSongList = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map(item => {
    const types = []
    const _types = {}
    const file = item.file
    if (file) {
      if (file.size_128mp3 != 0) {
        const size = sizeFormate(file.size_128mp3)
        types.push({ type: '128k', size })
        _types['128k'] = { size }
      }
      if (file.size_320mp3 !== 0) {
        const size = sizeFormate(file.size_320mp3)
        types.push({ type: '320k', size })
        _types['320k'] = { size }
      }
      if (file.size_flac !== 0) {
        const size = sizeFormate(file.size_flac)
        types.push({ type: 'flac', size })
        _types.flac = { size }
      }
      if (file.size_hires !== 0) {
        const size = sizeFormate(file.size_hires)
        types.push({ type: 'flac24bit', size })
        _types.flac24bit = { size }
      }
    }
    const albumId = item.album?.mid || ''
    const albumName = item.album?.name || ''
    return {
      id: 'tx_' + item.mid,
      singer: formatSingerName(item.singer, 'name'),
      name: item.title || '',
      albumName,
      albumId,
      source: 'tx',
      interval: formatPlayTime(item.interval || 0),
      songId: item.id,
      albumMid: albumId,
      strMediaMid: item.file?.media_mid || '',
      songmid: item.mid,
      img: albumId
        ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`
        : (item.singer?.length ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg` : ''),
      types,
      _types,
      typeUrl: {},
    }
  })
}

module.exports = {
  /**
   * 获取歌手信息
   */
  async getSingerInfo(singerMID) {
    if (!singerMID) throw new Error('歌手不存在')
    const body = await fetchWithRetry({
      req_1: {
        module: 'music.singer.SingerInfoServer',
        method: 'GetSingerInfo',
        param: { singerMids: [singerMID] },
      },
    })
    if (!body || !body.req_1 || body.req_1.code !== 0) {
      throw new Error('获取歌手信息失败: ' + (body?.req_1?.msg || '无数据'))
    }
    const data = body.req_1.data
    const info = data?.singer_info?.[0] || data || {}
    return {
      source: 'tx',
      singerid: singerMID,
      info: {
        name: info.name || info.singer_name || '',
        desc: info.desc || info.brief_desc || '',
        img: info.mid ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${info.mid}.jpg` : (info.pic || ''),
      },
    }
  },

  /**
   * 获取歌手歌曲列表
   */
  async getSingerSongList(singerMID, page, limit) {
    if (!singerMID) throw new Error('歌手不存在')
    const body = await fetchWithRetry({
      req_1: {
        module: 'music.singerSongList.SingerSongList',
        method: 'GetSingerSongList',
        param: {
          singerMID,
          begin: (page - 1) * limit,
          num: limit,
          order: 2,
        },
      },
    })
    if (!body || !body.req_1 || body.req_1.code !== 0) {
      throw new Error('获取歌手歌曲列表失败: ' + (body?.req_1?.msg || '无数据'))
    }
    const data = body.req_1.data
    const rawList = data?.songList || data?.list || []
    if (!rawList.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')

    const list = formatSongList(rawList)
    const singerInfo = await this.getSingerInfo(singerMID).catch(() => null)
    return {
      source: 'tx',
      list,
      id: `tx__singer_${singerMID}`,
      singerid: singerMID,
      total: data.total || 0,
      limit,
      allPage: Math.ceil((data.total || 0) / limit) || 1,
      info: {
        name: singerInfo?.info?.name || '',
        img: singerInfo?.info?.img,
        desc: singerInfo?.info?.desc || '',
      },
    }
  },

  /**
   * 获取歌手专辑列表
   */
  async getSingerAlbumList(singerMID, page, limit) {
    if (!singerMID) throw new Error('歌手不存在')
    const body = await fetchWithRetry({
      req_1: {
        module: 'music.singerAlbum.SingerAlbum',
        method: 'get_singer_album',
        param: {
          singerMID,
          begin: (page - 1) * limit,
          num: limit,
        },
      },
    })
    if (!body || !body.req_1 || body.req_1.code !== 0) {
      throw new Error('获取歌手专辑列表失败: ' + (body?.req_1?.msg || '无数据'))
    }
    const data = body.req_1.data
    const rawList = data.list || []
    const albums = rawList.map(item => ({
      id: item.albumMID || item.album_mid || item.mid,
      name: item.albumName || item.album_name || item.name,
      singer: formatSingerName(item.singer_list || item.singers || item.singer || [], 'name'),
      img: (item.albumMID || item.album_mid)
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albumMID || item.album_mid}.jpg`
        : (item.albumPic || ''),
      source: 'tx',
      song_count: item.song_count || item.total || 0,
      publish_date: item.publicTime || item.publish_date || '',
    }))
    return {
      source: 'tx',
      albums,
      singerid: singerMID,
      total: data.total || 0,
      allPage: Math.ceil((data.total || 0) / limit) || 1,
    }
  },
}