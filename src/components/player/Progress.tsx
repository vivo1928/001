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

  // 防回弹：pending 期间外部 progress 不同步覆盖 sliderValue
  const pendingRef = useRef(false)
  useEffect(() => {
    if (pendingRef.current) return
    setSliderValue(progress)
  }, [progress])

  // 拖拽中标记
  const isTouchingRef = useRef(false)

  const handleSlidingStart = useCallback((val: number) => {
    isTouchingRef.current = true
    pendingRef.current = true
    setDraging(true)
    setDragProgress(val)
    setSliderValue(val)
  }, [])

  const handleValueChange = useCallback((val: number) => {
    setDragProgress(val)
    setSliderValue(val)
    // 无障碍手势（非拖拽状态）→ 立即 seek
    if (!isTouchingRef.current) {
      onSetProgress(val)
    }
  }, [onSetProgress])

  const handleSlidingComplete = useCallback((val: number) => {
    isTouchingRef.current = false
    setDraging(false)
    setDragProgress(val)
    setSliderValue(val)
    onSetProgress(val)
    // 300ms 后若 progress 未同步则释放 pending
    setTimeout(() => {
      pendingRef.current = false
    }, 300)
  }, [onSetProgress])

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
        importantForAccessibility="yes"
        accessibilityLabel="播放进度"
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
