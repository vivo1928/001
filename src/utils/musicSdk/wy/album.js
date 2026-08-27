// https://github.com/Binaryify/NeteaseCloudMusicApi/blob/master/module/album.js
import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'
import { dateFormat } from '../../index'
import musicDetailApi from './musicDetail'

const filterSongs = (songs, privileges) => musicDetailApi.filterList({ songs, privileges })

const fetchAlbumDetail = async(id) => {
  // 用 weapi 加密请求（明文 /api/album/{id} 已被风控返回 -462，weapi 与歌曲详情等可用接口一致）
  const requestObj = httpFetch(`https://music.163.com/weapi/v1/album/${id}`, {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
      Referer: 'https://music.163.com/album?id=' + id,
      origin: 'https://music.163.com',
    },
    form: weapi({}),
  })
  const { statusCode, body } = await requestObj.promise
  if (statusCode !== 200 || body.code !== 200 || !body.album) throw new Error('获取专辑详情失败')
  return body
}

const getAlbumDetail = async(id, page = 1, limit = 100) => {
  // 网易云专辑详情接口：返回 { album, songs, privileges }
  // songs + privileges 结构与 musicDetail.filterList 兼容，直接复用转换
  const body = await fetchAlbumDetail(id)

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
