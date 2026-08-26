import { useMemo, useRef, useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { FlatList, type FlatListProps, RefreshControl, View, Vibration, AccessibilityInfo, PanResponder, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent, type LayoutChangeEvent } from 'react-native'

// import { useMusicList } from '@/store/list/hook'
import ListItem, { ITEM_HEIGHT } from './ListItem'
import { createStyle, getRowInfo, type RowInfoType } from '@/utils/tools'
import type { Position } from './ListMenu'
import type { SelectMode } from './MultipleModeBar'
import { useTheme } from '@/store/theme/hook'
import settingState from '@/store/setting/state'
import { MULTI_SELECT_BAR_HEIGHT } from './MultipleModeBar'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import { handlePlay } from './listAction'
import { useSettingValue } from '@/store/setting/hook'

type FlatListType = FlatListProps<LX.Music.MusicInfoOnline>

export type {
  RowInfoType,
}

export interface ListProps {
  onShowMenu: (musicInfo: LX.Music.MusicInfoOnline, index: number, position: Position) => void
  onMuiltSelectMode: () => void
  onSelectAll: (isAll: boolean) => void
  onRefresh: () => void
  onLoadMore: () => void
  onPlayList?: (index: number) => void
  progressViewOffset?: number
  ListHeaderComponent?: React.ReactNode
  checkHomePagerIdle: boolean
  rowType?: RowInfoType
}
export interface ListType {
  setList: (list: LX.Music.MusicInfoOnline[], isAppend: boolean, showSource: boolean) => void
  setIsMultiSelectMode: (isMultiSelectMode: boolean) => void
  isMultiSelectMode: () => boolean
  setSelectMode: (mode: SelectMode) => void
  selectAll: (isAll: boolean) => void
  selectRange: (list: LX.Music.MusicInfoOnline[]) => void
  getSelectedList: () => LX.Music.MusicInfoOnline[]
  getList: () => LX.Music.MusicInfoOnline[]
  setStatus: (val: Status) => void
}
export type Status = 'loading' | 'refreshing' | 'end' | 'error' | 'idle'


const List = forwardRef<ListType, ListProps>(({
  onShowMenu,
  onMuiltSelectMode,
  onSelectAll,
  onRefresh,
  onLoadMore,
  onPlayList,
  progressViewOffset,
  ListHeaderComponent,
  checkHomePagerIdle,
  rowType,
}, ref) => {
  // const t = useI18n()
  const theme = useTheme()
  const flatListRef = useRef<FlatList>(null)
  const [currentList, setList] = useState<LX.Music.MusicInfoOnline[]>([])
  const [showSource, setShowSource] = useState(false)
  const isMultiSelectModeRef = useRef(false)
  const selectModeRef = useRef<SelectMode>('single')
  const prevSelectIndexRef = useRef(-1)
  const [selectedList, setSelectedList] = useState<LX.Music.MusicInfoOnline[]>([])
  const selectedListRef = useRef<LX.Music.MusicInfoOnline[]>([])
  const [visibleMultiSelect, setVisibleMultiSelect] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const rowInfo = useRef(getRowInfo(rowType))
  const isShowAlbumName = useSettingValue('list.isShowAlbumName')
  const isShowInterval = useSettingValue('list.isShowInterval')
  // 拖拽多选相关
  const isDraggingRef = useRef(false)
  const dragStartIndexRef = useRef(-1)
  const dragLastIndexRef = useRef(-1)
  const listContainerRef = useRef<View>(null)
  const scrollOffsetRef = useRef(0)
  const containerRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const headerHeightRef = useRef(0)
  // const currentListIdRef = useRef('')
  // console.log('render music list')

  useImperativeHandle(ref, () => ({
    setList(list, isAppend, showSource) {
      setList(list)
      setShowSource(showSource)
      if (!isAppend) {
        // 切换列表时自动取消多选模式
        if (selectedListRef.current.length) setSelectedList(selectedListRef.current = [])
        if (isMultiSelectModeRef.current) {
          isMultiSelectModeRef.current = false
          prevSelectIndexRef.current = -1
          setVisibleMultiSelect(false)
        }
        // 重置拖拽状态
        stopEdgeScroll()
        isDraggingRef.current = false
        dragStartIndexRef.current = -1
        dragLastIndexRef.current = -1
      }
    },
    setIsMultiSelectMode(isMultiSelectMode) {
      isMultiSelectModeRef.current = isMultiSelectMode
      if (!isMultiSelectMode) {
        prevSelectIndexRef.current = -1
        handleUpdateSelectedList([])
        // 重置拖拽状态
        stopEdgeScroll()
        isDraggingRef.current = false
        dragStartIndexRef.current = -1
        dragLastIndexRef.current = -1
      }
      setVisibleMultiSelect(isMultiSelectMode)
    },
    isMultiSelectMode() {
      return isMultiSelectModeRef.current
    },
    setSelectMode(mode) {
      selectModeRef.current = mode
    },
    selectAll(isAll) {
      let list: LX.Music.MusicInfoOnline[]
      if (isAll) {
        list = [...currentList]
      } else {
        list = []
      }
      selectedListRef.current = list
      setSelectedList(list)
    },
    selectRange(list) {
      selectedListRef.current = list
      setSelectedList(list)
      if (list.length === currentList.length) onSelectAll(true)
      else if (list.length === 0) onSelectAll(false)
    },
    getSelectedList() {
      return selectedListRef.current
    },
    getList() {
      return currentList
    },
    setStatus(val) {
      setStatus(val)
    },
  }))


  const handleUpdateSelectedList = (newList: LX.Music.MusicInfoOnline[]) => {
    if (selectedListRef.current.length && newList.length == currentList.length) onSelectAll(true)
    else if (selectedListRef.current.length == currentList.length) onSelectAll(false)
    selectedListRef.current = newList
    setSelectedList(newList)
  }
  const handleSelect = (item: LX.Music.MusicInfoOnline, pressIndex: number) => {
    let newList: LX.Music.MusicInfoOnline[]
    if (selectModeRef.current == 'single') {
      prevSelectIndexRef.current = pressIndex
      const index = selectedListRef.current.indexOf(item)
      if (index < 0) {
        newList = [...selectedListRef.current, item]
      } else {
        newList = [...selectedListRef.current]
        newList.splice(index, 1)
      }
    } else {
      if (selectedListRef.current.length) {
        const prevIndex = prevSelectIndexRef.current
        const currentIndex = pressIndex
        if (prevIndex == currentIndex) {
          newList = []
        } else if (currentIndex > prevIndex) {
          newList = currentList.slice(prevIndex, currentIndex + 1)
        } else {
          newList = currentList.slice(currentIndex, prevIndex + 1)
          newList.reverse()
        }
      } else {
        newList = [item]
        prevSelectIndexRef.current = pressIndex
      }
    }

    handleUpdateSelectedList(newList)
  }

  const handlePress = (item: LX.Music.MusicInfoOnline, index: number) => {
    requestAnimationFrame(() => {
      if (checkHomePagerIdle && !global.lx.homePagerIdle) return
      if (isMultiSelectModeRef.current) {
        handleSelect(item, index)
      } else {
        if (settingState.setting['list.isClickPlayList'] && onPlayList != null) {
          onPlayList(index)
        } else {
          // console.log(currentList[index])
          handlePlay(currentList[index])
        }
      }
    })
  }

  const handleLongPress = (item: LX.Music.MusicInfoOnline, index: number) => {
    prevSelectIndexRef.current = index
    dragStartIndexRef.current = index
    dragLastIndexRef.current = index
    isDraggingRef.current = true
    if (isMultiSelectModeRef.current) return
    handleUpdateSelectedList([item])
    onMuiltSelectMode()
    // 震动反馈
    Vibration.vibrate(30)
    // 无障碍播报提示
    AccessibilityInfo.announceForAccessibility(
      global.i18n.t('download_multi_select') || '已进入多选模式',
    )
  }

  // 更新拖拽选中状态（index 为列表项序号）
  const handleDragSelect = useCallback((index: number) => {
    if (!isMultiSelectModeRef.current || !isDraggingRef.current) return
    if (index < 0) return
    const startIndex = dragStartIndexRef.current
    const currentIndex = Math.min(index, currentList.length - 1)
    if (currentIndex === dragLastIndexRef.current) return
    dragLastIndexRef.current = currentIndex

    let newSelectedList: LX.Music.MusicInfoOnline[]
    if (currentIndex >= startIndex) {
      newSelectedList = currentList.slice(startIndex, currentIndex + 1)
    } else {
      newSelectedList = currentList.slice(currentIndex, startIndex + 1)
    }
    handleUpdateSelectedList(newSelectedList)
  }, [currentList, handleUpdateSelectedList])

  // 根据屏幕坐标计算列表项索引
  const getIndexByPage = useCallback((pageX: number, pageY: number) => {
    const rect = containerRectRef.current
    if (rect.width <= 0) return -1
    const contentY = scrollOffsetRef.current + (pageY - rect.y) - headerHeightRef.current
    const rowNum = rowInfo.current.rowNum ?? 1
    const rowIndex = Math.max(0, Math.floor(contentY / ITEM_HEIGHT))
    const colIndex = rowNum > 1
      ? Math.max(0, Math.min(Math.floor((pageX - rect.x) / (rect.width / rowNum)), rowNum - 1))
      : 0
    const index = rowIndex * rowNum + colIndex
    return Math.min(index, currentList.length - 1)
  }, [currentList.length])

  // 测量列表容器在屏幕中的位置
  const measureContainer = useCallback(() => {
    listContainerRef.current?.measureInWindow((x, y, width, height) => {
      containerRectRef.current = { x, y, width, height }
    })
  }, [])

  // 容器布局变化时重新测量
  const handleContainerLayout = useCallback(() => {
    measureContainer()
  }, [measureContainer])

  // 边缘自动滚动
  const edgeScrollStateRef = useRef<-1 | 0 | 1>(0)
  const edgeScrollRAFRef = useRef<number | null>(null)
  const lastTouchRef = useRef({ pageX: 0, pageY: 0 })
  const stopEdgeScroll = useCallback(() => {
    edgeScrollStateRef.current = 0
    if (edgeScrollRAFRef.current != null) {
      cancelAnimationFrame(edgeScrollRAFRef.current)
      edgeScrollRAFRef.current = null
    }
  }, [])
  const runEdgeScroll = useCallback(() => {
    if (edgeScrollStateRef.current == 0 || !isDraggingRef.current) return
    const nextOffset = Math.max(0, scrollOffsetRef.current + edgeScrollStateRef.current * ITEM_HEIGHT * 0.5)
    scrollOffsetRef.current = nextOffset
    flatListRef.current?.scrollToOffset({ offset: nextOffset, animated: false })
    handleDragSelect(getIndexByPage(lastTouchRef.current.pageX, lastTouchRef.current.pageY))
    edgeScrollRAFRef.current = requestAnimationFrame(runEdgeScroll)
  }, [getIndexByPage, handleDragSelect])
  const updateEdgeScroll = useCallback((pageX: number, pageY: number) => {
    const rect = containerRectRef.current
    if (rect.height <= 0) return
    const edge = ITEM_HEIGHT
    let state: -1 | 0 | 1 = 0
    if (pageY < rect.y + edge) state = -1
    else if (pageY > rect.y + rect.height - edge) state = 1
    if (state != edgeScrollStateRef.current) {
      stopEdgeScroll()
      edgeScrollStateRef.current = state
      if (state != 0) edgeScrollRAFRef.current = requestAnimationFrame(runEdgeScroll)
    }
  }, [runEdgeScroll, stopEdgeScroll])

  // 创建 PanResponder 用于拖拽多选
  const createPanResponder = useCallback(() => {
    return PanResponder.create({
      // 在子组件没有明确声明捕获前，拒绝作为响应者
      onStartShouldSetPanResponder: () => false,
      // 在子组件没有明确声明捕获前，拒绝作为响应者
      onStartShouldSetPanResponderCapture: () => false,
      // 拖拽开始后捕获移动事件
      onMoveShouldSetPanResponderCapture: () => {
        return isMultiSelectModeRef.current && isDraggingRef.current
      },
      onPanResponderGrant: (e: GestureResponderEvent) => {
        measureContainer()
        lastTouchRef.current = { pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY }
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        if (!isMultiSelectModeRef.current || !isDraggingRef.current) return
        lastTouchRef.current = { pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY }
        handleDragSelect(getIndexByPage(e.nativeEvent.pageX, e.nativeEvent.pageY))
        updateEdgeScroll(e.nativeEvent.pageX, e.nativeEvent.pageY)
      },
      onPanResponderRelease: () => {
        stopEdgeScroll()
        isDraggingRef.current = false
      },
      onPanResponderTerminate: () => {
        stopEdgeScroll()
        isDraggingRef.current = false
      },
    })
  }, [getIndexByPage, handleDragSelect, measureContainer, stopEdgeScroll, updateEdgeScroll])

  // 触摸结束（含未发生移动的长按抬起）时重置拖拽状态
  const handleTouchEnd = useCallback(() => {
    stopEdgeScroll()
    isDraggingRef.current = false
  }, [stopEdgeScroll])

  // 初始化 PanResponder
  const panResponder = useMemo(createPanResponder, [createPanResponder])

  // 记录滚动位置
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y
  }, [])
  // 记录表头高度
  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    headerHeightRef.current = e.nativeEvent.layout.height
  }, [])

  // 组件卸载时清理拖拽状态
  useEffect(() => () => {
    stopEdgeScroll()
    isDraggingRef.current = false
  }, [stopEdgeScroll])

  // 检测屏幕阅读器是否开启：保留以便后续其他无障碍优化使用
  // 当前滚动性能优化（removeClippedSubviews=true）不依赖此状态

  const handleLoadMore = () => {
    if (status != 'idle') return
    onLoadMore()
  }


  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      item={item}
      index={index}
      showSource={showSource}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onShowMenu={onShowMenu}
      selectedList={selectedList}
      rowInfo={rowInfo.current}
      isShowAlbumName={isShowAlbumName}
      isShowInterval={isShowInterval}
      hideMoreButton={visibleMultiSelect}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }
  const refreshControl = useMemo(() => (
    <RefreshControl
      colors={[theme['c-primary']]}
      // progressBackgroundColor={theme.primary}
      refreshing={status == 'refreshing'}
      onRefresh={onRefresh} />
  ), [status, onRefresh, theme])
  const footerComponent = useMemo(() => {
    let label: FooterLabel
    switch (status) {
      case 'refreshing': return null
      case 'loading':
        label = 'list_loading'
        break
      case 'end':
        label = 'list_end'
        break
      case 'error':
        label = 'list_error'
        break
      case 'idle':
        label = null
        break
    }
    return (
      <View style={{ width: '100%', paddingBottom: visibleMultiSelect ? MULTI_SELECT_BAR_HEIGHT : 0 }} >
        <Footer label={label} onLoadMore={onLoadMore} />
      </View>
    )
  }, [onLoadMore, status, visibleMultiSelect])

  return (
    <View ref={listContainerRef} onLayout={handleContainerLayout} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd} style={styles.container} {...panResponder.panHandlers}>
      {/* 平衡方案：removeClippedSubviews=false（滚动时节点不 detach，读屏焦点不丢、不空白）
          + windowSize=21（前后 10 屏 cell 常驻，滚动时几乎不重建，无障碍树稳定，避免 detach 重建导致的卡顿） */}
      <FlatList
        ref={flatListRef}
        style={styles.list}
        data={currentList}
        numColumns={rowInfo.current.rowNum}
        horizontal={false}
        maxToRenderPerBatch={4}
        windowSize={21}
        removeClippedSubviews={false}
        initialNumToRender={12}
        renderItem={renderItem}
        keyExtractor={getkey}
        getItemLayout={getItemLayout}
        onScroll={handleScroll}
        onEndReachedThreshold={0.5}
        onEndReached={handleLoadMore}
        progressViewOffset={progressViewOffset}
        ListHeaderComponent={ListHeaderComponent ? <View onLayout={handleHeaderLayout}>{ListHeaderComponent}</View> : null}
        refreshControl={refreshControl}
        ListFooterComponent={footerComponent}
      />
    </View>
  )
})

type FooterLabel = 'list_loading' | 'list_end' | 'list_error' | null
const Footer = ({ label, onLoadMore }: {
  label: FooterLabel
  onLoadMore: () => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const handlePress = () => {
    if (label != 'list_error') return
    onLoadMore()
  }
  return (
    label
      ? (
          <View>
            <Text onPress={handlePress} style={styles.footer} color={theme['c-font-label']} accessibilityRole={label == 'list_error' ? 'button' : 'text'}>{t(label)}</Text>
          </View>
        )
      : null
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  footer: {
    textAlign: 'center',
    padding: 10,
  },
})

export default List
