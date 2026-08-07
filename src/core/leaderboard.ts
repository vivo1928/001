import leaderboardState, { type Board, type ListDetailInfo } from '@/store/leaderboard/state'
import leaderboardActions from '@/store/leaderboard/action'
import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'

/**
 * 获取排行榜内单页歌曲
 * @param id 排行榜id  {souce}__{bangId}
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const setListDetailInfo = (id: string) => {
  clearListDetail()
  const [source] = id.split('__') as [LX.OnlineSource, string]
  leaderboardActions.setListDetailInfo(source, id)
}
export const setListDetail = (result: ListDetailInfo, id: string, page: number) => {
  return leaderboardActions.setListDetail(result, id, page)
}

export const clearListDetail = () => {
  leaderboardActions.clearListDetail()
}

const setBoard = (board: Board, source: LX.OnlineSource) => {
  leaderboardActions.setBoard(board, source)
}

interface PageCache { data: ListDetailInfo, sourcePage: number }
type CacheValue = Map<string, PageCache | ListDetailInfo['list']>

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

export const getBoardsList = async(source: LX.OnlineSource) => {
  // const source = (await getLeaderboardSetting()).source as LX.OnlineSource
  if (leaderboardState.boards[source]) return leaderboardState.boards[source].list
  const board = await (musicSdk[source]?.leaderboard.getBoards() as Promise<Board>)
  setBoard(board, source)
  return leaderboardState.boards[source]!.list
}

/**
 * 获取排行榜内单页分页歌曲（用于在本地控制每页大小）
 * @param source 源
 * @param bangId 排行榜id
 * @param page 页数
 * @returns
 */
const getListLimit = async(source: LX.OnlineSource, bangId: string, page: number): Promise<ListDetailInfo> => {
  const listKey = `${source}__${bangId}`
  const prevPageKey = `${source}__${bangId}__${page - 1}`
  const tempListKey = `${source}__${bangId}__temp`

  let listCache = cache.get(listKey)!
  if (!listCache) cache.set(listKey, listCache = new Map<string, PageCache | LX.Music.MusicInfoOnline[]>())
  let sourcePage = 0
  {
    const prevPageData = listCache.get(prevPageKey) as PageCache
    if (prevPageData) sourcePage = prevPageData.sourcePage
  }

  return musicSdk[source]?.leaderboard.getList(bangId, sourcePage + 1).then((result: ListDetailInfo) => {
    if (listCache !== cache.get(listKey)) return
    result.list = deduplicationList(result.list.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
    let p = page
    const tempList = listCache.get(tempListKey) as ListDetailInfo['list']
    if (tempList) {
      listCache.delete(tempListKey)
      listCache.set(`${source}__${bangId}__${p}`, {
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
      listCache.set(`${source}__${bangId}__${p}`, {
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
    return (listCache.get(`${source}__${bangId}__${page}`) as PageCache).data
  }) ?? Promise.reject(new Error('source not found'))
}

/**
 * 获取排行榜内单页歌曲
 * @param id 排行榜id  {souce}__{bangId}
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const getListDetail = async(id: string, page: number, isRefresh = false): Promise<ListDetailInfo> => {
  // console.log(tabId)
  const [source, bangId] = id.split('__') as [LX.OnlineSource, string]
  const listKey = `${source}__${bangId}`
  const pageKey = `${source}__${bangId}__${page}`

  let listCache = cache.get(listKey)
  if (!listCache || isRefresh) {
    cache.set(listKey, listCache = new Map<string, PageCache | LX.Music.MusicInfoOnline[]>())
  }

  let pageCache = listCache.get(pageKey) as PageCache
  if (pageCache) return pageCache.data

  return getListLimit(source, bangId, page)
}

/**
 * 获取排行榜内全部歌曲
 * 独立全量拉取：按源接口分页大小直接请求，分批并发获取剩余页，失败页自动重试一次
 * @param id 排行榜id  {souce}__{id}
 * @param isRefresh 兼容参数，无需缓存
 * @returns 全部歌曲列表
 */
export const getListDetailAll = async(id: string, isRefresh = false): Promise<LX.Music.MusicInfoOnline[]> => {
  const [source, bangId] = id.split('__') as [LX.OnlineSource, string]
  const sdk = musicSdk[source]
  if (!sdk) throw new Error('source not found: ' + source)
  const leaderboard = sdk.leaderboard
  if (!leaderboard) throw new Error('leaderboard not supported for source: ' + source)

  const PAGES_PER_BATCH = 6
  const MAX_RETRY = 1

  const fetchPage = async(sourcePage: number): Promise<{ list: any[], total: number, limit: number }> => {
    const r = await withTimeout(
      leaderboard.getList(bangId, sourcePage) as Promise<{ list?: any[], total?: number, limit?: number }>,
      FETCH_TIMEOUT,
      `leaderboard fetch timeout for source: ${source}, page: ${sourcePage}`,
    )
    if (!r?.list) throw new Error(`leaderboard returned empty list, page: ${sourcePage}`)
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
        console.warn(`[leaderboard] fetch page ${p} failed: ${err instanceof Error ? err.message : String(err)}`)
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
    console.warn(`[leaderboard] pages still failed after retry: ${retryFailed.join(',')}, total=${firstPage.total}`)
  }

  return deduplicationList(allSongs.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
}

/**
 * 获取并设置排行榜内单页歌曲
 * @param id 排行榜id  {souce}__{id}
 * @param isRefresh 是否跳过缓存
 * @returns
 */
// export const getAndSetListDetail = async(id: string, page: number, isRefresh = false) => {
//   // let [source, bangId] = tabId.split('__')
//   // if (!bangId) return
//   let key = `${id}__${page}`

//   if (!isRefresh && leaderboardState.listDetailInfo.key == key && leaderboardState.listDetailInfo.list.length) return

//   leaderboardState.listDetailInfo.key = key

//   return getListDetail(id, page, isRefresh).then((result: ListDetailInfo) => {
//     if (key != leaderboardState.listDetailInfo.key) return
//     setListDetail(result, id, page)
//   }).catch((error: any) => {
//     clearListDetail()
//     console.log(error)
//     throw error
//   })
// }
