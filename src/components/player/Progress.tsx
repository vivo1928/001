import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Slider from '@react-native-community/slider'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'


const DefaultBar = memo(() => {
  return <View style={{
    ...styles.progressBar,
    position: 'absolute',
    width: '100%',
    left: 0,
    top: 0,
  }}></View>
})

const BufferedBar = memo(({ progress }: { progress: number }) => {
  const theme = useTheme()
  return <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-600-alpha-900'], position: 'absolute', width: `${progress * 100}%`, left: 0, top: 0 }}></View>
})


export const ProgressPlain = ({ progress, duration, buffered, paddingTop }: {
  progress: number
  duration: number
  buffered: number
  paddingTop?: number
}) => {
  const theme = useTheme()
  const progressStr: `${number}%` = `${progress * 100}%`

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  return (
    <View style={{ ...styles.progress, paddingTop }}>
      <View style={{ flex: 1 }}>
        <DefaultBar />
        <BufferedBar progress={buffered} />
        <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-alpha-900'], width: progressStr, position: 'absolute', left: 0, top: 0 }} />
      </View>
      <View style={styles.pressBar} />
    </View>
  )
}

const Progress = ({ progress, duration, buffered, paddingTop }: {
  progress: number
  duration: number
  buffered: number
  paddingTop?: number
}) => {
  const theme = useTheme()
  const [draging, setDraging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  const [sliderValue, setSliderValue] = useState(progress)
  const progressStr: `${number}%` = `${progress * 100}%`

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const onSetProgress = useCallback((progress: number) => {
    global.app_event.setProgress(progress * durationRef.current)
  }, [])

  // 外部 progress 同步到 slider（非拖拽/无障碍调节期间）
  const draggingRef = useRef(false)
  useEffect(() => {
    if (draggingRef.current) return
    setSliderValue(progress)
  }, [progress])

  const handleSlidingStart = useCallback((val: number) => {
    draggingRef.current = true
    setDraging(true)
    setDragProgress(val)
    setSliderValue(val)
  }, [])

  const handleValueChange = useCallback((val: number) => {
    setDragProgress(val)
    setSliderValue(val)
  }, [])

  const handleSlidingComplete = useCallback((val: number) => {
    draggingRef.current = false
    setDraging(false)
    setDragProgress(val)
    setSliderValue(val)
    onSetProgress(val)
  }, [onSetProgress])

  // 无障碍调节防抖：300ms 后恢复外部 progress 同步
  const a11yDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    const A11Y_STEP = 0.05
    const current = sliderValue
    let newValue = current
    switch (event.nativeEvent.actionName) {
      case 'increment':
        newValue = Math.min(1, current + A11Y_STEP)
        break
      case 'decrement':
        newValue = Math.max(0, current - A11Y_STEP)
        break
      default:
        return
    }
    if (newValue === current) return
    draggingRef.current = true
    setSliderValue(newValue)
    setDragProgress(newValue)
    onSetProgress(newValue)
    if (a11yDebounceRef.current) {
      clearTimeout(a11yDebounceRef.current)
    }
    a11yDebounceRef.current = setTimeout(() => {
      a11yDebounceRef.current = null
      draggingRef.current = false
    }, 300)
  }, [sliderValue, onSetProgress])

  return (
    <View style={{ ...styles.progress, paddingTop }}>
      <View style={{ flex: 1 }} pointerEvents="none">
        <DefaultBar />
        <BufferedBar progress={buffered} />
        {
          draging
            ? (
                <>
                  <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-200-alpha-900'], width: progressStr, position: 'absolute', left: 0, top: 0 }} />
                  <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-100-alpha-800'], width: `${dragProgress * 100}%`, position: 'absolute', left: 0, top: 0 }} />
                </>
              ) : (
                <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-alpha-900'], width: progressStr, position: 'absolute', left: 0, top: 0 }} />
              )
        }
      </View>
      <Slider
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, height: '100%' }}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={sliderValue}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="transparent"
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="播放进度"
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
        ]}
        onAccessibilityAction={handleAccessibilityAction}
      />
    </View>
  )
}


const styles = createStyle({
  progress: {
    flex: 1,
    zIndex: 1,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  pressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    width: '100%',
  },
})

export default Progress
