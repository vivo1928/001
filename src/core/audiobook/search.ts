import state, { type AudiobookSource, type AudiobookType } from '@/store/audiobook/state'
import xm from '@/utils/musicSdk/xm'

const sdkMap: Record<AudiobookSource, typeof xm> = { xm }

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

  // 在执行搜索前立即写 state，确保异常路径下 state 也有值
  state.searchText = text
  state.searchType = type
  state.source = sourceId

  const key = `${page}__${sourceId}__${type}__${text}`
  if (listInfo.key === key && listInfo.list.length) return listInfo

  const sdk = sdkMap[sourceId]
  if (!sdk) throw new Error('听书源不支持: ' + sourceId)

  console.log('[audiobook search] start:', text, 'page:', page, 'source:', sourceId, 'type:', type)

  // 只在首次搜索时设置 key，等 SDK 成功返回后才正式写入
  // 避免 SDK 抛异常后 state.key 已更新但 list 为空的不一致状态
  let result
  try {
    result = await sdk.search(text, page, type, listInfo.limit)
  } catch (err) {
    // 搜索失败时清理 state，对齐歌曲搜索模块的 clearListInfo 行为
    if (page === 1) clearListInfo()
    throw err
  }
  console.log('[audiobook search] result:', result?.list?.length, 'items, total:', result?.total)

  // SDK 成功返回后才写入 key，确保 state 一致性
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
  const sdk = sdkMap[sourceId]
  if (!sdk) throw new Error('听书源不支持: ' + sourceId)
  return sdk.getAlbumDetail(albumId, page, limit)
}

/**
 * 获取主播专辑列表
 */
export const getAnchorDetail = async (anchorId: string, sourceId: AudiobookSource, page = 1, limit = 30) => {
  const sdk = sdkMap[sourceId]
  if (!sdk) throw new Error('听书源不支持: ' + sourceId)
  return sdk.getAnchorDetail(anchorId, page, limit)
}