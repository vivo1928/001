import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { View, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import { useStatusbarHeight } from '@/store/common/hook'
import { useLayout } from '@/utils/hooks'
import { createStyle } from '@/utils/tools'
import { scaleSizeW } from '@/utils/pixelRatio'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { getAnchorDetail } from '@/core/audiobook/search'
import { pushAudiobookAlbumDetailScreen } from '@/navigation/navigation'
import commonState from '@/store/common/state'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import PlayerBar from '@/components/player/PlayerBar'

interface AnchorDetailInfo {
  id: string
  name: string
  img?: string
  source: string
  followerCount?: number
  albumCount?: number
}

interface AlbumItem {
  id: string
  name: string
  author: string
  img: string
  desc: string
  playCount: number
  trackCount: number
  source: string
  categoryId?: string
  categoryName?: string
}

const IMAGE_WIDTH = 70
const MIN_WIDTH = scaleSizeW(110)
const GAP = scaleSizeW(20)

export default ({ componentId, info }: { componentId: string, info: AnchorDetailInfo }) => {
  const statusBarHeight = useStatusbarHeight()
  const theme = useTheme()
  const { onLayout, width } = useLayout()
  const [albums, setAlbums] = useState<AlbumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [anchorInfo, setAnchorInfo] = useState<AnchorDetailInfo>(info)
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.audiobookAnchorDetail, componentId)
    isUnmountedRef.current = false
    loadAlbums()
    return () => { isUnmountedRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAlbums = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      console.log('[AudiobookAnchorDetail] loading anchor:', info.id, info.source)
      const result = await getAnchorDetail(info.id, info.source as any, 1, 30, info.name)
      console.log('[AudiobookAnchorDetail] result:', result?.list?.length, 'albums')
      if (!isUnmountedRef.current) {
        setAlbums(result.list || [])
        if (result.info) {
          setAnchorInfo(prev => ({
            ...prev,
            name: result.info!.name || prev.name,
            img: result.info!.img || prev.img,
          }))
        }
        setLoading(false)
      }
    } catch (err: any) {
      console.error('[AudiobookAnchorDetail] load error:', err?.message || err)
      if (!isUnmountedRef.current) {
        setErrorMsg(err?.message || '加载失败')
        setLoading(false)
      }
    }
  }, [info.id, info.source])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await getAnchorDetail(info.id, info.source as any, 1, 30, info.name)
      if (!isUnmountedRef.current) {
        setAlbums(result.list || [])
        setRefreshing(false)
      }
    } catch (err: any) {
      if (!isUnmountedRef.current) {
        setRefreshing(false)
      }
    }
  }, [info.id, info.source])

  const handleAlbumPress = useCallback((album: AlbumItem) => {
    console.log('[AudiobookAnchorDetail] open album:', album.name, album.id)
    const homeComponentId = commonState.componentIds.home!
    pushAudiobookAlbumDetailScreen(homeComponentId, {
      id: album.id,
      name: album.name,
      author: album.author,
      img: album.img,
      source: album.source,
    })
  }, [])

  // 网格布局计算
  const rowInfo = useMemo(() => {
    const w = width - GAP
    let n = width / (MIN_WIDTH + GAP)
    if (n > 10) n = 10
    const computedItemWidth = Math.floor(w / n)
    const num = Math.max(Math.floor(width / computedItemWidth), 2)
    return {
      num,
      itemWidth: (width - GAP) / num,
    }
  }, [width])

  const renderAlbum = useCallback(({ item }: { item: AlbumItem }) => {
    const itemWidth = rowInfo.itemWidth
    return (
      <TouchableOpacity
        activeOpacity={0.5}
        onPress={() => handleAlbumPress(item)}
        style={{ ...styles.albumItem, width: itemWidth }}
      >
        <View style={{ ...styles.albumImg, backgroundColor: theme['c-content-background'] }}>
          <Image url={item.img} nativeID={`${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_from_${item.id}`} style={{ width: itemWidth, height: itemWidth, borderRadius: 4 }} />
        </View>
        <Text style={styles.albumTitle} numberOfLines={2}>{item.name}</Text>
        {item.author ? <Text style={styles.albumAuthor} size={11} color={theme['c-font-label']} numberOfLines={1}>{item.author}</Text> : null}
        {item.trackCount > 0 ? <Text size={10} color={theme['c-font-label']} numberOfLines={1}>{item.trackCount} 集</Text> : null}
      </TouchableOpacity>
    )
  }, [rowInfo.itemWidth, handleAlbumPress, theme])

  const keyExtractor = useCallback((item: AlbumItem, index: number) => `${item.id}_${index}`, [])

  const renderHeader = () => (
    <View style={{ ...styles.header, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
      <View style={styles.headerContent}>
        <View style={{ ...styles.headerImg, width: IMAGE_WIDTH, height: IMAGE_WIDTH }}>
          <Image url={anchorInfo.img} style={{ flex: 1, borderRadius: 4 }} />
        </View>
        <View style={styles.headerText}>
          <Text size={14} numberOfLines={2}>{anchorInfo.name}</Text>
          {anchorInfo.followerCount != null ? <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{anchorInfo.followerCount} 粉丝</Text> : null}
          {anchorInfo.albumCount != null ? <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{anchorInfo.albumCount} 专辑</Text> : null}
        </View>
      </View>
    </View>
  )

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <Text color={theme['c-font-label']} size={14}>加载中...</Text>
        </View>
      )
    }
    if (errorMsg) {
      return (
        <View style={styles.emptyContainer}>
          <Text color={theme['c-font-label']} size={14} onPress={loadAlbums}>{errorMsg}</Text>
        </View>
      )
    }
    return (
      <View style={styles.emptyContainer}>
        <Text color={theme['c-font-label']} size={14}>暂无专辑</Text>
      </View>
    )
  }

  return (
    <PageContent>
      <StatusBar />
      <View style={styles.container} onLayout={onLayout}>
        {
          width == 0
            ? null
            : (
                <FlatList
                  key={String(rowInfo.num)}
                  style={styles.list}
                  columnWrapperStyle={{ justifyContent: 'space-evenly' }}
                  numColumns={rowInfo.num}
                  data={albums}
                  renderItem={renderAlbum}
                  keyExtractor={keyExtractor}
                  ListHeaderComponent={renderHeader}
                  ListEmptyComponent={renderEmpty}
                  refreshControl={
                    <RefreshControl
                      colors={[theme['c-primary']]}
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                    />
                  }
                />
              )
        }
      </View>
      <PlayerBar />
    </PageContent>
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
  header: {
    borderBottomWidth: BorderWidths.normal,
    paddingBottom: 10,
    marginBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    padding: 10,
  },
  headerImg: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 4,
  },
  headerText: {
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
    justifyContent: 'center',
  },
  albumItem: {
    margin: 10,
  },
  albumImg: {
    borderRadius: 4,
    marginBottom: 5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.20,
        shadowRadius: 1.41,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  albumTitle: {
    fontSize: 12,
    marginBottom: 3,
  },
  albumAuthor: {
    marginBottom: 5,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
})