import { memo, useCallback, useRef, useState } from 'react'
import { View, PanResponder, AccessibilityInfo, type LayoutChangeEvent } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'

export type SliderProps = {
  value: number
  minimumValue: number
  maximumValue: number
  onSlidingStart?: (value: number) => void
  onSlidingComplete?: (value: number) => void
  onValueChange?: (value: number) => void
  step?: number
  accessibilityLabel?: string
  /** 用来自定义无障碍播报数值的格式化函数，如 (v) => (v / 100).toFixed(2) + 'x' */
  accessibilityValueFormatter?: (value: number) => string
}

export default memo(({ value, minimumValue, maximumValue, onSlidingStart, onSlidingComplete, onValueChange, step = 1, accessibilityLabel, accessibilityValueFormatter }: SliderProps) => {
  const theme = useTheme()
  const infoRef = useRef({
    progressWidth: 0,
    isDragging: false,
  })
  const [dragValue, setDragValue] = useState(value)

  const valueToRatio = useCallback((val: number) => {
    return (val - minimumValue) / (maximumValue - minimumValue)
  }, [minimumValue, maximumValue])

  const clampValue = useCallback((val: number) => {
    let v = Math.max(minimumValue, Math.min(maximumValue, val))
    if (step) v = Math.round(v / step) * step
    return Math.max(minimumValue, Math.min(maximumValue, v))
  }, [minimumValue, maximumValue, step])

  const getValueFromPosition = useCallback((locationX: number) => {
    const ratio = Math.max(0, Math.min(1, locationX / infoRef.current.progressWidth))
    return clampValue(minimumValue + ratio * (maximumValue - minimumValue))
  }, [minimumValue, maximumValue, clampValue])

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: (evt) => {
      infoRef.current.isDragging = true
      const val = getValueFromPosition(evt.nativeEvent.locationX)
      setDragValue(val)
      onSlidingStart?.(val)
    },
    onPanResponderMove: (evt) => {
      if (!infoRef.current.isDragging) return
      const val = getValueFromPosition(evt.nativeEvent.locationX)
      setDragValue(val)
      onValueChange?.(val)
    },
    onPanResponderRelease: () => {
      infoRef.current.isDragging = false
      onSlidingComplete?.(dragValue)
    },
  })).current

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    infoRef.current.progressWidth = e.nativeEvent.layout.width
  }, [])

  // 使用 value 作为显示值（外部更新时同步），拖拽时使用 dragValue
  const displayValue = infoRef.current.isDragging ? dragValue : value
  const ratio = valueToRatio(displayValue)
  const progressPercent = `${Math.max(0, Math.min(1, ratio)) * 100}%`

  const handleAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    const stepSize = Math.max(step, (maximumValue - minimumValue) / 20)
    let newValue = displayValue
    switch (event.nativeEvent.actionName) {
      case 'increment':
        newValue = clampValue(displayValue + stepSize)
        break
      case 'decrement':
        newValue = clampValue(displayValue - stepSize)
        break
      default:
        return
    }
    setDragValue(newValue)
    onValueChange?.(newValue)
    onSlidingComplete?.(newValue)
    if (accessibilityValueFormatter) {
      AccessibilityInfo.announceForAccessibility(accessibilityValueFormatter(newValue))
    } else {
      AccessibilityInfo.announceForAccessibility(String(Math.round(newValue)))
    }
  }, [displayValue, minimumValue, maximumValue, step, clampValue, onValueChange, onSlidingComplete, accessibilityValueFormatter])

  return (
    <View style={styles.container} onLayout={onLayout} {...panResponder.panHandlers}
      accessible={true}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValueFormatter
        ? { now: accessibilityValueFormatter(displayValue), min: accessibilityValueFormatter(minimumValue), max: accessibilityValueFormatter(maximumValue) }
        : { now: Math.round(displayValue), min: minimumValue, max: maximumValue }}
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <View style={{ ...styles.track, backgroundColor: theme['c-primary-alpha-500'] }} />
      <View style={{ ...styles.trackFill, backgroundColor: theme['c-primary'], width: progressPercent }} />
      <View style={{ ...styles.thumb, backgroundColor: theme['c-primary'], left: progressPercent }} />
    </View>
  )
})

const THUMB_SIZE = 20
const TRACK_HEIGHT = 4

const styles = createStyle({
  container: {
    flexShrink: 0,
    flexGrow: 1,
    height: 40,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    top: (40 - THUMB_SIZE) / 2,
  },
})