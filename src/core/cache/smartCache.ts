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

// 播放稳定多久后启动预缓存：过早启动会在用户马上跳走时浪费流量，
// 过晚则"听半首补全整首"的窗口变短，取折中值。
const STABLE_MILLIS = 15 * 1000

let scheduleTimer: number | null = null
let running = false
let cancelled = false

const clearSchedule = () => {
  if (scheduleTimer == null) return
  BackgroundTimer.clearTimeout(scheduleTimer)
  scheduleTimer = null
}

/**
 * 预测接下来会播放的歌曲（最多 count 首）。
 * - 稍后播放队列优先；
 * - 随机模式只预测确定性的下一首（getNextPlayMusicInfo 会缓存该预测，
 *   与实播切歌保持一致，不会因预取而错位）；
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
    if (next?.musicInfo && !seen.has(next.musicInfo.id)) result.push(next)
    return result
  }

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

const prefetchOne = async(musicInfo: LX.Player.PlayMusicInfo['musicInfo']) => {
  if (cancelled || !musicInfo || !('source' in musicInfo)) return
  const onlineInfo = musicInfo as LX.Music.MusicInfoOnline
  if (onlineInfo.source == 'local') return

  // 已完整缓存则跳过，避免为缓存内的歌做无谓的链接解析
  const targetQuality = getPlayQuality(settingState.setting['player.playQuality'], onlineInfo)
  const cached = await isCached(getPlayCacheKey(onlineInfo, targetQuality)).catch(() => false)
  if (cached || cancelled) return

  const result = await getMusicUrl({ musicInfo: onlineInfo, forPlayback: false }).catch(() => null)
  if (!result?.url || cancelled) return
  // 离线兜底产生的占位链接无实际内容，无需预缓存
  if (result.url.includes('lx-cache-hit.invalid')) return
  const alreadyCached = await isCached(result.cacheKey).catch(() => false)
  if (alreadyCached || cancelled) return

  await prefetchModule?.prefetchToCache(result.url, result.cacheKey).catch(() => {})
}

const runSmartCache = async() => {
  if (running || cancelled) return
  running = true
  try {
    const count = Number(settingState.setting['player.cacheAheadCount'] ?? 10)
    const current = playerState.playMusicInfo.musicInfo
    if (current) await prefetchOne(current)
    if (cancelled) return
    const upcoming = await getUpcomingPlayMusicInfos(count)
    for (const item of upcoming) {
      if (cancelled) break
      await prefetchOne(item.musicInfo)
    }
  } finally {
    running = false
  }
}
export { runSmartCache }

export const scheduleSmartCache = () => {
  if (!settingState.setting['player.isSmartCache']) return
  clearSchedule()
  scheduleTimer = BackgroundTimer.setTimeout(() => {
    scheduleTimer = null
    void runSmartCache()
  }, STABLE_MILLIS)
}

export const cancelSmartCache = () => {
  cancelled = true
  clearSchedule()
  void prefetchModule?.cancelPrefetch().catch(() => {})
}

export default () => {
  const handlePlay = () => {
    cancelled = false
    scheduleSmartCache()
  }
  const handleMusicToggled = () => {
    // 切歌：取消进行中的预缓存（含队列中未开始的），等新的稳定计时
    cancelSmartCache()
  }
  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys) => {
    if (!keys.includes('player.isSmartCache') && !keys.includes('player.cacheAheadCount') && !keys.includes('player.togglePlayMethod')) return
    cancelled = false
    scheduleSmartCache()
  }

  global.app_event.on('play', handlePlay)
  global.app_event.on('musicToggled', handleMusicToggled)
  global.state_event.on('configUpdated', handleConfigUpdated)
}
