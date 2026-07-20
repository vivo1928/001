import { useState, useEffect, useCallback } from 'react'

import { View, AccessibilityInfo } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import Slider, { type SliderProps } from '@/components/common/Slider'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import styles from './style'
import { setVolume } from '@/plugins/player'


const Volume = () => {
  const theme = useTheme()
  const volume = Math.trunc(useSettingValue('player.volume') * 100)
  const [sliderSize, setSliderSize] = useState(volume)
  const t = useI18n()

  // 同步外部 volume 变化到 sliderSize
  useEffect(() => {
    setSliderSize(volume)
  }, [volume])

  const handleSlidingStart: SliderProps['onSlidingStart'] = useCallback(value => {
    value = Math.trunc(value)
    setSliderSize(value)
    void setVolume(value / 100)
  }, [])

  const handleValueChange: SliderProps['onValueChange'] = useCallback(value => {
    value = Math.trunc(value)
    setSliderSize(value)
    void setVolume(value / 100)
    AccessibilityInfo.announceForAccessibility(t('play_detail_setting_volume') + ' ' + value)
  }, [t])

  const handleSlidingComplete: SliderProps['onSlidingComplete'] = useCallback(value => {
    value = Math.trunc(value)
    setSliderSize(value)
    if (volume == value) return
    updateSetting({ 'player.volume': value / 100 })
  }, [volume])

  return (
    <View style={styles.container}>
      <Text>{t('play_detail_setting_volume')}</Text>
      <View style={styles.content}>
        <Text style={styles.label} color={theme['c-font-label']}>{sliderSize}</Text>
        <Slider
          minimumValue={0}
          maximumValue={100}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={1}
          value={sliderSize}
          accessibilityLabel={t('play_detail_setting_volume')}
        />
      </View>
    </View>
  )
}

export default Volume