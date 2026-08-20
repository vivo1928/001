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
  const progressStr: `${number}%` = `${progress * 100}%`

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const onSetProgress = useCallback((progress: number) => {
    global.app_event.setProgress(progress * durationRef.current)
  }, [])

  const handleSlidingStart = useCallback((val: number) => {
    setDraging(true)
    setDragProgress(val)
  }, [])

  const handleValueChange = useCallback((val: number) => {
    setDragProgress(val)
  }, [])

  const handleSlidingComplete = useCallback((val: number) => {
    setDraging(false)
    setDragProgress(val)
    onSetProgress(val)
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
        value={progress}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="transparent"
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
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
