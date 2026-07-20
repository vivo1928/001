import { memo, useCallback, useState, useEffect } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { setDesktopLyricMaxLineNum } from '@/core/desktopLyric'
import { updateSetting } from '@/core/common'


export default memo(() => {
  const t = useI18n()
  const maxLineNum = useSettingValue('desktopLyric.maxLineNum')
  const theme = useTheme()
  const [sliderSize, setSliderSize] = useState(maxLineNum)

  useEffect(() => {
    setSliderSize(maxLineNum)
  }, [maxLineNum])

  const handleSlidingStart = useCallback<NonNullable<SliderProps['onSlidingStart']>>(value => {
    setSliderSize(value)
  }, [])
  const handleValueChange = useCallback<NonNullable<SliderProps['onValueChange']>>(value => {
    setSliderSize(value)
  }, [])
  const handleSlidingComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    setSliderSize(value)
    if (maxLineNum == value) return
    void setDesktopLyricMaxLineNum(value).then(() => {
      updateSetting({ 'desktopLyric.maxLineNum': value })
    })
  }, [maxLineNum])

  return (
    <SubTitle title={t('setting_lyric_desktop_maxlineNum')}>
      <View style={styles.content}>
        <Text style={{ color: theme['c-primary-font'] }}>{sliderSize}</Text>
        <Slider
          minimumValue={1}
          maximumValue={8}
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