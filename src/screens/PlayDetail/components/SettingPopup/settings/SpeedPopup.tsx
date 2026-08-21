import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { View, TouchableOpacity, ScrollView } from 'react-native'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import Slider from '@/components/common/Slider'
import { createStyle } from '@/utils/tools'
import { setPlaybackRate, updateMetaData } from '@/plugins/player'
import { setPlaybackRate as setLyricPlaybackRate } from '@/core/lyric'
import { updateSetting } from '@/core/common'
import playerState from '@/store/player/state'

export interface SpeedPopupType {
  show: () => void
}

// 预设倍速值
const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]

const MIN_SPEED = 50 // 0.50x
const MAX_SPEED = 300 // 3.00x


const SpeedPresetButton = ({ speed, active, onPress }: {
  speed: number
  active: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const label = speed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'x'
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        speedStyles.presetBtn,
        {
          backgroundColor: active ? theme['c-primary'] : 'transparent',
          borderColor: active ? theme['c-primary'] : theme['c-font-label'],
        },
      ]}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      accessibilityRole="button"
    >
      <Text
        size={15}
        color={active ? theme['c-primary-font'] : theme['c-font-label']}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export default forwardRef<SpeedPopupType, { currentRate: number, onRateChange: (rate: number) => void }>(
  ({ currentRate, onRateChange }, ref) => {
    const popupRef = useRef<PopupType>(null)
    const [visible, setVisible] = useState(false)
    const [sliderValue, setSliderValue] = useState(Math.round(currentRate * 100))
    const theme = useTheme()
    const t = useI18n()

    useImperativeHandle(ref, () => ({
      show() {
        setSliderValue(Math.round(currentRate * 100))
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

    const applySpeed = useCallback((rate: number) => {
      const clampedRate = Math.max(0.5, Math.min(3.0, rate))
      void setPlaybackRate(clampedRate).then(() => {
        void setLyricPlaybackRate(clampedRate)
        void updateMetaData(playerState.musicInfo, playerState.isPlay, true)
        void updateSetting({ 'player.playbackRate': clampedRate })
        onRateChange(clampedRate)
      })
    }, [onRateChange])

    const handlePresetPress = useCallback((speed: number) => {
      const value = Math.round(speed * 100)
      setSliderValue(value)
      applySpeed(speed)
    }, [applySpeed])

    const handleSliderValueChange = useCallback((value: number) => {
      setSliderValue(value)
    }, [])

    const handleSliderComplete = useCallback((value: number) => {
      const rate = Math.round(value) / 100
      applySpeed(rate)
    }, [applySpeed])

    const handleReset = useCallback(() => {
      setSliderValue(100)
      applySpeed(1.0)
    }, [applySpeed])

    const isActivePreset = (speed: number) => {
      return Math.abs(currentRate - speed) < 0.005
    }

    return (
      visible
        ? (
          <Popup ref={popupRef} title={t('play_detail_setting_playback_rate')} onHide={() => { setVisible(false) }}>
            <ScrollView>
              <View style={speedStyles.container} onStartShouldSetResponder={() => true}>
                {/* 当前速率显示 */}
                <View style={speedStyles.currentRateRow}>
                  <Text size={13} color={theme['c-font-label']}>
                    {t('play_detail_setting_playback_rate')}
                  </Text>
                  <Text size={28} color={theme['c-primary']} style={speedStyles.currentRateText}>
                    {currentRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x
                  </Text>
                </View>

                {/* 预设按钮网格 */}
                <View style={speedStyles.presetSection}>
                  <Text size={13} color={theme['c-font-label']} style={speedStyles.sectionLabel}>
                    {t('play_detail_setting_playback_rate')}
                  </Text>
                  <View style={speedStyles.presetGrid}>
                    {SPEED_PRESETS.map(speed => (
                      <SpeedPresetButton
                        key={speed}
                        speed={speed}
                        active={isActivePreset(speed)}
                        onPress={() => { handlePresetPress(speed) }}
                      />
                    ))}
                  </View>
                </View>

                {/* 滑动条 */}
                <View style={speedStyles.sliderSection}>
                  <View style={speedStyles.sliderRow}>
                    <Text size={12} color={theme['c-font-label']} style={speedStyles.speedMark}>0.50x</Text>
                    <View style={speedStyles.sliderWrapper}>
                      <Slider
                        minimumValue={MIN_SPEED}
                        maximumValue={MAX_SPEED}
                        value={sliderValue}
                        step={1}
                        onValueChange={handleSliderValueChange}
                        onSlidingComplete={handleSliderComplete}
                        accessibilityLabel={`${t('play_detail_setting_playback_rate')} ${(sliderValue / 100).toFixed(2)}x`}
                      />
                    </View>
                    <Text size={12} color={theme['c-font-label']} style={speedStyles.speedMark}>3.00x</Text>
                  </View>
                </View>

                {/* 重置按钮 */}
                <TouchableOpacity
                  onPress={handleReset}
                  style={[speedStyles.resetBtn, { borderColor: theme['c-font-label'] }]}
                  accessibilityLabel={t('play_detail_setting_playback_rate_reset')}
                  accessibilityRole="button"
                >
                  <Text size={14} color={theme['c-font-label']}>{t('play_detail_setting_playback_rate_reset')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Popup>
          )
        : null
    )
  },
)

const speedStyles = createStyle({
  container: {
    paddingTop: 5,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 20,
  },
  currentRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
  },
  currentRateText: {
    fontWeight: 'bold',
  },
  presetSection: {
    paddingBottom: 10,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetBtn: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderSection: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 5,
  },
  sliderWrapper: {
    flex: 1,
  },
  speedMark: {
    width: 42,
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
