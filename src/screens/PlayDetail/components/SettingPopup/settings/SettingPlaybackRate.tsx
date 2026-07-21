import { useState, useEffect, useCallback } from 'react'

import { View } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import Slider, { type SliderProps } from '@/components/common/Slider'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import styles from './style'
import { setPlaybackRate, updateMetaData } from '@/plugins/player'
import { setPlaybackRate as setLyricPlaybackRate } from '@/core/lyric'
import ButtonPrimary from '@/components/common/ButtonPrimary'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'

const MIN_VALUE = 60
const MAX_VALUE = 200

const formatRate = (value: number) => (value / 100).toFixed(2) + 'x'

export default () => {
  const theme = useTheme()
  const playbackRate = Math.trunc(useSettingValue('player.playbackRate') * 100)
  const [sliderSize, setSliderSize] = useState(playbackRate)
  const t = useI18n()

  // 同步外部 playbackRate 变化到 sliderSize
  useEffect(() => {
    setSliderSize(playbackRate)
  }, [playbackRate])

  const handleSlidingStart: SliderProps['onSlidingStart'] = useCallback(value => {
    value = Math.trunc(value)
    setSliderSize(value)
    void setPlaybackRate(parseFloat((value / 100).toFixed(2)))
  }, [])

  const handleValueChange: SliderProps['onValueChange'] = useCallback(value => {
    value = Math.trunc(value)
    setSliderSize(value)
    void setPlaybackRate(parseFloat((value / 100).toFixed(2)))
  }, [])

  const handleSlidingComplete: SliderProps['onSlidingComplete'] = useCallback(value => {
    value = Math.trunc(value)
    setSliderSize(value)
    const rate = value / 100
    void setLyricPlaybackRate(rate)
    void updateMetaData(playerState.musicInfo, playerState.isPlay, true) // 更新通知栏的播放速率
    if (playbackRate == value) return
    updateSetting({ 'player.playbackRate': rate })
  }, [playbackRate])

  const handleReset = () => {
    if (settingState.setting['player.playbackRate'] == 1) return
    setSliderSize(100)
    void setPlaybackRate(1).then(() => {
      void updateMetaData(playerState.musicInfo, playerState.isPlay, true) // 更新通知栏的播放速率
      void setLyricPlaybackRate(1)
    })
    updateSetting({ 'player.playbackRate': 1 })
  }

  return (
    <View style={styles.container}>
      <Text>{t('play_detail_setting_playback_rate')}</Text>
      <View style={styles.content}>
        <Text style={styles.label} color={theme['c-font-label']}>{`${(sliderSize / 100).toFixed(2)}x`}</Text>
        <Slider
          minimumValue={MIN_VALUE}
          maximumValue={MAX_VALUE}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={1}
          value={sliderSize}
          accessibilityLabel={t('play_detail_setting_playback_rate')}
          accessibilityValueFormatter={formatRate}
        />
      </View>
      <ButtonPrimary onPress={handleReset}>{t('play_detail_setting_playback_rate_reset')}</ButtonPrimary>
    </View>
  )
}