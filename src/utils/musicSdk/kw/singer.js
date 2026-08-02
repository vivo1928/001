import { httpFetch } from '../../request'
import { decodeName } from '../../index'

export default {
  async getSingerAlbumList(singerid, page, limit) {
    if (!singerid) throw new Error('歌手不存在')
    const requestObj = httpFetch(`http://www.kuwo.cn/api/www/artist/artistAlbum?artistid=${singerid}&pn=${page}&rn=${limit}&httpsStatus=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        'Referer': 'http://www.kuwo.cn/',
      },
    })
    let { body, statusCode } = await requestObj.promise
    if (statusCode !== 200 || !body) throw new Error('获取歌手专辑列表失败')
    if (body.code !== 200 || !body.data) throw new Error('获取歌手专辑列表失败: ' + (body.msg || '无数据'))
    const rawList = body.data.albumList || []
    const albums = rawList.map(item => ({
      id: item.albumId || item.albumid,
      name: decodeName(item.albumName || item.name || ''),
      singer: decodeName(item.artist || item.ARTIST || ''),
      img: (item.pic || item.picpath || '') ? `http://img1.kuwo.cn/star/albumcover/${item.pic || item.picpath}` : '',
      source: 'kw',
      publish_date: item.pubTime || item.publish_date || item.releaseDate || '',
      song_count: item.song_count || item.total || 0,
    }))
    return {
      source: 'kw',
      albums,
      singerid,
      total: body.data.total || 0,
      allPage: Math.ceil((body.data.total || 0) / limit) || 1,
    }
  },
}