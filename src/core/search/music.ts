import searchMusicState, { type Source } from '@/store/search/music/state'
import searchMusicActions, { type SearchResult, mergeResults } from '@/store/search/music/action'
import musicSdk from '@/utils/musicSdk'
import { appLog } from '@/utils/appLog'

export const setSource: typeof searchMusicActions['setSource'] = (source) => {
  searchMusicActions.setSource(source)
}
export const setSearchText: typeof searchMusicActions['setSearchText'] = (text) => {
  searchMusicActions.setSearchText(text)
}
export const setListInfo: typeof searchMusicActions['setListInfo'] = (result, id, page) => {
  return searchMusicActions.setListInfo(result, id, page)
}

export const clearListInfo: typeof searchMusicActions['clearListInfo'] = (source) => {
  searchMusicActions.clearListInfo(source)
}

// ── 搜索性能优化（延迟实测见 DSH-Go 测试报告） ─────────────────────
// 1. 聚合搜索：单源 3.5s 预算。任一源挂起（实测咪咕偶发 15s 才被全局超时中断）
//    都不会拖住整体，最坏耗时从 15s 降到 3.5s；已返回的源仍会流式渲染。
const AGG_SOURCE_TIMEOUT = 3500
// 2. 结果短缓存：同一 源/关键词/页码 5 分钟内重复搜索直接命中，省一次网络往返
//    （来回切源、重复点搜索是最高频的操作）。
const CACHE_TTL = 5 * 60 * 1000
const CACHE_MAX = 60
const resultCache = new Map<string, { at: number, results: SearchResult[] }>()

const cacheKey = (sourceId: Source, page: number, text: string) => `${sourceId}__${page}__${text}`

const getCachedResults = (key: string) => {
  const item = resultCache.get(key)
  if (!item) return
  if (Date.now() - item.at > CACHE_TTL) {
    resultCache.delete(key)
    return
  }
  // LRU：命中后移到队尾
  resultCache.delete(key)
  resultCache.set(key, item)
  return item.results
}

const setCachedResults = (key: string, results: SearchResult[]) => {
  resultCache.delete(key)
  resultCache.set(key, { at: Date.now(), results })
  while (resultCache.size > CACHE_MAX) {
    const oldest = resultCache.keys().next().value
    if (oldest == null) break
    resultCache.delete(oldest)
  }
}

const emptyResult = (source: Source): SearchResult => ({ allPage: 1, limit: 30, list: [], source, total: 0 })

const withSourceBudget = (source: Source, promise: Promise<SearchResult>): Promise<SearchResult> => new Promise(resolve => {
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    appLog('search:source-timeout', { source, timeout: AGG_SOURCE_TIMEOUT })
    resolve(emptyResult(source))
  }, AGG_SOURCE_TIMEOUT)
  promise.then(result => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolve(result)
  }).catch(() => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolve(emptyResult(source))
  })
})

export const search = async(text: string, page: number, sourceId: Source, onPartial?: (list: LX.Music.MusicInfoOnline[]) => void): Promise<LX.Music.MusicInfoOnline[]> => {
  if (page <= 1) appLog('search', { text, source: sourceId })
  const listInfo = searchMusicState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${text}`
  if (sourceId == 'all') {
    listInfo.key = key
    const cached = page == 1 ? getCachedResults(cacheKey(sourceId, page, text)) : undefined
    if (cached) {
      appLog('search:cache-hit', { source: sourceId, page })
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(cached, page, text)
    }
    const task: Promise<SearchResult>[] = []
    const accumulated: SearchResult[] = []
    for (const source of searchMusicState.sources) {
      if (source == 'all') continue
      const base = ((musicSdk[source]?.musicSearch.search(text, page, searchMusicState.listInfos.all.limit) as Promise<SearchResult>) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(error)
        return emptyResult(source)
      })
      const p = withSourceBudget(source, base)
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
      if (page == 1) setCachedResults(cacheKey(sourceId, page, text), results)
      return setListInfo(results, page, text)
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    const cached = page == 1 ? getCachedResults(cacheKey(sourceId, page, text)) : undefined
    listInfo.key = key
    if (cached?.[0]) {
      appLog('search:cache-hit', { source: sourceId, page })
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(cached[0], page, text)
    }
    return (musicSdk[sourceId]?.musicSearch.search(text, page, listInfo.limit).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      if (page == 1) setCachedResults(cacheKey(sourceId, page, text), [data])
      return setListInfo(data, page, text)
    }) ?? Promise.reject(new Error('source not found: ' + sourceId))).catch((err: any) => {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}
