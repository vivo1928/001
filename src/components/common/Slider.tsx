import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import RNSlider from '@react-native-community/slider'
import { useTheme } from '@/store/theme/hook'

export interface SliderProps {
  value: number
  minimumValue: number
  maximumValue: number
  onSlidingStart?: (value: number) => void
  onSlidingComplete?: (value: number) => void
  onValueChange?: (value: number) => void
  step?: number
  accessibilityLabel?: string
}

export default memo(({ value, minimumValue, maximumValue, onSlidingStart, onSlidingComplete, onValueChange, step = 1, accessibilityLabel }: SliderProps) => {
  const theme = useTheme()

  const [sliderValue, setSliderValue] = useState(value)
  const pendingRef = useRef(false)
  const isTouchingRef = useRef(false)

  useEffect(() => {
    if (!pendingRef.current) setSliderValue(value)
  }, [value])

  const handleSlidingStart = useCallback((val: number) => {
    isTouchingRef.current = true
    pendingRef.current = true
    setSliderValue(val)
    onSlidingStart?.(val)
  }, [onSlidingStart])

  const handleValueChange = useCallback((val: number) => {
    setSliderValue(val)
    onValueChange?.(val)
    if (!isTouchingRef.current) {
      onSlidingComplete?.(val)
    }
  }, [onValueChange, onSlidingComplete])

  const handleSlidingComplete = useCallback((val: number) => {
    isTouchingRef.current = false
    setSliderValue(val)
    onSlidingComplete?.(val)
    setTimeout(() => { pendingRef.current = false }, 300)
  }, [onSlidingComplete])

  const handleAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    const stepSize = Math.max(step, (maximumValue - minimumValue) / 20)
    let newValue = sliderValue
    switch (event.nativeEvent.actionName) {
      case 'increment':
        newValue = Math.min(maximumValue, sliderValue + stepSize)
        break
      case 'decrement':
        newValue = Math.max(minimumValue, sliderValue - stepSize)
        break
      default:
        return
    }
    if (newValue === sliderValue) return
    setSliderValue(newValue)
    onValueChange?.(newValue)
    onSlidingComplete?.(newValue)
  }, [sliderValue, minimumValue, maximumValue, step, onValueChange, onSlidingComplete])

  return (
    <View style={{ flexShrink: 0, flexGrow: 1, height: 40, justifyContent: 'center' }}>
      <RNSlider
        style={{ width: '100%', height: 40 }}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={sliderValue}
        minimumTrackTintColor={theme['c-primary']}
        maximumTrackTintColor={theme['c-primary-alpha-500']}
        thumbTintColor={theme['c-primary']}
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        importantForAccessibility="yes"
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          now: Math.round(sliderValue),
          min: minimumValue,
          max: maximumValue,
        }}
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
        ]}
        onAccessibilityAction={handleAccessibilityAction}
      />
    </View>
  )
})
