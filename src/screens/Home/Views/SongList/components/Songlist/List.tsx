import { useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { FlatList, View, RefreshControl, type FlatListProps, AccessibilityInfo } from 'react-native'
import { RecyclerListView, DataProvider, LayoutProvider } from 'recyclerlistview'

import ListItem from './ListItem'
// import { navigations } from '@/navigation'
import { type ListInfoItem } from '@/store/songlist/state'
import { useLayout } from '@/utils/hooks'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { scaleSizeW } from '@/utils/pixelRatio'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'

// 读屏时是否使用 RecyclerListView（cell 回收 + 最小重渲染，滚动时无障碍更顺）
// 若失效，改此值为 false 即可整体回退原版 FlatList
const USE_RECYCLERLIST = true

type FlatListType = FlatListProps<ListInfoItem>

// const MAX_WIDTH = scaleSizeW(110)
const MIN_WIDTH = scaleSizeW(110)
const GAP = scaleSizeW(20)

export interface ListProps {
  onRefresh: () => void
  onLoadMore: () => void
  onOpenDetail: (item: ListInfoItem, index: number) => void
  onCollect?: (item: ListInfoItem) => void
  collectedSet?: Set<string>
  ListHeaderComponent?: React.ReactElement
}
export type Status = 'loading' | 'refreshing' | 'end' | 'error' | 'idle'

export interface ListType {
  setList: (list: ListInfoItem[], isAppend?: boolean, showSource?: boolean) => void
  setStatus: (val: Status) => void
}

export default forwardRef<ListType, ListProps>(({ onRefresh, onLoadMore, onOpenDetail, onCollect, collectedSet, ListHeaderComponent }, ref) => {
  const flatListRef = useRef<FlatList>(null)
  const recyclerListRef = useRef<RecyclerListView<any, any>>(null)
  const [currentList, setList] = useState<ListInfoItem[]>([])
  const [showSource, setShowSource] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false)
  const { onLayout, width } = useLayout()
  const theme = useTheme()
  // console.log('render songlist')

  useImperativeHandle(ref, () => ({
    setList(list, isAppend = false, showSource = false) {
      setList(prev => isAppend ? [...prev, ...list] : list)
      setShowSource(showSource)
    },
    setStatus(val) {
      setStatus(val)
    },
  }))

  // 检测屏幕阅读器是否开启：开启时切换为 RecyclerListView
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!mounted) return
      setScreenReaderEnabled(enabled)
    })
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      setScreenReaderEnabled(enabled)
    })
    return () => {
      mounted = false
      sub?.remove()
    }
  }, [])

  const handleLoadMore = () => {
    if (status != 'idle') return
    onLoadMore()
  }

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      item={item}
      index={index}
      width={rowInfo.width}
      showSource={showSource}
      onPress={onOpenDetail}
      onCollect={onCollect}
      isCollected={collectedSet ? collectedSet.has(`${item.source}__${item.id}`) : false}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
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
      <View style={{ width: '100%' }}>
        <Footer label={label} onLoadMore={onLoadMore} />
      </View>
    )
  }, [onLoadMore, status])

  const rowInfo = useMemo(() => {
    let w = width - GAP
    let n = width / (MIN_WIDTH + GAP)
    if (n > 10) n = 10
    let computedItemWidth = Math.floor(w / n)
    const num = Math.max(Math.floor(width / computedItemWidth), 2)
    return {
      num,
      width: (width - GAP) / num,
    }
  }, [width])

  // 一维列表（含白色占位补足列数），供 FlatList 使用
  const list = useMemo(() => {
    const list = [...currentList]
    let whiteItemNum = (list.length % rowInfo.num)
    if (whiteItemNum > 0) whiteItemNum = rowInfo.num - whiteItemNum
    for (let i = 0; i < whiteItemNum; i++) {
      list.push({
        id: `white__${i}`,
        play_count: '',
        author: '',
        name: '',
        img: '',
        desc: '',
        // @ts-expect-error
        source: '',
      })
    }
    return list
  }, [currentList, rowInfo])

  // 读屏时使用 RecyclerListView：按行重组数据，每行是一个横向容器
  const useRecycler = USE_RECYCLERLIST && screenReaderEnabled && width > 0
  // 行数组：每个元素是 { id, startIndex, items: ListInfoItem[] }，items 为该行内的卡片
  const rowList = useMemo(() => {
    const rows: Array<{ id: string, startIndex: number, items: ListInfoItem[] }> = []
    const num = rowInfo.num
    for (let i = 0; i < list.length; i += num) {
      rows.push({
        id: `row__${i / num}`,
        startIndex: i,
        items: list.slice(i, i + num),
      })
    }
    return rows
  }, [list, rowInfo.num])
  const recyclerDataProvider = useMemo(
    () => new DataProvider((r1, r2) => r1 !== r2).cloneWithRows(rowList),
    [rowList],
  )
  const rowHeight = rowInfo.width
  const recyclerLayoutProvider = useMemo(
    () => new LayoutProvider(() => 0, (_type, dim) => { dim.width = width; dim.height = rowHeight }),
    [width, rowHeight],
  )
  const recyclerRowRenderer = useCallback((_type: any, row: any) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', width, height: rowHeight }}>
      {row.items.map((item: ListInfoItem, idx: number) => (
        <ListItem
          key={item.id}
          item={item}
          index={row.startIndex + idx}
          width={rowInfo.width}
          showSource={showSource}
          onPress={onOpenDetail}
          onCollect={onCollect}
          isCollected={collectedSet ? collectedSet.has(`${item.source}__${item.id}`) : false}
        />
      ))}
    </View>
  ), [width, rowHeight, rowInfo.width, showSource, onOpenDetail, onCollect, collectedSet])
  const recyclerExtendedState = useMemo(
    () => ({ showSource, collectedSet }),
    [showSource, collectedSet],
  )

  return (
    <View style={styles.container} onLayout={onLayout}>
      {
        width == 0
          ? null
          : useRecycler
            ? (
              // 读屏时：RecyclerListView（按行虚拟化，滚动时无障碍更顺）；若失效改 USE_RECYCLERLIST=false 回退 FlatList
              <>
                {ListHeaderComponent}
                <RecyclerListView
                  ref={recyclerListRef}
                  style={styles.list}
                  dataProvider={recyclerDataProvider}
                  layoutProvider={recyclerLayoutProvider}
                  rowRenderer={recyclerRowRenderer}
                  extendedState={recyclerExtendedState}
                  onEndReached={handleLoadMore}
                  onEndReachedThreshold={0.6}
                  renderFooter={() => footerComponent}
                  scrollViewProps={{
                    refreshControl,
                  }}
                />
              </>
              )
            : (
              <FlatList
                key={String(rowInfo.num)}
                ref={flatListRef}
                style={styles.list}
                columnWrapperStyle={{ justifyContent: 'space-evenly' }}
                numColumns={rowInfo.num}
                data={list}
                maxToRenderPerBatch={10}
                // updateCellsBatchingPeriod={80}
                windowSize={7}
                removeClippedSubviews={false}
                initialNumToRender={12}
                renderItem={renderItem}
                keyExtractor={getkey}
                // getItemLayout={getItemLayout}
                // onRefresh={onRefresh}
                // refreshing={refreshing}
                onEndReachedThreshold={0.6}
                onEndReached={handleLoadMore}
                maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
                refreshControl={refreshControl}
                ListHeaderComponent={ListHeaderComponent}
                ListFooterComponent={footerComponent}
              />
              )
      }
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
            <Text onPress={handlePress} style={styles.footer} color={theme['c-font-label']} accessibilityRole="button">{t(label)}</Text>
          </View>
        )
      : null
  )
}


const styles = createStyle({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 10,
  },
  footer: {
    textAlign: 'center',
    padding: 10,
  },
})
