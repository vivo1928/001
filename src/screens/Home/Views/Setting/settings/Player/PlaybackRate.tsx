import { useRef, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { useSettingValue } from '@/store/setting/hook'
import SpeedPopup, { type SpeedPopupType } from '@/screens/PlayDetail/components/SettingPopup/settings/SpeedPopup'

const formatRateLabel = (rate: number) => {
  return rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'x'
}

export default () => {
  const theme = useTheme()
  const t = useI18n()
  const popupRef = useRef<SpeedPopupType>(null)
  const playbackRate = useSettingValue('player.playbackRate')

  const handlePress = useCallback(() => {
    popupRef.current?.show()
  }, [])

  const handleRateChange = useCallback((rate: number) => {
    // 倍速变更由 SpeedPopup 内部通过 updateSetting 完成
    // 这里不需要额外操作
  }, [])

  const currentRateLabel = formatRateLabel(playbackRate)

  return (
    <View>
      <TouchableOpacity
        style={settingRowStyles.settingRow}
        onPress={handlePress}
        accessibilityLabel={`${t('play_detail_setting_playback_rate')}，${currentRateLabel}`}
        accessibilityRole="button"
      >
        <Text>{t('play_detail_setting_playback_rate')}</Text>
        <Text size={13} color={theme['c-font-label']}>{currentRateLabel}</Text>
      </TouchableOpacity>
      <SpeedPopup ref={popupRef} currentRate={playbackRate} onRateChange={handleRateChange} />
    </View>
  )
}

const settingRowStyles = createStyle({
  settingRow: {
    paddingTop: 5,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
})