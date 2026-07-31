import { useRef, useState, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { FlatList, View, RefreshControl, type FlatListProps, TouchableOpacity, Platform } from 'react-native'

import { type SearchListItem, type AudiobookType } from '@/store/audiobook/state'
import { useLayout } from '@/utils/hooks'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { scaleSizeW } from '@/utils/pixelRatio'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'

type FlatListType = FlatListProps<SearchListItem>

const MIN_WIDTH = scaleSizeW(110)
const GAP = scaleSizeW(20)
const IMG_GAP = scaleSizeW(15)

export type Status = 'loading' | 'refreshing' | 'end' | 'error' | 'idle'

export interface AudioListProps {
  onRefresh: () => void
  onLoadMore: () => void
  onOpenDetail: (item: SearchListItem, index: number) => void
  type: AudiobookType
}

export interface AudioListType {
  setList: (list: SearchListItem[]) => void
  setStatus: (val: Status, errorMsg?: string) => void
}

const ListItem = ({ item, index, width, onPress, type }: {
  item: SearchListItem
  index: number
  width: number
  onPress: (item: SearchListItem, index: number) => void
  type: AudiobookType
}) => {
  const theme = useTheme()
  const itemWidth = width - IMG_GAP
  const handlePress = useCallback(() => {
    onPress(item, index)
  }, [onPress, item, index])
  const isAnchor = 'isAnchor' in item && item.isAnchor

  if (!item.id) {
    return <View style={{ ...styles.listItem, width: itemWidth }} accessible={false} importantForAccessibility="no" />
  }

  return (
    <TouchableOpacity activeOpacity={0.5} onPress={handlePress} accessibilityLabel={item.name} style={{ ...styles.listItem, width: itemWidth }}>
      <View style={{ ...styles.listItemImg, backgroundColor: theme['c-content-background'] }}>
        <Image url={item.img} nativeID={`${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_from_${item.id}`} style={{ width: itemWidth, height: itemWidth, borderRadius: 4 }} />
      </View>
      <Text style={styles.listItemTitle} numberOfLines={2}>{item.name}</Text>
      {item.author ? <Text style={styles.listItemAuthor} size={11} color={theme['c-font-label']} numberOfLines={1}>{item.author}</Text> : null}
      {/* 主播模式额外显示关注/专辑数 */}
      {isAnchor && type === 'anchor' && 'followerCount' in item ? (
        <Text style={styles.listItemSub} size={10} color={theme['c-font-label']} numberOfLines={1}>
          {'followerCount' in item && item.followerCount != null ? `${item.followerCount} 粉丝` : ''}
          {'albumCount' in item && item.albumCount != null ? ` · ${item.albumCount} 专辑` : ''}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

const EmptyView = ({ status, errorMsg, onEmptyPress }: {
  status: Status
  errorMsg?: string
  onEmptyPress?: () => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  if (status === 'loading' || status === 'refreshing') return null
  const text = status === 'error' ? (errorMsg || t('list_error')) : t('list_empty')
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText} color={theme['c-font-label']} onPress={status === 'error' ? onEmptyPress : undefined}>{text}</Text>
    </View>
  )
}

export default forwardRef<AudioListType, AudioListProps>(({ onRefresh, onLoadMore, onOpenDetail, type }, ref) => {
  const flatListRef = useRef<FlatList>(null)
  const [currentList, setList] = useState<SearchListItem[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const { onLayout, width } = useLayout()
  const theme = useTheme()

  useImperativeHandle(ref, () => ({
    setList(list) {
      setList(list)
    },
    setStatus(val, errMsg) {
      setStatus(val)
      if (errMsg) setErrorMsg(errMsg)
      else if (val !== 'error') setErrorMsg('')
    },
  }), [])

  const handleLoadMore = useCallback(() => {
    if (status != 'idle') return
    onLoadMore()
  }, [status, onLoadMore])

  // rowInfo 必须定义在 renderItem 之前，否则 useCallback 依赖数组中引用 TDZ 变量会崩溃
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

  const renderItem: FlatListType['renderItem'] = useCallback(({ item, index }) => (
    <ListItem
      item={item}
      index={index}
      width={rowInfo.width}
      onPress={onOpenDetail}
      type={type}
    />
  ), [rowInfo.width, onOpenDetail, type])

  const getkey: FlatListType['keyExtractor'] = useCallback((item, index) => `${item.id}_${index}`, [])

  const refreshControl = useMemo(() => (
    <RefreshControl
      colors={[theme['c-primary']]}
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

  const list = useMemo(() => {
    const list = [...currentList]
    let whiteItemNum = (list.length % rowInfo.num)
    if (whiteItemNum > 0) whiteItemNum = rowInfo.num - whiteItemNum
    for (let i = 0; i < whiteItemNum; i++) {
      list.push({
        id: `white_${rowInfo.num}_${i}`,
        name: '',
        author: '',
        img: '',
        desc: '',
        playCount: 0,
        trackCount: 0,
        source: 'xm',
      } as SearchListItem)
    }
    return list
  }, [currentList, rowInfo])

  const handleEmptyPress = useCallback(() => {
    if (status === 'error') onLoadMore()
  }, [status, onLoadMore])

  return (
    <View style={styles.container} onLayout={onLayout}>
      {
        width == 0
          ? null
          : (
              <FlatList
                key={String(rowInfo.num)}
                ref={flatListRef}
                style={styles.list}
                columnWrapperStyle={{ justifyContent: 'space-evenly' }}
                numColumns={rowInfo.num}
                data={list}
                maxToRenderPerBatch={4}
                windowSize={5}
                removeClippedSubviews={false}
                renderItem={renderItem}
                keyExtractor={getkey}
                onEndReachedThreshold={0.6}
                onEndReached={handleLoadMore}
                refreshControl={refreshControl}
                ListFooterComponent={footerComponent}
                ListEmptyComponent={<EmptyView status={status} errorMsg={errorMsg} onEmptyPress={handleEmptyPress} />}
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
  const handlePress = useCallback(() => {
    if (label != 'list_error') return
    onLoadMore()
  }, [label, onLoadMore])
  return (
    label
      ? (
          <View>
            <Text onPress={handlePress} style={styles.footer} color={theme['c-font-label']}>{t(label)}</Text>
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
  listItem: {
    margin: 10,
  },
  listItemImg: {
    borderRadius: 4,
    marginBottom: 5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 1,
        },
        shadowOpacity: 0.20,
        shadowRadius: 1.41,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  listItemTitle: {
    fontSize: 12,
    marginBottom: 3,
  },
  listItemAuthor: {
    marginBottom: 5,
  },
  listItemSub: {
    marginBottom: 5,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
})