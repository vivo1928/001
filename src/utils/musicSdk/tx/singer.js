const { httpFetch } = require('../../request')
const { formatSingerName } = require('../utils')
const { formatPlayTime, sizeFormate } = require('../../index')

const API_HOST = 'https://u.y.qq.com'
const API_PATH = '/cgi-bin/musicu.fcg'

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
  Referer: 'https://y.qq.com',
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
        await new Promise(_resolve => setTimeout(_resolve, 300 * (attempt + 1)))
      }
    } catch (err) {
      if (attempt < retryCount) {
        await new Promise(_resolve => setTimeout(_resolve, 500 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  throw new Error('QQ Music API request failed')
}

// QQ Music musicu.fcg 通用公共参数（与 leaderboard/musicInfo 保持一致的较新版本）
const COMM = {
  cv: '1859',
  ct: 24,
  format: 'json',
  inCharset: 'utf-8',
  outCharset: 'utf-8',
  uin: 0,
  tmeAppID: 'qqmusic',
  tmePlatform: 'pc_web_qq_com',
}

// musics.fcg 端点用新版签名参数
const COMM_FCG = {
  ct: '11',
  cv: '14090508',
  v: '14090508',
  tmeAppID: 'qqmusic',
  phonetype: 'EBG-AN10',
  deviceScore: '553.47',
  devicelevel: '50',
  newdevicelevel: '20',
  rom: 'HuaWei/EMOTION/EmotionUI_14.2.0',
  os_ver: '12',
  OpenUDID: '0',
  OpenUDID2: '0',
  QIMEI36: '0',
  udid: '0',
  chid: '0',
  aid: '0',
  oaid: '0',
  taid: '0',
  tid: '0',
  wid: '0',
  uid: '0',
  sid: '0',
  modeSwitch: '6',
  teenMode: '0',
  ui_mode: '2',
  nettype: '1020',
  v4ip: '',
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
    // 补齐完整分级音质（flac24bit/flac/320k/128k/hires/atmos/master），确保播放可从设置档向下递进
    for (const q of ['flac24bit', 'flac', '320k', '128k', 'hires', 'atmos', 'master']) {
      if (!_types[q]) {
        types.push({ type: q, size: '' })
        _types[q] = { size: '' }
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
   * 按歌手名搜索歌手MID（供跨源兜底使用）
   */
  async searchSingerId(name) {
    if (!name) return null
    try {
      // 歌曲搜索取歌手 mid（musicSearch 同款参数）
      const body = await fetchWithRetry({
        comm: COMM_FCG,
        req_1: {
          module: 'music.search.SearchCgiService',
          method: 'DoSearchForQQMusicMobile',
          param: {
            remoteplace: 'txt.mqq.all',
            search_type: 0,
            query: name,
            searchid: Math.random().toString().slice(2),
            cur_page: 1,
            page_num: 10,
            page_size: 10,
            highlight: 0,
            nqc_flag: 0,
            multi_zhida: 0,
            cat: 2,
            grp: 1,
            sin: 0,
            sem: 0,
          },
        },
      }, 1)
      const songList = body?.req_1?.data?.body?.song?.list || []
      const singerItem = songList[0]?.singer?.[0]
      if (singerItem?.mid) return singerItem.mid
      return null
    } catch {
      return null
    }
  },
  /**
   * 获取歌手信息
   * 优先使用带 wiki_singer 的 GetSingerDetail 接口（简介更全、更新及时），
   * 失败时降级到旧的 GetSingerInfo 接口
   */
  async getSingerInfo(singerMID) {
    if (!singerMID) throw new Error('歌手不存在')

    // 1. 优先：GetSingerDetail（含歌手百科简介，最新数据）
    try {
      const detailBody = await fetchWithRetry({
        comm: COMM,
        req_1: {
          module: 'music.musichallSinger.SingerInfoInter',
          method: 'GetSingerDetail',
          param: {
            singer_mid: [singerMID],
            ex_singer: 1,
            wiki_singer: 1,
            group_singer: 0,
            pic: 1,
            photos: 0,
          },
        },
      }, 1)
      if (detailBody && detailBody.req_1 && detailBody.req_1.code === 0) {
        const info = detailBody.req_1.data?.singer_list?.[0]
        const data = info?.data || info || {}
        const basic = data.basic_info || {}
        const ex = data.ex_info || {}
        const desc = ex.desc || data.desc || ''
        if (desc || basic.name) {
          return {
            source: 'tx',
            singerid: singerMID,
            info: {
              name: basic.name || info.singer_name || '',
              desc: String(desc).trim(),
              img: data.pic?.pic
                ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${data.pic.pic}.jpg`
                : (data.pic?.pic120 || data.pic?.pic300 || ''),
            },
          }
        }
      }
    } catch (err) {
      console.log(`[tx singer] GetSingerDetail failed, fallback to GetSingerInfo: ${err?.message || err}`)
    }

    // 2. 降级：旧 GetSingerInfo 接口
    try {
      const body = await fetchWithRetry({
        comm: COMM,
        req_1: {
          module: 'music.singer.SingerInfoServer',
          method: 'GetSingerInfo',
          param: { singerMids: [singerMID] },
        },
      }, 1)
      if (body && body.req_1 && body.req_1.code === 0) {
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
      }
    } catch (err) {
      console.log(`[tx singer] GetSingerInfo failed, fallback to GetSingerList: ${err?.message || err}`)
    }

    // 3. 再次降级：GetSingerList（最简洁的端点，最不容易被废弃）
    try {
      const body = await fetchWithRetry({
        comm: COMM,
        req_1: {
          module: 'music.musichallSinger.SingerInfoInter',
          method: 'GetSingerList',
          param: {
            singer_mid: [singerMID],
            ex_singer: 1,
          },
        },
      }, 1)
      if (body && body.req_1 && body.req_1.code === 0) {
        const list = body.req_1.data?.singer_list || []
        const info = list[0] || {}
        const data = info.data || info || {}
        const basic = data.basic_info || {}
        return {
          source: 'tx',
          singerid: singerMID,
          info: {
            name: basic.name || info.singer_name || data.singer_name || '',
            desc: (data.ex_info || {}).desc || data.desc || '',
            img: data.pic?.pic ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${data.pic.pic}.jpg` : (data.pic?.pic120 || ''),
          },
        }
      }
    } catch (err) {
      console.log(`[tx singer] GetSingerList failed: ${err?.message || err}`)
    }

    throw new Error('获取歌手信息失败: 所有端点均无数据')
  },

  /**
   * 获取歌手歌曲列表
   */
  async getSingerSongList(singerMID, page, limit) {
    if (!singerMID) throw new Error('歌手不存在')
    const body = await fetchWithRetry({
      comm: COMM,
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
      comm: COMM,
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
