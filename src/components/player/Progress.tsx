import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View, PanResponder } from 'react-native'
import { useDrag } from '@/utils/hooks'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
// import { scaleSizeW } from '@/utils/pixelRatio'
// import { AppColors } from '@/theme'


const DefaultBar = memo(() => {
  // const theme = useTheme()

  return <View style={{
    ...styles.progressBar,
    // backgroundColor: theme['c-primary-light-200-alpha-900'],
    position: 'absolute',
    width: '100%',
    left: 0,
    top: 0,
  }}></View>
})

const BufferedBar = memo(({ progress }: { progress: number }) => {
  // console.log(bufferedProgress)
  const theme = useTheme()
  return <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-600-alpha-900'], position: 'absolute', width: `${progress * 100}%`, left: 0, top: 0 }}></View>
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

      // onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        onDrag(gestureState.dx)
      },
      onPanResponderGrant: (evt, gestureState) => {
        // console.log(evt.nativeEvent.locationX, gestureState)
        onDragStart(gestureState.dx, evt.nativeEvent.locationX)
      },
      onPanResponderRelease: () => {
        onDragEnd()
      },
      // onPanResponderTerminate: (evt, gestureState) => {
      //   onDragEnd()
      // },
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

  const progressPercent = Math.round(progress * 100)
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
    accessibilityLabel={progressPercent + '%'}
    accessibilityValue={{
      now: a11yPercent,
      min: 0,
      max: 100,
      text: a11yPercent + '%',
    }}
    accessibilityActions={[
      { name: 'increment' },
      { name: 'decrement' },
    ]}
    onAccessibilityAction={handleAccessibilityAction}
  />
})


export const ProgressPlain = ({ progress, duration, buffered, paddingTop }: {
  progress: number
  duration: number
  buffered: number
  paddingTop?: number
}) => {
  // const { progress } = usePlayTimeBuffer()
  const theme = useTheme()
  // console.log(progress)
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
  // const { progress } = usePlayTimeBuffer()
  const theme = useTheme()
  const [draging, setDraging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  // console.log(progress)
  const progressStr: `${number}%` = `${progress * 100}%`

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const onSetProgress = useCallback((progress: number) => {
    global.app_event.setProgress(progress * durationRef.current)
  }, [])

  return (
    <View style={{ ...styles.progress, paddingTop }}>
      <View style={{ flex: 1 }}>
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
      <PreassBar onDragState={setDraging} setDragProgress={setDragProgress} onSetProgress={onSetProgress} progress={progress} duration={duration} />
      {/* <View style={{ ...styles.progressBar, height: '100%', width: progressStr }}><Pressable style={styles.progressDot}></Pressable></View> */}
    </View>
  )
}


// const progressContentPadding = 9
// const progressHeight = 3
const styles = createStyle({
  progress: {
    flex: 1,
    // backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 1,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  pressBar: {
    position: 'absolute',
    // backgroundColor: 'rgba(0,0,0,0.5)',
    left: 0,
    top: 0,
    // height: progressContentPadding * 2 + progressHeight,
    height: '100%',
    width: '100%',
  },
})

export default Progress
