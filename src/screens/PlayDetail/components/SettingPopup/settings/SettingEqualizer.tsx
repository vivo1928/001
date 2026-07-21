import { useState, useEffect, useCallback, useRef } from 'react'
import { View, TouchableOpacity, AccessibilityInfo } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { getBandInfo, setBandLevel, setAllBandLevels, setEnabled, isEnabled as isEqEnabled, type BandInfo } from '@/utils/nativeModules/equalizer'

const EQ_MIN_DB = -12
const EQ_MAX_DB = 12
const EQ_STEP = 1

const eqStyles = createStyle({
  container: {
    paddingTop: 15,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 13,
  },
  bandsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    width: '100%',
    height: 200,
    marginTop: 15,
    paddingHorizontal: 5,
  },
  bandColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    marginHorizontal: 2,
  },
  bandSliderTrack: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 2,
  },
  bandSliderFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 4,
  },
  bandLabel: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  bandValue: {
    fontSize: 9,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: 15,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    alignSelf: 'center',
    borderWidth: 1,
  },
  resetText: {
    fontSize: 13,
  },
})

const BAND_HEIGHT = 160

const freqToLabel = (freq: number): string => {
  if (freq >= 1000) return (freq / 1000).toFixed(1) + 'k'
  return String(freq)
}

interface BandSliderProps {
  freq: number
  level: number
  enabled: boolean
  onAdjust: (newLevel: number) => void
  onAdjustComplete: (newLevel: number) => void
}

const BandSlider = ({ freq, level, enabled, onAdjust, onAdjustComplete }: BandSliderProps) => {
  const theme = useTheme()
  const levelRef = useRef(level)
  levelRef.current = level
  const onAdjustRef = useRef(onAdjust)
  onAdjustRef.current = onAdjust
  const onAdjustCompleteRef = useRef(onAdjustComplete)
  onAdjustCompleteRef.current = onAdjustComplete

  const fillPercent = enabled ? ((level - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100 : 0
  const fillColor = enabled ? theme['c-primary'] : theme['c-font-label']
  const dBLabel = level > 0 ? `+${level}` : `${level}`

  const handleAccessibilityAction = useCallback((event: any) => {
    const action = event.nativeEvent?.actionName
    let newLevel = levelRef.current
    if (action === 'increment') {
      newLevel = Math.min(EQ_MAX_DB, levelRef.current + EQ_STEP)
    } else if (action === 'decrement') {
      newLevel = Math.max(EQ_MIN_DB, levelRef.current - EQ_STEP)
    }
    if (newLevel !== levelRef.current) {
      onAdjustRef.current(newLevel)
      onAdjustCompleteRef.current(newLevel)
      AccessibilityInfo.announceForAccessibility(`${freqToLabel(freq)} ${newLevel > 0 ? '+' : ''}${newLevel}dB`)
    }
  }, [freq])

  return (
    <View style={eqStyles.bandColumn}>
      <View
        style={[eqStyles.bandSliderTrack, { height: BAND_HEIGHT }]}
        accessibilityRole="adjustable"
        accessibilityLabel={`${freqToLabel(freq)}: ${dBLabel}dB`}
        accessibilityValue={{ now: level, min: EQ_MIN_DB, max: EQ_MAX_DB }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
        importantForAccessibility={enabled ? 'yes' : 'no'}
      >
        <View style={[eqStyles.bandSliderFill, {
          height: `${fillPercent}%`,
          backgroundColor: fillColor,
          opacity: enabled ? 0.8 : 0.3,
        }]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <TouchableOpacity
          onPress={() => {
            const newLevel = Math.max(EQ_MIN_DB, level - EQ_STEP)
            onAdjust(newLevel)
            onAdjustComplete(newLevel)
          }}
          accessibilityLabel={''}
          importantForAccessibility="no"
          style={{ padding: 4 }}
        >
          <Text size={10} color={enabled ? theme['c-font'] : theme['c-font-label']}>−</Text>
        </TouchableOpacity>
        <Text style={eqStyles.bandValue} size={10} color={enabled ? theme['c-font'] : theme['c-font-label']}>{dBLabel}</Text>
        <TouchableOpacity
          onPress={() => {
            const newLevel = Math.min(EQ_MAX_DB, level + EQ_STEP)
            onAdjust(newLevel)
            onAdjustComplete(newLevel)
          }}
          accessibilityLabel={''}
          importantForAccessibility="no"
          style={{ padding: 4 }}
        >
          <Text size={10} color={enabled ? theme['c-font'] : theme['c-font-label']}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={eqStyles.bandLabel} size={10} color={enabled ? theme['c-font'] : theme['c-font-label']}>{freqToLabel(freq)}</Text>
    </View>
  )
}

export default () => {
  const theme = useTheme()
  const t = useI18n()
  const [bands, setBands] = useState<BandInfo[]>([])
  const [levels, setLevels] = useState<number[]>([])
  const [enabled, setEqEnabled] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // 软件均衡器永远可用，直接初始化
  useEffect(() => {
    void (async () => {
      try {
        const bandInfo = await getBandInfo()
        if (bandInfo && bandInfo.length > 0) {
          setBands(bandInfo)
          setLevels(new Array(bandInfo.length).fill(0))
          const eqEnabled = await isEqEnabled()
          setEqEnabled(eqEnabled)
          setInitialized(true)
        }
      } catch (e) {
        console.log('Equalizer init error:', e)
      }
    })()
  }, [])

  const handleToggle = useCallback(() => {
    const newEnabled = !enabled
    setEqEnabled(newEnabled)
    void setEnabled(newEnabled)
  }, [enabled])

  const handleAdjust = useCallback((index: number, newLevel: number) => {
    const newLevels = [...levels]
    newLevels[index] = newLevel
    setLevels(newLevels)
  }, [levels])

  const handleAdjustComplete = useCallback((index: number, newLevel: number) => {
    void setBandLevel(index, newLevel * 100) // Convert dB to millibels
  }, [])

  const handleReset = useCallback(() => {
    const newLevels = new Array(bands.length).fill(0)
    setLevels(newLevels)
    void setAllBandLevels(newLevels.map(l => l * 100))
  }, [bands.length])

  if (!initialized) {
    return (
      <View style={eqStyles.container}>
        <Text size={14} color={theme['c-font-label']}>{t('eq_title')}</Text>
      </View>
    )
  }

  return (
    <View style={eqStyles.container}>
      <View style={eqStyles.titleRow}>
        <Text size={15}>{t('eq_title')}</Text>
        <TouchableOpacity
          onPress={handleToggle}
          style={[eqStyles.toggleBtn, {
            backgroundColor: enabled ? theme['c-primary'] : 'transparent',
            borderColor: enabled ? theme['c-primary'] : theme['c-font-label'],
          }]}
          accessibilityLabel={enabled ? t('eq_disable') : t('eq_enable')}
          accessibilityState={{ checked: enabled }}
        >
          <Text style={eqStyles.toggleText} color={enabled ? theme['c-primary-font'] : theme['c-font-label']}>
            {enabled ? t('eq_on') : t('eq_off')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={eqStyles.bandsContainer}>
        {bands.map((band, index) => (
          <BandSlider
            key={band.index}
            freq={band.centerFreq}
            level={levels[index] ?? 0}
            enabled={enabled}
            onAdjust={(newLevel) => handleAdjust(index, newLevel)}
            onAdjustComplete={(newLevel) => handleAdjustComplete(index, newLevel)}
          />
        ))}
      </View>

      <TouchableOpacity
        onPress={handleReset}
        style={[eqStyles.resetBtn, { borderColor: theme['c-font-label'] }]}
        accessibilityLabel={t('eq_reset')}
      >
        <Text style={eqStyles.resetText} color={theme['c-font-label']}>{t('eq_reset')}</Text>
      </TouchableOpacity>
    </View>
  )
}