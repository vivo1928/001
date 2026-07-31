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

// 模拟桌面浏览器请求头，绕过 WAF 检测
const pcHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.ximalaya.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
}

const mobileHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://m.ximalaya.com/',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

/**
 * 安全解析响应体，处理非 JSON 响应
 */
const safeParseBody = (resp) => {
  const { body } = resp
  // body 已经是解析后的对象（httpFetch 内部 JSON.parse）
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body
  }
  // body 是字符串，尝试手动解析
  if (typeof body === 'string' && body.trim().startsWith('{')) {
    try {
      return JSON.parse(body)
    } catch (e) {
      console.error('[xm] JSON parse failed:', e.message)
      return null
    }
  }
  console.error('[xm] unexpected body type:', typeof body, 'value:', String(body).substring(0, 200))
  return null
}

/**
 * 搜索专辑
 */
const searchAlbum = async (keyword, page = 1, limit = 30) => {
  const url = `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=album&page=${page}&pageSize=${limit}`
  console.log('[xm searchAlbum] fetching:', url)
  let resp
  try {
    resp = await httpFetch(url, { headers: pcHeaders }).promise
  } catch (err) {
    console.error('[xm searchAlbum] fetch error:', err?.message || err)
    throw err
  }
  console.log('[xm searchAlbum] statusCode:', resp?.statusCode, 'ok:', resp?.ok)

  // 使用安全解析处理响应体
  const body = safeParseBody(resp)
  console.log('[xm searchAlbum] response ret:', body?.ret, 'has data:', !!body?.data)

  if (!body || body.ret !== 200) {
    const errMsg = body?.msg || (typeof body === 'string' ? body.substring(0, 200) : 'unknown')
    throw new Error('喜马拉雅搜索失败: ' + errMsg)
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0 }

  const response = data.result?.response
  if (!response) return { list: [], total: 0, page, limit, allPage: 0 }

  const docs = response.docs || []
  const total = response.numFound || 0
  console.log('[xm searchAlbum] found', docs.length, 'albums, total:', total)

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
  console.log('[xm searchAnchor] fetching:', url)
  let resp
  try {
    resp = await httpFetch(url, { headers: pcHeaders }).promise
  } catch (err) {
    console.error('[xm searchAnchor] fetch error:', err?.message || err)
    throw err
  }
  console.log('[xm searchAnchor] statusCode:', resp?.statusCode, 'ok:', resp?.ok)

  // 使用安全解析处理响应体
  const body = safeParseBody(resp)
  console.log('[xm searchAnchor] response ret:', body?.ret, 'has data:', !!body?.data)

  if (!body || body.ret !== 200) {
    const errMsg = body?.msg || (typeof body === 'string' ? body.substring(0, 200) : 'unknown')
    throw new Error('喜马拉雅搜索主播失败: ' + errMsg)
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0 }

  const userData = data.result?.user
  if (!userData) return { list: [], total: 0, page, limit, allPage: 0 }

  const docs = userData.docs || []
  const total = userData.numFound || 0
  console.log('[xm searchAnchor] found', docs.length, 'anchors, total:', total)

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