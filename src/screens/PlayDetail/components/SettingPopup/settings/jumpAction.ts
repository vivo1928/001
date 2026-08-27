import musicSdk from '@/utils/musicSdk'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'

interface SingerSearchResult {
  list?: Array<{ id: string | number, name?: string }>
}

interface SingerModule {
  searchSingerId?: (name: string) => Promise<string | number | null>
}

interface SingerSearchModule {
  search?: (str: string, page?: number, limit?: number) => Promise<SingerSearchResult>
}

// 歌手 id 反查结果缓存（key: `${source}__${name}`），避免重复请求
const singerIdCache = new Map<string, string>()

interface JumpTargetMusic {
  source: string
  name: string
  singer: string
  meta?: {
    albumId?: string | number | null
    albumName?: string
    picUrl?: string | null
  }
}

/**
 * 反查歌手 id
 * 优先使用各源 singerSearch（歌手搜索接口，与搜索页同款，更可靠），精确匹配歌手名；
 * 失败时兜底 searchSingerId（部分源如 wy 的明文 /api/search/get 接口可能被风控返回 null）。
 */
const findSingerId = async(singerName: string, source: LX.OnlineSource): Promise<string | null> => {
  // 1. singerSearch 歌手搜索接口（与搜索页同款，更稳定）
  try {
    const sdk = musicSdk[source] as { singerSearch?: SingerSearchModule } | undefined
    const searchFn = sdk?.singerSearch?.search
    if (searchFn) {
      const res = await searchFn.call(sdk?.singerSearch, singerName, 1, 20)
      const list = res?.list ?? []
      // 优先精确匹配，其次包含匹配；均未命中时取第一个（歌手搜索首个结果最相关）
      const exact = list.find(s => s.name === singerName)
      const match = exact ?? list.find(s => s.name && s.name.includes(singerName)) ?? list[0]
      if (match?.id) return String(match.id)
    }
  } catch { /* fall through */ }

  // 2. 兜底 searchSingerId
  try {
    const sdk = musicSdk[source] as { singer?: SingerModule } | undefined
    const id = await sdk?.singer?.searchSingerId?.(singerName)
    if (id) return String(id)
  } catch { /* ignore */ }

  return null
}

/**
 * 反查歌手 id 并跳转到歌手详情页
 * @param singerName 歌手名
 * @param source 音源
 * @param closePopup 关闭设置弹窗的回调（跳转前调用，避免弹窗覆盖详情页）
 */
export const jumpToSinger = async(
  singerName: string,
  source: LX.OnlineSource,
  closePopup?: () => void,
): Promise<boolean> => {
  const cacheKey = `${source}__${singerName}`
  let singerId: string | null | undefined = singerIdCache.get(cacheKey)
  if (!singerId) {
    singerId = await findSingerId(singerName, source)
    if (!singerId) return false
    singerIdCache.set(cacheKey, singerId)
  }
  closePopup?.()
  navigations.pushSingerDetailScreen(commonState.componentIds.playDetail!, {
    id: singerId,
    name: singerName,
    source,
  })
  return true
}

/**
 * 跳转到当前歌曲所在专辑的详情页
 */
export const jumpToAlbum = (musicInfo: JumpTargetMusic, closePopup?: () => void): boolean => {
  const albumId = musicInfo?.meta?.albumId
  if (!albumId) return false
  closePopup?.()
  const albumName = musicInfo.meta?.albumName
  navigations.pushAlbumDetailScreen(commonState.componentIds.playDetail!, {
    id: String(albumId),
    name: albumName ?? musicInfo.name,
    singer: musicInfo.singer,
    img: musicInfo.meta?.picUrl != null ? musicInfo.meta.picUrl : undefined,
    source: musicInfo.source as LX.OnlineSource,
  })
  return true
}
