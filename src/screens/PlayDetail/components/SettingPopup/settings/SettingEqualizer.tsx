import { useRef, useState, useEffect, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import EqualizerPopup, { type EqualizerPopupType } from './EqualizerPopup'
import { getEnabled, getBandLevels, EQ_PRESETS } from '@/utils/nativeModules/equalizer'

/**
 * 判断当前levels与哪个预设匹配
 */
const findMatchingPreset = (levels: number[]): string => {
  for (const preset of EQ_PRESETS) {
    if (preset.id === 'custom') continue
    let match = true
    for (let i = 0; i < levels.length; i++) {
      if (levels[i] !== preset.levels[i]) {
        match = false
        break
      }
    }
    if (match) return preset.id
  }
  return 'custom'
}

export default () => {
  const theme = useTheme()
  const t = useI18n()
  const popupRef = useRef<EqualizerPopupType>(null)
  const [eqEnabled, setEqEnabled] = useState(false)
  const [currentPreset, setCurrentPreset] = useState('flat')

  // 每次组件渲染时刷新状态
  useEffect(() => {
    void (async () => {
      try {
        const enabled = await getEnabled()
        setEqEnabled(enabled)
        if (enabled) {
          const levels = await getBandLevels()
          if (levels && levels.length > 0) {
            setCurrentPreset(findMatchingPreset(levels))
          }
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const enabled = await getEnabled()
      setEqEnabled(enabled)
      if (enabled) {
        const levels = await getBandLevels()
        if (levels && levels.length > 0) {
          setCurrentPreset(findMatchingPreset(levels))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const handlePress = useCallback(() => {
    popupRef.current?.show()
    void refreshStatus()
  }, [refreshStatus])

  // 当前状态描述
  const statusText = eqEnabled
    ? t((EQ_PRESETS.find(p => p.id === currentPreset)?.name ?? 'eq_preset_custom') as Parameters<typeof t>[0])
    : t('eq_off')

  return (
    <View>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={handlePress}
        accessibilityLabel={`${t('play_detail_setting_equalizer')}，${statusText}`}
        accessibilityRole="button"
        accessibilityHint={t('eq_select_preset')}
      >
        <Text>{t('play_detail_setting_equalizer')}</Text>
        <Text size={13} color={theme['c-font-label']}>{statusText}</Text>
      </TouchableOpacity>
      <EqualizerPopup ref={popupRef} />
    </View>
  )
}

const styles = createStyle({
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
