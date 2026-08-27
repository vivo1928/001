import musicSdk from '@/utils/musicSdk'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'

interface SingerModule {
  searchSingerId?: (name: string) => Promise<string | number | null>
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
  let singerId = singerIdCache.get(cacheKey)
  if (!singerId) {
    try {
      const sdk = musicSdk[source] as { singer?: SingerModule } | undefined
      const id = await sdk?.singer?.searchSingerId?.(singerName)
      if (!id) throw new Error('singer not found')
      singerId = String(id)
      singerIdCache.set(cacheKey, singerId)
    } catch {
      return false
    }
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
    img: musicInfo.meta?.picUrl ?? undefined,
    source: musicInfo.source as LX.OnlineSource,
  })
  return true
}
