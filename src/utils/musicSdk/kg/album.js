import { decodeName, formatPlayTime, sizeFormate } from '../../index'
import { createHttpFetch } from './util'
import { httpFetch } from '../../request'

/**
 * 酷狗专辑模块 — 多 API 并发 + 搜索降级，确保可靠性
 *
 * API 链路：
 * 1. mobilecdn / mobiles / mobcdn.kugou.com — 并发请求专辑列表
 * 2. gateway.kugou.com — 获取歌曲详情（hash → 完整信息）
 * 3. songsearch.kugou.com — 降级搜索（当专辑 API 返回空时）
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

  if (_types.flac24bit) {
    for (const q of ['hires', 'atmos', 'master']) {
      if (!_types[q]) {
        types.push({ type: q, size: '' })
        _types[q] = { size: '' }
      }
    }
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

// 将搜索结果的歌曲转为标准格式（用于降级搜索）
const searchToMusicInfo = (rawData) => {
  const types = []
  const _types = {}
  if (rawData.FileSize !== 0) {
    let size = sizeFormate(rawData.FileSize)
    types.push({ type: '128k', size, hash: rawData.FileHash })
    _types['128k'] = { size, hash: rawData.FileHash }
  }
  if (rawData.HQFileSize !== 0) {
    let size = sizeFormate(rawData.HQFileSize)
    types.push({ type: '320k', size, hash: rawData.HQFileHash })
    _types['320k'] = { size, hash: rawData.HQFileHash }
  }
  if (rawData.SQFileSize !== 0) {
    let size = sizeFormate(rawData.SQFileSize)
    types.push({ type: 'flac', size, hash: rawData.SQFileHash })
    _types.flac = { size, hash: rawData.SQFileHash }
  }
  if (rawData.ResFileSize !== 0) {
    let size = sizeFormate(rawData.ResFileSize)
    types.push({ type: 'flac24bit', size, hash: rawData.ResFileHash })
    _types.flac24bit = { size, hash: rawData.ResFileHash }
  }
  if (_types.flac24bit) {
    for (const q of ['hires', 'atmos', 'master']) {
      if (!_types[q]) {
        types.push({ type: q, size: '' })
        _types[q] = { size: '' }
      }
    }
  }
  return {
    singer: decodeName(rawData.SingerName || ''),
    name: decodeName(rawData.SongName),
    albumName: decodeName(rawData.AlbumName || ''),
    albumId: rawData.AlbumID || '',
    songmid: rawData.Audioid || '',
    source: 'kg',
    interval: rawData.Duration ? formatPlayTime(rawData.Duration) : '',
    img: null,
    lrc: null,
    hash: rawData.FileHash,
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
   * 尝试从指定域名获取专辑歌曲列表（带超时）
   * 优化：超时从8s降至5s，同时尝试HTTPS和HTTP
   */
  async _fetchAlbumList(host, id, page, limit, timeoutMs = 5000) {
    // 同时尝试 HTTPS 和 HTTP
    const urls = [
      `https://${host}/api/v3/album/song?version=9108&albumid=${id}&plat=0&pagesize=${limit}&area_code=0&page=${page}&with_res_tag=0`,
      `http://${host}/api/v3/album/song?version=9108&albumid=${id}&plat=0&pagesize=${limit}&area_code=0&page=${page}&with_res_tag=0`,
    ]
    console.log(`[kg album] trying ${host} for albumId=${id}`)

    const errors = []
    for (const url of urls) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`timeout ${host}`)), timeoutMs)
        )
        const result = await Promise.race([
          createHttpFetch(url),
          timeoutPromise,
        ])
        if (result && result.info && Array.isArray(result.info)) {
          return result
        }
        errors.push(`empty from ${url}`)
      } catch (e) {
        errors.push(`${url}: ${e?.message}`)
      }
    }
    throw new Error(`All protocols failed for ${host}: ${errors.join('; ')}`)
  },

  /**
   * 并发请求所有主机，返回第一个有效结果
   * 优化：简化竞速逻辑，降低超时
   */
  async _fetchAlbumListRace(id, page, limit) {
    const hosts = [
      'mobilecdn.kugou.com',
      'mobiles.kugou.com',
      'mobcdn.kugou.com',
    ]

    // 用 Promise.race + allSettled 实现竞速
    const results = await Promise.allSettled(
      hosts.map(host => this._fetchAlbumList(host, id, page, limit))
    )

    // 取第一个成功结果
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && result.value.info && result.value.info.length > 0) {
        console.log(`[kg album] race success, got ${result.value.info.length} songs`)
        return result.value
      }
    }

    // 收集所有失败原因
    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message || 'unknown')
    console.log(`[kg album] all hosts failed: ${errors.join('; ')}`)

    // 尝试串行回退（某些网络环境可能并发受限）
    console.log('[kg album] concurrent failed, trying sequential fallback')
    for (const host of hosts) {
      try {
        const result = await this._fetchAlbumList(host, id, page, limit, 8000)
        if (result && result.info && result.info.length > 0) {
          console.log(`[kg album] sequential success with ${host}, got ${result.info.length} songs`)
          return result
        }
      } catch (e) {
        console.log(`[kg album] sequential ${host} failed:`, e?.message)
      }
    }
    throw new Error('All album API hosts failed')
  },

  /**
   * 降级方案：通过歌曲搜索 API 搜索专辑名，再按专辑名过滤
   */
  async _searchSongsByAlbumName(albumName, singerName, page, limit) {
    const keyword = `${albumName} ${singerName || ''}`.trim()
    console.log(`[kg album] fallback search: keyword="${keyword}" page=${page}`)

    const searchUrl = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`

    const result = await httpFetch(searchUrl).promise
    const body = result.body

    if (!body || body.error_code !== 0 || !body.data?.lists) {
      throw new Error('Search API failed: ' + (body?.error || 'unknown'))
    }

    const allSongs = []
    const seen = new Set()

    // 规范化：去空格、转小写，用于精确比较
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '')
    const targetAlbumNameNorm = normalize(albumName || '')
    const targetSingerNameNorm = normalize(singerName || '')

    for (const item of body.data.lists) {
      const itemAlbumName = decodeName(item.AlbumName || '')
      const itemAlbumNameNorm = normalize(itemAlbumName)

      // 精确匹配专辑名：忽略大小写和空格，但必须完全相等
      if (itemAlbumNameNorm !== targetAlbumNameNorm) continue

      // 如果有歌手名，同时校验歌手名匹配（模糊包含）
      // 避免同名专辑由不同歌手演唱时混入
      if (targetSingerNameNorm) {
        const itemSingerName = decodeName(item.SingerName || '')
        const itemSingerNameNorm = normalize(itemSingerName)
        if (!itemSingerNameNorm.includes(targetSingerNameNorm) &&
            !targetSingerNameNorm.includes(itemSingerNameNorm)) {
          continue
        }
      }

      const key = item.Audioid + item.FileHash
      if (seen.has(key)) continue
      seen.add(key)
      allSongs.push(searchToMusicInfo(item))

      // 也添加 Grp 中的子项
      if (item.Grp) {
        for (const childItem of item.Grp) {
          const childKey = childItem.Audioid + childItem.FileHash
          if (seen.has(childKey)) continue
          seen.add(childKey)
          const childInfo = searchToMusicInfo(childItem)
          childInfo.albumName = decodeName(item.AlbumName || '')
          allSongs.push(childInfo)
        }
      }
    }

    console.log(`[kg album] fallback search got ${allSongs.length} songs (total=${body.data.total})`)
    return {
      list: allSongs,
      total: allSongs.length,
      allPage: Math.ceil(allSongs.length / limit),
    }
  },

  /**
   * 通过AlbumId获取专辑 — 多API回退 + 搜索降级
   * @param {string} id - 专辑ID
   * @param {number} page - 页码
   * @param {number} limit - 每页条数
   * @param {string} [albumName] - 专辑名（可选，用于降级搜索）
   * @param {string} [singerName] - 歌手名（可选，用于降级搜索）
   */
  async getAlbumDetail(id, page = 1, limit = 200, albumName, singerName) {
    let albumList = null
    let lastError = null

    // 1. 尝试并发请求所有专辑 API 主机
    try {
      albumList = await this._fetchAlbumListRace(id, page, limit)
    } catch (err) {
      lastError = err
      console.log('[kg album] all album API hosts failed:', err?.message)
    }

    // 2. 如果专辑 API 失败，尝试降级搜索（仅第 1 页）
    // 第 2 页以后返回空表示专辑没更多歌曲了，不应降级搜索
    if (!albumList || !albumList.info || albumList.info.length === 0) {
      if (albumName && page === 1) {
        console.log(`[kg album] album API empty, trying search fallback for "${albumName}"`)
        try {
          const searchResult = await this._searchSongsByAlbumName(albumName, singerName, page, limit)
          if (searchResult.list && searchResult.list.length > 0) {
            // 获取专辑信息（非阻塞）
            let info = { name: albumName, image: '', desc: '', authorName: singerName || '' }
            try {
              info = await this.getAlbumInfo(id)
            } catch (err) {
              console.log(`[kg album] getAlbumInfo failed (non-blocking):`, err?.message)
            }

            return {
              list: searchResult.list,
              page,
              limit,
              total: searchResult.total,
              source: 'kg',
              info: {
                name: info.name || albumName || '',
                img: info.image || '',
                desc: info.desc || '',
                author: info.authorName || singerName || '',
              },
            }
          }
        } catch (searchErr) {
          console.log('[kg album] search fallback also failed:', searchErr?.message)
          lastError = searchErr
        }
      }

      throw new Error(`All album methods failed: ${lastError?.message || 'empty result'}`)
    }

    // 3. 获取歌曲详情（去重 + 保持原始顺序）
    let result = []
    try {
      // 3a. 去重：按 hash 去重，保留首次出现的顺序（即专辑原始曲序）
      const seenHashes = new Set()
      const hashOrderMap = new Map() // hash → 原始顺序索引
      const uniqueHashList = []
      for (const item of albumList.info) {
        const h = item.hash
        if (h && !seenHashes.has(h)) {
          seenHashes.add(h)
          hashOrderMap.set(h, uniqueHashList.length)
          uniqueHashList.push({ hash: h })
        }
      }
      console.log(`[kg album] dedup: ${albumList.info.length} → ${uniqueHashList.length} unique hashes`)

      // 3b. 获取详情
      const detailList = await getSongDetail(uniqueHashList)
      result = detailList.map(toMusicInfo).filter(Boolean)

      // 3c. 按原始专辑曲序排序，确保序号连续正确
      result.sort((a, b) => {
        const idxA = hashOrderMap.get(a.hash) ?? 9999
        const idxB = hashOrderMap.get(b.hash) ?? 9999
        return idxA - idxB
      })
    } catch (err) {
      console.log(`[kg album] getSongDetail failed:`, err?.message)
      throw err
    }

    if (result.length === 0) {
      throw new Error('No valid songs after detail fetch')
    }

    // 4. 获取专辑信息（非阻塞）
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