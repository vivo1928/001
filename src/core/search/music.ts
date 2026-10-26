import searchMusicState, { type Source } from '@/store/search/music/state'
import searchMusicActions, { type SearchResult, mergeResults } from '@/store/search/music/action'
import musicSdk from '@/utils/musicSdk'

export const setSource: typeof searchMusicActions['setSource'] = (source) => {
  searchMusicActions.setSource(source)
}
export const setSearchText: typeof searchMusicActions['setSearchText'] = (text) => {
  searchMusicActions.setSearchText(text)
}
export const setListInfo: typeof searchMusicActions.setListInfo = (result, id, page) => {
  return searchMusicActions.setListInfo(result, id, page)
}

export const clearListInfo: typeof searchMusicActions.clearListInfo = (source) => {
  searchMusicActions.clearListInfo(source)
}


export const search = async(text: string, page: number, sourceId: Source, onPartial?: (list: LX.Music.MusicInfoOnline[]) => void): Promise<LX.Music.MusicInfoOnline[]> => {
  const listInfo = searchMusicState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${text}`
  if (sourceId == 'all') {
    listInfo.key = key
    let task = []
    const accumulated: SearchResult[] = []
    for (const source of searchMusicState.sources) {
      if (source == 'all') continue
      const p = ((musicSdk[source]?.musicSearch.search(text, page, searchMusicState.listInfos.all.limit) as Promise<SearchResult>) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(error)
        return {
          allPage: 1,
          limit: 30,
          list: [],
          source,
          total: 0,
        }
      })
      if (onPartial) {
        // 流式：每个源一返回就并入并推送分片，不等最慢的源
        task.push(p.then((result) => {
          accumulated.push(result)
          if (key == listInfo.key) onPartial(mergeResults([...accumulated], page, text))
          return result
        }))
      } else {
        task.push(p)
      }
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
    return (musicSdk[sourceId]?.musicSearch.search(text, page, listInfo.limit).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(data, page, text)
    }) ?? Promise.reject(new Error('source not found: ' + sourceId))).catch((err: any) => {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}

