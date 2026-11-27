import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { DrawerLayoutAndroid, type DrawerLayoutAndroidProps, View, type LayoutChangeEvent } from 'react-native'
// import { getWindowSise } from '@/utils/tools'
import { usePageVisible } from '@/store/common/hook'
import { type COMPONENT_IDS } from '@/config/constant'

interface Props extends DrawerLayoutAndroidProps {
  visibleNavNames: COMPONENT_IDS[]
  widthPercentage: number
  widthPercentageMax?: number
}

export interface DrawerLayoutFixedType {
  openDrawer: () => void
  closeDrawer: () => void
  fixWidth: () => void
}

const DrawerLayoutFixed = forwardRef<DrawerLayoutFixedType, Props>(({ visibleNavNames, widthPercentage, widthPercentageMax, renderNavigationView, children, ...props }, ref) => {
  const drawerLayoutRef = useRef<DrawerLayoutAndroid>(null)
  const [w, setW] = useState<number | `${number}%`>('100%')
  const [drawerWidth, setDrawerWidth] = useState(0)
  const [drawerOpened, setDrawerOpened] = useState(false)
  const changedRef = useRef({ width: 0, changed: false })

  const fixDrawerWidth = useCallback(() => {
    if (!changedRef.current.width) return
    changedRef.current.changed = true
    // console.log('usePageVisible', visible, changedRef.current.width)
    setW(changedRef.current.width - 1)
  }, [])

  // 修复 DrawerLayoutAndroid 在导航到其他屏幕再返回后无法打开的问题
  usePageVisible(visibleNavNames, useCallback((visible) => {
    if (!visible || !changedRef.current.width) return
    fixDrawerWidth()
  }, [fixDrawerWidth]))

  useImperativeHandle(ref, () => ({
    openDrawer() {
      // 不在这里乐观置 true：若原生 openDrawer 静默失败，会留下“JS 认为已打开”
      // 的坏状态，主内容被 no-hide-descendants 永久隐藏（读屏整页不可见）。
      // 只依赖 onDrawerOpen / onDrawerSlide 的真实事件。
      drawerLayoutRef.current?.openDrawer()
    },
    closeDrawer() {
      // 主动关闭时立刻同步状态：onDrawerClose 偶发丢失会让主内容一直 hidden，读屏就“看不见”整页
      setDrawerOpened(false)
      drawerLayoutRef.current?.closeDrawer()
    },
    fixWidth() {
      fixDrawerWidth()
    },
  }), [fixDrawerWidth])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    // console.log('handleLayout', e.nativeEvent.layout.width, changedRef.current.width)
    if (changedRef.current.changed) {
      // setW(e.nativeEvent.layout.width - 1)
      setW('100%')
      changedRef.current.changed = false
    } else {
      const width = e.nativeEvent.layout.width
      if (changedRef.current.width == width) return
      changedRef.current.width = width

      // 重新设置面板宽度
      const wp = Math.floor(width * widthPercentage)
      // console.log(wp, widthPercentageMax)
      setDrawerWidth(widthPercentageMax ? Math.min(wp, widthPercentageMax) : wp)

      // 强制触发渲染以应用更改
      changedRef.current.changed = true
      setW(width - 1)
    }
  }, [widthPercentage, widthPercentageMax])

  const handleDrawerOpen = useCallback((e: any) => {
    setDrawerOpened(true)
    props.onDrawerOpen?.(e)
  }, [props.onDrawerOpen])

  // 兜底：抽屉滑动/回弹过程中按偏移量同步状态，事件丢失时也能自愈
  const handleDrawerSlide = useCallback((e: any) => {
    const offset = e?.nativeEvent?.offset
    if (typeof offset == 'number') setDrawerOpened(offset > 0.001)
    props.onDrawerSlide?.(e)
  }, [props.onDrawerSlide])

  const handleDrawerClose = useCallback((e: any) => {
    setDrawerOpened(false)
    props.onDrawerClose?.(e)
  }, [props.onDrawerClose])

  return (
    <View
      onLayout={handleLayout}
      style={{ width: w, flex: 1 }}
    >
      <DrawerLayoutAndroid
        ref={drawerLayoutRef}
        keyboardDismissMode="on-drag"
        drawerWidth={drawerWidth}
        renderNavigationView={renderNavigationView ? () => (
          <View style={{ flex: 1 }} importantForAccessibility={drawerOpened ? 'auto' : 'no-hide-descendants'}>
            {renderNavigationView()}
          </View>
        ) : undefined}
        onDrawerOpen={handleDrawerOpen}
        onDrawerClose={handleDrawerClose}
        onDrawerSlide={handleDrawerSlide}
        {...props}
      >
        {/* 抽屉打开时把主内容从无障碍焦点里隐藏，焦点只留在侧边栏里，避免跑到后面的列表上 */}
        <View
          style={{ marginRight: w == '100%' ? 0 : -1, flex: 1 }}
          importantForAccessibility={drawerOpened ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
      </DrawerLayoutAndroid>
    </View>
  )
})

export default DrawerLayoutFixed
