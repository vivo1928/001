import {
  saveLyric,
  saveMusicUrl,
  getMusicUrl as getStoreMusicUrl,
} from '@/utils/data'
import { updateListMusics } from '@/core/list'
import settingState from '@/store/setting/state'

import {
  buildLyricInfo,
  getPlayQuality,
  handleGetOnlineLyricInfo,
  handleGetOnlineMusicUrl,
  handleGetOnlinePicUrl,
  getCachedLyricInfo,
} from './utils'
import { applyAudioModeForQuality } from './audioMode'

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
export const buildQualityFallbackOrder = (targetQuality: LX.Quality, musicInfo: LX.Music.MusicInfoOnline): string[] => {
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

/**
 * 计算播放时可用的候选音质顺序（目标音质 + 降级链，去重并过滤 _qualitys 中存在的）
 */
const buildCandidateQualities = (targetQuality: LX.Quality, musicInfo: LX.Music.MusicInfoOnline): LX.Quality[] => {
  const _qualitys = musicInfo.meta?._qualitys ?? {}
  const seen = new Set<LX.Quality>()
  const result: LX.Quality[] = []
  for (const q of buildQualityFallbackOrder(targetQuality, musicInfo)) {
    const quality = q as LX.Quality
    if (seen.has(quality)) continue
    seen.add(quality)
    if (_qualitys[quality] != null) result.push(quality)
  }
  return result
}

/**
 * 并发请求多个候选音质，取最先成功者（每个候选对应自己的音质，返回即用该音质）
 */
const getMusicUrlConcurrent = async({ musicInfo, candidates, isRefresh, allowToggleSource, onToggleSource }: {
  musicInfo: LX.Music.MusicInfoOnline
  candidates: LX.Quality[]
  isRefresh: boolean
  allowToggleSource: boolean
  onToggleSource: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<{ url: string, quality: LX.Quality }> => {
  // 缓存预检：有缓存直接命中（最快），无需等待网络请求
  const cacheHit = await Promise.all(candidates.map(async(q) => {
    const url = await getStoreMusicUrl(musicInfo, q)
    return { q, url }
  })).then(list => list.find(item => item.url))
  if (cacheHit?.url) return { url: cacheHit.url, quality: cacheHit.q }

  const requests = candidates.map(async(quality) => {
    const { url, quality: resultQuality, musicInfo: targetMusicInfo, isFromCache } = await handleGetOnlineMusicUrl({ musicInfo, quality, onToggleSource, isRefresh, allowToggleSource })
    return {
      url,
      quality: resultQuality,
      musicInfo: targetMusicInfo,
      isFromCache,
    }
  })

  return new Promise<{ url: string, quality: LX.Quality }>((resolve, reject) => {
    let fulfilled = false
    let remaining = requests.length
    for (const p of requests) {
      p.then((result) => {
        if (fulfilled) return
        fulfilled = true
        if (result.musicInfo.id != musicInfo.id && !result.isFromCache) void saveMusicUrl(result.musicInfo, result.quality, result.url)
        void saveMusicUrl(musicInfo, result.quality, result.url)
        resolve({ url: result.url, quality: result.quality })
      }).catch(() => {
        remaining--
        if (!fulfilled && remaining == 0) reject(new Error('all candidates failed'))
      })
    }
  })
}


export const getMusicUrl = async({ musicInfo, quality, isRefresh, allowToggleSource = true, onToggleSource = () => {}, forPlayback = false }: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  /** 是否用于真正播放（决定是否按音质切换 EQ/offload 输出模式）；预取/下载传 false */
  forPlayback?: boolean
}): Promise<string> => {
  const targetQuality = quality ?? getPlayQuality(settingState.setting['player.playQuality'], musicInfo)
  const cachedUrl = await getStoreMusicUrl(musicInfo, targetQuality)
  if (cachedUrl && !isRefresh) {
    if (forPlayback) await applyAudioModeForQuality(targetQuality)
    return cachedUrl
  }

  // 播放场景（未显式指定音质）：并发请求候选音质，谁先拿到有效链接用谁
  if (!quality) {
    const candidates = buildCandidateQualities(targetQuality, musicInfo)
    if (candidates.length > 1) {
      try {
        const result = await getMusicUrlConcurrent({ musicInfo, candidates, isRefresh, allowToggleSource, onToggleSource })
        if (result.url) {
          // 用实际解析成功的音质判定模式（并发降级时可能是 flac 而非 atmos）
          if (forPlayback) await applyAudioModeForQuality(result.quality)
          return result.url
        }
      } catch {
        // 并发全部失败，回退到单音质请求（保留切源逻辑）
      }
    }
  }

  return handleGetOnlineMusicUrl({ musicInfo, quality, onToggleSource, isRefresh, allowToggleSource }).then(async({ url, quality: resultQuality, musicInfo: targetMusicInfo, isFromCache }) => {
    if (targetMusicInfo.id != musicInfo.id && !isFromCache) void saveMusicUrl(targetMusicInfo, resultQuality, url)
    void saveMusicUrl(musicInfo, resultQuality, url)
    if (forPlayback) await applyAudioModeForQuality(resultQuality)
    return url
  })
}

export const getPicUrl = async({ musicInfo, listId, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (musicInfo.meta.picUrl && !isRefresh) return musicInfo.meta.picUrl
  return handleGetOnlinePicUrl({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(({ url, musicInfo: targetMusicInfo, isFromCache }) => {
    // picRequest = null
    if (listId) {
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
