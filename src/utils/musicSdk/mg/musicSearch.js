import { httpFetch } from '../../request'
import { sizeFormate, formatPlayTime } from '../../index'
import { toMD5, formatSingerName } from '../utils'
import { appLog } from '../../appLog'

export const createSignature = (time, str) => {
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20'
  const signatureMd5 = '6cdc72a439cef99a3418d2a78aa28c73'
  const sign = toMD5(`${str}${signatureMd5}yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`)
  return { sign, deviceId }
}

const pickImg = (imgItems, sizeType) => {
  if (!Array.isArray(imgItems)) return null
  const item = imgItems.find(it => it.imgSizeType === sizeType) || imgItems[0]
  return item?.img || null
}

// 把 MIGUM2.0 的返回整理成 v3 的结构，这样 filterData 不用写两套
const normalizeM2Body = (body) => {
  const groups = body?.songResultData?.resultList
  if (!Array.isArray(groups)) throw new Error('m2: ' + (body?.code || 'no resultList'))
  const resultList = groups.map(group => (Array.isArray(group) ? group : []).map(raw => {
    const album = Array.isArray(raw.albums) ? raw.albums[0] : null
    const formats = Array.isArray(raw.newRateFormats) ? raw.newRateFormats : []
    return {
      songId: raw.id,
      name: raw.name,
      copyrightId: raw.copyrightId,
      albumId: album?.id,
      album: album?.name,
      singerList: Array.isArray(raw.singers) ? raw.singers.map(s => ({ id: s.id, name: s.name })) : [],
      img1: pickImg(raw.imgItems, '01'),
      img2: pickImg(raw.imgItems, '02'),
      img3: pickImg(raw.imgItems, '03'),
      audioFormats: formats.map(f => {
        const size = f.androidSize ?? f.size
        return { formatType: f.formatType, size, isize: size, asize: size }
      }),
      // MIGUM2.0 没有时长字段：走这条兜底时列表会显示 00:00（正常走 v3 不受影响）
      duration: 0,
      lrcUrl: raw.lyricUrl || '',
      mrcurl: raw.mrcurl || '',
      trcUrl: raw.trcUrl || '',
    }
  }))
  return { code: '000000', songResultData: { resultList, totalCount: body?.songResultData?.totalCount ?? 0 } }
}

export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  // 旧版API
  // musicSearch(str, page, limit) {
  //   const searchRequest = httpFetch(`http://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?ua=Android_migu&version=5.0.1&text=${encodeURIComponent(str)}&pageNo=${page}&pageSize=${limit}&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22songlist%22%3A0%2C%22bestShow%22%3A1%7D`, {
  // searchRequest = httpFetch(`http://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?ua=Android_migu&version=5.0.1&text=${encodeURIComponent(str)}&pageNo=${page}&pageSize=${limit}&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22songlist%22%3A0%2C%22bestShow%22%3A1%7D`, {
  // searchRequest = httpFetch(`http://jadeite.migu.cn:7090/music_search/v2/search/searchAll?sid=4f87090d01c84984a11976b828e2b02c18946be88a6b4c47bcdc92fbd40762db&isCorrect=1&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(str)}&pageNo=${page}&sort=0`, {
  // searchRequest = httpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1&pageNo=${page}&pageSize=${limit}&searchSwitch={%22song%22:1,%22album%22:0,%22singer%22:0,%22tagSong%22:0,%22mvSong%22:0,%22songlist%22:0,%22bestShow%22:0}&sort=0&text=${encodeURIComponent(str)}`)
  //   // searchRequest = httpFetch(`http://jadeite.migu.cn:7090/music_search/v2/search/searchAll?sid=4f87090d01c84984a11976b828e2b02c18946be88a6b4c47bcdc92fbd40762db&isCorrect=1&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(str)}&pageNo=${page}&sort=0`, {
  //     headers: {
  //       // sign: 'c3b7ae985e2206e97f1b2de8f88691e2',
  //       // timestamp: 1578225871982,
  //       // appId: 'yyapp2',
  //       // mode: 'android',
  //       // ua: 'Android_migu',
  //       // version: '6.9.4',
  //       osVersion: 'android 7.0',
  //       'User-Agent': 'okhttp/3.9.1',
  //     },
  //   })
  //   // searchRequest = httpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1&pageNo=${page}&pageSize=${limit}&searchSwitch={%22song%22:1,%22album%22:0,%22singer%22:0,%22tagSong%22:0,%22mvSong%22:0,%22songlist%22:0,%22bestShow%22:0}&sort=0&text=${encodeURIComponent(str)}`)
  //   return searchRequest.promise.then(({ body }) => body)
  // },
  // handleResult(rawData) {
  //   // console.log(rawData)
  //   let ids = new Set()
  //   const list = []
  //   rawData.forEach(item => {
  //     if (ids.has(item.id)) return
  //     ids.add(item.id)
  //     const types = []
  //     const _types = {}
  //     item.newRateFormats && item.newRateFormats.forEach(type => {
  //       let size
  //       switch (type.formatType) {
  //         case 'PQ':
  //           size = sizeFormate(type.size ?? type.androidSize)
  //           types.push({ type: '128k', size })
  //           _types['128k'] = {
  //             size,
  //           }
  //           break
  //         case 'HQ':
  //           size = sizeFormate(type.size ?? type.androidSize)
  //           types.push({ type: '320k', size })
  //           _types['320k'] = {
  //             size,
  //           }
  //           break
  //         case 'SQ':
  //           size = sizeFormate(type.size ?? type.androidSize)
  //           types.push({ type: 'flac', size })
  //           _types.flac = {
  //             size,
  //           }
  //           break
  //         case 'ZQ':
  //           size = sizeFormate(type.size ?? type.androidSize)
  //           types.push({ type: 'flac24bit', size })
  //           _types.flac24bit = {
  //             size,
  //           }
  //           break
  //       }
  //     })

  //     const albumNInfo = item.albums && item.albums.length
  //       ? {
  //           id: item.albums[0].id,
  //           name: item.albums[0].name,
  //         }
  //       : {}

  //     list.push({
  //       singer: this.getSinger(item.singers),
  //       name: item.name,
  //       albumName: albumNInfo.name,
  //       albumId: albumNInfo.id,
  //       songmid: item.songId,
  //       copyrightId: item.copyrightId,
  //       source: 'mg',
  //       interval: null,
  //       img: item.imgItems && item.imgItems.length ? item.imgItems[0].img : null,
  //       lrc: null,
  //       lrcUrl: item.lyricUrl,
  //       mrcUrl: item.mrcurl,
  //       trcUrl: item.trcUrl,
  //       otherSource: null,
  //       types,
  //       _types,
  //       typeUrl: {},
  //     })
  //   })
  //   return list
  // },

  // 咪咕有两条官方搜索接口，特性互补，这里并发竞速、先成功者胜：
  // - v3（jadeite）：字段全（含时长），但实测经常 5–15s 才回、甚至连接挂起；
  // - MIGUM2.0（app.c.nf）：稳定 0.6s 左右，但没有时长字段。
  // 慢的那条会在后台被丢弃；两条都失败才交给外层 search() 的重试。
  musicSearch(str, page, limit) {
    const v3 = () => {
      const time = Date.now().toString()
      const signData = createSignature(time, str)
      return httpFetch(`https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(str)}&pageNo=${page}&sort=0&sid=USS`, {
        timeout: 4000,
        headers: {
          uiVersion: 'A_music_3.6.1',
          deviceId: signData.deviceId,
          timestamp: time,
          sign: signData.sign,
          channel: '0146921',
          'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
        },
      }).promise.then(({ body }) => {
        if (!body || body.code !== '000000') throw new Error(`v3 code ${body && body.code}`)
        return body
      })
    }

    const m2 = () => {
      const searchSwitch = encodeURIComponent('{"song":1,"album":0,"singer":0,"tagSong":1,"mvSong":0,"bestShow":1}')
      const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1&pageNo=${page}&pageSize=${limit}&searchSwitch=${searchSwitch}&sort=0&text=${encodeURIComponent(str)}`
      return httpFetch(url, {
        timeout: 4000,
        headers: {
          channel: '0146921',
          'User-Agent': 'okhttp/3.9.1',
        },
      }).promise.then(({ body }) => normalizeM2Body(body))
    }

    return new Promise((resolve, reject) => {
      let settled = false
      let pending = 2
      let lastError = null
      const ok = (tag, body) => {
        if (settled) return
        settled = true
        appLog('mg:search:winner', { tag, page })
        resolve(body)
      }
      const fail = (tag, err) => {
        lastError = err
        appLog('mg:search:endpoint-fail', { tag, page, err: String(err?.message || err) })
        if (--pending === 0 && !settled) {
          settled = true
          reject(lastError || new Error('mg search failed'))
        }
      }
      v3().then(body => ok('v3', body)).catch(err => fail('v3', err))
      m2().then(body => ok('m2', body)).catch(err => fail('m2', err))
    })
  },
  filterData(rawData) {
    // console.log(rawData)
    const list = []
    const ids = new Set()

    rawData.forEach(item => {
      item.forEach(data => {
        if (!data.songId || !data.copyrightId || ids.has(data.copyrightId)) return
        ids.add(data.copyrightId)

        const types = []
        const _types = {}
        data.audioFormats && data.audioFormats.forEach(type => {
          let size
          switch (type.formatType) {
            case 'PQ':
              size = sizeFormate(type.asize ?? type.isize)
              types.push({ type: '128k', size })
              _types['128k'] = {
                size,
              }
              break
            case 'HQ':
              size = sizeFormate(type.asize ?? type.isize)
              types.push({ type: '320k', size })
              _types['320k'] = {
                size,
              }
              break
            case 'SQ':
              size = sizeFormate(type.asize ?? type.isize)
              types.push({ type: 'flac', size })
              _types.flac = {
                size,
              }
              break
            case 'ZQ24':
              size = sizeFormate(type.asize ?? type.isize)
              types.push({ type: 'flac24bit', size })
              _types.flac24bit = {
                size,
              }
              break
          }
        })
        let img = data.img3 || data.img2 || data.img1 || null
        if (img && !/https?:/.test(data.img3)) img = 'http://d.musicapp.migu.cn' + img

        list.push({
          id: 'mg_' + data.copyrightId,
          singer: formatSingerName(data.singerList),
          name: data.name,
          albumName: data.album,
          albumId: data.albumId,
          songmid: data.songId,
          copyrightId: data.copyrightId,
          source: 'mg',
          interval: formatPlayTime(data.duration),
          img,
          lrc: null,
          lrcUrl: data.lrcUrl,
          mrcUrl: data.mrcurl,
          trcUrl: data.trcUrl,
          types,
          _types,
          typeUrl: {},
        })
      })
    })
    return list
  },
  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    // http://newlyric.kuwo.cn/newlyric.lrc?62355680
    return this.musicSearch(str, page, limit).catch(() => {
      // 网络错误（超时/连接失败等），通过延迟重试机制重试
      return this.delayRetry(str, page, limit, retryNum)
    }).then(result => {
      // console.log(result)
      if (!result || result.code !== '000000') return this.delayRetry(str, page, limit, retryNum)
      const songResultData = result.songResultData || { resultList: [], totalCount: 0 }

      let list = this.filterData(songResultData.resultList)
      if (list == null) return this.delayRetry(str, page, limit, retryNum)

      this.total = parseInt(songResultData.totalCount)
      this.page = page
      this.allPage = Math.ceil(this.total / limit)

      return {
        list,
        allPage: this.allPage,
        limit,
        total: this.total,
        source: 'mg',
      }
    })
  },

  /** 带延迟的重试，避免立即重试仍失败 */
  delayRetry(str, page, limit, retryNum) {
    return new Promise(resolve => setTimeout(resolve, 300 * retryNum)).then(() => this.search(str, page, limit, retryNum))
  },
}
