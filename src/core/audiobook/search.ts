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
  listInfo.key = key
  const result = await sdk.search(text, page, type, listInfo.limit)
  console.log('[audiobook search] result:', result?.list?.length, 'items, total:', result?.total)

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