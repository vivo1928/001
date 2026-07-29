import { createHttpFetch } from './utils'
import { filterMusicInfoList } from './musicInfo'
import { formatPlayCount } from '../../index'

export default {
  async getSingerInfo(singerid) {
    // MG singer info API is currently broken, fall back to musicSearch
    // The v2.0 endpoint returns "路由请求不支持"
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
    // MG singer song list API is currently broken
    // The v1.0 endpoint returns "路由请求不支持"
    // Fall back to musicSearch in the caller
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
}