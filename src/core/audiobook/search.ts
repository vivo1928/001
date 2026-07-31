import state, { type AudiobookSource, type AudiobookType } from '@/store/audiobook/state'

/**
 * 获取 SDK 实例
 * 使用 require() 而非 import，避免 TypeScript 的 esModuleInterop 把
 * export default 包装成 { default: { search, ... } } 导致 .search 丢失
 * 对齐歌曲搜索模块通过 musicSdk 主入口访问子模块的模式
 */
const getSdk = (sourceId: AudiobookSource) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const xm = require('@/utils/musicSdk/xm')
  // 兼容两种导出格式：export default 返回 { default: {...} }，module.exports 直接返回 {...}
  const sdk = xm.default || xm
  if (sourceId === 'xm' && sdk.search) return sdk
  throw new Error('听书源不支持: ' + sourceId)
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

  console.log('[audiobook search] start:', text, 'page:', page, 'source:', sourceId, 'type:', type)

  let result
  try {
    result = await sdk.search(text, page, type, listInfo.limit)
  } catch (err: any) {
    // 搜索失败时清理 state，对齐歌曲搜索模块的 clearListInfo 行为
    console.error('[audiobook search] failed:', err?.message || err)
    if (page === 1) clearListInfo()
    throw err
  }
  console.log('[audiobook search] result:', result?.list?.length, 'items, total:', result?.total)

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