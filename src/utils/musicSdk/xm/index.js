const { httpFetch } = require('../../request')
const { formatPlayTime } = require('../../index')

/**
 * 喜马拉雅FM 听书源
 *
 * 提供两个搜索端点，互相作为 fallback:
 * 1. SEO 端点: /revision/search/seo — 无需 xm-sign 签名，为搜索引擎爬虫设计
 * 2. 普通端点: /revision/search — 同样无需签名，响应结构不同
 *
 * 两个端点都无需 xm-sign（对比 /revision/search/main 需要 dws.2.0.0.js 签名）
 *
 * 重试策略（对齐歌曲搜索 SDK 的实现）:
 * - 最多重试 3 次
 * - 每次重试切换端点（SEO → 普通 → SEO）
 * - 网络错误 / API 错误 / 风控 都触发重试
 */

const XM_SEARCH_API = 'https://www.ximalaya.com/revision/search/seo'
const XM_SEARCH_FALLBACK_API = 'https://www.ximalaya.com/revision/search'
const XM_MOBILE_API = 'https://mobile.ximalaya.com'

const MAX_RETRY = 3

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
 * 从响应中提取 docs 和 total
 * 兼容两种端点格式:
 * - SEO 格式: { ret: 200, data: { album/user: { docs: [...], total: N } } }
 * - 普通格式: { ret: 200, data: { result: { response: { docs: [...], numFound: N } } } }
 */
const extractDocs = (body, core) => {
  if (!body || body.ret !== 200) return null

  const data = body.data
  if (!data) return null

  // 风控拦截
  if (data.reason) {
    console.warn('[xm] risk control:', data.reason)
    return null
  }

  // SEO 格式: data.album 或 data.user
  if (data[core] && data[core].docs) {
    return {
      docs: data[core].docs,
      total: data[core].total || 0,
      totalPage: data[core].totalPage || 0,
    }
  }

  // 普通格式: data.result.response.docs
  if (data.result && data.result.response) {
    const resp = data.result.response
    return {
      docs: resp.docs || [],
      total: resp.numFound || resp.total || 0,
      totalPage: resp.totalPage || 0,
    }
  }

  return null
}

/**
 * 执行一次 HTTP 请求，返回解析后的 body
 * 绕过 request.js 封装，直接使用 global.fetch
 * 避免 request.js 中 cache:'no-store' 等选项在 React Native 上的兼容性问题
 */
const fetchJson = async (url) => {
  console.log('[xm fetch]', url.substring(0, 120))
  const controller = new global.AbortController()
  const timeoutId = setTimeout(() => {
    console.warn('[xm fetch] timeout, aborting')
    controller.abort()
  }, 15000)

  try {
    const resp = await global.fetch(url, {
      method: 'GET',
      headers: pcHeaders,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    console.log('[xm fetch] status:', resp.status, 'ok:', resp.ok)

    const text = await resp.text()
    console.log('[xm fetch] body length:', text.length)

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`)
    }

    let body
    try {
      body = JSON.parse(text)
    } catch (e) {
      console.error('[xm fetch] JSON parse failed:', e.message, 'body:', text.substring(0, 200))
      throw new Error('响应解析异常: ' + text.substring(0, 100))
    }

    return body
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw err
  }
}

// ==================== 专辑搜索 ====================

/**
 * 构建 SEO 专辑搜索 URL
 */
const buildSeoAlbumUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=album&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true&page=${page}&rows=${limit}`
}

/**
 * 构建普通专辑搜索 URL
 */
const buildNormalAlbumUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_FALLBACK_API}?core=album&kw=${encodeURIComponent(keyword)}&page=${page}&rows=${limit}&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`
}

/**
 * 专辑搜索（带重试 + 端点 fallback）
 * 对齐歌曲搜索 SDK 的重试模式: 最多重试 MAX_RETRY 次，每次切换端点
 */
const searchAlbum = async (keyword, page = 1, limit = 30, retryCount = 0) => {
  // 交替使用 SEO 端点和普通端点
  const useSeo = retryCount % 2 === 0
  const url = useSeo
    ? buildSeoAlbumUrl(keyword, page, limit)
    : buildNormalAlbumUrl(keyword, page, limit)

  console.log(`[xm searchAlbum] attempt ${retryCount + 1}/${MAX_RETRY} endpoint: ${useSeo ? 'seo' : 'normal'} url:`, url)

  let body
  try {
    body = await fetchJson(url)
  } catch (err) {
    console.error(`[xm searchAlbum] attempt ${retryCount + 1} fetch error:`, err?.message || err)
    if (retryCount < MAX_RETRY - 1) return searchAlbum(keyword, page, limit, retryCount + 1)
    throw new Error('喜马拉雅搜索专辑失败: ' + (err?.message || err))
  }

  // 提取数据
  const extracted = extractDocs(body, 'album')
  if (!extracted) {
    console.warn(`[xm searchAlbum] attempt ${retryCount + 1} extract failed, body.ret:`, body?.ret, 'has reason:', !!body?.data?.reason)
    if (retryCount < MAX_RETRY - 1) return searchAlbum(keyword, page, limit, retryCount + 1)
    const errMsg = body?.data?.reason
      ? '喜马拉雅搜索被风控拦截: ' + body.data.reason
      : (body?.msg || '响应数据格式异常')
    throw new Error('喜马拉雅搜索专辑失败: ' + errMsg)
  }

  const { docs, total } = extracted
  console.log(`[xm searchAlbum] attempt ${retryCount + 1} OK, found ${docs.length} albums, total: ${total}`)

  const list = docs.map(item => ({
    id: String(item.albumId || item.id),
    name: item.title || item.name || '',
    author: item.nickname || '',
    img: buildCoverUrl(item.coverPath || item.cover_path || item.img),
    desc: item.intro || '',
    playCount: item.playCount || item.play || 0,
    trackCount: item.tracksCount || item.tracks || 0,
    source: 'xm',
    categoryId: String(item.categoryId || item.category_id || ''),
    categoryName: item.categoryTitle || item.category_title || '',
    isPaid: item.isPaid || item.is_paid || false,
    anchorId: String(item.uid || ''),
    anchorUrl: buildAnchorUrl(item.anchorUrl || item.anchor_url),
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

// ==================== 主播搜索 ====================

/**
 * 构建 SEO 主播搜索 URL
 */
const buildSeoAnchorUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=user&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true&page=${page}&rows=${limit}`
}

/**
 * 构建普通主播搜索 URL
 */
const buildNormalAnchorUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_FALLBACK_API}?core=user&kw=${encodeURIComponent(keyword)}&page=${page}&rows=${limit}&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`
}

/**
 * 主播搜索（带重试 + 端点 fallback）
 */
const searchAnchor = async (keyword, page = 1, limit = 30, retryCount = 0) => {
  const useSeo = retryCount % 2 === 0
  const url = useSeo
    ? buildSeoAnchorUrl(keyword, page, limit)
    : buildNormalAnchorUrl(keyword, page, limit)

  console.log(`[xm searchAnchor] attempt ${retryCount + 1}/${MAX_RETRY} endpoint: ${useSeo ? 'seo' : 'normal'} url:`, url)

  let body
  try {
    body = await fetchJson(url)
  } catch (err) {
    console.error(`[xm searchAnchor] attempt ${retryCount + 1} fetch error:`, err?.message || err)
    if (retryCount < MAX_RETRY - 1) return searchAnchor(keyword, page, limit, retryCount + 1)
    throw new Error('喜马拉雅搜索主播失败: ' + (err?.message || err))
  }

  // 提取数据（普通端点 user 搜索的 core 是 'user'，但 data.result.response 同样适用）
  const extracted = extractDocs(body, 'user')
  if (!extracted) {
    console.warn(`[xm searchAnchor] attempt ${retryCount + 1} extract failed, body.ret:`, body?.ret, 'has reason:', !!body?.data?.reason)
    if (retryCount < MAX_RETRY - 1) return searchAnchor(keyword, page, limit, retryCount + 1)
    const errMsg = body?.data?.reason
      ? '喜马拉雅搜索被风控拦截: ' + body.data.reason
      : (body?.msg || '响应数据格式异常')
    throw new Error('喜马拉雅搜索主播失败: ' + errMsg)
  }

  const { docs, total } = extracted
  console.log(`[xm searchAnchor] attempt ${retryCount + 1} OK, found ${docs.length} anchors, total: ${total}`)

  const list = docs.map(item => ({
    id: String(item.uid || item.id),
    name: item.nickname || '',
    author: '',
    img: buildCoverUrl(item.logoPic || item.logo_pic || item.smallPic || item.small_pic || item.img),
    desc: item.description || item.personDescribe || item.person_describe || '',
    followerCount: item.followersCount || item.followers_counts || 0,
    albumCount: item.albumCount || item.album_counts || 0,
    trackCount: item.tracksCount || item.tracks_counts || 0,
    source: 'xm',
    isAnchor: true,
    anchorGrade: item.anchorGrade || item.anchor_grade || 0,
    verifyType: item.verifyType || item.verify_type || 0,
    isVerified: item.isVerified || item.is_verified || false,
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

// ==================== 专辑详情 ====================

/**
 * 获取专辑章节列表
 * 使用 mobile API，失败时尝试备用 URL
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

  const list = tracks.map((item) => ({
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
 * 使用 mobile API，失败时尝试备用 URL
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

module.exports = {
  search,
  getAlbumDetail,
  getAnchorDetail,
}