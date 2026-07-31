import { httpFetch } from '../../request'
import { formatPlayTime } from '../../index'

/**
 * 喜马拉雅FM 听书源
 * 
 * API 文档参考: https://github.com/MeoProject/lx-music-api-server
 * 
 * 提供:
 * - audiobookSearch: 搜索专辑/主播
 * - getAlbumDetail: 获取专辑章节列表
 * - getAnchorDetail: 获取主播专辑列表
 */

const XM_BASE = 'https://m.ximalaya.com'
const XM_MOBILE_API = 'https://m.ximalaya.com/mobile/v1'

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://m.ximalaya.com/',
}

// 搜索类型: album=专辑, anchor=主播
const search = async (keyword, page = 1, type = 'album', limit = 30) => {
  const url = `${XM_MOBILE_API}/search?keyword=${encodeURIComponent(keyword)}&page=${page}&pageSize=${limit}&searchType=${type}`
  const { body } = await httpFetch(url, { headers: defaultHeaders }).promise
  
  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅搜索失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0 }

  if (type === 'album') {
    const albums = data.albumList || data.albums || []
    const list = albums.map(item => ({
      id: String(item.albumId || item.id),
      name: item.albumTitle || item.title || '',
      author: item.nickname || item.anchorName || '',
      img: item.coverLarge || item.cover || '',
      desc: item.albumIntro || item.intro || '',
      playCount: item.playCount || 0,
      trackCount: item.includeTrackCount || item.trackCount || 0,
      source: 'xm',
      // 用于分类展示
      categoryId: item.categoryId || '',
      categoryName: item.categoryName || '',
    }))
    return {
      list,
      total: data.totalCount || data.total || 0,
      page,
      limit,
      allPage: Math.ceil((data.totalCount || data.total || 0) / limit),
      source: 'xm',
    }
  } else {
    // anchor 类型
    const anchors = data.anchorList || data.anchors || []
    const list = anchors.map(item => ({
      id: String(item.anchorId || item.id),
      name: item.nickname || item.anchorName || item.name || '',
      author: '',
      img: item.avatarLarge || item.avatar || item.cover || '',
      desc: item.personalSignature || item.signature || '',
      followerCount: item.followerCount || item.followers || 0,
      albumCount: item.albumCount || 0,
      source: 'xm',
      isAnchor: true,
    }))
    return {
      list,
      total: data.totalCount || data.total || 0,
      page,
      limit,
      allPage: Math.ceil((data.totalCount || data.total || 0) / limit),
      source: 'xm',
    }
  }
}

// 获取专辑章节列表
const getAlbumDetail = async (albumId, page = 1, limit = 200) => {
  const url = `${XM_MOBILE_API}/album/track?albumId=${albumId}&page=${page}&pageSize=${limit}`
  const { body } = await httpFetch(url, { headers: defaultHeaders }).promise
  
  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅获取专辑详情失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit }

  const tracks = data.trackList || data.tracks || []
  const albumInfo = data.albumInfo || data.album || {}

  const list = tracks.map((item, index) => ({
    // 包装成 musicInfo 格式，以便复用现有播放器
    singer: item.nickname || item.anchorName || '',
    name: item.title || item.trackTitle || '',
    albumName: albumInfo.albumTitle || albumInfo.title || '',
    albumId: String(albumId),
    songmid: String(item.trackId || item.id),
    source: 'xm',
    interval: formatPlayTime(parseInt(item.duration || '0')),
    img: item.coverLarge || albumInfo.coverLarge || '',
    lrc: null,
    hash: String(item.trackId || item.id),
    otherSource: null,
    types: [{ type: '128k', size: null }],
    _types: { '128k': { size: null } },
    typeUrl: {},
    // 听书特有字段
    isAudiobook: true,
    trackId: item.trackId || item.id,
    playUrl: item.playUrl32 || item.playUrl64 || item.playUrl || '',
    playSize: item.playSize32 || item.playSize64 || 0,
  }))

  return {
    list,
    total: data.totalCount || data.total || 0,
    page,
    limit,
    allPage: Math.ceil((data.totalCount || data.total || 0) / limit),
    source: 'xm',
    info: {
      name: albumInfo.albumTitle || albumInfo.title || '',
      img: albumInfo.coverLarge || albumInfo.cover || '',
      desc: albumInfo.albumIntro || albumInfo.intro || '',
      author: albumInfo.nickname || albumInfo.anchorName || '',
    },
  }
}

// 获取主播的专辑列表
const getAnchorDetail = async (anchorId, page = 1, limit = 30) => {
  const url = `${XM_MOBILE_API}/anchor/album?anchorId=${anchorId}&page=${page}&pageSize=${limit}`
  const { body } = await httpFetch(url, { headers: defaultHeaders }).promise
  
  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅获取主播详情失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit }

  const albums = data.albumList || data.albums || []
  const anchorInfo = data.anchorInfo || data.anchor || {}

  const list = albums.map(item => ({
    id: String(item.albumId || item.id),
    name: item.albumTitle || item.title || '',
    author: anchorInfo.nickname || item.nickname || '',
    img: item.coverLarge || item.cover || '',
    desc: item.albumIntro || item.intro || '',
    playCount: item.playCount || 0,
    trackCount: item.includeTrackCount || item.trackCount || 0,
    source: 'xm',
  }))

  return {
    list,
    total: data.totalCount || data.total || 0,
    page,
    limit,
    allPage: Math.ceil((data.totalCount || data.total || 0) / limit),
    source: 'xm',
    info: {
      name: anchorInfo.nickname || anchorInfo.anchorName || '',
      img: anchorInfo.avatarLarge || anchorInfo.avatar || '',
      desc: anchorInfo.personalSignature || '',
      author: '',
    },
  }
}

export default {
  search,
  getAlbumDetail,
  getAnchorDetail,
}