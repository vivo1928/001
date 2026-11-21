import leaderboardState, { type Board, type ListDetailInfo } from '@/store/leaderboard/state'
import leaderboardActions from '@/store/leaderboard/action'
import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'
import { perfLog, perfTimer } from '@/utils/perfLog'

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
// 每个榜单已取回的歌曲数：作为"从完整列表里再取多少"的偏移量，
// 供 tx 这类只能整表返回、无法按页跳过的源做首屏精简加载
const consumedByList = new Map<string, number>()
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
  if (leaderboardState.boards[source]) {
    perfLog('boardsHit', { source, count: leaderboardState.boards[source].list.length })
    return leaderboardState.boards[source].list
  }
  const done = perfTimer('boards')
  const board = await (musicSdk[source]?.leaderboard.getBoards() as Promise<Board>)
  setBoard(board, source)
  const list = leaderboardState.boards[source]!.list
  done({ source, count: list.length })
  return list
}

/**
 * 获取排行榜内单页分页歌曲（用于在本地控制每页大小）
 * @param source 源
 * @param bangId 排行榜id
 * @param page 页数
 * @returns
 */
const getListLimit = async(source: LX.OnlineSource, bangId: string, page: number, isRefresh = false): Promise<ListDetailInfo> => {
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

  const offset = consumedByList.get(listKey) ?? 0
  const doneFetch = perfTimer('boardFetch')
  const leaderboard = musicSdk[source]?.leaderboard
  // 支持按偏移取数的源（目前仅 tx）：首屏少取，后续按需补；
  // 其余源保持原分页调用，第三个参数是它们内部的重试计数，不能串用
  const request = typeof leaderboard?.getListByOffset === 'function'
    ? leaderboard.getListByOffset(bangId, offset, isRefresh)
    : leaderboard?.getList(bangId, sourcePage + 1)
  return (request ?? Promise.reject(new Error('source not found'))).then((result: ListDetailInfo) => {
    doneFetch({ source, bangId, sourcePage: sourcePage + 1, offset, count: result.list.length, total: result.total })
    // 期间发生过刷新/换榜（缓存已被替换）：丢弃本次结果，返回空页避免上层读 undefined
    if (listCache !== cache.get(listKey)) {
      return { list: [], total: 0, maxPage: 0, page, source, limit: LIST_LOAD_LIMIT, key: null }
    }
    result.list = deduplicationList(result.list.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
    // 本次拉回的歌会被全部放进分页缓存（含临时页），累计偏移量随之增加
    consumedByList.set(listKey, offset + result.list.length)
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
    // 源本身已按本地页大小返回（tx 偏移模式 limit=30）时，末尾不足 30 首就是最后一页，
    // 不能再放进临时页等待下一页，否则最后一页永远不会被取出
    const isLocalPaged = result.limit === LIST_LOAD_LIMIT
    do {
      if (!isLocalPaged && result.list.length < LIST_LOAD_LIMIT && sourcePage < Math.ceil(result.total / result.limit)) {
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
    const pageData = listCache.get(`${source}__${bangId}__${page}`) as PageCache | undefined
    // 源已无更多新歌（按偏移取回为空）：返回空页让上层把状态置为到底，
    // 避免直接读 undefined 崩溃
    if (!pageData) return { ...result, list: [], total: consumedByList.get(listKey) ?? 0, limit: LIST_LOAD_LIMIT, page }
    return pageData.data
  })
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
    consumedByList.delete(listKey)
  }

  let pageCache = listCache.get(pageKey) as PageCache
  if (pageCache) {
    perfLog('boardPageHit', { source, page, count: pageCache.data.list.length })
    return pageCache.data
  }

  const done = perfTimer('boardPage')
  return getListLimit(source, bangId, page, isRefresh).then((data) => {
    done({ source, page, count: data.list.length })
    return data
  })
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
