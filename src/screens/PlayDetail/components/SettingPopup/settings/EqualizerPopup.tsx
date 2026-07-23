import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { View, TouchableOpacity, ScrollView } from 'react-native'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import Slider from '@/components/common/Slider'
import { createStyle } from '@/utils/tools'
import {
  EQ_PRESETS,
  getBandInfo,
  setBandLevel,
  setBandLevels,
  setEnabled,
  getEnabled,
  getBandLevels,
  resetEq,
  formatDb,
  formatFreq,
  type BandInfo,
} from '@/utils/nativeModules/equalizer'

export interface EqualizerPopupType {
  show: () => void
}

const MIN_LEVEL = -12000 // -12 dB in millibel
const MAX_LEVEL = 12000  // +12 dB in millibel
const STEP = 100 // 0.1 dB step

const PresetButton = ({ name, active, onPress }: {
  name: string
  active: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.presetBtn,
        {
          backgroundColor: active ? theme['c-primary'] : 'transparent',
          borderColor: active ? theme['c-primary'] : theme['c-font-label'],
        },
      ]}
      accessibilityLabel={name}
      accessibilityState={{ selected: active }}
      accessibilityRole="button"
    >
      <Text
        size={13}
        color={active ? theme['c-primary-font'] : theme['c-font-label']}
      >
        {name}
      </Text>
    </TouchableOpacity>
  )
}

const BandSlider = ({ freq, level, enabled, onValueChange, onSlidingComplete }: {
  freq: number
  level: number
  enabled: boolean
  onValueChange: (value: number) => void
  onSlidingComplete: (value: number) => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const [slidingValue, setSlidingValue] = useState(level)
  const [isSliding, setIsSliding] = useState(false)

  const displayValue = isSliding ? slidingValue : level
  const freqLabel = formatFreq(freq)
  const dbLabel = formatDb(displayValue)
  const a11yLabel = t('eq_band_fmt' as Parameters<typeof t>[0], { freq: freqLabel, db: dbLabel })

  const handleValueChange = useCallback((value: number) => {
    setSlidingValue(value)
    onValueChange(value)
  }, [onValueChange])

  const handleSlidingStart = useCallback(() => {
    setIsSliding(true)
  }, [])

  const handleSlidingComplete = useCallback((value: number) => {
    setIsSliding(false)
    onSlidingComplete(value)
  }, [onSlidingComplete])

  return (
    <View style={styles.bandContainer}>
      <View style={styles.bandHeader}>
        <Text size={12} color={theme['c-font-label']}>{freqLabel}</Text>
        <Text size={12} color={enabled ? theme['c-primary'] : theme['c-font-label']}>{dbLabel}</Text>
      </View>
      <View style={styles.bandSliderRow}>
        <Text size={10} color={theme['c-font-label']} style={styles.dbMark}>-12</Text>
        <View style={styles.sliderWrapper}>
          <Slider
            minimumValue={MIN_LEVEL}
            maximumValue={MAX_LEVEL}
            value={level}
            step={STEP}
            onValueChange={handleValueChange}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
            accessibilityLabel={a11yLabel}
          />
        </View>
        <Text size={10} color={theme['c-font-label']} style={styles.dbMark}>+12</Text>
      </View>
    </View>
  )
}

export default forwardRef<EqualizerPopupType>((_, ref) => {
  const popupRef = useRef<PopupType>(null)
  const [visible, setVisible] = useState(false)
  const [bands, setBands] = useState<BandInfo[]>([])
  const [levels, setLevels] = useState<number[]>([])
  const [eqEnabled, setEqEnabled] = useState(false)
  const [activePreset, setActivePreset] = useState<string>('flat')
  const [initialized, setInitialized] = useState(false)
  const theme = useTheme()
  const t = useI18n()

  useImperativeHandle(ref, () => ({
    show() {
      if (visible) {
        popupRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          popupRef.current?.setVisible(true)
        })
      }
    },
  }))

  // 初始化
  useEffect(() => {
    if (!visible) return
    void (async () => {
      try {
        const [enabled, bandInfo] = await Promise.all([
          getEnabled(),
          getBandInfo(),
        ])
        setEqEnabled(enabled)
        setBands(bandInfo)
        const currentLevels = await getBandLevels()
        setLevels(currentLevels)
        setInitialized(true)
      } catch (e) {
        console.log('Equalizer init error:', e)
      }
    })()
  }, [visible])

  const handleToggle = useCallback(async () => {
    const newEnabled = !eqEnabled
    setEqEnabled(newEnabled)
    await setEnabled(newEnabled)
  }, [eqEnabled])

  const handleSelectPreset = useCallback(async (presetId: string) => {
    setActivePreset(presetId)
    const preset = EQ_PRESETS.find(p => p.id === presetId)
    if (!preset) return

    const newLevels = [...preset.levels]
    setLevels(newLevels)
    await setBandLevels(newLevels)
    if (!eqEnabled) {
      setEqEnabled(true)
      await setEnabled(true)
    }
  }, [eqEnabled])

  const handleBandValueChange = useCallback((index: number, value: number) => {
    setLevels(prev => {
      const newLevels = [...prev]
      newLevels[index] = value
      return newLevels
    })
    // 实时调整
    void setBandLevel(index, value)
    // 如果正在调节，切换到自定义预设
    if (activePreset !== 'custom') {
      setActivePreset('custom')
    }
  }, [activePreset])

  const handleBandSlidingComplete = useCallback((index: number, value: number) => {
    void setBandLevel(index, value)
  }, [])

  const handleReset = useCallback(async () => {
    await resetEq()
    setLevels(new Array(bands.length).fill(0))
    setActivePreset('flat')
  }, [bands.length])

  const presetButtons = useMemo(() => {
    return EQ_PRESETS.map(preset => (
      <PresetButton
        key={preset.id}
        name={t(preset.name as Parameters<typeof t>[0])}
        active={activePreset === preset.id}
        onPress={() => { void handleSelectPreset(preset.id) }}
      />
    ))
  }, [t, activePreset, handleSelectPreset])

  return (
    visible
      ? (
        <Popup ref={popupRef} title={t('eq_title')} onHide={() => setVisible(false)}>
          <ScrollView>
            <View style={styles.container} onStartShouldSetResponder={() => true}>
              {/* 开关按钮 */}
              <View style={styles.headerRow}>
                <Text size={15}>{t('eq_title')}</Text>
                <TouchableOpacity
                  onPress={handleToggle}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor: eqEnabled ? theme['c-primary'] : 'transparent',
                      borderColor: eqEnabled ? theme['c-primary'] : theme['c-font-label'],
                    },
                  ]}
                  accessibilityLabel={eqEnabled ? t('eq_disable') : t('eq_enable')}
                  accessibilityState={{ checked: eqEnabled }}
                  accessibilityRole="switch"
                >
                  <Text
                    size={13}
                    color={eqEnabled ? theme['c-primary-font'] : theme['c-font-label']}
                  >
                    {eqEnabled ? t('eq_on') : t('eq_off')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 预设选择 */}
              <View style={styles.presetSection}>
                <Text size={13} color={theme['c-font-label']} style={styles.sectionLabel}>
                  {t('eq_select_preset')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetScrollContent}
                >
                  {presetButtons}
                </ScrollView>
              </View>

              {/* 频段滑块 */}
              {initialized && eqEnabled && (
                <View style={styles.bandsSection}>
                  {bands.map((band, index) => (
                    <BandSlider
                      key={band.index}
                      freq={band.centerFreq}
                      level={levels[index] ?? 0}
                      enabled={eqEnabled}
                      onValueChange={(value) => { handleBandValueChange(index, value) }}
                      onSlidingComplete={(value) => { handleBandSlidingComplete(index, value) }}
                    />
                  ))}
                </View>
              )}

              {/* 重置按钮 */}
              <TouchableOpacity
                onPress={() => { void handleReset() }}
                style={[styles.resetBtn, { borderColor: theme['c-font-label'] }]}
                accessibilityLabel={t('eq_reset')}
                accessibilityRole="button"
              >
                <Text size={14} color={theme['c-font-label']}>{t('eq_reset')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Popup>
        )
      : null
  )
})

const styles = createStyle({
  container: {
    paddingTop: 5,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetSection: {
    paddingBottom: 10,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  presetScrollContent: {
    paddingRight: 15,
    gap: 8,
  },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  bandsSection: {
    paddingTop: 5,
    paddingBottom: 10,
  },
  bandContainer: {
    marginBottom: 5,
  },
  bandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    marginBottom: 2,
  },
  bandSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderWrapper: {
    flex: 1,
  },
  dbMark: {
    width: 28,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
})
