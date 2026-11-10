import { NativeModules } from 'react-native'
import BackgroundTimer from 'react-native-background-timer'
import { getMusicUrl } from '@/core/music'
import { getPlayCacheKey } from '@/utils/data'
import { getPlayQuality } from '@/core/music/utils'
import { isCached } from '@/plugins/player/utils'
import { getNextPlayMusicInfo } from '@/core/player/player'
import { getList } from '@/core/list'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'

interface PrefetchNativeModule {
  prefetchToCache: (url: string, cacheKey: string) => Promise<boolean>
  cancelPrefetch: () => Promise<void>
}
const prefetchModule: PrefetchNativeModule | undefined = NativeModules.TrackPlayerModule

// 滑动窗口维护（切歌后补新进窗口的尾部歌）：短防抖合并快速切歌，
// 实现"切一首、立刻往后再缓存一首"，缓存水位始终保持 N 首。
const WINDOW_DEBOUNCE = 3 * 1000
// 当前曲整首补全：播放稳定一段时间后再补，避免用户马上跳走时白下后半首。
const STABLE_MILLIS = 15 * 1000

let windowTimer: number | null = null
let stableTimer: number | null = null
// 每次作废/重建任务都递增；进行中的流水线发现 token 变化即停止
let runToken = 0

const clearWindowTimer = () => {
  if (windowTimer == null) return
  BackgroundTimer.clearTimeout(windowTimer)
  windowTimer = null
}
const clearStableTimer = () => {
  if (stableTimer == null) return
  BackgroundTimer.clearTimeout(stableTimer)
  stableTimer = null
}

/**
 * 预测接下来会播放的歌曲（最多 count 首），维持滑动窗口：
 * - 稍后播放队列优先；
 * - 随机模式先取确定性的下一首预测（getNextPlayMusicInfo 会缓存该预测，
 *   与实播切歌一致），不足的名额按列表顺序补足以维持缓存水位；
 * - 列表模式按播放顺序向后走，listLoop 循环回绕。
 */
export const getUpcomingPlayMusicInfos = async(count: number): Promise<LX.Player.PlayMusicInfo[]> => {
  const result: LX.Player.PlayMusicInfo[] = []
  if (count <= 0) return result
  const seen = new Set<string>()
  const currentId = playerState.playMusicInfo.musicInfo?.id
  if (currentId) seen.add(currentId)

  for (const item of playerState.tempPlayList) {
    if (result.length >= count) break
    if (!item?.musicInfo || seen.has(item.musicInfo.id)) continue
    seen.add(item.musicInfo.id)
    result.push(item)
  }
  if (result.length >= count) return result

  const method = settingState.setting['player.togglePlayMethod']
  if (method == 'singleLoop') return result

  if (method == 'random') {
    const next = await getNextPlayMusicInfo().catch(() => null)
    if (next?.musicInfo && !seen.has(next.musicInfo.id)) {
      seen.add(next.musicInfo.id)
      result.push(next)
    }
  }

  if (result.length >= count) return result
  const listId = playerState.playInfo.playerListId
  const list = listId ? getList(listId) : []
  if (!list.length) return result
  const startIndex = playerState.playInfo.playerPlayIndex
  for (let i = 1; result.length < count && i <= list.length; i++) {
    const idx = method == 'listLoop'
      ? (startIndex + i + list.length) % list.length
      : startIndex + i
    if (idx < 0 || idx >= list.length) break
    const musicInfo = list[idx]
    if (!musicInfo || seen.has(musicInfo.id)) continue
    seen.add(musicInfo.id)
    result.push({ musicInfo, listId, isTempPlay: false })
  }
  return result
}

const prefetchOne = async(musicInfo: LX.Player.PlayMusicInfo['musicInfo'], token: number) => {
  if (token != runToken || !musicInfo || !('source' in musicInfo)) return
  if ('progress' in musicInfo) return
  const onlineInfo = musicInfo as LX.Music.MusicInfoOnline
  if (onlineInfo.source == 'local') return

  // 已完整缓存则跳过，避免为缓存内的歌做无谓的链接解析
  const targetQuality = getPlayQuality(settingState.setting['player.playQuality'], onlineInfo)
  const cached = await isCached(getPlayCacheKey(onlineInfo, targetQuality)).catch(() => false)
  if (cached || token != runToken) return

  const result = await getMusicUrl({ musicInfo: onlineInfo, forPlayback: false }).catch(() => null)
  if (!result?.url || token != runToken) return
  // 离线兜底产生的占位链接无实际内容，无需预缓存
  if (result.url.includes('lx-cache-hit.invalid')) return
  const alreadyCached = await isCached(result.cacheKey).catch(() => false)
  if (alreadyCached || token != runToken) return

  await prefetchModule?.prefetchToCache(result.url, result.cacheKey).catch(() => {})
}

/**
 * 窗口维护：把"接下来 N 首"补齐到缓存/预取队列。
 * 已缓存的歌只做本地判定直接跳过，因此重复执行代价极低；
 * 切一首后通常只有一首新歌进入窗口，其余都在缓存里。
 */
export const runWindow = async() => {
  const token = runToken
  const count = Number(settingState.setting['player.cacheAheadCount'] ?? 10)
  const upcoming = await getUpcomingPlayMusicInfos(count)
  for (const item of upcoming) {
    if (token != runToken) return
    await prefetchOne(item.musicInfo, token)
  }
}

/** 当前曲整首补全（播放稳定后调用） */
export const runCurrentFill = async() => {
  const token = runToken
  const current = playerState.playMusicInfo.musicInfo
  if (current) await prefetchOne(current, token)
}

export const scheduleWindow = () => {
  if (!settingState.setting['player.isSmartCache']) return
  clearWindowTimer()
  windowTimer = BackgroundTimer.setTimeout(() => {
    windowTimer = null
    void runWindow()
  }, WINDOW_DEBOUNCE)
}

export const scheduleCurrentFill = () => {
  if (!settingState.setting['player.isSmartCache']) return
  clearStableTimer()
  stableTimer = BackgroundTimer.setTimeout(() => {
    stableTimer = null
    void runCurrentFill()
  }, STABLE_MILLIS)
}

/** 作废进行中的流水线并取消原生在途预取（被取消的任务重启后从已缓存处续传，不重复下载） */
export const invalidatePrefetch = () => {
  runToken++
  clearWindowTimer()
  clearStableTimer()
  void prefetchModule?.cancelPrefetch().catch(() => {})
}

export default () => {
  const handlePlay = () => {
    // 起播/恢复播放：重建窗口与当前曲补全任务
    scheduleWindow()
    scheduleCurrentFill()
  }
  const handleMusicToggled = () => {
    // 切歌：作废在途任务（旧歌剩余部分不再下载），立刻按新播放位置维护窗口
    invalidatePrefetch()
    scheduleWindow()
    scheduleCurrentFill()
  }
  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys) => {
    if (!keys.includes('player.isSmartCache') && !keys.includes('player.cacheAheadCount') && !keys.includes('player.togglePlayMethod')) return
    invalidatePrefetch()
    scheduleWindow()
    scheduleCurrentFill()
  }

  global.app_event.on('play', handlePlay)
  global.app_event.on('musicToggled', handleMusicToggled)
  global.state_event.on('configUpdated', handleConfigUpdated)
}
