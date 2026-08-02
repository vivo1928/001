import { httpFetch } from '../../request'
// import { decodeName, formatPlayTime, sizeFormate } from '../../index'
// import { signatureParams } from './util'
import { getMusicInfosByList } from './musicInfo'

const SINGER_HOSTS = ['mobilecdnbj.kugou.com', 'mobilecdn.kugou.com', 'mobcdn.kugou.com']

/**
 * 向多个主机依次请求，第一个成功即返回
 */
async function fetchWithFallback(hosts, buildUrl, timeoutMs = 10000) {
  const errors = []
  for (const host of hosts) {
    try {
      const url = buildUrl(host)
      const requestObj = httpFetch(url, { timeout: timeoutMs })
      let { body, statusCode } = await requestObj.promise
      if (statusCode !== 200) {
        errors.push(`${host}: status ${statusCode}`)
        continue
      }
      // KG API 可能返回 HTML 注释包裹的 JSON
      if (typeof body === 'string') {
        body = body.replace(/<!--KG_TAG_RES_START-->/, '').replace(/<!--KG_TAG_RES_END-->/, '')
        try { body = JSON.parse(body) } catch (e) {}
      }
      return body
    } catch (err) {
      errors.push(`${host}: ${err.message || err}`)
    }
  }
  throw new Error(errors.join('; '))
}

const stripHtml = (str) => (str || '').replace(/<[^>]+>/g, '')

export default {
  async getSingerInfo(singerid) {
    if (singerid == 0) throw new Error('歌手不存在')
    const body = await fetchWithFallback(SINGER_HOSTS, (host) =>
      `http://${host}/api/v3/singer/info?singerid=${singerid}&with_res_tag=1`
    )
    if (!body || body.errcode !== 0 || !body.data) {
      throw new Error('获取歌手信息失败: ' + (body?.error || body?.errmsg || '无数据'))
    }
    return {
      source: 'kg',
      singerid,
      info: {
        name: body.data.singername || '',
        desc: body.data.intro || '',
        img: (body.data.imgurl || '').replace('{size}', '480'),
      },
    }
  },
  async getSingerSongList(singerid, page, limit) {
    if (singerid == 0) throw new Error('歌手不存在')
    const body = await fetchWithFallback(SINGER_HOSTS, (host) =>
      `http://${host}/api/v3/singer/song?sorttype=2&version=9108&identity=3&plat=0&pagesize=${limit}&singerid=${singerid}&area_code=1&page=${page}&with_res_tag=1`
    )
    if (!body || body.errcode !== 0 || !body.data) {
      throw new Error('获取歌手歌曲列表失败: ' + (body?.error || body?.errmsg || '无数据'))
    }
    const infoList = body.data.info || body.data.lists || []
    if (!infoList.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')
    let listData = await getMusicInfosByList(infoList)
    const singerInfo = await this.getSingerInfo(singerid).catch(() => null)
    return {
      source: 'kg',
      list: listData,
      id: `kg__singer_${singerid}`,
      singerid,
      total: body.data.total || 0,
      limit,
      allPage: Math.ceil((body.data.total || 0) / limit) || 1,
      info: {
        name: singerInfo?.info?.name || '',
        img: singerInfo?.info?.img,
        desc: singerInfo?.info?.desc || '',
      },
    }
  },
  async getSingerAlbumList(singerid, page, limit) {
    if (singerid == 0) throw new Error('歌手不存在')
    const body = await fetchWithFallback(SINGER_HOSTS, (host) =>
      `http://${host}/api/v3/singer/album?version=9108&plat=0&pagesize=${limit}&singerid=${singerid}&category=1&area_code=1&page=${page}&show_album_tag=0`
    )
    if (!body || body.errcode !== 0 || !body.data) {
      throw new Error('获取歌手专辑列表失败: ' + (body?.error || body?.errmsg || '无数据'))
    }
    const albums = (body.data.info || body.data.list || []).map(item => ({
      id: item.albumid,
      name: stripHtml(item.albumname || ''),
      singer: stripHtml(item.singername || ''),
      img: (item.imgurl || '').replace('{size}', '480'),
      source: 'kg',
      publish_date: item.publishtime ? item.publishtime.slice(0, 10) : (item.publishdate || ''),
      song_count: item.songcount || 0,
    }))
    return {
      source: 'kg',
      albums,
      singerid,
      total: body.data.total || 0,
      allPage: Math.ceil((body.data.total || 0) / limit) || 1,
    }
  },
}