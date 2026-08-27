// https://github.com/Binaryify/NeteaseCloudMusicApi/blob/master/module/album.js
import { httpFetch } from '../../request'
import { dateFormat } from '../../index'
import musicDetailApi from './musicDetail'

const filterSongs = (songs, privileges) => musicDetailApi.filterList({ songs, privileges })

const getAlbumDetail = async(id, page = 1, limit = 100) => {
  // 网易云专辑详情公开接口：返回 { album, songs, privileges }
  // songs + privileges 结构与 musicDetail.filterList 兼容，直接复用转换
  const requestObj = httpFetch(`https://music.163.com/api/album/${id}`, {
    method: 'get',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
      Referer: 'https://music.163.com/',
      origin: 'https://music.163.com',
    },
  })
  const { statusCode, body } = await requestObj.promise
  if (statusCode !== 200 || body.code !== 200 || !body.album) throw new Error('获取专辑详情失败')

  const album = body.album
  const songs = body.songs || []
  const privileges = body.privileges || []

  const total = songs.length
  const allPage = Math.max(1, Math.ceil(total / limit))
  const list = filterSongs(songs, privileges)

  return {
    list,
    page,
    limit,
    total,
    allPage,
    source: 'wy',
    info: {
      name: album.name,
      img: album.picUrl || album.blurPicUrl || '',
      desc: album.description || '',
      author: album.artist ? album.artist.name : (album.artists && album.artists[0] ? album.artists[0].name : ''),
      publish_date: album.publishTime ? dateFormat(album.publishTime, 'Y-M-D') : '',
    },
  }
}

export default {
  getAlbumDetail,
}
