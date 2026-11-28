import { formatPlayTime, sizeFormate } from '../../index'
import { formatSingerName } from '../utils'
import { signRequest } from './utils'
import { fetchJson } from './http'

// 腾讯接口有并发/频率限制：原来失败立即递归重试（最坏 30 次请求），既慢又易触发风控。
// 现在改为指数退避+抖动、总次数收敛，并在 musicu.fcg 失败时改用旧版 soso 接口兜底。
const MUSICU_MAX_TRY = 2
const FALLBACK_MAX_TRY = 2
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const backoffMs = (attempt) => 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300)

const getSearchId = () => {
  let guid = ''
  for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16)
  return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, '0')
}

const doMusicuSearch = (str, page, limit) => {
  const searchRequest = signRequest({
    comm: {
      _channelid: '0',
      _os_version: '6.2.9200-2',
      ct: '19',
      cv: '2151',
      guid: '1F70E520B2EAA7D25E11760783C53CA9',
      patch: '118',
      psrf_access_token_expiresAt: 0,
      psrf_qqaccess_token: '',
      psrf_qqopenid: '',
      psrf_qqunionid: '',
      tmeAppID: 'qqmusic',
      tmeLoginType: 0,
      uin: '0',
      wid: '7223299733393904640',
    },
    'music.search.SearchCgiService': {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicDesktop',
      param: {
        grp: 1,
        num_per_page: limit,
        page_num: page,
        query: str,
        remoteplace: 'txt.newclient.top',
        search_type: 0,
        searchid: getSearchId(),
      },
    },
  })
  return searchRequest.then(({ body }) => {
    const req = body?.['music.search.SearchCgiService'] ?? body?.req
    if (!req || body.code !== 0 || req.code !== 0) throw new Error('musicu invalid response')
    return req.data
  })
}

export default {
  limit: 50,
  total: 0,
  page: 0,
  allPage: 1,
  /** 主搜索请求（musicu）；独立方法便于单测替换 */
  musicSearch(str, page, limit) {
    return doMusicuSearch(str, page, limit)
  },

  handleResult(rawList) {
    // console.log(rawList)
    if (!rawList || !Array.isArray(rawList)) return []
    const list = []
    rawList.forEach(item => {
      if (!item.file?.media_mid) return

      let types = []
      let _types = {}
      const file = item.file
      if (file.size_128mp3 != 0) {
        let size = sizeFormate(file.size_128mp3)
        types.push({ type: '128k', size })
        _types['128k'] = {
          size,
        }
      }
      if (file.size_320mp3 !== 0) {
        let size = sizeFormate(file.size_320mp3)
        types.push({ type: '320k', size })
        _types['320k'] = {
          size,
        }
      }
      if (file.size_flac !== 0) {
        let size = sizeFormate(file.size_flac)
        types.push({ type: 'flac', size })
        _types.flac = {
          size,
        }
      }
      if (file.size_hires !== 0) {
        let size = sizeFormate(file.size_hires)
        types.push({ type: 'flac24bit', size })
        _types.flac24bit = {
          size,
        }
      }
      // types.reverse()
      let albumId = ''
      let albumName = ''
      if (item.album) {
        albumName = item.album.name
        albumId = item.album.mid
      }
      list.push({
        id: 'tx_' + item.mid,
        singer: formatSingerName(item.singer, 'name'),
        // name: item.name + (item.title_extra ?? ''),
        name: item.title,
        albumName,
        albumId,
        source: 'tx',
        interval: item.interval ? formatPlayTime(item.interval) : null,
        songId: item.id,
        albumMid: item.album?.mid ?? '',
        strMediaMid: item.file.media_mid,
        songmid: item.mid,
        img: (albumId === '' || albumId === '空')
          ? item.singer?.length ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg` : ''
          : `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`,
        types,
        _types,
        typeUrl: {},
      })
    })
    // console.log(list)
    return list
  },
  /** 旧版 soso 搜索接口（与 musicu 不同入口），作为 musicu 失败时的兜底 */
  legacySearch(str, page, limit, retryNum = 0) {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&t=0' +
      `&p=${page}&n=${limit}&w=${encodeURIComponent(str)}`
    return fetchJson(url, {
      method: 'get',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
        Referer: 'https://y.qq.com',
      },
    }).then(({ body }) => {
      if (body?.code !== 0) throw new Error('legacy search invalid response')
      const song = body.data?.song ?? {}
      const list = this.handleLegacyResult(song.list ?? [])
      const total = song.totalnum ?? 0
      return {
        list,
        allPage: Math.ceil(total / limit),
        limit,
        total,
        source: 'tx',
      }
    }).catch(async(err) => {
      if (retryNum + 1 >= FALLBACK_MAX_TRY) throw err
      await sleep(backoffMs(retryNum + 1))
      return this.legacySearch(str, page, limit, retryNum + 1)
    })
  },

  /** 旧版接口字段映射（songmid/size128 等） */
  handleLegacyResult(rawList) {
    if (!Array.isArray(rawList)) return []
    return rawList.map(item => {
      const singers = item.singer ?? []
      const albumId = item.albummid ?? ''
      const types = []
      const _types = {}
      const mapping = [
        ['128k', item.size128],
        ['320k', item.size320],
        ['flac', item.sizeflac],
        ['flac24bit', item.sizehires],
      ]
      for (const [type, size] of mapping) {
        if (!size) continue
        const sizeStr = sizeFormate(size)
        types.push({ type, size: sizeStr })
        _types[type] = { size: sizeStr }
      }
      return {
        id: 'tx_' + item.songmid,
        singer: formatSingerName(singers, 'name'),
        name: item.songname,
        albumName: item.albumname,
        albumId,
        source: 'tx',
        interval: item.interval ? formatPlayTime(item.interval) : null,
        songId: item.songid,
        albumMid: item.albummid ?? '',
        strMediaMid: item.media_mid,
        songmid: item.songmid,
        img: albumId
          ? `https://y.gtimg.cn/music/photo_new/T002R500x300M000${albumId}.jpg`
          : singers.length ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${singers[0].mid}.jpg` : '',
        types,
        _types,
        typeUrl: {},
      }
    })
  },

  /** 依次尝试：musicu（带退避，最多 2 次）→ 旧版 soso 接口（最多 2 次） */
  async search(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    let lastErr
    for (let attempt = 1; attempt <= MUSICU_MAX_TRY; attempt++) {
      try {
        const data = await this.musicSearch(str, page, limit)
        const list = this.handleResult(data?.body?.song?.list ?? [])
        const meta = data?.meta
        this.total = meta?.sum ?? 0
        this.page = page
        this.allPage = Math.ceil(this.total / limit)
        if (list.length || page > 1) return { list, allPage: this.allPage, limit, total: this.total, source: 'tx' }
        lastErr = new Error('empty result')
      } catch (err) {
        lastErr = err
      }
      if (attempt < MUSICU_MAX_TRY) await sleep(backoffMs(attempt))
    }
    // musicu 全部失败或返回空：换旧版接口兜底
    try {
      const result = await this.legacySearch(str, page, limit)
      if (result.list.length || page > 1) return result
      // 旧版也空：返回空结果（让 UI 显示空态，而不是报错）
      return result
    } catch (err) {
      lastErr = err
    }
    throw lastErr ?? new Error('搜索失败')
  },
}
