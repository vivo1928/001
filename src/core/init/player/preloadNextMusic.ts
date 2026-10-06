import { getMusicUrl } from '@/core/music'
import { getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@/core/player/player'
import { checkUrl } from '@/utils/request'
import { isCached } from '@/plugins/player/utils'


// 距歌曲结束多少秒开始预加载下一首。
// 原实现只在最后 10 秒触发，遇到慢的自定义音源（解析 URL + 校验常常超过 10 秒）会来不及；
// 提前到 30 秒，给解析和探测留足时间，同时不至于过早拿到会过期的临时链接。
const PRELOAD_BEFORE_END = 30

const preloadMusicInfo = {
  isLoading: false,
  done: false,
  info: null as LX.Player.PlayMusicInfo | null,
}
const resetPreloadInfo = () => {
  preloadMusicInfo.info = null
  preloadMusicInfo.done = false
  preloadMusicInfo.isLoading = false
}

const preloadNextMusicUrl = async() => {
  if (preloadMusicInfo.isLoading || preloadMusicInfo.done) return
  preloadMusicInfo.isLoading = true
  try {
    // getNextPlayMusicInfo 内部会把随机模式选中的歌曲缓存到 randomNextMusicInfo，
    // 因此随后真正切歌时 playNext 会选到同一首，预加载与实播结果一致，随机循环也不会错位。
    const info = await getNextPlayMusicInfo()
    // 无论是否预测到下一首都标记完成，避免在歌曲最后阶段每秒重复探测
    preloadMusicInfo.done = true
    if (!info) return
    preloadMusicInfo.info = info

    const url = await getMusicUrl({ musicInfo: info.musicInfo }).catch(() => '')
    if (!url) return
    // 已进入播放器缓存则无需再校验；否则发一个轻量 HEAD 预热 CDN 连接并确认链接可用。
    const [cached, available] = await Promise.all([
      isCached(url),
      checkUrl(url).then(() => true).catch(() => false),
    ])
    // 链接既不在缓存又不可用，说明临时链接已失效，刷新一次拿到新链接
    if (!cached && !available) {
      await getMusicUrl({ musicInfo: info.musicInfo, isRefresh: true }).catch(() => '')
    }
  } finally {
    preloadMusicInfo.isLoading = false
  }
}

export default () => {
  const handleSetPlayInfo = () => {
    resetPreloadInfo()
  }

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys) => {
    if (!keys.includes('player.togglePlayMethod')) return
    if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
    // 切换播放模式后，之前预测的下一首（尤其是随机选中的那首）已失效，需要重新预测
    resetRandomNextMusicInfo()
    resetPreloadInfo()
  }

  const handlePlayProgressChanged: typeof global.state_event.playProgressChanged = (progress) => {
    const duration = progress.maxPlayTime
    if (duration > 10 && duration - progress.nowPlayTime < PRELOAD_BEFORE_END) {
      void preloadNextMusicUrl()
    }
  }

  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.state_event.on('playProgressChanged', handlePlayProgressChanged)
}
