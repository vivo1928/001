import searchProgramState, { type Source } from '@/store/search/program/state'
import searchProgramActions, { type SearchResult } from '@/store/search/program/action'
import musicSdk from '@/utils/musicSdk'

const SEARCH_TIMEOUT = 15000

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, source: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Program search timeout for source: ${source}`)), timeoutMs)
    }),
  ])
}

export const setSource: typeof searchProgramActions['setSource'] = (source) => {
  searchProgramActions.setSource(source)
}
export const setSearchText: typeof searchProgramActions['setSearchText'] = (text) => {
  searchProgramActions.setSearchText(text)
}
const setListInfo: typeof searchProgramActions.setListInfo = (result, page, text) => {
  return searchProgramActions.setListInfo(result, page, text)
}

export const clearListInfo: typeof searchProgramActions.clearListInfo = (source) => {
  searchProgramActions.clearListInfo(source)
}

export const search = async(text: string, page: number, sourceId: Source) => {
  const listInfo = searchProgramState.listInfos[sourceId]!
  const key = `${page}__${sourceId}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  if (sourceId == 'all') {
    listInfo.key = key
    let task = []
    for (const source of searchProgramState.sources) {
      if (source == 'all' || (page > 1 && page > (searchProgramState.maxPages[source]!))) continue
      const searchPromise = (musicSdk[source]?.programSearch.search(text, page, searchProgramState.listInfos.all.limit) as Promise<SearchResult>)
        ?? Promise.reject(new Error('source not found: ' + source))
      task.push(
        withTimeout(searchPromise, SEARCH_TIMEOUT, source).catch((error: any) => {
          console.log(`[program search] ${source} error:`, error?.message || error)
          return {
            list: [],
            total: 0,
            limit: searchProgramState.listInfos.all.limit,
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
    // 如果已经超过最大页数，直接返回空列表
    if (page > 1 && searchProgramState.maxPages[sourceId] != null && page > searchProgramState.maxPages[sourceId]!) {
      return []
    }
    listInfo.key = key
    const searchPromise = (musicSdk[sourceId]?.programSearch.search(text, page, listInfo.limit) as Promise<SearchResult>)
      ?? Promise.reject(new Error('source not found: ' + sourceId))
    return withTimeout(searchPromise, SEARCH_TIMEOUT, sourceId).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      return setListInfo(data, page, text)
    }).catch((err: any) => {
      console.log(`[program search] ${sourceId} error:`, err?.message || err)
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}