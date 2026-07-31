import { httpFetch } from '../../request'
import { formatPlayTime } from '../../index'

/**
 * 喜马拉雅FM 听书源
 * 
 * 使用 www.ximalaya.com/revision/search 接口
 * 
 * 提供:
 * - search: 搜索专辑/主播
 * - getAlbumDetail: 获取专辑章节列表
 * - getAnchorDetail: 获取主播专辑列表
 */

const XM_SEARCH_API = 'https://www.ximalaya.com/revision/search'
const XM_MOBILE_API = 'https://mobile.ximalaya.com'

const pcHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.ximalaya.com/',
  'Accept': 'application/json, text/plain, */*',
}

const mobileHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://m.ximalaya.com/',
}

/**
 * 搜索专辑
 */
const searchAlbum = async (keyword, page = 1, limit = 30) => {
  const url = `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=album&page=${page}&pageSize=${limit}`
  const { body } = await httpFetch(url, { headers: pcHeaders }).promise

  if (!body || body.ret !== 200) {
    throw new Error('喜马拉雅搜索失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0 }

  const response = data.result?.response
  if (!response) return { list: [], total: 0, page, limit, allPage: 0 }

  const docs = response.docs || []
  const total = response.numFound || 0

  const list = docs.map(item => ({
    id: String(item.id),
    name: item.title || '',
    author: item.nickname || '',
    img: item.cover_path ? (item.cover_path.startsWith('//') ? 'https:' + item.cover_path : item.cover_path) : '',
    desc: item.intro || '',
    playCount: item.play || 0,
    trackCount: item.tracks || 0,
    source: 'xm',
    categoryId: String(item.category_id || ''),
    categoryName: item.category_title || '',
    score: item.score || 0,
    isPaid: item.is_paid || false,
    anchorId: String(item.uid || ''),
    anchorUrl: item.anchorUrl || '',
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
  }
}

/**
 * 搜索主播
 */
const searchAnchor = async (keyword, page = 1, limit = 30) => {
  // 使用 core=all 来获取用户数据
  const url = `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=all&page=${page}&pageSize=${limit}`
  const { body } = await httpFetch(url, { headers: pcHeaders }).promise

  if (!body || body.ret !== 200) {
    throw new Error('喜马拉雅搜索主播失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0 }

  const userData = data.result?.user
  if (!userData) return { list: [], total: 0, page, limit, allPage: 0 }

  const docs = userData.docs || []
  const total = userData.numFound || 0

  const list = docs.map(item => ({
    id: String(item.uid),
    name: item.nickname || '',
    author: '',
    img: item.logoPic
      ? (item.logoPic.startsWith('//') ? 'https:' + item.logoPic : item.logoPic)
      : (item.smallPic || ''),
    desc: item.personDescribe || item.description || '',
    followerCount: item.followers_counts || 0,
    albumCount: item.album_counts || 0,
    trackCount: item.tracks_counts || 0,
    source: 'xm',
    isAnchor: true,
    anchorGrade: item.anchorGrade || 0,
    verifyType: item.verifyType || 0,
    isVerified: item.isVerified || false,
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
  }
}

/**
 * 搜索: type = 'album' | 'anchor'
 */
const search = async (keyword, page = 1, type = 'album', limit = 30) => {
  if (type === 'album') {
    return searchAlbum(keyword, page, limit)
  } else {
    return searchAnchor(keyword, page, limit)
  }
}

/**
 * 获取专辑章节列表
 * 使用 mobile API
 */
const getAlbumDetail = async (albumId, page = 1, limit = 200) => {
  // 喜马拉雅 mobile API 获取专辑音轨
  const url = `${XM_MOBILE_API}/mobile/v1/album/track/ts-${Math.floor(Date.now() / 1000)}?albumId=${albumId}&device=android&isAsc=true&pageId=${page}&pageSize=${limit}`
  
  let body
  try {
    const resp = await httpFetch(url, { headers: mobileHeaders }).promise
    body = resp.body
  } catch (e) {
    // 尝试备用 URL
    const altUrl = `${XM_MOBILE_API}/mobile/v1/album/track?albumId=${albumId}&device=android&isAsc=true&pageId=${page}&pageSize=${limit}`
    const altResp = await httpFetch(altUrl, { headers: mobileHeaders }).promise
    body = altResp.body
  }

  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅获取专辑详情失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit }

  const tracks = data.tracks?.list || data.list || []
  const albumInfo = data.album || data.albumInfo || {}
  const total = data.tracks?.totalCount || data.totalCount || 0

  const list = tracks.map((item, index) => ({
    singer: item.nickname || item.anchorName || albumInfo.nickname || '',
    name: item.title || item.trackTitle || '',
    albumName: albumInfo.albumTitle || albumInfo.title || '',
    albumId: String(albumId),
    songmid: String(item.trackId || item.id),
    source: 'xm',
    interval: formatPlayTime(parseInt(item.duration || '0')),
    img: item.coverLarge || item.cover_url || albumInfo.coverLarge || albumInfo.cover || '',
    lrc: null,
    hash: String(item.trackId || item.id),
    otherSource: null,
    types: [{ type: '128k', size: null }],
    _types: { '128k': { size: null } },
    typeUrl: {},
    // 听书特有字段
    isAudiobook: true,
    trackId: item.trackId || item.id,
    playUrl: item.playUrl32 || item.playUrl64 || item.play_path_32 || item.play_path_64 || '',
    playSize: item.playSize32 || item.playSize64 || 0,
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
    info: {
      name: albumInfo.albumTitle || albumInfo.title || '',
      img: albumInfo.coverLarge || albumInfo.cover || '',
      desc: albumInfo.albumIntro || albumInfo.intro || '',
      author: albumInfo.nickname || albumInfo.anchorName || '',
    },
  }
}

/**
 * 获取主播的专辑列表
 * 使用 mobile API
 */
const getAnchorDetail = async (anchorId, page = 1, limit = 30) => {
  const url = `${XM_MOBILE_API}/mobile/v1/artist/albums?anchorId=${anchorId}&device=android&pageId=${page}&pageSize=${limit}`
  
  let body
  try {
    const resp = await httpFetch(url, { headers: mobileHeaders }).promise
    body = resp.body
  } catch (e) {
    // 备用 URL
    const altUrl = `${XM_MOBILE_API}/mobile/v1/anchor/album?anchorId=${anchorId}&device=android&pageId=${page}&pageSize=${limit}`
    const altResp = await httpFetch(altUrl, { headers: mobileHeaders }).promise
    body = altResp.body
  }

  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅获取主播详情失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit }

  const albums = data.albumList || data.albums || data.list || []
  const anchorInfo = data.anchorInfo || data.anchor || data.userInfo || {}
  const total = data.totalCount || data.total || 0

  const list = albums.map(item => ({
    id: String(item.albumId || item.id),
    name: item.albumTitle || item.title || '',
    author: anchorInfo.nickname || item.nickname || '',
    img: item.coverLarge || item.cover || item.cover_url || '',
    desc: item.albumIntro || item.intro || '',
    playCount: item.playCount || 0,
    trackCount: item.includeTrackCount || item.trackCount || 0,
    source: 'xm',
    categoryId: item.categoryId || '',
    categoryName: item.categoryName || '',
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
    info: {
      name: anchorInfo.nickname || anchorInfo.anchorName || '',
      img: anchorInfo.avatarLarge || anchorInfo.avatar || anchorInfo.logoPic || '',
      desc: anchorInfo.personalSignature || anchorInfo.signature || '',
      author: '',
    },
  }
}

export default {
  search,
  getAlbumDetail,
  getAnchorDetail,
}