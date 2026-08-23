import {
  downloadFile,
  existsFile,
  unlink,
  mkdir,
  stat,
  readDir,
  extname,
  temporaryDirectoryPath,
} from '@/utils/fs'

/**
 * 播放缓存模块
 * 在线歌曲播放时整体下载到本地缓存目录，后续播放命中缓存直接播本地文件，
 * 避免流式播放慢（服务器对 range request 响应慢）导致的长时间缓冲。
 * 缓存目录位于系统缓存目录下，清除应用缓存时一并清除。
 */

const CACHE_DIR = `${temporaryDirectoryPath}/lx-playback-cache`

interface CacheEntry {
  path: string
  size: number
}

type CacheIndex = Map<string, CacheEntry>

const cacheIndex: CacheIndex = new Map()
const downloadTasks = new Map<string, Promise<string | null>>()

const getKey = (musicInfo: Pick<LX.Music.MusicInfoOnline, 'id'>): string => musicInfo.id

const getCachePath = (key: string, url: string): string => {
  const ext = extname(url) || 'mp3'
  return `${CACHE_DIR}/${key}.${ext}`
}

/**
 * 扫描缓存目录，重建内存索引
 */
const scanCacheDir = async(): Promise<void> => {
  const dirExists = await existsFile(CACHE_DIR).catch(() => false)
  if (!dirExists) return
  const names = await readDir(CACHE_DIR).catch(() => [])
  cacheIndex.clear()
  for (const file of names) {
    if (file.name == 'index.json' || file.isDirectory) continue
    const key = file.name.substring(0, file.name.lastIndexOf('.'))
    cacheIndex.set(key, {
      path: file.path,
      size: file.size ?? 0,
    })
  }
}

let initPromise: Promise<void> | null = null
export const initPlaybackCache = async(): Promise<void> => {
  if (!initPromise) {
    initPromise = scanCacheDir().catch(() => {})
  }
  await initPromise
}

/**
 * 获取歌曲本地缓存路径（命中且文件存在时返回，否则 null）
 */
export const getPlaybackCachePath = async(musicInfo: Pick<LX.Music.MusicInfoOnline, 'id'>): Promise<string | null> => {
  await initPlaybackCache()
  const key = getKey(musicInfo)
  const entry = cacheIndex.get(key)
  if (!entry) return null
  const exists = await existsFile(entry.path).catch(() => false)
  if (!exists) {
    cacheIndex.delete(key)
    return null
  }
  return entry.path
}

/**
 * 后台下载歌曲到本地缓存
 * 同歌并发去重；下载完成后追加到内存索引
 * @param maxSizeMB 缓存大小上限（MB），0 或负数表示禁用缓存
 */
export const cachePlaybackMusic = async(
  musicInfo: Pick<LX.Music.MusicInfoOnline, 'id'>,
  url: string,
  maxSizeMB = 0,
): Promise<string | null> => {
  if (!url || !/^https?:/i.test(url)) return null
  if (maxSizeMB <= 0) return null
  await initPlaybackCache()
  const key = getKey(musicInfo)
  if (cacheIndex.has(key)) return cacheIndex.get(key)!.path

  const existing = downloadTasks.get(key)
  if (existing) return existing

  const path = getCachePath(key, url)
  const task = (async(): Promise<string | null> => {
    try {
      // 检查缓存大小限制，超出时淘汰最旧文件
      await enforceCacheLimit(maxSizeMB)
      await mkdir(CACHE_DIR).catch(() => {})
      const result = await downloadFile(url, path, {
        connectionTimeout: 30000,
        readTimeout: 30000,
      }).promise
      if (result.statusCode !== 200) {
        await unlink(path).catch(() => {})
        return null
      }
      const st = await stat(path).catch(() => null)
      cacheIndex.set(key, {
        path,
        size: (st as any)?.size ?? 0,
      })
      return path
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[playbackCache] download failed: ${(err as any)?.message || err}`)
      await unlink(path).catch(() => {})
      return null
    } finally {
      downloadTasks.delete(key)
    }
  })()
  downloadTasks.set(key, task)
  return task
}

/**
 * 检查缓存大小限制，超出时淘汰最旧条目
 */
const enforceCacheLimit = async(maxSizeMB: number): Promise<void> => {
  if (maxSizeMB <= 0) return
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  let total = 0
  for (const entry of cacheIndex.values()) total += entry.size
  if (total <= maxSizeBytes) return
  // 按添加顺序淘汰最旧条目，直到低于限制
  const entries = [...cacheIndex.entries()]
  for (const [key, entry] of entries) {
    if (total <= maxSizeBytes) break
    await unlink(entry.path).catch(() => {})
    cacheIndex.delete(key)
    total -= entry.size
  }
}

/**
 * 获取缓存总大小（字节）
 */
export const getPlaybackCacheSize = async(): Promise<number> => {
  await initPlaybackCache()
  let total = 0
  for (const entry of cacheIndex.values()) total += entry.size
  return total
}

/**
 * 清除播放缓存
 */
export const clearPlaybackCache = async(): Promise<void> => {
  await initPlaybackCache()
  await Promise.all([...cacheIndex.values()].map(async entry => {
    try { await unlink(entry.path) } catch {}
  }))
  await unlink(CACHE_DIR).catch(() => {})
  cacheIndex.clear()
  downloadTasks.clear()
}
