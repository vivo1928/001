import { memo, useCallback, useState, useEffect } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { setDesktopLyricWidth } from '@/core/desktopLyric'
import { updateSetting } from '@/core/common'


export default memo(() => {
  const t = useI18n()
  const width = useSettingValue('desktopLyric.width')
  const theme = useTheme()
  const [sliderSize, setSliderSize] = useState(width)

  useEffect(() => {
    setSliderSize(width)
  }, [width])

  const handleSlidingStart = useCallback<NonNullable<SliderProps['onSlidingStart']>>(value => {
    setSliderSize(value)
  }, [])
  const handleValueChange = useCallback<NonNullable<SliderProps['onValueChange']>>(value => {
    setSliderSize(value)
  }, [])
  const handleSlidingComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    setSliderSize(value)
    if (width == value) return
    void setDesktopLyricWidth(value).then(() => {
      updateSetting({ 'desktopLyric.width': value })
    })
  }, [width])

  return (
    <SubTitle title={t('setting_lyric_desktop_view_width')}>
      <View style={styles.content}>
        <Text style={{ color: theme['c-primary-font'] }}>{sliderSize}</Text>
        <Slider
          minimumValue={10}
          maximumValue={100}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={1}
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