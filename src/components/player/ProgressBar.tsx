import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, PanResponder } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { scaleSizeW, scaleSizeH } from '@/utils/pixelRatio'
import { useDrag } from '@/utils/hooks'
import { Icon } from '@/components/common/Icon'


const DefaultBar = memo(() => {
  const theme = useTheme()

  return <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-300-alpha-800'], position: 'absolute', width: '100%', left: 0, top: 0 }}></View>
})

const BufferedBar = memo(({ progress }: { progress: number }) => {
  const theme = useTheme()
  return <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-400-alpha-700'], position: 'absolute', width: `${progress * 100}%`, left: 0, top: 0 }}></View>
})


const PreassBar = memo(({ onDragState, setDragProgress, onSetProgress, progress, duration }: {
  onDragState: (drag: boolean) => void
  setDragProgress: (progress: number) => void
  onSetProgress: (progress: number) => void
  progress: number
  duration: number
}) => {
  const {
    onLayout,
    onDragStart,
    onDragEnd,
    onDrag,
  } = useDrag(onSetProgress, onDragState, setDragProgress)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,
      onPanResponderMove: (evt, gestureState) => {
        onDrag(gestureState.dx)
      },
      onPanResponderGrant: (evt, gestureState) => {
        onDragStart(gestureState.dx, evt.nativeEvent.locationX)
      },
      onPanResponderRelease: () => {
        onDragEnd()
      },
    }),
  ).current

  // 防抖：防止快速连续 seek 导致静音
  const a11yDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 无障碍调整期间禁止被外部 progress 同步回跳
  const a11yPendingRef = useRef(false)
  const [a11yProgress, setA11yProgress] = useState(progress)

  useEffect(() => {
    if (a11yPendingRef.current) return
    setA11yProgress(progress)
  }, [progress])

  const a11yPercent = Math.round(a11yProgress * 100)

  const handleAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    const step = 0.05
    let newProgress = a11yProgress
    switch (event.nativeEvent.actionName) {
      case 'increment':
        newProgress = Math.min(1, a11yProgress + step)
        break
      case 'decrement':
        newProgress = Math.max(0, a11yProgress - step)
        break
      default:
        return
    }
    // 本地值立即更新，accessibilityValue 随之变化，TalkBack 原生播报新值
    a11yPendingRef.current = true
    setA11yProgress(newProgress)
    // 防抖：300ms 内连续操作只执行最后一次 seek
    if (a11yDebounceRef.current) {
      clearTimeout(a11yDebounceRef.current)
    }
    a11yDebounceRef.current = setTimeout(() => {
      a11yDebounceRef.current = null
      a11yPendingRef.current = false
      onSetProgress(newProgress)
    }, 300)
  }, [a11yProgress, onSetProgress])

  return <View
    onLayout={onLayout}
    style={styles.pressBar}
    {...panResponder.panHandlers}
    accessible={true}
    accessibilityRole="adjustable"
    accessibilityLabel={'播放进度'}
    accessibilityValue={{
      now: a11yPercent,
      min: 0,
      max: 100,
    }}
    accessibilityActions={[
      { name: 'increment' },
      { name: 'decrement' },
    ]}
    onAccessibilityAction={handleAccessibilityAction}
  />
})


const Progress = ({ progress, duration, buffered }: {
  progress: number
  duration: number
  buffered: number
}) => {
  const theme = useTheme()
  const [draging, setDraging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
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

  return (
    <View style={styles.progress}>
      <View>
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
      <PreassBar onDragState={setDraging} setDragProgress={setDragProgress} onSetProgress={onSetProgress} progress={progress} duration={duration} />
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
