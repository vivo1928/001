const { eapiRequest } = require('./utils/index')

const filterSongList = (rawList, singerid) => {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map(item => {
    const artists = (item.ar || item.artists || []).map(a => a.name).join('、')
    const types = []
    const _types = {}
    // 简化处理：只返回基本信息，由 getMusicInfosByList 补充详情
    return {
      id: 'wy_' + item.id,
      singer: artists || '',
      name: item.name || '',
      albumName: (item.al?.name) || (item.album?.name) || '',
      albumId: (item.al?.id) || (item.album?.id) || '',
      source: 'wy',
      interval: item.dt ? Math.floor(item.dt / 1000) : 0,
      songmid: item.id,
      img: (item.al?.picUrl) || (item.album?.picUrl) || '',
      lrc: null,
      types,
      _types,
      typeUrl: {},
    }
  })
}

const filterAlbumList = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  return rawList.map(item => ({
    id: String(item.id),
    name: item.name || '',
    singer: (item.artist?.name) || (item.artist?.userName) || '',
    img: item.picUrl || item.coverImgUrl || item.blurPicUrl || '',
    source: 'wy',
    publish_date: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : '',
    song_count: item.size || 0,
  }))
}

module.exports = {
  async getSingerInfo(singerid) {
    if (!singerid) throw new Error('歌手不存在')
    const requestObj = eapiRequest('/api/v1/artist/detail', { id: singerid })
    const { body } = await requestObj.promise
    if (!body || body.code !== 200) {
      throw new Error('获取歌手信息失败: ' + (body?.msg || '无数据'))
    }
    const data = body.data || {}
    const artist = data.artist || {}
    const briefDesc = artist.briefDesc || ''
    const alias = Array.isArray(artist.alias) ? artist.alias.join(' ') : ''
    const introParts = (artist.introduction || [])
      .map(item => {
        const title = item.title || item.ti || ''
        const text = item.text || item.txt || ''
        return [title, text].filter(Boolean).join('\n')
      })
      .filter(Boolean)
    const desc = [briefDesc || alias, ...introParts].filter(Boolean).join('\n\n')
    return {
      source: 'wy',
      singerid,
      info: {
        name: artist.name || '',
        desc,
        img: artist.cover || artist.picUrl || artist.img1v1Url || '',
      },
    }
  },
  async getSingerSongList(singerid, page, limit) {
    if (!singerid) throw new Error('歌手不存在')
    const offset = (page - 1) * limit
    const requestObj = eapiRequest('/api/v1/artist/songs', {
      id: singerid,
      offset,
      limit,
      order: 'hot',
    })
    const { body } = await requestObj.promise
    if (!body || body.code !== 200) {
      throw new Error('获取歌手歌曲列表失败: ' + (body?.msg || '无数据'))
    }
    const songs = body.songs || []
    if (!songs.length) throw new Error('获取歌手歌曲列表失败: 歌曲列表为空')
    const list = filterSongList(songs, singerid)
    const singerInfo = await this.getSingerInfo(singerid).catch(() => null)
    return {
      source: 'wy',
      list,
      id: `wy__singer_${singerid}`,
      singerid,
      total: body.total || 0,
      limit,
      allPage: Math.ceil((body.total || 0) / limit) || 1,
      info: {
        name: singerInfo?.info?.name || '',
        img: singerInfo?.info?.img,
        desc: singerInfo?.info?.desc || '',
      },
    }
  },
  async getSingerAlbumList(singerid, page, limit) {
    if (!singerid) throw new Error('歌手不存在')
    const offset = (page - 1) * limit
    const requestObj = eapiRequest('/api/artist/albums/' + singerid, {
      offset,
      limit,
    })
    const { body } = await requestObj.promise
    if (!body || body.code !== 200) {
      throw new Error('获取歌手专辑列表失败: ' + (body?.msg || '无数据'))
    }

    // 注意：网易云 API 返回两个字段：
    //   hotAlbums - 热门专辑（最多约12-15张，不受分页影响）
    //   albums    - 全部专辑（支持分页），但仅在 offset=0 时返回
    // 对于后续分页，只能通过 albums 分页来获取
    const hotAlbums = filterAlbumList(body.hotAlbums || [])
    const paginatedAlbums = filterAlbumList(body.albums || [])

    let albums
    if (page === 1) {
      // 第一页：合并热门专辑和分页专辑，按 id 去重
      const seenIds = new Set()
      albums = []
      for (const item of [...hotAlbums, ...paginatedAlbums]) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id)
          albums.push(item)
        }
      }
    } else {
      // 后续页：直接用分页专辑
      albums = paginatedAlbums
    }

    return {
      source: 'wy',
      albums,
      singerid,
      total: body.total || 0,
      allPage: Math.ceil((body.total || 0) / limit) || 1,
    }
  },
}