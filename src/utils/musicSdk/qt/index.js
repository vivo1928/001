import { httpFetch } from '../../request'
import { formatPlayTime } from '../../index'

/**
 * 蜻蜓FM 听书源
 * 
 * 提供:
 * - search: 搜索专辑/主播
 * - getAlbumDetail: 获取专辑章节列表
 * - getAnchorDetail: 获取主播专辑列表
 */

const QT_SEARCH_API = 'https://search.qingting.fm/v3/search'
const QT_PC_API = 'https://pcapi.qingting.fm/v2/media'

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://m.qingting.fm/',
}

// 搜索: type = 'album' | 'anchor'
const search = async (keyword, page = 1, type = 'album', limit = 30) => {
  const url = `${QT_SEARCH_API}?q=${encodeURIComponent(keyword)}&page=${page}&pageSize=${limit}&type=${type}`
  const { body } = await httpFetch(url, { headers: defaultHeaders }).promise
  
  if (!body || body.errorno !== 0) {
    throw new Error('蜻蜓FM搜索失败: ' + (body?.errormsg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0 }

  if (type === 'album') {
    const albums = data.albumList || data.albums || data.items || []
    const list = albums.map(item => ({
      id: String(item.albumId || item.id),
      name: item.albumName || item.title || item.name || '',
      author: item.anchorName || item.author || '',
      img: item.coverLarge || item.cover || item.img || '',
      desc: item.albumDesc || item.description || '',
      playCount: item.playCount || 0,
      trackCount: item.trackCount || item.programCount || 0,
      source: 'qt',
      categoryId: item.categoryId || '',
      categoryName: item.categoryName || '',
    }))
    return {
      list,
      total: data.total || data.totalCount || 0,
      page,
      limit,
      allPage: Math.ceil((data.total || 0) / limit),
      source: 'qt',
    }
  } else {
    // anchor 类型
    const anchors = data.anchorList || data.anchors || data.items || []
    const list = anchors.map(item => ({
      id: String(item.anchorId || item.id),
      name: item.anchorName || item.name || '',
      author: '',
      img: item.avatar || item.cover || item.img || '',
      desc: item.signature || item.description || '',
      followerCount: item.followerCount || 0,
      albumCount: item.albumCount || 0,
      source: 'qt',
      isAnchor: true,
    }))
    return {
      list,
      total: data.total || 0,
      page,
      limit,
      allPage: Math.ceil((data.total || 0) / limit),
      source: 'qt',
    }
  }
}

// 获取专辑章节列表
const getAlbumDetail = async (albumId, page = 1, limit = 200) => {
  // 蜻蜓FM专辑详情
  const url = `${QT_PC_API}/album/${albumId}/programs?page=${page}&pageSize=${limit}`
  const { body } = await httpFetch(url, { headers: defaultHeaders }).promise
  
  if (!body || body.errorno !== 0) {
    throw new Error('蜻蜓FM获取专辑详情失败: ' + (body?.errormsg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit }

  const programs = data.items || data.programs || data.list || []
  const albumInfo = data.albumInfo || data.album || {}

  const list = programs.map((item, index) => ({
    singer: item.anchorName || item.author || '',
    name: item.programName || item.title || item.name || '',
    albumName: albumInfo.albumName || albumInfo.title || '',
    albumId: String(albumId),
    songmid: String(item.programId || item.id),
    source: 'qt',
    interval: formatPlayTime(parseInt(item.duration || '0')),
    img: albumInfo.cover || albumInfo.img || '',
    lrc: null,
    hash: String(item.programId || item.id),
    otherSource: null,
    types: [{ type: '128k', size: null }],
    _types: { '128k': { size: null } },
    typeUrl: {},
    isAudiobook: true,
    trackId: item.programId || item.id,
    playUrl: item.playUrl || '',
    playSize: item.playSize || 0,
  }))

  return {
    list,
    total: data.total || 0,
    page,
    limit,
    allPage: Math.ceil((data.total || 0) / limit),
    source: 'qt',
    info: {
      name: albumInfo.albumName || albumInfo.title || '',
      img: albumInfo.cover || albumInfo.img || '',
      desc: albumInfo.albumDesc || albumInfo.description || '',
      author: albumInfo.anchorName || albumInfo.author || '',
    },
  }
}

// 获取主播的专辑列表
const getAnchorDetail = async (anchorId, page = 1, limit = 30) => {
  const url = `${QT_PC_API}/anchor/${anchorId}/albums?page=${page}&pageSize=${limit}`
  const { body } = await httpFetch(url, { headers: defaultHeaders }).promise
  
  if (!body || body.errorno !== 0) {
    throw new Error('蜻蜓FM获取主播详情失败: ' + (body?.errormsg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit }

  const albums = data.items || data.albums || data.list || []
  const anchorInfo = data.anchorInfo || data.anchor || {}

  const list = albums.map(item => ({
    id: String(item.albumId || item.id),
    name: item.albumName || item.title || item.name || '',
    author: anchorInfo.anchorName || item.anchorName || '',
    img: item.cover || item.img || '',
    desc: item.albumDesc || item.description || '',
    playCount: item.playCount || 0,
    trackCount: item.trackCount || item.programCount || 0,
    source: 'qt',
  }))

  return {
    list,
    total: data.total || 0,
    page,
    limit,
    allPage: Math.ceil((data.total || 0) / limit),
    source: 'qt',
    info: {
      name: anchorInfo.anchorName || anchorInfo.name || '',
      img: anchorInfo.avatar || anchorInfo.img || '',
      desc: anchorInfo.signature || '',
      author: '',
    },
  }
}

export default {
  search,
  getAlbumDetail,
  getAnchorDetail,
}