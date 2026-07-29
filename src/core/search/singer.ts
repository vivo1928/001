import searchSingerState, { type Source } from '@/store/search/singer/state'
import searchSingerActions, { type SearchResult } from '@/store/search/singer/action'
import musicSdk from '@/utils/musicSdk'

export const setSource: typeof searchSingerActions['setSource'] = (source) => {
  searchSingerActions.setSource(source)
}
export const setSearchText: typeof searchSingerActions['setSearchText'] = (text) => {
  searchSingerActions.setSearchText(text)
}
const setListInfo: typeof searchSingerActions.setListInfo = (result, page, text) => {
  return searchSingerActions.setListInfo(result, page, text)
}

export const clearListInfo: typeof searchSingerActions.clearListInfo = (source) => {
  searchSingerActions.clearListInfo(source)
}

export const search = async(text: string, page: number, sourceId: Source) => {
  const listInfo = searchSingerState.listInfos[sourceId]!
  const key = `${page}__${sourceId}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  if (sourceId == 'all') {
    listInfo.key = key
    let task = []
    for (const source of searchSingerState.sources) {
      if (source == 'all' || (page > 1 && page > (searchSingerState.maxPages[source]!))) continue
      task.push(((musicSdk[source]?.singerSearch.search(text, page, searchSingerState.listInfos.all.limit) as Promise<SearchResult>) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(error)
        return {
          list: [],
          total: 0,
          limit: searchSingerState.listInfos.all.limit,
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
    listInfo.key = key
    return ((musicSdk[sourceId]?.singerSearch.search(text, page, listInfo.limit) as Promise<SearchResult>).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      return setListInfo(data, page, text)
    }) ?? Promise.reject(new Error('source not found: ' + sourceId))).catch((err: any) => {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}