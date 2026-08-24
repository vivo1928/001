import { playNext, setMusicUrl } from '@/core/player/player'
import { setStatusText } from '@/core/player/playStatus'
import { getPosition, isEmpty, setStop } from '@/plugins/player'
import { isActive } from '@/utils/tools'
import BackgroundTimer from 'react-native-background-timer'
import playerState from '@/store/player/state'
import { setNowPlayTime } from '@/core/player/progress'
import { clearTempPlayQuality } from '@/core/music/utils'
import { collectDebugLog } from '@/utils/debugLogCollector'


export default () => {
  let retryNum = 0
  let prevTimeoutId: string | null = null

  let loadingTimeout: number | null = null
  let delayNextTimeout: number | null = null

  // 将格式化时长（03:55 / 01:02:03）解析为秒，解析失败返回 0
  const parseIntervalToSec = (interval?: string | null): number => {
    if (!interval) return 0
    const parts = interval.split(':').map(p => parseInt(p, 10))
    if (parts.some(p => isNaN(p))) return 0
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] || 0
  }
  const getMusicInfoInterval = (musicInfo: LX.Player.PlayMusic): string | null => {
    return 'progress' in musicInfo ? musicInfo.metadata.musicInfo.interval : musicInfo.interval
  }
  // 长音频（10 分钟以上）播放过程中临时 URL 更容易过期，
  // 允许更多次自动刷新 URL 从当前位置续播；普通音频最多 2 次
  const getMaxRetryNum = (): number => {
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo) return 2
    return parseIntervalToSec(getMusicInfoInterval(musicInfo)) >= 600 ? 5 : 2
  }
  const refreshUrl = (musicInfo: LX.Player.PlayMusic) => {
    collectDebugLog('playerEvent', 'refreshUrl retryNum=', retryNum)
    retryNum++
    setMusicUrl(musicInfo, true)
    setStatusText(global.i18n.t('player__refresh_url'))
  }

  const startLoadingTimeout = () => {
    // console.log('start load timeout')
    clearLoadingTimeout()
    loadingTimeout = BackgroundTimer.setTimeout(() => {
      // if (global.lx.isPlayedStop) {
      //   prevTimeoutId = null
      //   setStatusText('')
      //   return
      // }

      const musicInfo = playerState.playMusicInfo.musicInfo
      // 如果加载超时，则尝试刷新URL
      if (prevTimeoutId == playerState.musicInfo.id) {
        // 再次加载超时：若还有重试机会（长音频），继续刷新URL续播，否则切歌
        if (musicInfo && retryNum < getMaxRetryNum()) {
          refreshUrl(musicInfo)
        } else {
          prevTimeoutId = null
          void playNext(true)
        }
      } else {
        prevTimeoutId = playerState.musicInfo.id
        if (musicInfo && retryNum < getMaxRetryNum()) refreshUrl(musicInfo)
      }
    }, 15000)
  }
  const clearLoadingTimeout = () => {
    if (!loadingTimeout) return
    // console.log('clear load timeout')
    BackgroundTimer.clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  const clearDelayNextTimeout = () => {
    // console.log(this.delayNextTimeout)
    if (!delayNextTimeout) return
    BackgroundTimer.clearTimeout(delayNextTimeout)
    delayNextTimeout = null
  }
  const addDelayNextTimeout = () => {
    clearDelayNextTimeout()
    delayNextTimeout = BackgroundTimer.setTimeout(() => {
      if (global.lx.isPlayedStop) {
        setStatusText('')
        return
      }
      void playNext(true)
    }, 5000)
  }

  const handleLoadstart = () => {
    collectDebugLog('playerEvent', 'handleLoadstart isPlay=', playerState.isPlay)
    console.log('handleLoadstart', playerState.isPlay)
    if (global.lx.isPlayedStop || !playerState.isPlay) return
    startLoadingTimeout()
    setStatusText(global.i18n.t('player__loading'))
  }

  // const handleLoadeddata = () => {
  //   setStatusText(global.i18n.t('player__loading'))
  // }

  // const handleCanplay = () => {
  //   setStatusText('')
  // }

  const handlePlaying = () => {
    collectDebugLog('playerEvent', 'handlePlaying')
    setStatusText('')
    clearLoadingTimeout()
  }

  const handleEmpied = () => {
    collectDebugLog('playerEvent', 'handleEmpied')
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  const handleWating = () => {
    collectDebugLog('playerEvent', 'handleWating')
    setStatusText(global.i18n.t('player__buffering'))
  }

  const handleError = () => {
    collectDebugLog('playerEvent', 'handleError retryNum=', retryNum)
    if (!playerState.musicInfo.id) return
    clearLoadingTimeout()
    if (global.lx.isPlayedStop) return
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (musicInfo && retryNum < getMaxRetryNum()) { // 若音频URL无效则尝试刷新URL续播
      void getPosition().then((position) => {
        if (position) setNowPlayTime(position)
      }).finally(() => {
        // console.log(this.retryNum)
        if (playerState.playMusicInfo.musicInfo !== musicInfo) return
        refreshUrl(musicInfo)
      })
      return
    }
    if (!isEmpty()) void setStop()

    if (isActive()) {
      setStatusText(global.i18n.t('player__error'))
      setTimeout(addDelayNextTimeout)
    } else {
      console.warn('error skip to next')
      void playNext(true)
    }
  }

  const handleSetPlayInfo = () => {
    collectDebugLog('playerEvent', 'handleSetPlayInfo clearTempPlayQuality')
    retryNum = 0
    prevTimeoutId = null
    clearDelayNextTimeout()
    clearLoadingTimeout()
    clearTempPlayQuality()
  }

  // const handlePlayedStop = () => {
  //   clearDelayNextTimeout()
  //   clearLoadingTimeout()
  // }


  global.app_event.on('playerLoadstart', handleLoadstart)
  // global.app_event.on('playerLoadeddata', handleLoadeddata)
  // global.app_event.on('playerCanplay', handleCanplay)
  global.app_event.on('playerPlaying', handlePlaying)
  global.app_event.on('playerWaiting', handleWating)
  global.app_event.on('playerEmptied', handleEmpied)
  global.app_event.on('playerError', handleError)
  global.app_event.on('musicToggled', handleSetPlayInfo)
}
