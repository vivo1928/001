import { useState, useEffect } from 'react'

import { View } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import Slider, { type SliderProps } from '@/components/common/Slider'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import styles from './style'


const LrcFontSize = ({ direction }: {
  direction: 'horizontal' | 'vertical'
}) => {
  const theme = useTheme()
  const settingKey = direction == 'horizontal' ? 'playDetail.horizontal.style.lrcFontSize' : 'playDetail.vertical.style.lrcFontSize'
  const lrcFontSize = useSettingValue(settingKey)
  const [sliderSize, setSliderSize] = useState(lrcFontSize)
  const t = useI18n()

  // 同步外部 lrcFontSize 变化到 sliderSize
  useEffect(() => {
    setSliderSize(lrcFontSize)
  }, [lrcFontSize])

  const handleSlidingStart: SliderProps['onSlidingStart'] = value => {
    setSliderSize(value)
  }
  const handleValueChange: SliderProps['onValueChange'] = value => {
    setSliderSize(value)
  }
  const handleSlidingComplete: SliderProps['onSlidingComplete'] = value => {
    setSliderSize(value)
    if (lrcFontSize == value) return
    updateSetting({ [settingKey]: value })
  }

  return (
    <View style={styles.container}>
      <Text>{t('play_detail_setting_lrc_font_size')}</Text>
      <View style={styles.content}>
        <Text style={styles.label} color={theme['c-font-label']}>{sliderSize}</Text>
        <Slider
          minimumValue={100}
          maximumValue={300}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={2}
          value={sliderSize}
        />
      </View>
    </View>
  )
}

export default LrcFontSize