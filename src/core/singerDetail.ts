import singerDetailState from '@/store/singerDetail/state'
import singerDetailActions from '@/store/singerDetail/action'
import { type ListDetailInfo } from '@/store/singerDetail/state'
import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'

const LIMIT = 30
const FETCH_TIMEOUT = 15000
// 各源歌手接口单次可请求的歌曲数（mg 接口 pageSize 受限保持 30，其余源按 100）
const SOURCE_FETCH_LIMIT: Record<string, number> = {
  tx: 100,
  kg: 100,
  wy: 100,
  mg: 30,
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

interface SingerInfoResult { source: string, singerid: string, info?: { name?: string, img?: string, desc?: string } }

interface SingerModule {
  getSingerInfo?: (singerid: string) => Promise<SingerInfoResult>
  searchSingerId?: (name: string) => Promise<string | number | null>
}

// 简介长度阈值：低于该值视为不完整，触发跨源兜底补齐
const MIN_DESC_LEN = 30

/**
 * 获取歌手简介，跨源兜底补齐
 * 1. 优先本源 getSingerInfo
 * 2. 本源简介缺失/过短时，依次尝试其他源补全（tx→wy→kg→kw）
 */
const getSingerInfoWithFallback = async(source: LX.OnlineSource, singerId: string, singerName: string): Promise<SingerInfoResult | null> => {
  const sources = ['tx', 'wy', 'kg', 'kw'] as LX.OnlineSource[]
  const primary = (musicSdk[source]?.singer as SingerModule | undefined)

  // 本源优先
  let best: SingerInfoResult | null = null

  if (primary?.getSingerInfo) {
    try {
      const r = await withTimeout(
        primary.getSingerInfo(singerId),
        FETCH_TIMEOUT,
        `SingerInfo timeout for source: ${source}`,
      )
      if (r?.info) best = r
    } catch { /* ignore */ }
  }

  const descLen = () => String(best?.info?.desc || '').trim().length

  if (!best || descLen() < MIN_DESC_LEN) {
    // 跨源兜底：按优先级尝试其他源（tx→wy→kg→kw）
    for (const other of sources) {
      if (other === source) continue
      const otherSinger = musicSdk[other]?.singer as SingerModule | undefined
      if (!otherSinger?.getSingerInfo || !otherSinger?.searchSingerId) continue
      try {
        const otherId = await withTimeout(
          otherSinger.searchSingerId(singerName),
          FETCH_TIMEOUT,
          `searchSingerId timeout for source: ${other}`,
        )
        if (!otherId) continue
        const r = await withTimeout(
          otherSinger.getSingerInfo(otherId),
          FETCH_TIMEOUT,
          `SingerInfo timeout for source: ${other}`,
        )
        if (r?.info && String(r.info.desc || '').trim().length > descLen()) {
          best = r
        }
      } catch { /* ignore */ }
    }
  }

  return best
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

  const sdk = musicSdk[source] as {
    singer?: { getSingerSongList?: (singerid: string, page: number, limit: number) => Promise<{ list: any[], total: number, limit: number, info?: any }> }
    musicSearch?: { search: (name: string, page: number, limit: number) => Promise<{ list: any[], total: number, limit: number, allPage: number }> }
  }
  if (!sdk) throw new Error('source not found: ' + source)

  const hasSingerApi = !!(sdk.singer?.getSingerSongList)
  let result: any

  // 简介获取：本源优先，缺失/过短时跨源兜底
  const fetchSingerInfo = async() => {
    try {
      const info = await getSingerInfoWithFallback(source, singerId, singerName)
      if (info?.info) singerDetailActions.setSingerInfo(info.info)
    } catch { /* 简介失败不影响列表 */ }
  }

  if (hasSingerApi) {
    try {
      const fetchLimit = SOURCE_FETCH_LIMIT[source] || 100
      result = await withTimeout(
        sdk.singer!.getSingerSongList!(singerId, sourcePage + 1, fetchLimit),
        FETCH_TIMEOUT,
        `Singer API timeout for source: ${source}`,
      )
      if (result && result.list && result.list.length > 0) {
        const info = result.info as SingerInfoResult['info'] | undefined
        const hasMeaningfulDesc = info && String(info.desc || '').trim().length >= MIN_DESC_LEN
        if (hasMeaningfulDesc) {
          singerDetailActions.setSingerInfo(info)
        } else if (sourcePage === 0) {
          // 本源简介缺失/过短时跨源兜底补齐
          await fetchSingerInfo()
        } else if (info) {
          singerDetailActions.setSingerInfo(info)
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
      if (sourcePage === 0) await fetchSingerInfo()
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
    // kw 等无歌手歌曲 API 的源，首次分页请求时补充歌手简介（失败不影响列表）
    if (sourcePage === 0) await fetchSingerInfo()
  }

  if (listCache !== cache.get(listKey)) throw new Error('cache mismatch')
  result.list = deduplicationList(result.list.map((m: any) => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[])
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
 * 获取歌手全部歌曲
 * 独立全量拉取：按源接口大分页直接请求，分批并发获取剩余页，
 * 失败页自动重试一次，保证大批量（如 2000+ 首）歌手也能快速、完整获取
 * @param id 歌手id  {source}__{singerId}
 * @param isRefresh 兼容参数，无需缓存
 * @returns {list, isComplete, total} list 歌曲列表，isComplete 是否完整，total 接口报告的总数
 */
export const getListDetailAll = async(id: string, isRefresh = false): Promise<{ list: LX.Music.MusicInfoOnline[], isComplete: boolean, total: number }> => {
  const [source, singerId] = id.split('__') as [LX.OnlineSource, string]
  const sdk = musicSdk[source] as {
    singer?: { getSingerSongList?: (singerid: string, page: number, limit: number) => Promise<{ list: any[], total: number, limit: number, info?: any }> }
    musicSearch?: { search: (name: string, page: number, limit: number) => Promise<{ list: any[], total: number, limit: number, allPage: number }> }
  }
  if (!sdk) throw new Error('source not found: ' + source)

  const hasSingerApi = !!(sdk.singer?.getSingerSongList)
  const singerName = singerDetailState.singerName
  const fetchLimit = SOURCE_FETCH_LIMIT[source] || 100
  const PAGES_PER_BATCH = 6
  const MAX_RETRY = 1

  const fetchPage = async(sourcePage: number): Promise<{ list: any[], total: number, limit: number }> => {
    if (hasSingerApi) {
      const r = await withTimeout(
        sdk.singer!.getSingerSongList!(singerId, sourcePage, fetchLimit),
        FETCH_TIMEOUT,
        `Singer API timeout for source: ${source}, page: ${sourcePage}`,
      )
      if (!r || !r.list || !r.list.length) throw new Error(`Singer API returned empty list, page: ${sourcePage}`)
      if (r.info) singerDetailActions.setSingerInfo(r.info)
      return { list: r.list, total: r.total || 0, limit: r.limit || fetchLimit }
    }
    if (!singerName) throw new Error('Singer name is empty')
    if (!sdk.musicSearch) throw new Error('musicSearch not supported for source: ' + source)
    const r = await withTimeout(
      sdk.musicSearch.search(singerName, sourcePage, LIMIT),
      FETCH_TIMEOUT,
      `musicSearch timeout for source: ${source}, page: ${sourcePage}`,
    )
    return { list: r.list || [], total: r.total || 0, limit: LIMIT }
  }

  const firstPage = await fetchPage(1)
  const allSongs: any[] = firstPage.list
  const maxSourcePage = Math.ceil(firstPage.total / firstPage.limit)
  if (maxSourcePage <= 1) {
    return {
      list: deduplicationList(allSongs.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[]),
      isComplete: true,
      total: firstPage.total,
    }
  }

  const pages = Array.from({ length: maxSourcePage - 1 }, (_, i) => i + 2)
  const failedPages: number[] = []
  const collect = async(pageList: number[]) => {
    const results = await Promise.allSettled(pageList.map(p =>
      fetchPage(p).then(r => ({ page: p, list: r.list })).catch(err => {
        console.warn(`[singerDetail] fetch page ${p} failed: ${err?.message || err}`)
        return { page: p, list: null as any[] | null }
      }),
    ))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.list) allSongs.push(...r.value.list)
      else if (r.status === 'fulfilled' && !r.value.list) failedPages.push(r.value.page)
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
    const results = await Promise.allSettled(current.map(p =>
      fetchPage(p).then(r => ({ page: p, list: r.list })).catch(() => ({ page: p, list: null as any[] | null })),
    ))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.list) allSongs.push(...r.value.list)
      else if (r.status === 'fulfilled') retryFailed.push(r.value.page)
    }
  }
  if (retryFailed.length) {
    console.warn(`[singerDetail] pages still failed after retry: ${retryFailed.join(',')}, total=${firstPage.total}`)
  }

  return {
    list: deduplicationList(allSongs.map(m => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[]),
    isComplete: retryFailed.length === 0,
    total: firstPage.total,
  }
}