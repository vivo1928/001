import {
  saveLyric,
  saveMusicUrl,
  getMusicUrl as getStoreMusicUrl,
} from '@/utils/data'
import { updateListMusics } from '@/core/list'
import settingState from '@/store/setting/state'

import {
  getPlaybackCachePath,
} from '@/core/playbackCache'
import {
  buildLyricInfo,
  getPlayQuality,
  handleGetOnlineLyricInfo,
  handleGetOnlineMusicUrl,
  handleGetOnlinePicUrl,
  getCachedLyricInfo,
} from './utils'

/* export const setMusicUrl = ({ musicInfo, type, url }: {
  musicInfo: LX.Music.MusicInfo
  type: LX.Quality
  url: string
}) => {
  saveMusicUrl(musicInfo, type, url)
}

export const setPic = (datas: {
  listId: string
  musicInfo: LX.Music.MusicInfo
  url: string
}) => {
  datas.musicInfo.img = datas.url
  updateMusicInfo({
    listId: datas.listId,
    id: datas.musicInfo.songmid,
    data: { img: datas.url },
    musicInfo: datas.musicInfo,
  })
}
 */

/**
 * 音质降级顺序：从首选音质开始，按 qualityList 顺序向更低音质递减
 */
const buildQualityFallbackOrder = (targetQuality: LX.Quality, musicInfo: LX.Music.MusicInfoOnline): string[] => {
  const list: string[] = (global.lx.qualityList as Partial<Record<string, string[]>> | undefined)?.[musicInfo.source] ?? []
  const order: string[] = [targetQuality]
  if (!list.length) return order
  const idx = list.indexOf(targetQuality)
  if (idx >= 0) {
    for (let i = idx - 1; i >= 0; i--) order.push(list[i])
  } else {
    for (let i = list.length - 1; i >= 0; i--) order.push(list[i])
  }
  return order
}


export const getMusicUrl = async({ musicInfo, quality, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  const targetQuality = quality ?? getPlayQuality(settingState.setting['player.playQuality'], musicInfo)

  // 播放缓存命中：直接返回本地文件路径，避免流式缓冲（本地文件不受 isRefresh 影响）
  let cachedPath = ''
  if (!(musicInfo.meta as any)?.toggleMusicInfo) {
    cachedPath = await getPlaybackCachePath(musicInfo) ?? ''
  }
  if (cachedPath) return cachedPath

  // 首选音质无缓存 URL 时，直接尝试全解析（刷新），不依赖过期 URL 缓存
  const cachedUrl = await getStoreMusicUrl(musicInfo, targetQuality)
  if (cachedUrl && !isRefresh) return cachedUrl

  // 音质逐级降级获取：首选拿不到链接时降到更低音质重试，
  // 确保总能拿到可播 URL，避免一直卡在"获取链接"导致自动下载不触发
  const qualityOrder = buildQualityFallbackOrder(targetQuality, musicInfo)
  let lastErr: unknown
  for (const q of qualityOrder) {
    try {
      return await handleGetOnlineMusicUrl({ musicInfo, quality: q as any, onToggleSource, isRefresh, allowToggleSource }).then(({ url, quality: tq, musicInfo: targetMusicInfo, isFromCache }) => {
        if (targetMusicInfo.id != musicInfo.id && !isFromCache) void saveMusicUrl(targetMusicInfo, tq, url)
        void saveMusicUrl(musicInfo, tq, url)
        return url
      })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('获取播放链接失败')
}

export const getPicUrl = async({ musicInfo, listId, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (musicInfo.meta?.picUrl && !isRefresh) return musicInfo.meta.picUrl
  return handleGetOnlinePicUrl({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(({ url, musicInfo: targetMusicInfo, isFromCache }) => {
    // picRequest = null
    if (listId && musicInfo.meta) {
      musicInfo.meta.picUrl = url
      void updateListMusics([{ id: listId, musicInfo }])
    }
    // savePic({ musicInfo, url, listId })
    return url
  })
}
export const getLyricInfo = async({ musicInfo, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  // lrcRequest = music[musicInfo.source].getLyric(musicInfo)
  return handleGetOnlineLyricInfo({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(async({ lyricInfo, musicInfo: targetMusicInfo, isFromCache }) => {
    // lrcRequest = null
    if (isFromCache) return buildLyricInfo(lyricInfo)
    if (targetMusicInfo.id == musicInfo.id) void saveLyric(musicInfo, lyricInfo)
    else void saveLyric(targetMusicInfo, lyricInfo)

    return buildLyricInfo(lyricInfo)
  })
}
