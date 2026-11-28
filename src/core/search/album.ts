import searchAlbumState, { type Source } from '@/store/search/album/state'
import searchAlbumActions, { type SearchResult } from '@/store/search/album/action'
import musicSdk from '@/utils/musicSdk'

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

// 同一搜索 key 的并发请求去重：用户连续点搜索/切页签时复用同一个在途请求，
// 既避免重复请求被腾讯限流，也避免"先到的旧请求覆盖新结果"
const inflight = new Map<string, Promise<any>>()

export const search = async(text: string, page: number, sourceId: Source) => {
  const listInfo = searchAlbumState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${sourceId}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  const pending = inflight.get(key)
  if (pending) return pending
  const task = searchInner(text, page, sourceId, key, listInfo)
  inflight.set(key, task)
  return task.finally(() => { inflight.delete(key) })
}

const searchInner = async(text: string, page: number, sourceId: Source, key: string, listInfo: any) => {
  if (sourceId == 'all') {
    listInfo.key = key
    let task = []
    for (const source of searchAlbumState.sources) {
      if (source == 'all' || (page > 1 && page > (searchAlbumState.maxPages[source]!))) continue
      task.push(((musicSdk[source]?.albumSearch.search(text, page, searchAlbumState.listInfos.all.limit) as Promise<SearchResult>) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(`[album search] ${source} error:`, error?.message || error)
        return {
          list: [],
          total: 0,
          limit: searchAlbumState.listInfos.all.limit,
          source,
          allPage: 0,
        }
      }))
    }
    return Promise.all(task).then((results: SearchResult[]) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(results, page, text)
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    if (page > 1 && searchAlbumState.maxPages[sourceId] != null && page > searchAlbumState.maxPages[sourceId]!) {
      return []
    }
    listInfo.key = key
    return (musicSdk[sourceId]?.albumSearch.search(text, page, listInfo.limit) as Promise<SearchResult> ?? Promise.reject(new Error('source not found: ' + sourceId))).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(data, page, text)
    }).catch((err: any) => {
      console.log(`[album search] ${sourceId} error:`, err?.message || err)
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}