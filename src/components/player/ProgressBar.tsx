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
    setTimeout(() => {
      pendingRef.current = false
    }, 300)
  }, [onSetProgress])

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
        importantForAccessibility="yes"
        accessibilityLabel="播放进度"
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
