const { httpFetch } = require('../../request')
const { formatSingerName } = require('../utils')

module.exports = {
  async getSingerAlbumList(singerMID, page, limit) {
    if (!singerMID) throw new Error('歌手不存在')
    const requestObj = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
        'Referer': 'https://y.qq.com',
        'Content-Type': 'application/json',
      },
      body: {
        req_1: {
          module: 'music.singerAlbum.SingerAlbum',
          method: 'get_singer_album',
          param: {
            singerMID,
            begin: (page - 1) * limit,
            num: limit,
          },
        },
      },
    })
    let { body, statusCode } = await requestObj.promise
    if (statusCode !== 200 || !body) throw new Error('获取歌手专辑列表失败')
    if (body.code !== 0 || !body.req_1 || body.req_1.code !== 0) throw new Error('获取歌手专辑列表失败: ' + (body.req_1?.msg || '无数据'))
    const data = body.req_1.data
    const rawList = data.list || []
    const albums = rawList.map(item => ({
      id: item.albumMID || item.album_mid || item.mid,
      name: item.albumName || item.album_name || item.name,
      singer: formatSingerName(item.singer_list || item.singers || item.singer || [], 'name'),
      img: (item.albumMID || item.album_mid) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albumMID || item.album_mid}.jpg` : (item.albumPic || ''),
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