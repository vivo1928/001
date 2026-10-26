import { useMemo, useRef, useState, forwardRef, useImperativeHandle, useEffect } from 'react'
import { FlatList, type FlatListProps, RefreshControl, View } from 'react-native'

// import { useMusicList } from '@/store/list/hook'
import CommentFloor from './CommentFloor'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { type Comment } from '../utils'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

type FlatListType = FlatListProps<Comment>

// 自动续加载：进入页面后持续加载下一页直到到底，无需滚动
// AUTO_FILL_MAX_PAGE 为安全上限，防止 maxPage 判定异常时无限请求
const AUTO_FILL_MAX_PAGE = 500

export interface ListProps {
  onRefresh: () => void
  onLoadMore: () => void
}
export interface ListType {
  setList: (list: Comment[]) => void
  getList: () => Comment[]
  setStatus: (val: Status) => void
}
export type Status = 'loading' | 'refreshing' | 'end' | 'error' | 'idle'

const List = forwardRef<ListType, ListProps>(({
  onRefresh,
  onLoadMore,
}, ref) => {
  // const t = useI18n()
  const theme = useTheme()
  const flatListRef = useRef<FlatList>(null)
  const [currentList, setList] = useState<Comment[]>([])
  const listDataRef = useRef<Comment[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const statusRef = useRef<Status>('idle')
  const autoFillCountRef = useRef(0)
  const autoFillLastLenRef = useRef(0)
  const autoFillStoppedRef = useRef(false)
  // const currentListIdRef = useRef('')
  // console.log('render comment list')

  useImperativeHandle(ref, () => ({
    setList(list) {
      const prevLen = listDataRef.current.length
      listDataRef.current = list
      // 列表变短视为刷新/重新加载，重置续加载状态（评论 setList 总传全量，用长度判断）
      if (list.length < prevLen) {
        autoFillCountRef.current = 0
        autoFillLastLenRef.current = 0
        autoFillStoppedRef.current = false
      }
      setList(list)
    },
    getList() {
      return listDataRef.current
    },
    setStatus(val) {
      statusRef.current = val
      setStatus(val)
    },
  }))

  const handleLoadMore = () => {
    if (statusRef.current !== 'idle') return
    onLoadMore()
  }

  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  // 自动续加载：空闲且未到底时持续加载下一页，直到全部加载完或某页无进展（失败）停止。
  // 列表为空时等父组件加载首页，避免挂载时与父组件重复拉第一页。
  useEffect(() => {
    if (autoFillStoppedRef.current) return
    if (statusRef.current !== 'idle') return
    if (autoFillCountRef.current >= AUTO_FILL_MAX_PAGE) {
      autoFillStoppedRef.current = true
      return
    }
    const len = currentList.length
    if (len === 0) return
    if (len === autoFillLastLenRef.current) {
      autoFillStoppedRef.current = true
      return
    }
    autoFillLastLenRef.current = len
    autoFillCountRef.current += 1
    onLoadMoreRef.current?.()
  }, [currentList, status])

  const renderItem: FlatListType['renderItem'] = ({ item }) => <CommentFloor comment={item} />

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
    return <Footer label={label} onLoadMore={onLoadMore} />
  }, [onLoadMore, status])

  return (
    <FlatList
      ref={flatListRef}
      style={styles.list}
      data={currentList}
      onEndReachedThreshold={0.2}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={false}
      initialNumToRender={10}
      renderItem={renderItem}
      keyExtractor={getkey}
      onEndReached={handleLoadMore}
      refreshControl={refreshControl}
      ListFooterComponent={footerComponent}
    />
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
            <Text onPress={handlePress} style={styles.footer} color={theme['c-font-label']}
              accessibilityLabel={t(label)} accessibilityRole={label == 'list_error' ? 'button' : 'text'}>{t(label)}</Text>
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
    paddingLeft: 15,
    paddingRight: 15,
  },
  footer: {
    textAlign: 'center',
    padding: 10,
  },
})

export default List
