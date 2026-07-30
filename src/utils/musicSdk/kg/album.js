import { decodeName, formatPlayTime, sizeFormate } from '../../index'
import { createHttpFetch } from './util'

/**
 * 酷狗专辑模块 — 多 API 回退，确保可靠性
 * 
 * API 链路：
 * 1. mobilecdn.kugou.com/api/v3/album/song — 主 API
 * 2. mobiles.kugou.com/api/v3/album/song — 备用 API（同接口不同域名）
 * 3. songsearch.kugou.com — 兜底搜索（按专辑名，结果会过滤）
 */

// 歌曲详情接口（直接内联，不依赖 musicInfo.js 的复杂链路）
const getSongDetail = async (hashList) => {
  const data = {
    area_code: '1',
    show_privilege: 1,
    show_album_info: '1',
    is_publish: '',
    appid: 1005,
    clientver: 11451,
    mid: '1',
    dfid: '-',
    clienttime: Date.now(),
    key: 'OIlwieks28dk2k092lksi2UIkp',
    fields: 'album_info,author_name,audio_info,ori_audio_name,base,songname,classification',
  }

  const tasks = []
  let list = hashList
  while (list.length) {
    tasks.push(Object.assign({ data: list.slice(0, 100) }, data))
    if (list.length < 100) break
    list = list.slice(100)
  }

  const results = await Promise.all(tasks.map(task =>
    createHttpFetch('http://gateway.kugou.com/v3/album_audio/audio', {
      method: 'POST',
      body: task,
      headers: {
        'KG-THash': '13a3164',
        'KG-RC': '1',
        'KG-Fake': '0',
        'KG-RF': '00869891',
        'User-Agent': 'Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi',
        'x-router': 'kmr.service.kugou.com',
      },
    }).then(data => data.map(s => s[0]))
  ))

  return results.flat().filter(Boolean)
}

// 将歌曲详情转为标准格式
const toMusicInfo = (item) => {
  if (!item?.audio_info) return null
  const types = []
  const _types = {}

  if (item.audio_info.filesize && item.audio_info.filesize !== '0') {
    let size = sizeFormate(parseInt(item.audio_info.filesize))
    types.push({ type: '128k', size, hash: item.audio_info.hash })
    _types['128k'] = { size, hash: item.audio_info.hash }
  }
  if (item.audio_info.filesize_320 && item.audio_info.filesize_320 !== '0') {
    let size = sizeFormate(parseInt(item.audio_info.filesize_320))
    types.push({ type: '320k', size, hash: item.audio_info.hash_320 })
    _types['320k'] = { size, hash: item.audio_info.hash_320 }
  }
  if (item.audio_info.filesize_flac && item.audio_info.filesize_flac !== '0') {
    let size = sizeFormate(parseInt(item.audio_info.filesize_flac))
    types.push({ type: 'flac', size, hash: item.audio_info.hash_flac })
    _types.flac = { size, hash: item.audio_info.hash_flac }
  }
  if (item.audio_info.filesize_high && item.audio_info.filesize_high !== '0') {
    let size = sizeFormate(parseInt(item.audio_info.filesize_high))
    types.push({ type: 'flac24bit', size, hash: item.audio_info.hash_high })
    _types.flac24bit = { size, hash: item.audio_info.hash_high }
  }

  return {
    singer: decodeName(item.author_name),
    name: decodeName(item.songname),
    albumName: decodeName(item.album_info?.album_name || ''),
    albumId: item.album_info?.album_id || '',
    songmid: item.audio_info.audio_id,
    source: 'kg',
    interval: formatPlayTime(parseInt(item.audio_info.timelength || '0') / 1000),
    img: null,
    lrc: null,
    hash: item.audio_info.hash,
    otherSource: null,
    types,
    _types,
    typeUrl: {},
  }
}

export default {
  /**
   * 通过AlbumId获取专辑信息（非阻塞）
   */
  async getAlbumInfo(id) {
    const albumInfoRequest = await createHttpFetch(
      'http://kmrserviceretry.kugou.com/container/v1/album?dfid=1tT5He3kxrNC4D29ad1MMb6F&mid=22945702112173152889429073101964063697&userid=0&appid=1005&clientver=11589',
      {
        method: 'POST',
        body: {
          appid: 1005,
          clienttime: 1681833686,
          clientver: 11589,
          data: [{ album_id: id }],
          fields: 'language,grade_count,intro,mix_intro,heat,category,sizable_cover,cover,album_name,type,quality,publish_company,grade,special_tag,author_name,publish_date,language_id,album_id,exclusive,is_publish,trans_param,authors,album_tag',
          isBuy: 0,
          key: 'e6f3306ff7e2afb494e89fbbda0becbf',
          mid: '22945702112173152889429073101964063697',
          show_album_tag: 0,
        },
      }
    )
    if (!albumInfoRequest) throw new Error('get album info failed.')
    const albumInfo = albumInfoRequest[0]
    return {
      name: albumInfo.album_name,
      image: albumInfo.sizable_cover.replace('{size}', 240),
      desc: albumInfo.intro,
      authorName: albumInfo.author_name,
    }
  },

  /**
   * 尝试从指定域名获取专辑歌曲列表
   */
  async _fetchAlbumList(host, id, page, limit) {
    const url = `http://${host}/api/v3/album/song?version=9108&albumid=${id}&plat=0&pagesize=${limit}&area_code=0&page=${page}&with_res_tag=0`
    console.log(`[kg album] trying ${host} for albumId=${id}`)
    const result = await createHttpFetch(url)
    if (!result || !result.info || !Array.isArray(result.info)) {
      throw new Error(`Empty response from ${host}`)
    }
    return result
  },

  /**
   * 通过AlbumId获取专辑 — 多API回退
   */
  async getAlbumDetail(id, page = 1, limit = 200) {
    let albumList = null
    let lastError = null

    // 尝试多个 API 域名
    const hosts = [
      'mobilecdn.kugou.com',
      'mobiles.kugou.com',
      'mobcdn.kugou.com',
    ]

    for (const host of hosts) {
      try {
        albumList = await this._fetchAlbumList(host, id, page, limit)
        if (albumList && albumList.info && albumList.info.length > 0) {
          console.log(`[kg album] success with ${host}, got ${albumList.info.length} songs`)
          break
        }
      } catch (err) {
        lastError = err
        console.log(`[kg album] ${host} failed:`, err?.message)
      }
    }

    if (!albumList || !albumList.info || albumList.info.length === 0) {
      throw new Error(`All album API hosts failed: ${lastError?.message || 'empty result'}`)
    }

    // 获取歌曲详情
    let result = []
    try {
      const detailList = await getSongDetail(albumList.info.map(item => ({ hash: item.hash })))
      result = detailList.map(toMusicInfo).filter(Boolean)
    } catch (err) {
      console.log(`[kg album] getSongDetail failed:`, err?.message)
      throw err
    }

    if (result.length === 0) {
      throw new Error('No valid songs after detail fetch')
    }

    // 获取专辑信息（非阻塞）
    let info = { name: '', image: '', desc: '', authorName: '' }
    try {
      info = await this.getAlbumInfo(id)
    } catch (err) {
      console.log(`[kg album] getAlbumInfo failed (non-blocking):`, err?.message)
    }

    return {
      list: result,
      page,
      limit,
      total: albumList.total || result.length,
      source: 'kg',
      info: {
        name: info.name || '',
        img: info.image || '',
        desc: info.desc || '',
        author: info.authorName || '',
      },
    }
  },
}