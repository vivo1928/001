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
    // 缓冲区调优（单位：秒，Android 原生确实读取这四项，见 fork 的 MusicManager.createLocalPlayback）：
    // - playBuffer：攒够多少秒才开始出声。默认 2.5 秒，这是"URL 已就绪却仍要等很久才播放"的直接闸门，调到 1 秒可显著缩短起播等待。
    // - minBuffer：播放过程中持续保持的最小缓冲量。默认 50 秒，音乐文件小，15 秒足够，能少占带宽、加快首段缓冲。
    // - maxBuffer：最大缓冲量。原值 1000（秒）明显异常，收敛到 60 秒。
    // - backBuffer：播放头后方保留的缓冲，便于回退重听，10 秒。
    minBuffer: 15,
    maxBuffer: 60,
    playBuffer: 1,
    backBuffer: 10,
    // waitForBuffer 仅 iOS 生效，Android 会忽略，保留以兼容 iOS。
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
