import { createHttpFetch } from './utils'
import { filterMusicInfoList } from './musicInfo'
import { formatPlayCount } from '../../index'

export default {
  async getSingerInfo(singerid) {
    // MG singer info API is currently broken, fall back to musicSearch
    try {
      const info = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/resource/singer/v2.0?singerId=${singerid}`)
      if (!info) return Promise.reject(new Error('Get singer info error.'))
      return {
        name: info.title || info.singerName || '',
        image: info.imgItems && info.imgItems.length ? info.imgItems[0].img : null,
        desc: info.summary || info.intro || '',
        song_count: info.songCount || 0,
        album_count: info.albumCount || 0,
      }
    } catch (err) {
      return Promise.reject(new Error('MG singer info API is currently unavailable'))
    }
  },
  async getSingerSongList(singerid, page, limit) {
    try {
      const list = await createHttpFetch(`http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querySingerSong?singerId=${singerid}&pageNo=${page}&pageSize=${limit}`)
      if (!list || !list.songList) return Promise.reject(new Error('Get singer song list error.'))

      const songList = filterMusicInfoList(list.songList)
      const info = await this.getSingerInfo(singerid).catch(() => ({}))

      return {
        list: songList || [],
        page,
        limit,
        total: list.totalCount || 0,
        source: 'mg',
        info: {
          name: info.name || '',
          img: info.image,
          desc: info.desc || '',
        },
      }
    } catch (err) {
      return Promise.reject(new Error('MG singer song list API is currently unavailable: ' + (err.message || err)))
    }
  },
  async getSingerAlbumList(singerid, page, limit) {
    try {
      const list = await createHttpFetch(`http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryArtistAlbum?singerId=${singerid}&pageNo=${page}&pageSize=${limit}`)
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