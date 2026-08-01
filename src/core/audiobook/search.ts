import state, { type AudiobookSource, type AudiobookType } from '@/store/audiobook/state'
import musicSdk from '@/utils/musicSdk'

/**
 * 获取 SDK 实例
 * 对齐歌曲搜索模块通过 musicSdk 主入口访问子模块的模式
 * 所有音乐核心模块（搜索、歌单、排行榜等）都通过 musicSdk[sourceId] 访问
 *
 * 诊断日志用于排查模块加载问题，生产环境可删除
 */
const getSdk = (sourceId: AudiobookSource) => {
  // ====== 诊断日志：输出 musicSdk 的完整结构 ======
  console.log('[audiobook getSdk] sourceId:', sourceId)
  console.log('[audiobook getSdk] musicSdk 类型:', typeof musicSdk)
  console.log('[audiobook getSdk] musicSdk 是否为 null/undefined:', musicSdk == null)

  if (musicSdk) {
    // 列出 musicSdk 的所有顶层 key
    const keys = Object.keys(musicSdk)
    console.log('[audiobook getSdk] musicSdk 顶层 keys:', keys.join(', '))

    // 列出 sources 数组
    if (musicSdk.sources) {
      console.log('[audiobook getSdk] musicSdk.sources:', JSON.stringify(musicSdk.sources.map((s: any) => s.id || s)))
    } else {
      console.log('[audiobook getSdk] musicSdk.sources 不存在')
    }
  }

  // 尝试获取 xm 属性
  const rawXm = musicSdk[sourceId]
  console.log('[audiobook getSdk] musicSdk[' + sourceId + '] 类型:', typeof rawXm)
  console.log('[audiobook getSdk] musicSdk[' + sourceId + '] 是否为 null/undefined:', rawXm == null)

  if (rawXm) {
    const xmKeys = Object.keys(rawXm)
    console.log('[audiobook getSdk] musicSdk[' + sourceId + '] 的 keys:', xmKeys.join(', '))
    console.log('[audiobook getSdk] musicSdk[' + sourceId + '].search 类型:', typeof rawXm.search)
    console.log('[audiobook getSdk] musicSdk[' + sourceId + '].getAlbumDetail 类型:', typeof rawXm.getAlbumDetail)
    console.log('[audiobook getSdk] musicSdk[' + sourceId + '].getAnchorDetail 类型:', typeof rawXm.getAnchorDetail)
  } else {
    console.error('[audiobook getSdk] musicSdk[' + sourceId + '] 为 null/undefined！')
    // 尝试检查是否有 default 属性（esModuleInterop 包装）
    if (musicSdk.default) {
      console.log('[audiobook getSdk] musicSdk.default 存在')
      const defaultKeys = Object.keys(musicSdk.default)
      console.log('[audiobook getSdk] musicSdk.default keys:', defaultKeys.join(', '))
    }
  }
  // ====== 诊断日志结束 ======

  const sdk = musicSdk[sourceId]
  if (sdk && typeof sdk.search === 'function') {
    console.log('[audiobook getSdk] ✓ SDK 获取成功，search 是函数')
    return sdk
  }

  // 如果 sdk 存在但 search 不是函数，输出详细错误
  if (sdk) {
    console.error('[audiobook getSdk] ✗ sdk 存在但 search 不是函数')
    console.error('[audiobook getSdk] sdk 的所有 key:', Object.keys(sdk).join(', '))
    console.error('[audiobook getSdk] sdk.search:', sdk.search)
  } else {
    console.error('[audiobook getSdk] ✗ musicSdk[' + sourceId + '] 为 undefined/null')
  }

  throw new Error('听书源不支持: ' + sourceId + ' (musicSdk keys: ' + (musicSdk ? Object.keys(musicSdk).join(', ') : 'musicSdk is null') + ')')
}

/**
 * 立即更新搜索关键词（在调用 search() 之前调用）
 * 确保异常路径下也能保留用户输入的关键词，便于"重新加载"使用
 */
export const setSearchText = (text: string) => {
  state.searchText = text
}

/**
 * 清除列表信息（用于搜索失败后的状态恢复）
 * 对齐歌曲搜索模块 clearListInfo 的行为
 */
export const clearListInfo = () => {
  const listInfo = state.listInfo
  listInfo.list = []
  listInfo.page = 0
  listInfo.maxPage = 0
  listInfo.total = 0
  listInfo.key = null
}

/**
 * 搜索听书
 */
export const search = async (text: string, page: number, sourceId: AudiobookSource, type: AudiobookType) => {
  const listInfo = state.listInfo
  if (!text) return { list: [], total: 0, allPage: 0 }

  const key = `${page}__${sourceId}__${type}__${text}`
  // 如果 key 相同且已有列表数据，直接返回缓存
  if (listInfo.key === key && listInfo.list.length) {
    console.log('[audiobook search] cache hit:', key)
    return listInfo
  }

  const sdk = getSdk(sourceId)

  // 更新搜索参数
  state.searchText = text
  state.searchType = type
  state.source = sourceId

  console.log('[audiobook search] start:', text, 'page:', page, 'source:', sourceId, 'type:', type, 'limit:', listInfo.limit)

  let result
  try {
    console.log('[audiobook search] 调用 sdk.search 前, sdk keys:', Object.keys(sdk).join(', '))
    result = await sdk.search(text, page, type, listInfo.limit)
  } catch (err: any) {
    // 搜索失败时清理 state，对齐歌曲搜索模块的 clearListInfo 行为
    console.error('[audiobook search] failed:', err?.message || err)
    console.error('[audiobook search] error stack:', err?.stack)
    console.error('[audiobook search] error type:', typeof err, 'constructor:', err?.constructor?.name)
    if (page === 1) clearListInfo()
    throw err
  }
  console.log('[audiobook search] result:', result?.list?.length, 'items, total:', result?.total, 'allPage:', result?.allPage)

  // SDK 成功返回后才写入 key 和 list，确保 state 一致性
  listInfo.key = key
  listInfo.list = page === 1 ? result.list : [...listInfo.list, ...result.list]
  listInfo.total = result.total
  listInfo.page = page
  listInfo.maxPage = result.allPage
  listInfo.source = sourceId

  return result
}

/**
 * 获取专辑章节列表
 */
export const getAlbumDetail = async (albumId: string, sourceId: AudiobookSource, page = 1, limit = 200) => {
  const sdk = getSdk(sourceId)
  return sdk.getAlbumDetail(albumId, page, limit)
}

/**
 * 获取主播专辑列表
 */
export const getAnchorDetail = async (anchorId: string, sourceId: AudiobookSource, page = 1, limit = 30) => {
  const sdk = getSdk(sourceId)
  return sdk.getAnchorDetail(anchorId, page, limit)
}