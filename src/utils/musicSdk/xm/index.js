import { httpFetch } from '../../request'
import { formatPlayTime } from '../../index'

/**
 * 喜马拉雅FM 听书源
 *
 * 使用 SEO 搜索接口: /revision/search/seo
 * 该接口为搜索引擎爬虫设计，无需 xm-sign 签名
 * 相比之下 /revision/search/main 需要 dws.2.0.0.js 生成的 browserid&&sessionid 签名
 *
 * 提供:
 * - search: 搜索专辑/主播
 * - getAlbumDetail: 获取专辑章节列表
 * - getAnchorDetail: 获取主播专辑列表
 */

const XM_SEARCH_API = 'https://www.ximalaya.com/revision/search/seo'
const XM_MOBILE_API = 'https://mobile.ximalaya.com'

// 桌面浏览器请求头
const pcHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.ximalaya.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

const mobileHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://m.ximalaya.com/',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

/**
 * 构建封面图片完整 URL
 * 喜马拉雅返回的 coverPath 是相对路径，需要拼接 CDN 域名
 * 如: storages/xxx.jpeg → https://imagev2.xmcdn.com/storages/xxx.jpeg
 *     group63/M08/xxx.jpg → https://imagev2.xmcdn.com/group63/M08/xxx.jpg
 *     https://thirdwx.qlogo.cn/... → 已经是完整 URL，直接返回
 */
const buildCoverUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return 'https://imagev2.xmcdn.com/' + path
}

/**
 * 构建主播页 URL
 */
const buildAnchorUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return 'https://www.ximalaya.com' + path
}

/**
 * 安全解析响应体，处理非 JSON 响应
 */
const safeParseBody = (resp) => {
  const { body } = resp
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body
  }
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
 * SEO 接口: /revision/search/seo?core=album&kw=关键词&page=N&rows=N&device=iPhone&condition=relation&isGrayFilter=true&spellchecker=true
 * 成功响应: { ret: 200, data: { album: { docs: [...], total: N, totalPage: N } } }
 * 风控响应: { ret: 200, data: { reason: "risk invalid", riskLevel: 5 } }
 */
const searchAlbum = async (keyword, page = 1, limit = 30) => {
  const url = `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=album&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true&page=${page}&rows=${limit}`
  console.log('[xm searchAlbum] fetching:', url)
  let resp
  try {
    resp = await httpFetch(url, { headers: pcHeaders }).promise
  } catch (err) {
    console.error('[xm searchAlbum] fetch error:', err?.message || err)
    throw err
  }
  console.log('[xm searchAlbum] statusCode:', resp?.statusCode, 'ok:', resp?.ok)

  const body = safeParseBody(resp)
  if (!body) {
    throw new Error('喜马拉雅搜索失败: 响应解析异常')
  }

  console.log('[xm searchAlbum] response ret:', body.ret)

  // SEO 接口用 ret: 200 表示成功
  if (body.ret !== 200) {
    const errMsg = body.msg || JSON.stringify(body).substring(0, 200)
    throw new Error('喜马拉雅搜索失败: ' + errMsg)
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0, source: 'xm' }

  // 风控拦截: data 中没有 album 字段，而是 reason 字段
  if (data.reason) {
    throw new Error('喜马拉雅搜索被风控拦截: ' + data.reason)
  }

  const albumData = data.album
  if (!albumData) return { list: [], total: 0, page, limit, allPage: 0, source: 'xm' }

  const docs = albumData.docs || []
  const total = albumData.total || 0
  console.log('[xm searchAlbum] found', docs.length, 'albums, total:', total)

  const list = docs.map(item => ({
    id: String(item.albumId),
    name: item.title || '',
    author: item.nickname || '',
    img: buildCoverUrl(item.coverPath),
    desc: item.intro || '',
    playCount: item.playCount || 0,
    trackCount: item.tracksCount || 0,
    source: 'xm',
    categoryId: String(item.categoryId || ''),
    categoryName: item.categoryName || '',
    isPaid: item.isPaid || false,
    anchorId: String(item.uid || ''),
    anchorUrl: buildAnchorUrl(item.anchorUrl),
    albumUrl: item.url ? ('https://www.ximalaya.com' + item.url) : '',
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
 * SEO 接口: core=user
 * 成功响应: { ret: 200, data: { user: { docs: [...], total: N, totalPage: N } } }
 */
const searchAnchor = async (keyword, page = 1, limit = 30) => {
  const url = `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=user&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true&page=${page}&rows=${limit}`
  console.log('[xm searchAnchor] fetching:', url)
  let resp
  try {
    resp = await httpFetch(url, { headers: pcHeaders }).promise
  } catch (err) {
    console.error('[xm searchAnchor] fetch error:', err?.message || err)
    throw err
  }
  console.log('[xm searchAnchor] statusCode:', resp?.statusCode, 'ok:', resp?.ok)

  const body = safeParseBody(resp)
  if (!body) {
    throw new Error('喜马拉雅搜索主播失败: 响应解析异常')
  }

  console.log('[xm searchAnchor] response ret:', body.ret)

  // SEO 接口用 ret: 200 表示成功
  if (body.ret !== 200) {
    const errMsg = body.msg || JSON.stringify(body).substring(0, 200)
    throw new Error('喜马拉雅搜索主播失败: ' + errMsg)
  }

  const data = body.data
  if (!data) return { list: [], total: 0, page, limit, allPage: 0, source: 'xm' }

  // 风控拦截
  if (data.reason) {
    throw new Error('喜马拉雅搜索主播被风控拦截: ' + data.reason)
  }

  const userData = data.user
  if (!userData) return { list: [], total: 0, page, limit, allPage: 0, source: 'xm' }

  const docs = userData.docs || []
  const total = userData.total || 0
  console.log('[xm searchAnchor] found', docs.length, 'anchors, total:', total)

  const list = docs.map(item => ({
    id: String(item.uid),
    name: item.nickname || '',
    author: '',
    img: buildCoverUrl(item.logoPic),
    desc: item.description || item.personDescribe || '',
    followerCount: item.followersCount || 0,
    albumCount: item.albumCount || 0,
    trackCount: item.tracksCount || 0,
    source: 'xm',
    isAnchor: true,
    anchorGrade: item.anchorGrade || 0,
    verifyType: item.verifyType || 0,
    isVerified: item.isVerified || false,
    anchorUrl: item.url ? ('https://www.ximalaya.com' + item.url) : '',
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