import searchAlbumState, { type Source } from '@/store/search/album/state'
import searchAlbumActions, { type SearchResult } from '@/store/search/album/action'
import musicSdk from '@/utils/musicSdk'

const SEARCH_TIMEOUT = 15000

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, source: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Album search timeout for source: ${source}`)), timeoutMs)
    }),
  ])
}

export const setSource: typeof searchAlbumActions['setSource'] = (source) => {
  searchAlbumActions.setSource(source)
}
export const setSearchText: typeof searchAlbumActions['setSearchText'] = (text) => {
  searchAlbumActions.setSearchText(text)
}
const setListInfo: typeof searchAlbumActions.setListInfo = (result, page, text) => {
  return searchAlbumActions.setListInfo(result, page, text)
}

export const clearListInfo: typeof searchAlbumActions.clearListInfo = (source) => {
  searchAlbumActions.clearListInfo(source)
}

export const search = async(text: string, page: number, sourceId: Source) => {
  const listInfo = searchAlbumState.listInfos[sourceId]!
  const key = `${page}__${sourceId}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  if (sourceId == 'all') {
    listInfo.key = key
    let task = []
    for (const source of searchAlbumState.sources) {
      if (source == 'all' || (page > 1 && page > (searchAlbumState.maxPages[source]!))) continue
      const searchPromise = (musicSdk[source]?.albumSearch.search(text, page, searchAlbumState.listInfos.all.limit) as Promise<SearchResult>)
        ?? Promise.reject(new Error('source not found: ' + source))
      task.push(
        withTimeout(searchPromise, SEARCH_TIMEOUT, source).catch((error: any) => {
          console.log(`[album search] ${source} error:`, error?.message || error)
          return {
            list: [],
            total: 0,
            limit: searchAlbumState.listInfos.all.limit,
            source,
            allPage: 0,
          }
        })
      )
    }
    return Promise.all(task).then((results: SearchResult[]) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(results, page, text)
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    // 如果已经超过最大页数，直接返回空列表，避免无谓的API请求导致"加载失败"
    if (page > 1 && searchAlbumState.maxPages[sourceId] != null && page > searchAlbumState.maxPages[sourceId]!) {
      return []
    }
    listInfo.key = key
    const searchPromise = (musicSdk[sourceId]?.albumSearch.search(text, page, listInfo.limit) as Promise<SearchResult>)
      ?? Promise.reject(new Error('source not found: ' + sourceId))
    return withTimeout(searchPromise, SEARCH_TIMEOUT, sourceId).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      return setListInfo(data, page, text)
    }).catch((err: any) => {
      console.log(`[album search] ${sourceId} error:`, err?.message || err)
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}