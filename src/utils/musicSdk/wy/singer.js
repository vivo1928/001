const { eapiRequest, directRequest } = require('./utils/index')

const filterSongList = (rawList, singerid, privileges) => {
  if (!rawList || !Array.isArray(rawList)) return []
  const privMap = new Map()
  if (privileges) {
    for (const p of privileges) {
      if (p && p.id) privMap.set(p.id, p)
    }
  }
  return rawList.map(item => {
    const artists = (item.ar || item.artists || []).map(a => a.name).join('、')
    const types = []
    const _types = {}
    const priv = privMap.get(item.id) || item.privilege || {}
    const maxbr = priv.maxbr || 0
    if (maxbr >= 999000) {
      types.push({ type: 'flac', size: '' })
      _types.flac = { size: '' }
    }
    if (maxbr >= 320000 && maxbr < 999000) {
      types.push({ type: '320k', size: '' })
      _types['320k'] = { size: '' }
    }
    if (maxbr >= 128000) {
      const has128 = !types.some(t => t.type === '320k' || t.type === 'flac')
      if (has128 || maxbr < 320000) {
        types.push({ type: '128k', size: '' })
        _types['128k'] = { size: '' }
      }
    }
    if (maxbr >= 192000 && maxbr < 320000) {
      types.push({ type: '192k', size: '' })
      _types['192k'] = { size: '' }
    }
    // 补齐完整分级音质（flac24bit/flac/320k/128k/hires/atmos/master），确保播放可从设置档向下递进
    for (const q of ['flac24bit', 'flac', '320k', '128k', 'hires', 'atmos', 'master']) {
      if (!_types[q]) {
        const size = (q === 'hires' || q === 'atmos' || q === 'atmos_plus' || q === 'master') ? '' : ''
        types.push({ type: q, size })
        _types[q] = { size }
      }
    }
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
      otherSource: null,
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
  /**
   * 按歌手名搜索歌手ID（供跨源兜底使用）
   */
  async searchSingerId(name) {
    if (!name) return null
    try {
      const requestObj = eapiRequest('/api/search/get', { s: name, limit: 1, type: 100, offset: 0 })
      const { body } = await requestObj.promise
      if (!body || body.code !== 200) return null
      const artists = body.result?.artists || []
      if (artists.length && artists[0].id) return artists[0].id
      return null
    } catch {
      return null
    }
  },
  async getSingerInfo(singerid) {
    if (!singerid) throw new Error('歌手不存在')
    // 1. 优先获取完整歌手介绍（分段详细介绍）
    try {
      const requestObj = eapiRequest('/api/artist/desc', { id: singerid })
      const { body } = await requestObj.promise
      if (body && body.code === 200 && body.artistDesc) {
        const artistDesc = body.artistDesc
        const briefDesc = String(artistDesc.briefDesc || '').trim()
        const rawIntro = Array.isArray(artistDesc.intro) ? artistDesc.intro : []
        // 分章结构：每项 { ti: 章节标题, txt: 章节内容 }，便于提取"获奖记录/个人荣誉"等章节
        const intro = rawIntro.map(i => ({ title: String(i.ti || '').trim(), content: String(i.txt || '').trim() })).filter(i => i.content)
        const introText = intro.map(i => i.title ? `${i.title}\n${i.content}` : i.content).filter(Boolean).join('\n')
        const desc = introText || briefDesc
        return {
          source: 'wy',
          singerid,
          info: {
            name: artistDesc.briefDesc && artistDesc.artist?.name ? artistDesc.artist.name : (artistDesc.name || ''),
            desc,
            img: artistDesc.artist?.cover || artistDesc.artist?.picUrl || '',
            intro,
          },
        }
      }
    } catch { /* fallback to detail */ }

    // 2. 降级：artist/detail（eapi）
    try {
      const requestObj = eapiRequest('/api/v1/artist/detail', { id: singerid })
      const { body } = await requestObj.promise
      if (body && body.code === 200) {
        const data = body.data || {}
        return {
          source: 'wy',
          singerid,
          info: {
            name: data.artist?.name || '',
            desc: (data.artist?.briefDesc || data.artist?.alias || []).join(' '),
            img: data.artist?.cover || data.artist?.picUrl || data.artist?.img1v1Url || '',
          },
        }
      }
    } catch { /* fallback to direct API */ }

    // 3. 再次降级：非 eapi 直连 API
    try {
      const requestObj = directRequest('/weapi/v1/artist/detail', { id: singerid })
      const { body } = await requestObj.promise
      if (body && body.code === 200) {
        const data = body.data || {}
        return {
          source: 'wy',
          singerid,
          info: {
            name: data.artist?.name || '',
            desc: (data.artist?.briefDesc || data.artist?.alias || []).join(' '),
            img: data.artist?.cover || data.artist?.picUrl || data.artist?.img1v1Url || '',
          },
        }
      }
    } catch { /* final throw */ }

    throw new Error('获取歌手信息失败: 所有端点均无数据')
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
    const list = filterSongList(songs, singerid, body.privileges)
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
  /**
   * 获取歌手最新发行的单曲（order=time 按发行时间倒序）
   * 平台实时维护、自动更新到当下，是覆盖最新年份的最可靠信号源
   */
  async getSingerLatestSongs(singerid, limit = 15) {
    if (!singerid) throw new Error('歌手不存在')
    const requestObj = eapiRequest('/api/v1/artist/songs', {
      id: singerid,
      offset: 0,
      limit: limit + 5,
      order: 'time',
    })
    const { body } = await requestObj.promise
    if (!body || body.code !== 200 || !body.songs) {
      throw new Error('获取歌手最新单曲失败: ' + (body?.msg || '无数据'))
    }
    return body.songs
      .map((s) => {
        const publishTime = s.publishTime || s.album?.publishTime || 0
        return {
          name: String(s.name || '').trim(),
          songId: String(s.id ?? ''),
          albumId: String(s.album?.id ?? ''),
          albumName: String(s.album?.name || '').trim(),
          img: s.album?.picUrl || s.al?.picUrl || '',
          publishTime,
        }
      })
      .filter(s => s.name && s.publishTime > 0)
      .sort((a, b) => b.publishTime - a.publishTime)
      .slice(0, limit)
  },
}
