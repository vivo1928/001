import { deduplicationList, toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'
import { extendQualityTypes } from '@/utils/musicSdk/utils'

const LIMIT = 20
const FETCH_TIMEOUT = 8000
const ALBUM_SONG_TIMEOUT = 15000

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

  const sdk = musicSdk[source] as {
    singer?: { getSingerAlbumList?: (singerid: string, page: number, limit: number) => Promise<{ albums: any[], total: number, allPage: number }> }
    albumSearch?: { search: (name: string, page: number, limit: number) => Promise<{ list: any[], total: number, allPage: number }> }
    album?: { getAlbumDetail?: (...args: any[]) => Promise<any>, getAlbumListDetail?: (...args: any[]) => Promise<any> }
  }
  if (!sdk) throw new Error('source not found: ' + source)

  // 策略：优先使用 singer.getSingerAlbumList API，失败则降级到 albumSearch
  const hasSingerAlbumApi = !!(sdk.singer?.getSingerAlbumList)

  if (hasSingerAlbumApi) {
    try {
      const result = await withTimeout(
        sdk.singer!.getSingerAlbumList!(singerId, page, LIMIT),
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

/**
 * 获取专辑的歌曲列表（全部页面）
 * 用于收藏专辑时自动填充歌曲到歌单
 * @param id 专辑ID
 * @param source 源
 * @param albumName 专辑名（可选，用于降级搜索）
 * @param singerName 歌手名（可选，用于降级搜索）
 * @returns
 */
export const getAlbumSongs = async(id: string, source: LX.OnlineSource, albumName?: string, singerName?: string): Promise<LX.Music.MusicInfoOnline[]> => {
  const sdk = musicSdk[source] as {
    album?: { getAlbumDetail?: (...args: any[]) => Promise<any>, getAlbumListDetail?: (...args: any[]) => Promise<any> }
  }
  if (!sdk) throw new Error('source not found: ' + source)

  const albumApi = sdk?.album
  const getDetail = albumApi?.getAlbumDetail || albumApi?.getAlbumListDetail
  if (!getDetail) {
    console.warn(`[singerAlbum] Album API not available for source: ${source}, cannot fetch album songs`)
    return []
  }

  try {
    // 先获取第一页，获取总页数
    const page1Result = await withTimeout(
      getDetail.call(albumApi, id, 1, undefined, albumName, singerName),
      ALBUM_SONG_TIMEOUT,
      `Album API timeout for source: ${source}`,
    )

    if (!page1Result || !page1Result.list || page1Result.list.length === 0) {
      console.warn(`[singerAlbum] Album API returned empty list for source: ${source}, id: ${id}`)
      return []
    }

    const allSongs = page1Result.list.map((s: any) => toNewMusicInfo(s) as LX.Music.MusicInfoOnline)
    const total = page1Result.total || allSongs.length
    const limit = page1Result.limit || allSongs.length
    // 多数音源接口不返回 allPage，需按 total/limit 计算总页数（与 getListDetailAll 保持一致）
    const allPage = page1Result.allPage || (total > limit ? Math.ceil(total / limit) : 1)

    // 如果只有一页，直接返回
    if (allPage <= 1) {
      allSongs.forEach(extendQualityTypes)
      return allSongs
    }

    // 获取剩余页面的歌曲
    const remainingPages: number[] = []
    for (let p = 2; p <= allPage; p++) {
      remainingPages.push(p)
    }

    const pageResults = await Promise.allSettled(
      remainingPages.map(page =>
        withTimeout(
          getDetail.call(albumApi, id, page, undefined, albumName, singerName),
          ALBUM_SONG_TIMEOUT,
          `Album API timeout for source: ${source}, page: ${page}`,
        ).then(result => {
          if (result?.list?.length) {
            return result.list.map((s: any) => toNewMusicInfo(s) as LX.Music.MusicInfoOnline)
          }
          return [] as LX.Music.MusicInfoOnline[]
        }),
      ),
    )

    for (const result of pageResults) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allSongs.push(...result.value)
      }
    }

    console.log(`[singerAlbum] getAlbumSongs: total=${total}, fetched=${allSongs.length}, allPage=${allPage}`)
    allSongs.forEach(extendQualityTypes)
    return allSongs
  } catch (err: any) {
    console.warn(`[singerAlbum] getAlbumSongs error: ${err?.message || err}`)
    return []
  }
}