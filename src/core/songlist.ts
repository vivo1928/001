import songlistState, { type TagInfo, type ListDetailInfo, type ListInfo } from '@/store/songlist/state'
import songlistActions from '@/store/songlist/action'
import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'
import { extendQualityTypes } from '@/utils/musicSdk/utils'


interface DetailPageCache { data: ListDetailInfo, sourcePage: number }
type LimitDetailCache = Map<string, DetailPageCache | ListDetailInfo['list']>
type CacheValue = LimitDetailCache | ListInfo

const cache = new Map<string, CacheValue>()
const LIST_LOAD_LIMIT = 30
// 全量拉取超时（毫秒）
const FETCH_TIMEOUT = 15000

const withTimeout = async <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(msg))
      }, ms)
    }),
  ])
}


/**
 * 获取排序列表
 * @param source
 * @returns
 */
export const getSortList = (source: LX.OnlineSource) => {
  return songlistState.sortList[source]!
}

/**
 * 获取标签列表
 * @param source
 * @returns
 */
export const getTags = async<T extends LX.OnlineSource>(source: T) => {
  if (songlistState.tags[source]) return songlistState.tags[source] as TagInfo<T>
  const info = await (musicSdk[source]?.songList.getTags() as Promise<TagInfo<T>>)
  songlistActions.setTags(info, source)
  return info
}

/**
 * 设置列表加载加载前的基本信息（用于加载失败后的重新加载）
 * @param source
 * @param tagId
 * @param sortId
 */
export const setListInfo: typeof songlistActions.setListInfo = (source, tagId, sortId) => {
  clearList()
  songlistActions.setListInfo(source, tagId, sortId)
}
/**
 * 设置列表信息
 * @param result
 * @param tagId
 * @param sortId
 * @param page
 * @returns
 */
export const setList: typeof songlistActions.setList = (result, tagId, sortId, page) => {
  return songlistActions.setList(result, tagId, sortId, page)
}

export const clearList = () => {
  songlistActions.clearList()
}

/**
 * 获取歌单列表
 * @param source 歌单源
 * @param tabId 类型id
 * @param sortId 排序
 * @param page 页数
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const getList = async(source: LX.OnlineSource, tabId: string, sortId: string, page: number, isRefresh = false): Promise<ListInfo> => {
  let pageKey = `slist__${source}__${sortId}__${tabId}__${page}`

  let listCache = cache.get(pageKey) as ListInfo
  if (listCache) {
    if (isRefresh) cache.delete(pageKey)
    else return listCache
  }

  return musicSdk[source]?.songList.getList(sortId, tabId, page).then((result: ListInfo) => {
    cache.set(pageKey, result)
    return result
    // if (pageKey != listInfo.key) return
    // setList(result, tabId, sortId, page)
  })
}


/**
 * 获取歌单详情内单页分页歌曲（用于在本地控制每页大小）
 * @param source 源
 * @param id 歌单id
 * @param page 页数
 * @returns
 */
const getListDetailLimit = async(source: LX.OnlineSource, id: string, page: number): Promise<ListDetailInfo> => {
  const listKey = `sdetail__${source}__${id}`
  const prevPageKey = `sdetail__${source}__${id}__${page - 1}`
  const tempListKey = `sdetail__${source}__${id}__temp`

  let listCache = cache.get(listKey) as LimitDetailCache
  if (!listCache) cache.set(listKey, listCache = new Map())
  let sourcePage = 0
  {
    const prevPageData = listCache.get(prevPageKey) as DetailPageCache
    if (prevPageData) sourcePage = prevPageData.sourcePage
  }

  return musicSdk[source]?.songList.getListDetail(id, sourcePage + 1).then((result: ListDetailInfo) => {
    if (listCache !== cache.get(listKey)) return
    result.list = deduplicationList(result.list.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
    result.list.forEach(extendQualityTypes)
    let p = page
    const tempList = listCache.get(tempListKey) as ListDetailInfo['list']
    if (tempList) {
      listCache.delete(tempListKey)
      listCache.set(`sdetail__${source}__${id}__${p}`, {
        data: {
          ...result,
          list: [...tempList, ...result.list.splice(0, LIST_LOAD_LIMIT - tempList.length)],
          page: p,
          limit: LIST_LOAD_LIMIT,
        },
        sourcePage,
      })
      p++
    }
    sourcePage++
    do {
      if (result.list.length < LIST_LOAD_LIMIT && sourcePage < Math.ceil(result.total / result.limit)) {
        listCache.set(tempListKey, result.list.splice(0, LIST_LOAD_LIMIT))
        break
      }
      listCache.set(`sdetail__${source}__${id}__${p}`, {
        data: {
          ...result,
          list: result.list.splice(0, LIST_LOAD_LIMIT),
          page: p,
          limit: LIST_LOAD_LIMIT,
        },
        sourcePage,
      })
      p++
    } while (result.list.length > 0)
    return (listCache.get(`sdetail__${source}__${id}__${page}`) as DetailPageCache).data
  }) ?? Promise.reject(new Error('source not found'))
}

/**
 * 设置列表加载加载前的基本信息（用于加载失败后的重新加载）
 * @param source
 * @param tagId
 * @param sortId
 */
export const setListDetailInfo: typeof songlistActions.setListDetailInfo = (source, id) => {
  clearListDetail()
  songlistActions.setListDetailInfo(source, id)
}
export const setListDetail: typeof songlistActions.setListDetail = (result, id, page) => {
  return songlistActions.setListDetail(result, id, page)
}

export const clearListDetail = () => {
  songlistActions.clearListDetail()
}

/**
 * 获取歌单内单页歌曲
 * @param id 歌单id
 * @param source 歌单源
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const getListDetail = async(id: string, source: LX.OnlineSource, page: number, isRefresh = false): Promise<ListDetailInfo> => {
  const listKey = `sdetail__${source}__${id}`
  const pageKey = `sdetail__${source}__${id}__${page}`

  let listCache = cache.get(listKey) as LimitDetailCache
  if (!listCache || isRefresh) {
    cache.set(listKey, listCache = new Map())
  }

  let pageCache = listCache.get(pageKey) as DetailPageCache
  if (pageCache) return pageCache.data

  return getListDetailLimit(source, id, page)
}

/**
 * 获取歌单内全部歌曲
 * 独立全量拉取：按源接口分页大小直接请求，分批并发获取剩余页，失败页自动重试一次
 * @param source 源
 * @param id 歌单id
 * @param isRefresh 兼容参数，无需缓存
 * @returns 全部歌曲列表
 */
export const getListDetailAll = async(source: LX.OnlineSource, id: string, isRefresh = false): Promise<LX.Music.MusicInfoOnline[]> => {
  const sdk = musicSdk[source]
  if (!sdk) throw new Error('source not found: ' + source)
  const songList = sdk.songList
  if (!songList) throw new Error('songList not supported for source: ' + source)

  const PAGES_PER_BATCH = 6
  const MAX_RETRY = 1

  const fetchPage = async(sourcePage: number): Promise<{ list: any[], total: number, limit: number }> => {
    const r = await withTimeout(
      songList.getListDetail(id, sourcePage) as Promise<{ list?: any[], total?: number, limit?: number }>,
      FETCH_TIMEOUT,
      `songlist fetch timeout for source: ${source}, page: ${sourcePage}`,
    )
    if (!r?.list) throw new Error(`songlist returned empty list, page: ${sourcePage}`)
    return { list: r.list, total: r.total ?? 0, limit: r.limit ?? LIST_LOAD_LIMIT }
  }

  const firstPage = await fetchPage(1)
  const allSongs: any[] = firstPage.list
  const maxSourcePage = Math.ceil(firstPage.total / firstPage.limit)
  if (maxSourcePage <= 1) {
    return deduplicationList(allSongs.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
  }

  const pages = Array.from({ length: maxSourcePage - 1 }, (_, i) => i + 2)
  const failedPages: number[] = []
  const collect = async(pageList: number[]) => {
    const results = await Promise.allSettled(pageList.map(async p => {
      try {
        const r = await fetchPage(p)
        return { page: p, list: r.list }
      } catch (err) {
        console.warn(`[songlist] fetch page ${p} failed: ${err instanceof Error ? err.message : String(err)}`)
        return { page: p, list: null }
      }
    }))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.list) {
        for (const item of r.value.list) allSongs.push(item)
      } else if (r.status === 'fulfilled' && !r.value.list) failedPages.push(r.value.page)
    }
  }

  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
    await collect(pages.slice(i, i + PAGES_PER_BATCH))
  }

  // 失败页重试一次
  const retryFailed: number[] = []
  for (let attempt = 0; attempt <= MAX_RETRY && failedPages.length; attempt++) {
    const current = [...failedPages]
    failedPages.length = 0
    const results = await Promise.allSettled(current.map(async p => {
      try {
        const r = await fetchPage(p)
        return { page: p, list: r.list }
      } catch {
        return { page: p, list: null }
      }
    }))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.list) {
        for (const item of r.value.list) allSongs.push(item)
      } else if (r.status === 'fulfilled' && !r.value.list) retryFailed.push(r.value.page)
    }
  }
  if (retryFailed.length) {
    console.warn(`[songlist] pages still failed after retry: ${retryFailed.join(',')}, total=${firstPage.total}`)
  }

  return deduplicationList(allSongs.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
}
