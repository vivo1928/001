import { httpFetch } from '../../request'
import { formatPlayTime, sizeFormate } from '../../index'
import { formatSingerName } from '../utils'

export default {
  limit: 200,

  async getAlbumDetail(id, page = 1) {
    const res = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
        'Referer': 'https://y.qq.com',
      },
      body: {
        comm: {
          ct: 24,
          cv: 10000,
        },
        albumSongList: {
          method: 'GetAlbumSongList',
          module: 'music.musichallAlbum.AlbumSongList',
          param: {
            albumMid: id,
            begin: (page - 1) * this.limit,
            num: this.limit,
            order: 2,
          },
        },
      },
    }).promise

    const body = res.body
    if (body.code !== 0 || !body.albumSongList || body.albumSongList.code !== 0) {
      throw new Error('Get album detail failed: ' + (body.albumSongList?.code || body.code))
    }

    const data = body.albumSongList.data
    const list = (data.songList || []).map(item => {
      const songInfo = item.songInfo || item
      let types = []
      let _types = {}
      if (songInfo.file?.size_128mp3) {
        let size = sizeFormate(songInfo.file.size_128mp3)
        types.push({ type: '128k', size })
        _types['128k'] = { size }
      }
      if (songInfo.file?.size_320mp3) {
        let size = sizeFormate(songInfo.file.size_320mp3)
        types.push({ type: '320k', size })
        _types['320k'] = { size }
      }
      if (songInfo.file?.size_flac) {
        let size = sizeFormate(songInfo.file.size_flac)
        types.push({ type: 'flac', size })
        _types.flac = { size }
      }
      if (songInfo.file?.size_hires) {
        let size = sizeFormate(songInfo.file.size_hires)
        types.push({ type: 'flac24bit', size })
        _types.flac24bit = { size }
      }

      return {
        singer: formatSingerName(songInfo.singer, 'name'),
        name: songInfo.title || songInfo.name,
        albumName: data.albumName || '',
        albumId: id,
        source: 'tx',
        interval: formatPlayTime(songInfo.interval),
        songId: songInfo.id,
        albumMid: id,
        strMediaMid: songInfo.file?.media_mid,
        songmid: songInfo.mid,
        img: `https://y.gtimg.cn/music/photo_new/T002R500x500M000${id}.jpg`,
        lrc: null,
        otherSource: null,
        types,
        _types,
        typeUrl: {},
      }
    })

    return {
      list,
      page,
      limit: this.limit,
      total: data.totalNum || data.total_song_num || 0,
      source: 'tx',
      info: {
        name: data.albumName || '',
        img: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${id}.jpg`,
        desc: data.albumDesc || '',
        author: data.singerName || '',
      },
    }
  },
}