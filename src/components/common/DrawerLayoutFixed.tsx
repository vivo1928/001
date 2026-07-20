import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View, Animated, PanResponder, TouchableWithoutFeedback, type LayoutChangeEvent } from 'react-native'
import { usePageVisible } from '@/store/common/hook'
import { type COMPONENT_IDS } from '@/config/constant'

interface Props {
  visibleNavNames: COMPONENT_IDS[]
  widthPercentage: number
  widthPercentageMax?: number
  drawerPosition?: 'left' | 'right'
  drawerBackgroundColor?: string
  style?: Record<string, unknown>
  renderNavigationView: () => React.ReactNode
  children: React.ReactNode
}

export interface DrawerLayoutFixedType {
  openDrawer: () => void
  closeDrawer: () => void
  fixWidth: () => void
}

const DrawerLayoutFixed = forwardRef<DrawerLayoutFixedType, Props>(({ visibleNavNames, widthPercentage, widthPercentageMax, drawerPosition = 'left', drawerBackgroundColor, style, renderNavigationView, children }, ref) => {
  const [containerWidth, setContainerWidth] = useState(0)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [drawerVisible, setDrawerVisible] = useState(false)

  const drawerWidth = widthPercentageMax
    ? Math.min(Math.floor(containerWidth * widthPercentage), widthPercentageMax)
    : Math.floor(containerWidth * widthPercentage)

  const translateX = useRef(new Animated.Value(drawerPosition === 'left' ? -drawerWidth : containerWidth)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const isOpenRef = useRef(false)
  const changedRef = useRef({ width: 0, changed: false })

  const openDrawer = useCallback(() => {
    if (isOpenRef.current) return
    isOpenRef.current = true
    setDrawerVisible(true)
    setIsDrawerOpen(true)
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start()
  }, [translateX, overlayOpacity])

  const closeDrawer = useCallback(() => {
    if (!isOpenRef.current) return
    isOpenRef.current = false
    setIsDrawerOpen(false)
    const toValue = drawerPosition === 'left' ? -drawerWidth : containerWidth
    Animated.parallel([
      Animated.timing(translateX, {
        toValue,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDrawerVisible(false)
    })
  }, [drawerPosition, drawerWidth, containerWidth, translateX, overlayOpacity])

  const fixWidth = useCallback(() => {
    if (!changedRef.current.width) return
    changedRef.current.changed = true
    // Force re-render to fix layout
    setContainerWidth(c => c - 1)
    requestAnimationFrame(() => {
      setContainerWidth(c => c + 1)
      changedRef.current.changed = false
    })
  }, [])

  usePageVisible(visibleNavNames, useCallback((visible) => {
    if (!visible || !changedRef.current.width) return
    fixWidth()
  }, [fixWidth]))

  useImperativeHandle(ref, () => ({
    openDrawer,
    closeDrawer,
    fixWidth,
  }), [openDrawer, closeDrawer, fixWidth])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width
    if (changedRef.current.width == width) return
    changedRef.current.width = width
    // Update translateX for close state
    translateX.setValue(drawerPosition === 'left' ? -drawerWidth : width)
  }, [drawerPosition, drawerWidth, translateX])

  // PanResponder for swipe gestures on the overlay
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20
    },
    onPanResponderRelease: (_, gestureState) => {
      const threshold = drawerWidth * 0.3
      if (drawerPosition === 'left') {
        if (gestureState.dx < -threshold) {
          closeDrawer()
        }
      } else {
        if (gestureState.dx > threshold) {
          closeDrawer()
        }
      }
    },
  })).current

  const isLeft = drawerPosition === 'left'

  return (
    <View
      onLayout={handleLayout}
      style={{ flex: 1 }}
    >
      {/* Main content */}
      <View style={{ flex: 1 }}>
        {children}
      </View>

      {/* Overlay backdrop */}
      {drawerVisible && (
        <TouchableWithoutFeedback onPress={closeDrawer}>
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              opacity: overlayOpacity,
            }}
            {...panResponder.panHandlers}
          />
        </TouchableWithoutFeedback>
      )}

      {/* Drawer content - rendered as regular View, NOT through native DrawerLayout */}
      {drawerVisible && (
        <Animated.View
          style={[{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: drawerWidth,
            backgroundColor: drawerBackgroundColor ?? '#fff',
            [isLeft ? 'left' : 'right']: 0,
            transform: [{ translateX }],
            elevation: 16,
          }, style]}
        >
          {renderNavigationView()}
        </Animated.View>
      )}
    </View>
  )
})

export default DrawerLayoutFixed