import { createHttpFetch } from './utils'
import { filterMusicInfoList } from './musicInfo'

// 搜索歌手专用的 searchSwitch（只查歌手）
const SINGER_SEARCH_SWITCH = '%7B%22song%22%3A0%2C%22album%22%3A0%2C%22singer%22%3A1%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22songlist%22%3A0%2C%22bestShow%22%3A0%7D'

export default {
  /**
   * 按歌手名搜索歌手ID（供跨源兜底使用）
   * 使用 MIGUM2.0 search_all.do，只搜索歌手类别
   */
  async searchSingerId(name) {
    if (!name) return null
    try {
      const body = await createHttpFetch(
        `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1&pageNo=1&pageSize=3&searchSwitch=${SINGER_SEARCH_SWITCH}&sort=0&text=${encodeURIComponent(name)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
          },
        },
      )
      // 接口返回 singerResultData.result（元素 {id, name}），非 body.list
      const result = body?.singerResultData?.result || []
      if (result.length > 0 && result[0].id) return result[0].id
      return null
    } catch {
      // 兜底：尝试 app.c 的 searchSinger 端点
      try {
        const body = await createHttpFetch(
          `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/searchSinger.do?text=${encodeURIComponent(name)}&pageNo=1&pageSize=3`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
            },
          },
        )
        if (!body || !body.singerList) return null
        const singer = body.singerList[0]
        if (singer && singer.singerId) return singer.singerId
      } catch {
        /* silent */
      }
      return null
    }
  },
  async getSingerInfo(singerid) {
    // 尝试多个端点获取歌手信息
    let info = null

    // 端点 1：MIGUM3.0 resource singer（当前使用，可能仍有部分数据）
    try {
      info = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/resource/singer/v2.0?singerId=${singerid}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
        },
      })
      if (info && (info.title || info.singerName || info.summary || info.intro || info.imgItems)) {
        return {
          name: info.title || info.singerName || '',
          image: info.imgItems && info.imgItems.length ? info.imgItems[0].img : null,
          desc: info.summary || info.intro || '',
          song_count: info.songCount || 0,
          album_count: info.albumCount || 0,
        }
      }
    } catch (err) {
      console.log(`[mg singer] resource/v2.0 failed: ${err?.message || err}`)
    }

    // 端点 2：MIGUM3.0 resource singer v1.0
    try {
      info = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/resource/singer/v1.0?singerId=${singerid}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
        },
      })
      if (info && (info.title || info.singerName)) {
        return {
          name: info.title || info.singerName || '',
          image: info.imgItems && info.imgItems.length ? info.imgItems[0].img : null,
          desc: info.summary || info.intro || '',
        }
      }
    } catch (err) {
      console.log(`[mg singer] resource/v1.0 failed: ${err?.message || err}`)
    }

    // 端点 3：MIGUM2.0 singer info
    try {
      info = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querySinger?id=${singerid}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
        },
      })
      if (info && (info.singerName || info.title)) {
        return {
          name: info.singerName || info.title || '',
          image: info.imgItems && info.imgItems.length ? info.imgItems[0].img : (info.img || null),
          desc: info.summary || info.intro || '',
        }
      }
    } catch (err) {
      console.log(`[mg singer] querySinger failed: ${err?.message || err}`)
    }

    return Promise.reject(new Error('MG singer info API is currently unavailable'))
  },
  async getSingerSongList(singerid, page, limit) {
    try {
      const list = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querySingerSong?singerId=${singerid}&pageNo=${page}&pageSize=${limit}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
        },
      })
      if (!list || !list.songList) return Promise.reject(new Error('Get singer song list error.'))

      const songList = filterMusicInfoList(list.songList).map(item => {
        // 补齐完整分级音质（flac24bit/flac/320k/128k/hires/atmos/master），确保播放可从设置档向下递进
        if (!item.types) item.types = []
        if (!item._types) item._types = {}
        for (const q of ['flac24bit', 'flac', '320k', '128k', 'hires', 'atmos', 'master']) {
          if (!item._types[q]) {
            const size = (q === 'hires' || q === 'atmos' || q === 'atmos_plus' || q === 'master') ? '' : ''
            item.types.push({ type: q, size })
            item._types[q] = { size }
          }
        }
        return item
      })
      const singerInfo = await this.getSingerInfo(singerid).catch(() => ({}))

      return {
        list: songList || [],
        page,
        limit,
        total: list.totalCount || 0,
        source: 'mg',
        info: {
          name: singerInfo.name || '',
          img: singerInfo.image,
          desc: singerInfo.desc || '',
        },
      }
    } catch (err) {
      return Promise.reject(new Error('MG singer song list API is currently unavailable: ' + (err.message || err)))
    }
  },
  async getSingerAlbumList(singerid, page, limit) {
    try {
      const list = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryArtistAlbum?singerId=${singerid}&pageNo=${page}&pageSize=${limit}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
        },
      })
      if (!list || !list.albumList) return Promise.reject(new Error('Get singer album list error.'))

      const albums = list.albumList.map(item => {
        const img = item.imgItems && item.imgItems.length ? item.imgItems[0].img : null
        return {
          id: String(item.id),
          name: item.name || '',
          singer: item.singer || '',
          img: img || null,
          source: 'mg',
          publish_date: item.publishDate || '',
          song_count: item.songCount || item.totalSongCount || 0,
        }
      })

      return {
        source: 'mg',
        albums,
        singerid,
        total: list.totalCount || 0,
        allPage: Math.ceil((list.totalCount || 0) / limit) || 1,
      }
    } catch (err) {
      return Promise.reject(new Error('MG singer album list API is currently unavailable: ' + (err.message || err)))
    }
  },
}
