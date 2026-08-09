import { memo, useCallback, useState, useEffect } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { setDesktopLyricTextSize } from '@/core/desktopLyric'
import { updateSetting } from '@/core/common'


export default memo(() => {
  const t = useI18n()
  const fontSize = useSettingValue('desktopLyric.style.fontSize')
  const theme = useTheme()
  const [sliderSize, setSliderSize] = useState(fontSize)

  useEffect(() => {
    setSliderSize(fontSize)
  }, [fontSize])

  const handleSlidingStart = useCallback<NonNullable<SliderProps['onSlidingStart']>>(value => {
    setSliderSize(value)
  }, [])
  const handleValueChange = useCallback<NonNullable<SliderProps['onValueChange']>>(value => {
    setSliderSize(value)
  }, [])
  const handleSlidingComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    setSliderSize(value)
    if (fontSize == value) return
    void setDesktopLyricTextSize(value).then(() => {
      updateSetting({ 'desktopLyric.style.fontSize': value })
    })
  }, [fontSize])

  return (
    <SubTitle title={t('setting_lyric_desktop_text_size')}>
      <View style={styles.content}>
        <Text style={{ color: theme['c-primary-font'] }}>{sliderSize}</Text>
        <Slider
          minimumValue={100}
          maximumValue={500}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={2}
          value={sliderSize}
        />
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
})