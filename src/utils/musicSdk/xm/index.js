import { formatPlayTime } from '../../index'
import { apis } from '../api-source'

/**
 * 喜马拉雅FM 听书源
 *
 * 提供两个搜索端点，互相作为 fallback:
 * 1. SEO 端点: /revision/search/seo — 无需 xm-sign 签名，为搜索引擎爬虫设计
 * 2. 普通端点: /revision/search — 同样无需签名，响应结构不同
 * 3. Mobile 端点: mobile.ximalaya.com — 用于专辑详情和主播详情
 *
 * 全部使用原生 global.fetch，避免 request.js 管道中 cache:'no-store' 等
 * 选项在 React Native 上的兼容性问题
 *
 * 重试策略（对齐歌曲搜索 SDK 的实现）:
 * - 最多重试 3 次
 * - 每次重试切换端点（SEO → 普通 → SEO）
 * - 网络错误 / API 错误 / 风控 都触发重试
 */

console.log('[xm sdk] 喜马拉雅听书 SDK 模块已加载')

const XM_SEARCH_API = 'https://www.ximalaya.com/revision/search/seo'
const XM_SEARCH_FALLBACK_API = 'https://www.ximalaya.com/revision/search'
const XM_MOBILE_API = 'https://mobile.ximalaya.com'
const XM_API_PROXY = 'https://apis.netstart.cn/ximalaya'

const MAX_RETRY = 3
const FETCH_TIMEOUT = 15000

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
  'Accept': 'application/json, text/plain, */*',
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
 * 执行一次 HTTP 请求，返回解析后的 JSON body
 * 使用原生 global.fetch + AbortController 超时控制
 * 避免 request.js 封装中 cache:'no-store' 等选项在 React Native 上的兼容性问题
 *
 * @param {string} url 请求 URL
 * @param {object} [headers=pcHeaders] 自定义请求头
 * @returns {Promise<object>} 解析后的 JSON 响应体
 */
const fetchJson = async (url, headers = pcHeaders) => {
  console.log('[xm fetch]', url.substring(0, 120))
  const controller = new global.AbortController()
  const timeoutId = setTimeout(() => {
    console.warn('[xm fetch] timeout, aborting')
    controller.abort()
  }, FETCH_TIMEOUT)

  try {
    const resp = await global.fetch(url, {
      method: 'GET',
      headers,
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
  console.log('[xm sdk search] 被调用:', { keyword, page, type, limit })
  if (type === 'album') {
    return searchAlbum(keyword, page, limit)
  } else {
    return searchAnchor(keyword, page, limit)
  }
}

// ==================== 专辑详情 ====================

/**
 * 获取专辑章节列表（剧集/单集）
 * 使用 mobile API，失败时自动尝试备用 URL
 */
const getAlbumDetail = async (albumId, page = 1, limit = 200) => {
  const ts = Math.floor(Date.now() / 1000)
  const url = `${XM_MOBILE_API}/mobile/v1/album/track/ts-${ts}?albumId=${albumId}&device=android&isAsc=true&pageId=${page}&pageSize=${limit}`
  const altUrl = `${XM_MOBILE_API}/mobile/v1/album/track?albumId=${albumId}&device=android&isAsc=true&pageId=${page}&pageSize=${limit}`

  console.log('[xm getAlbumDetail] albumId:', albumId, 'page:', page)

  let body
  try {
    body = await fetchJson(url, mobileHeaders)
  } catch (e) {
    console.warn('[xm getAlbumDetail] primary URL failed:', e.message, 'trying fallback')
    try {
      body = await fetchJson(altUrl, mobileHeaders)
    } catch (e2) {
      throw new Error('喜马拉雅获取专辑详情失败: ' + (e2?.message || e2))
    }
  }

  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅获取专辑详情失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) {
    console.log('[xm getAlbumDetail] no data, returning empty list')
    return {
      list: [],
      total: 0,
      page,
      limit,
      allPage: 0,
      source: 'xm',
      info: { name: '', img: '', desc: '', author: '' },
    }
  }

  const tracks = data.tracks?.list || data.list || []
  const albumInfo = data.album || data.albumInfo || {}
  const total = data.tracks?.totalCount || data.totalCount || 0

  console.log('[xm getAlbumDetail] got', tracks.length, 'tracks, total:', total)

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
    types: [
      { type: '128k', size: item.playSize64 || null },
      { type: '64k', size: item.playSize32 || null },
      { type: '32k', size: null },
    ],
    _types: {
      '128k': { size: item.playSize64 || null },
      '64k': { size: item.playSize32 || null },
      '32k': { size: null },
    },
    typeUrl: {
      '128k': item.playUrl64 || item.play_path_64 || item.playUrl32 || item.play_path_32 || '',
      '64k': item.playUrl32 || item.play_path_32 || '',
      '32k': item.playPath32 || '',
    },
    isAudiobook: true,
    trackId: item.trackId || item.id,
    playUrl: item.playUrl64 || item.playUrl32 || item.play_path_64 || item.play_path_32 || '',
    playSize: item.playSize64 || item.playSize32 || 0,
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
 * 通过搜索API获取主播的专辑列表
 * 替代已失效的 apis.netstart.cn 代理
 * 使用搜索API: revision/search?core=album&kw=主播昵称
 * 通过 uid 过滤确保只返回该主播的专辑
 */
const getAnchorAlbumBySearch = async (anchorId, anchorName, page = 1, limit = 30) => {
  console.log('[xm getAnchorAlbumBySearch] anchorId:', anchorId, 'name:', anchorName, 'page:', page)

  // 用主播昵称搜索专辑
  const url = `${XM_SEARCH_FALLBACK_API}?core=album&kw=${encodeURIComponent(anchorName)}&page=${page}&rows=${limit}&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`

  let body
  try {
    body = await fetchJson(url)
  } catch (err) {
    throw new Error('喜马拉雅获取主播专辑列表失败: ' + (err?.message || err))
  }

  if (body.ret !== 200) {
    throw new Error('喜马拉雅获取主播专辑列表失败: ' + (body?.msg || 'ret=' + body.ret))
  }

  const data = body.data
  if (!data) {
    return { list: [], total: 0, page, limit, allPage: 0, source: 'xm', info: { name: anchorName, img: '', desc: '', author: '' } }
  }

  // 从搜索结果中提取数据
  const result = data.result?.response
  if (!result) {
    return { list: [], total: 0, page, limit, allPage: 0, source: 'xm', info: { name: anchorName, img: '', desc: '', author: '' } }
  }

  const docs = result.docs || []
  const total = result.numFound || 0

  // 按 uid 过滤，只保留该主播的专辑
  const anchorIdStr = String(anchorId)
  const filteredDocs = docs.filter(d => String(d.uid) === anchorIdStr)

  console.log('[xm getAnchorAlbumBySearch] found', docs.length, 'total,', filteredDocs.length, 'matching uid')

  const list = filteredDocs.map(item => ({
    id: String(item.id || ''),
    name: item.title || '',
    author: item.nickname || '',
    img: item.cover_path ? buildCoverUrl(item.cover_path) : '',
    desc: item.intro || '',
    playCount: item.play || 0,
    trackCount: item.tracks || 0,
    source: 'xm',
    categoryId: String(item.category_id || ''),
    categoryName: item.category_title || '',
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit) || 1,
    source: 'xm',
    info: {
      name: anchorName || '',
      img: '',
      desc: '',
      author: '',
    },
  }
}

/**
 * 获取主播的专辑列表
 * 使用搜索API获取主播专辑，通过 uid 过滤
 * 如果 anchorName 未提供，尝试通过搜索主播获取昵称
 */
const getAnchorDetail = async (anchorId, page = 1, limit = 30, anchorName = '') => {
  console.log('[xm getAnchorDetail] anchorId:', anchorId, 'page:', page, 'anchorName:', anchorName)

  if (anchorName) {
    return getAnchorAlbumBySearch(anchorId, anchorName, page, limit)
  }

  // 如果没有 anchorName，先通过搜索API获取主播昵称
  // 直接用主播ID作为搜索关键词，从搜索结果中匹配
  console.log('[xm getAnchorDetail] no anchorName, trying to find by id')
  const searchUrl = `${XM_SEARCH_FALLBACK_API}?core=user&kw=${encodeURIComponent(String(anchorId))}&page=1&rows=1&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`

  try {
    const body = await fetchJson(searchUrl)
    if (body.ret === 200) {
      const docs = body.data?.result?.response?.docs || []
      const anchor = docs.find(d => String(d.uid) === String(anchorId))
      if (anchor) {
        const name = anchor.nickname || ''
        console.log('[xm getAnchorDetail] found anchor name:', name)
        return getAnchorAlbumBySearch(anchorId, name, page, limit)
      }
    }
  } catch (e) {
    console.warn('[xm getAnchorDetail] failed to find anchor name:', e.message)
  }

  throw new Error('喜马拉雅获取主播专辑列表失败: 无法找到主播信息')
}

// ==================== 音质解析（对齐音乐 SDK 的 getMusicUrl 接口） ====================
// 现在使用 apis() 路由，与歌曲模块（kg/kw/tx/wy/mg）完全一致
// 调用链: player → getMusicUrl → handleGetOnlineMusicUrl → musicSdk['xm'].getMusicUrl(songInfo, quality).promise
//                                        → apis('xm').getMusicUrl(songInfo, quality).promise
//                                        → global.lx.apis['xm'].getMusicUrl(songInfo, quality)（自定义音源）
//                                        → 内置降级实现（无自定义音源时）

/**
 * 喜马拉雅单集音频 URL 内存缓存
 * 避免重复调用 track detail API
 */
const trackUrlCache = new Map()

/**
 * 内置降级实现：直接通过喜马拉雅 track detail API 获取音频 URL
 * 当用户未启用自定义音源时使用
 */
const builtInGetMusicUrl = async (songInfo, quality) => {
  console.log('[xm builtInGetMusicUrl] called:', { name: songInfo?.name, quality, hasTypeUrl: !!songInfo?.typeUrl, hasPlayUrl: !!songInfo?.playUrl })

  // 1. 优先使用 typeUrl（已缓存的音质映射）
  if (songInfo?.typeUrl?.[quality]) {
    console.log('[xm builtInGetMusicUrl] found in typeUrl:', songInfo.typeUrl[quality].substring(0, 60))
    return { url: songInfo.typeUrl[quality], type: quality }
  }

  // 2. 退而求其次，使用 playUrl
  if (songInfo?.playUrl) {
    console.log('[xm builtInGetMusicUrl] using playUrl:', songInfo.playUrl.substring(0, 60))
    return { url: songInfo.playUrl, type: '128k' }
  }

  // 3. 检查缓存
  const trackId = songInfo?.hash || songInfo?.songmid
  const cacheKey = trackId ? `${trackId}_${quality}` : null
  if (cacheKey && trackUrlCache.has(cacheKey)) {
    const cachedUrl = trackUrlCache.get(cacheKey)
    console.log('[xm builtInGetMusicUrl] cache hit:', cachedUrl.substring(0, 60))
    return { url: cachedUrl, type: quality }
  }

  // 4. 最后手段：通过 track detail API 获取音频 URL
  if (trackId) {
    console.log('[xm builtInGetMusicUrl] fetching from track API, trackId:', trackId)
    const ts = Math.floor(Date.now() / 1000)
    const url = `${XM_MOBILE_API}/mobile/v1/track/trackInfo/ts-${ts}?trackId=${trackId}&device=android`

    let body
    try {
      body = await fetchJson(url, mobileHeaders)
    } catch (e) {
      throw new Error('喜马拉雅获取音频URL失败: ' + (e?.message || e))
    }

    if (body.ret !== 0) {
      throw new Error('喜马拉雅获取音频URL失败: ' + (body?.msg || 'ret=' + body.ret))
    }

    const data = body.data
    if (!data) {
      throw new Error('喜马拉雅获取音频URL失败: 无数据')
    }

    // 按质量优先级获取 URL
    const playUrl = data.playUrl64 || data.playUrl32 || data.playPath64 || data.playPath32
    if (!playUrl) {
      throw new Error('喜马拉雅获取音频URL失败: 无可用播放地址')
    }

    console.log('[xm builtInGetMusicUrl] got from API:', playUrl.substring(0, 60))

    // 写入缓存
    if (cacheKey) {
      trackUrlCache.set(cacheKey, playUrl)
      if (trackUrlCache.size > 200) {
        const firstKey = trackUrlCache.keys().next().value
        trackUrlCache.delete(firstKey)
      }
    }

    return { url: playUrl, type: '128k' }
  }

  throw new Error('喜马拉雅获取音频URL失败: 缺少trackId')
}

/**
 * 获取喜马拉雅单集音频 URL
 * 使用 apis() 路由，与歌曲模块完全一致
 * 当自定义音源激活时 → 走自定义音源脚本
 * 当自定义音源未激活时 → 走内置降级实现
 *
 * @param {Object} songInfo - 歌曲信息（旧格式，通过 toOldMusicInfo 转换）
 * @param {string} quality - 请求的音质 ('128k' | '64k' | '32k')
 * @returns {{ promise: Promise<{ url: string, type: string }> }}
 */
const getMusicUrl = (songInfo, quality) => {
  // 优先使用 apis() 路由（与 kg/kw/tx/wy/mg 完全一致）
  try {
    console.log('[xm getMusicUrl] trying apis(xm) route...')
    const apiResult = apis('xm').getMusicUrl(songInfo, quality)
    if (apiResult && apiResult.promise) {
      console.log('[xm getMusicUrl] using apis(xm) route')
      return apiResult
    }
  } catch (err) {
    console.log('[xm getMusicUrl] apis(xm) not available, using built-in fallback:', err.message)
  }

  // 降级：使用内置实现
  console.log('[xm getMusicUrl] using built-in fallback')
  const promise = builtInGetMusicUrl(songInfo, quality)
  return { promise }
}

/**
 * 获取喜马拉雅单集封面图
 * 对齐音乐 SDK 的 getPic 接口格式
 *
 * @param {Object} songInfo - 歌曲信息（旧格式）
 * @returns {Promise<string>} 封面图 URL
 */
const getPic = (songInfo) => {
  console.log('[xm getPic] called:', { name: songInfo?.name, hasImg: !!songInfo?.img })
  if (songInfo?.img) return Promise.resolve(songInfo.img)
  return Promise.resolve('')
}

/**
 * 获取喜马拉雅单集歌词（听书一般无歌词，返回空）
 * 对齐音乐 SDK 的 getLyric 接口格式
 *
 * @param {Object} songInfo - 歌曲信息（旧格式）
 * @returns {{ promise: Promise<{ lyric: string, tlyric: string, rlyric: string, lxlyric: string }> }}
 */
const getLyric = (songInfo) => {
  const promise = Promise.resolve({
    lyric: '',
    tlyric: '',
    rlyric: '',
    lxlyric: '',
  })
  return { promise }
}

export default {
  search,
  getAlbumDetail,
  getAnchorDetail,
  getMusicUrl,
  getPic,
  getLyric,
}