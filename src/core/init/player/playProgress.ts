import { updateListMusics } from '@/core/list'
import { setMaxplayTime, setNowPlayTime } from '@/core/player/progress'
import { setCurrentTime, getDuration, getPosition, setPlaybackRate } from '@/plugins/player'
import { formatPlayTime2 } from '@/utils/common'
import { savePlayInfo } from '@/utils/data'
import { throttleBackgroundTimer } from '@/utils/tools'
import BackgroundTimer from 'react-native-background-timer'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { updateSetting } from '@/core/common'
import { onScreenStateChange } from '@/utils/nativeModules/utils'
import { AppState } from 'react-native'
import TrackPlayer, { State as TPState } from 'react-native-track-player'

const delaySavePlayInfo = throttleBackgroundTimer(() => {
  void savePlayInfo({
    time: playerState.progress.nowPlayTime,
    maxTime: playerState.progress.maxPlayTime,
    listId: playerState.playMusicInfo.listId!,
    index: playerState.playInfo.playIndex,
  })
}, 2000)

export default () => {
  // const updateMusicInfo = useCommit('list', 'updateMusicInfo')

  let updateTimeout: number | null = null
  let seekPlayTimer: number | null = null

  let isScreenOn = true

  const getCurrentTime = () => {
    let id = playerState.musicInfo.id
    void getPosition().then(position => {
      if (!position || id != playerState.musicInfo.id) return
      setNowPlayTime(position)
      if (!playerState.isPlay) return

      if (settingState.setting['player.isSavePlayTime'] && !playerState.playMusicInfo.isTempPlay && isScreenOn) {
        delaySavePlayInfo()
      }
    })
  }
  const getMaxTime = async() => {
    setMaxplayTime(await getDuration())

    if (playerState.playMusicInfo.musicInfo && 'source' in playerState.playMusicInfo.musicInfo && !playerState.playMusicInfo.musicInfo.interval) {
      // console.log(formatPlayTime2(playProgress.maxPlayTime))

      if (playerState.playMusicInfo.listId) {
        void updateListMusics([{
          id: playerState.playMusicInfo.listId,
          musicInfo: {
            ...playerState.playMusicInfo.musicInfo,
            interval: formatPlayTime2(playerState.progress.maxPlayTime),
          },
        }])
      }
    }
  }

  const clearUpdateTimeout = () => {
    if (!updateTimeout) return
    BackgroundTimer.clearInterval(updateTimeout)
    updateTimeout = null
  }
  const startUpdateTimeout = () => {
    if (!isScreenOn) return
    clearUpdateTimeout()
    updateTimeout = BackgroundTimer.setInterval(() => {
      getCurrentTime()
    }, 1000 / settingState.setting['player.playbackRate'])
    getCurrentTime()
  }

  const setProgress = (time: number, maxTime?: number) => {
    if (!playerState.musicInfo.id) return
    setNowPlayTime(time)

    const wasPlaying = playerState.isPlay

    // 执行 seek
    void setCurrentTime(time)

    // ExoPlayer seek bug: seek 后可能静音但时间进度继续走
    // 状态检查不可靠（ExoPlayer 可能报告 Playing 但无音频输出）
    // 策略：延迟后检查实际 TrackPlayer 状态，仅在需要时恢复播放
    if (wasPlaying) {
      if (seekPlayTimer) {
        BackgroundTimer.clearTimeout(seekPlayTimer)
      }
      seekPlayTimer = BackgroundTimer.setTimeout(async () => {
        seekPlayTimer = null
        try {
          const state = await TrackPlayer.getState()
          // 检查实际播放器状态，如果 seek 导致播放停止则恢复
          if (state !== TPState.Playing && state !== TPState.Buffering) {
            await TrackPlayer.play()
          }
        } catch (e) {
          // 如果状态检查失败，尝试恢复播放
          try { await TrackPlayer.play() } catch (_) {}
        }
      }, 100)
    }

    if (maxTime != null) setMaxplayTime(maxTime)

    // if (!isPlay) audio.play()
  }


  const handlePlay = () => {
    void getMaxTime()
    // prevProgressStatus = 'normal'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    startUpdateTimeout()
  }
  const handlePause = () => {
    // prevProgressStatus = 'paused'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    // clearBufferTimeout()
    clearUpdateTimeout()
  }

  const handleStop = () => {
    clearUpdateTimeout()
    setNowPlayTime(0)
    setMaxplayTime(0)
    // prevProgressStatus = 'none'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
  }

  const handleError = () => {
    // if (!restorePlayTime) restorePlayTime = getCurrentTime() // 记录出错的播放时间
    // console.log('handleError')
    // prevProgressStatus = 'error'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    clearUpdateTimeout()
  }


  const handleSetPlayInfo = () => {
    // restorePlayTime = playProgress.nowPlayTime
    // void setCurrentTime(playerState.progress.nowPlayTime)
    // setMaxplayTime(playProgress.maxPlayTime)
    handlePause()
    if (!playerState.playMusicInfo.isTempPlay) {
      void savePlayInfo({
        time: playerState.progress.nowPlayTime,
        maxTime: playerState.progress.maxPlayTime,
        listId: playerState.playMusicInfo.listId!,
        index: playerState.playInfo.playIndex,
      })
    }
  }

  // watch(() => playerState.progress.nowPlayTime, (newValue, oldValue) => {
  //   if (settingState.setting['player.isSavePlayTime'] && !playMusicInfo.isTempPlay) {
  //     delaySavePlayInfo({
  //       time: newValue,
  //       maxTime: playerState.progress.maxPlayTime,
  //       listId: playMusicInfo.listId as string,
  //       index: playInfo.playIndex,
  //     })
  //   }
  // })
  // watch(() => playerState.progress.maxPlayTime, maxPlayTime => {
  //   if (!playMusicInfo.isTempPlay) {
  //     delaySavePlayInfo({
  //       time: playerState.progress.nowPlayTime,
  //       maxTime: maxPlayTime,
  //       listId: playMusicInfo.listId as string,
  //       index: playInfo.playIndex,
  //     })
  //   }
  // })

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (keys.includes('player.playbackRate')) {
      const rate = settings['player.playbackRate'] as number
      if (rate > 0) void setPlaybackRate(rate)
      startUpdateTimeout()
    }
  }

  const handleSetPlaybackRate = (rate: number) => {
    if (rate > 0) {
      void setPlaybackRate(rate)
      updateSetting({ 'player.playbackRate': rate })
      startUpdateTimeout()
    }
  }

  const handleScreenStateChanged: Parameters<typeof onScreenStateChange>[0] = (state) => {
    isScreenOn = state == 'ON'
    if (isScreenOn) {
      if (playerState.isPlay) startUpdateTimeout()
    } else clearUpdateTimeout()
  }

  // 修复在某些设备上屏幕状态改变事件未触发导致的进度条未更新的问题
  AppState.addEventListener('change', (state) => {
    if (state == 'active' && !isScreenOn) handleScreenStateChanged('ON')
  })

  global.app_event.on('play', handlePlay)
  global.app_event.on('pause', handlePause)
  global.app_event.on('stop', handleStop)
  global.app_event.on('error', handleError)
  global.app_event.on('setProgress', setProgress)
  // global.app_event.on(eventPlayerNames.restorePlay, handleRestorePlay)
  // global.app_event.on('playerLoadeddata', handleLoadeddata)
  // global.app_event.on('playerCanplay', handleCanplay)
  // global.app_event.on('playerWaiting', handleWating)
  // global.app_event.on('playerEmptied', handleEmpied)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.app_event.on('setPlaybackRate', handleSetPlaybackRate)

  onScreenStateChange(handleScreenStateChanged)
}
