import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import Slider from '@react-native-community/slider'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { scaleSizeW, scaleSizeH } from '@/utils/pixelRatio'
import { Icon } from '@/components/common/Icon'


const DefaultBar = memo(() => {
  const theme = useTheme()

  return <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-300-alpha-800'], position: 'absolute', width: '100%', left: 0, top: 0 }}></View>
})

const BufferedBar = memo(({ progress }: { progress: number }) => {
  const theme = useTheme()
  return <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-400-alpha-700'], position: 'absolute', width: `${progress * 100}%`, left: 0, top: 0 }}></View>
})


const Progress = ({ progress, duration, buffered }: {
  progress: number
  duration: number
  buffered: number
}) => {
  const theme = useTheme()
  const [draging, setDraging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  const [sliderValue, setSliderValue] = useState(progress)
  const progressStr: `${number}%` = `${progress * 100}%`

  const progressDotStyle = useMemo(() => {
    return {
      width: progressDotSize,
      position: 'absolute',
      right: -progressDotSize / 2,
      top: -(progressDotSize - progressHeightSize) / 2,
    } as const
  }, [])

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
    <View style={styles.progress}>
      <View pointerEvents="none">
        <DefaultBar />
        <BufferedBar progress={buffered} />
        {
          draging
            ? (
                <>
                  <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-100-alpha-700'], width: progressStr, position: 'absolute', left: 0, top: 0 }} />
                  <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-100-alpha-600'], width: `${dragProgress * 100}%`, position: 'absolute', left: 0, top: 0 }}>
                    <Icon name="full_stop" color={theme['c-primary-light-100']} rawSize={progressDotSize} style={progressDotStyle} />
                  </View>
                </>
              ) : (
                <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-100-alpha-400'], width: progressStr, position: 'absolute', left: 0, top: 0 }}>
                  <Icon name="full_stop" color={theme['c-primary-light-100']} rawSize={progressDotSize} style={progressDotStyle} />
                </View>
              )
        }
      </View>
      <Slider
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
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


const progressContentPadding = 10
const progressHeight = 3.6
const progressContentHeight = progressContentPadding * 2 + progressHeight
const progressHeightSize = scaleSizeH(progressHeight)
let progressDotSize = scaleSizeW(progressContentHeight * 0.8)
const styles = createStyle({
  progress: {
    width: '100%',
    height: progressContentHeight,
    paddingTop: progressContentPadding,
    paddingBottom: progressContentPadding,
    zIndex: 1,
  },
  progressBar: {
    height: progressHeight,
    borderRadius: 4,
  },
  pressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: progressContentHeight,
    paddingTop: progressContentPadding,
    paddingBottom: progressContentPadding,
    width: '100%',
    zIndex: 6,
  },
})

export default Progress
