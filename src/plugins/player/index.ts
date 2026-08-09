import TrackPlayer from 'react-native-track-player'
import { updateOptions, setVolume, setPlaybackRate, migratePlayerCache } from './utils'

// const listenEvent = () => {
//   TrackPlayer.addEventListener('playback-error', err => {
//     console.log('playback-error', err)
//   })
//   TrackPlayer.addEventListener('playback-state', info => {
//     console.log('playback-state', info)
//   })
//   TrackPlayer.addEventListener('playback-track-changed', info => {
//     console.log('playback-track-changed', info)
//   })
//   TrackPlayer.addEventListener('playback-queue-ended', info => {
//     console.log('playback-queue-ended', info)
//   })
// }

const initial = async({ volume, playRate, cacheSize, isHandleAudioFocus, isEnableAudioOffload }: {
  volume: number
  playRate: number
  cacheSize: number
  isHandleAudioFocus: boolean
  isEnableAudioOffload: boolean
}) => {
  if (global.lx.playerStatus.isIniting || global.lx.playerStatus.isInitialized) return
  global.lx.playerStatus.isIniting = true
  console.log('Cache Size', cacheSize * 1024)
  await migratePlayerCache()
  await TrackPlayer.setupPlayer({
    maxCacheSize: cacheSize * 1024,
    // maxBuffer 单位为秒。此前配置 1000（秒）会让 ExoPlayer 把最多约 16 分钟的
    // 音频数据全部缓冲进 Java 堆内存：播放长音频时内存暴涨，导致缓冲失败
    // （「音频加载出错，5 秒后切换下一首」）以及 BlobModule 大响应分配
    // byte[] 时触发 OutOfMemoryError。此处按 VLC 缓冲策略调优：
    // - playBuffer 降到 1.5s，只需很少缓冲即可出声（VLC 网络缓存默认 1~3s），
    //   显著缩短首次播放等待时间；
    // - minBuffer=20s / maxBuffer=60s 拉出预下载区间，播放中持续预载到 60s，
    //   为网络波动留足余量，减少播放中途卡顿；60s 内存占用（数十 KB~几 MB）
    //   远低于 1000s 触发 OOM 的量级，安全。
    minBuffer: 20,
    maxBuffer: 60,
    playBuffer: 1.5,
    waitForBuffer: true,
    handleAudioFocus: isHandleAudioFocus,
    audioOffload: isEnableAudioOffload,
    autoUpdateMetadata: false,
  })
  global.lx.playerStatus.isInitialized = true
  global.lx.playerStatus.isIniting = false
  await updateOptions()
  await setVolume(volume)
  await setPlaybackRate(playRate)
  // listenEvent()
}


const isInitialized = () => global.lx.playerStatus.isInitialized


export {
  initial,
  isInitialized,
  setVolume,
  setPlaybackRate,
}

export {
  setResource,
  setPause,
  setPlay,
  setCurrentTime,
  getDuration,
  setStop,
  resetPlay,
  getPosition,
  updateMetaData,
  onStateChange,
  isEmpty,
  useBufferProgress,
  initTrackInfo,
} from './utils'
