import singerDetailState from '@/store/singerDetail/state'
import singerDetailActions from '@/store/singerDetail/action'
import { type ListDetailInfo } from '@/store/singerDetail/state'
import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'

const LIMIT = 30
const FETCH_TIMEOUT = 15000

const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export const setListDetailInfo = (id: string) => {
  clearListDetail()
  const [source] = id.split('__') as [LX.OnlineSource, string]
  singerDetailActions.setListDetailInfo(source, id)
}

export const setListDetail = (result: ListDetailInfo, id: string, page: number) => {
  return singerDetailActions.setListDetail(result, id, page)
}

export const clearListDetail = () => {
  singerDetailActions.clearListDetail()
}

// 分页缓存结构（匹配排行榜模式）
interface PageCache { data: ListDetailInfo, sourcePage: number }
type CachePageValue = Map<string, PageCache | LX.Music.MusicInfoOnline[]>

const cache = new Map<string, CachePageValue>()

/**
 * 按本地分页大小（30条/页）从 singer API 获取并拆分数据
 * 完全匹配排行榜 core/leaderboard.ts 的 getListLimit 逻辑
 */
const getListLimit = async(source: LX.OnlineSource, singerId: string, page: number, singerName: string): Promise<ListDetailInfo> => {
  const listKey = `singer__${source}__${singerId}`
  const prevPageKey = `${listKey}__${page - 1}`
  const tempListKey = `${listKey}__temp`

  let listCache = cache.get(listKey)!
  if (!listCache) cache.set(listKey, listCache = new Map())
  let sourcePage = 0
  {
    const prevPageData = listCache.get(prevPageKey) as PageCache
    if (prevPageData) sourcePage = prevPageData.sourcePage
  }

  const sdk = musicSdk[source]
  if (!sdk) throw new Error('source not found: ' + source)

  const hasSingerApi = !!(sdk.singer?.getSingerSongList)
  let result: any

  if (hasSingerApi) {
    try {
      result = await withTimeout(
        sdk.singer.getSingerSongList(singerId, sourcePage + 1, LIMIT),
        FETCH_TIMEOUT,
        `Singer API timeout for source: ${source}`,
      )
      if (result && result.list && result.list.length > 0) {
        if (result.info) {
          singerDetailActions.setSingerInfo(result.info)
        }
      } else {
        throw new Error('Singer API returned empty list')
      }
    } catch (err: any) {
      console.log(`[singerDetail] singer API failed, falling back to musicSearch: ${err?.message || err}`)
      // 降级到 musicSearch
      if (!singerName) throw new Error('Singer name is empty')
      if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + source)
      result = await withTimeout(
        sdk.musicSearch.search(singerName, sourcePage + 1, LIMIT),
        FETCH_TIMEOUT,
        `musicSearch timeout for source: ${source}`,
      )
      result = {
        list: result.list || [],
        total: result.total || 0,
        allPage: result.allPage || 1,
        limit: LIMIT,
      }
    }
  } else {
    // 没有 singer API，直接使用 musicSearch
    if (!singerName) throw new Error('Singer name is empty')
    if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + source)
    result = await withTimeout(
      sdk.musicSearch.search(singerName, sourcePage + 1, LIMIT),
      FETCH_TIMEOUT,
      `musicSearch timeout for source: ${source}`,
    )
    result = {
      list: result.list || [],
      total: result.total || 0,
      allPage: result.allPage || 1,
      limit: LIMIT,
    }
  }

  if (listCache !== cache.get(listKey)) throw new Error('cache mismatch')
  result.list = deduplicationList(result.list.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
  let p = page
  const tempList = listCache.get(tempListKey) as LX.Music.MusicInfoOnline[]
  if (tempList) {
    listCache.delete(tempListKey)
    listCache.set(`${listKey}__${p}`, {
      data: {
        ...result,
        list: [...tempList, ...result.list.splice(0, LIMIT - tempList.length)],
        page: p,
        limit: LIMIT,
      },
      sourcePage,
    })
    p++
  }
  sourcePage++
  do {
    if (result.list.length < LIMIT && sourcePage < Math.ceil(result.total / result.limit)) {
      listCache.set(tempListKey, result.list.splice(0, LIMIT))
      break
    }
    listCache.set(`${listKey}__${p}`, {
      data: {
        ...result,
        list: result.list.splice(0, LIMIT),
        page: p,
        limit: LIMIT,
      },
      sourcePage,
    })
    p++
  } while (result.list.length > 0)
  return (listCache.get(`${listKey}__${page}`) as PageCache).data
}

/**
 * 获取歌手单曲列表（匹配排行榜模式）
 * @param id 歌手id  {source}__{singerId}
 * @param page 页数
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const getListDetail = async(id: string, page: number, isRefresh = false): Promise<ListDetailInfo> => {
  const [source, singerId] = id.split('__') as [LX.OnlineSource, string]
  const listKey = `singer__${source}__${singerId}`
  const pageKey = `${listKey}__${page}`

  let listCache = cache.get(listKey)
  if (!listCache || isRefresh) {
    cache.set(listKey, listCache = new Map())
  }

  let pageCache = listCache.get(pageKey) as PageCache
  if (pageCache) return pageCache.data

  return getListLimit(source, singerId, page, singerDetailState.singerName)
}

/**
 * 获取歌手全部歌曲（匹配排行榜模式）
 * @param id 歌手id  {source}__{singerId}
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const getListDetailAll = async(id: string, isRefresh = false): Promise<LX.Music.MusicInfoOnline[]> => {
  const [source, singerId] = id.split('__') as [LX.OnlineSource, string]
  const listKey = `singer__${source}__${singerId}`
  let listCache = cache.get(listKey)!
  if (!listCache || isRefresh) {
    cache.set(listKey, listCache = new Map())
  }

  const loadData = async(page: number): Promise<ListDetailInfo> => {
    const pageKey = `${listKey}__${page}`
    let pageCache = listCache.get(pageKey) as PageCache
    if (pageCache) return pageCache.data
    return getListLimit(source, singerId, page, singerDetailState.singerName)
  }
  return loadData(1).then(async result => {
    if (result.total <= result.limit) return result.list

    let maxPage = Math.ceil(result.total / result.limit)
    const loadDetail = async(loadPage = 2): Promise<LX.Music.MusicInfoOnline[]> => {
      return loadPage == maxPage
        ? loadData(loadPage).then(result => result.list)
        : loadData(loadPage).then(result1 => loadDetail(++loadPage).then(result2 => [...result1.list, ...result2]))
    }
    return loadDetail().then(result2 => [...result.list, ...result2])
  }).then(list => deduplicationList(list))
}