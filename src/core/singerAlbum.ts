import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'

const LIMIT = 20
const FETCH_TIMEOUT = 8000

const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

// 缓存结构
const cache = new Map<string, { list: any[], allPage: number, total: number }>()

/**
 * 获取歌手专辑列表 - 匹配搜索模块的加载逻辑
 * @param singerId 歌手ID
 * @param singerName 歌手名（用于降级搜索）
 * @param source 源
 * @param page 页数
 * @param isRefresh 是否跳过缓存
 * @returns
 */
export const search = async(singerId: string, singerName: string, source: LX.OnlineSource, page: number, isRefresh = false): Promise<{ list: any[], allPage: number, total: number }> => {
  const cacheKey = `${source}__${singerId}__${page}`
  const listKey = `singer_album__${source}__${singerId}`

  if (!isRefresh) {
    const cached = cache.get(cacheKey)
    if (cached) return cached
  }

  const sdk = musicSdk[source]
  if (!sdk) throw new Error('source not found: ' + source)

  // 策略：优先使用 singer.getSingerAlbumList API，失败则降级到 albumSearch
  const hasSingerAlbumApi = !!(sdk.singer?.getSingerAlbumList)

  if (hasSingerAlbumApi) {
    try {
      const result = await withTimeout(
        sdk.singer.getSingerAlbumList(singerId, page, LIMIT),
        FETCH_TIMEOUT,
        `Singer album API timeout for source: ${source}`,
      )
      if (result && result.albums && result.albums.length > 0) {
        const data = {
          list: result.albums.map((item: any) => ({
            ...item,
            source,
          })),
          allPage: result.allPage || Math.ceil((result.total || 0) / LIMIT) || 1,
          total: result.total || 0,
        }
        cache.set(cacheKey, data)
        // 清理旧缓存（只保留当前歌手的缓存）
        for (const key of cache.keys()) {
          if (key !== cacheKey && key.startsWith(listKey)) {
            cache.delete(key)
          }
        }
        return data
      }
    } catch (err: any) {
      console.log(`[singerAlbum] singer API failed, falling back to albumSearch: ${err?.message || err}`)
    }
  }

  // 降级：使用 albumSearch 按歌手名称搜索
  if (!sdk?.albumSearch) throw new Error('albumSearch not supported for source: ' + source)

  const result = await withTimeout(
    sdk.albumSearch.search(singerName, page, LIMIT),
    FETCH_TIMEOUT,
    `albumSearch timeout for source: ${source}`,
  )

  // 过滤出与歌手名匹配的专辑
  const filteredList = (result.list || []).filter((item: any) => {
    const singer = (item.singer || item.author || '').toLowerCase()
    return singer.includes(singerName.toLowerCase())
  }).map((item: any) => ({
    ...item,
    source,
  }))

  const data = {
    list: filteredList,
    allPage: result.allPage || 1,
    total: result.total || 0,
  }
  cache.set(cacheKey, data)
  return data
}

/**
 * 清空指定歌手的缓存
 */
export const clearCache = (singerId: string, source: LX.OnlineSource) => {
  const prefix = `singer_album__${source}__${singerId}`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}