import state, { type AudiobookSource, type AudiobookType } from '@/store/audiobook/state'
import xm from '@/utils/musicSdk/xm'
import qt from '@/utils/musicSdk/qt'

const sdkMap: Record<AudiobookSource, typeof xm> = { xm, qt }

/**
 * 搜索听书
 */
export const search = async (text: string, page: number, sourceId: AudiobookSource, type: AudiobookType) => {
  const listInfo = state.listInfo
  if (!text) return { list: [], total: 0, allPage: 0 }

  const key = `${page}__${sourceId}__${type}__${text}`
  if (listInfo.key === key && listInfo.list.length) return listInfo

  const sdk = sdkMap[sourceId]
  if (!sdk) throw new Error('听书源不支持: ' + sourceId)

  listInfo.key = key
  const result = await sdk.search(text, page, type, listInfo.limit)

  listInfo.list = page === 1 ? result.list : [...listInfo.list, ...result.list]
  listInfo.total = result.total
  listInfo.page = page
  listInfo.maxPage = result.allPage
  listInfo.source = sourceId
  state.searchText = text
  state.searchType = type
  state.source = sourceId

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