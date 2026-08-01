import { useEffect, useRef, useState, useCallback } from 'react'
import { View, FlatList, TouchableOpacity, RefreshControl } from 'react-native'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import { useStatusbarHeight } from '@/store/common/hook'
import { createStyle } from '@/utils/tools'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { getAlbumDetail } from '@/core/audiobook/search'
import { addListMusics } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import settingState from '@/store/setting/state'
import { getListMusicSync } from '@/utils/listManage'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import PlayerBar from '@/components/player/PlayerBar'

interface AlbumDetailInfo {
  id: string
  name: string
  author?: string
  img?: string
  source: string
}

interface EpisodeItem {
  songmid: string
  name: string
  singer: string
  interval: string
  albumName: string
  albumId: string
  source: string
  img: string
  hash: string
  isAudiobook: boolean
  trackId: string
  types: { type: string; size: null }[]
  _types: Record<string, { size: null }>
  typeUrl: Record<string, string>
  playUrl: string
  playSize: number
  lrc: null
  otherSource: null
}

const IMAGE_WIDTH = 70

export default ({ componentId, info }: { componentId: string, info: AlbumDetailInfo }) => {
  const statusBarHeight = useStatusbarHeight()
  const theme = useTheme()
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [albumInfo, setAlbumInfo] = useState<{ name: string; img: string; desc: string; author: string }>({
    name: info.name || '',
    img: info.img || '',
    desc: info.author || '',
    author: info.author || '',
  })
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.audiobookAlbumDetail, componentId)
    isUnmountedRef.current = false
    loadEpisodes()
    return () => { isUnmountedRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadEpisodes = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      console.log('[AudiobookAlbumDetail] loading album:', info.id, info.source)
      const result = await getAlbumDetail(info.id, info.source as any)
      console.log('[AudiobookAlbumDetail] result:', result?.list?.length, 'episodes')
      if (!isUnmountedRef.current) {
        setEpisodes(result.list || [])
        if (result.info) {
          setAlbumInfo({
            name: result.info.name || info.name || '',
            img: result.info.img || info.img || '',
            desc: result.info.desc || result.info.author || info.author || '',
            author: result.info.author || info.author || '',
          })
        }
        setLoading(false)
      }
    } catch (err: any) {
      console.error('[AudiobookAlbumDetail] load error:', err?.message || err)
      if (!isUnmountedRef.current) {
        setErrorMsg(err?.message || '加载失败')
        setLoading(false)
      }
    }
  }, [info.id, info.source, info.name, info.img, info.author])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await getAlbumDetail(info.id, info.source as any)
      if (!isUnmountedRef.current) {
        setEpisodes(result.list || [])
        setRefreshing(false)
      }
    } catch (err: any) {
      if (!isUnmountedRef.current) {
        setRefreshing(false)
      }
    }
  }, [info.id, info.source])

  const handlePlayEpisode = useCallback((episode: EpisodeItem) => {
    console.log('[AudiobookAlbumDetail] play episode:', episode.name)
    const episodeImg = episode.img || albumInfo.img || ''
    const musicInfo = {
      id: episode.songmid,
      name: episode.name,
      singer: episode.singer || episode.albumName || '',
      albumName: episode.albumName || '',
      albumId: episode.albumId,
      interval: episode.interval || '00:00',
      source: episode.source || 'xm',
      img: episodeImg,
      hash: episode.hash || episode.songmid,
      songmid: episode.songmid,
      types: episode.types,
      _types: episode._types,
      typeUrl: episode.typeUrl,
      isAudiobook: true,
      lrc: null,
      otherSource: null,
      meta: {
        songId: episode.songmid,
        albumName: episode.albumName || '',
        picUrl: episodeImg,
        qualitys: episode.types,
        _qualitys: episode._types,
        hash: episode.hash || episode.songmid,
        xmPlayUrl: episode.playUrl || '',
        xmTypeUrl: episode.typeUrl || {},
      },
    } as any

    void addListMusics(LIST_IDS.DEFAULT, [musicInfo], settingState.setting['list.addMusicLocationType']).then(() => {
      const idx = getListMusicSync(LIST_IDS.DEFAULT).findIndex((m: any) => m.id == musicInfo.id)
      if (idx < 0) {
        console.warn('[AudiobookAlbumDetail] episode not found in list after add')
        return
      }
      void playList(LIST_IDS.DEFAULT, idx)
    })
  }, [albumInfo.img])

  const renderEpisode = useCallback(({ item, index }: { item: EpisodeItem; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.5}
      onPress={() => handlePlayEpisode(item)}
      style={{ ...styles.episodeItem, borderBottomColor: theme['c-border-background'] }}
    >
      <Text style={styles.episodeIndex} size={12} color={theme['c-font-label']}>{index + 1}</Text>
      <View style={styles.episodeInfo}>
        <Text numberOfLines={1} size={14}>{item.name}</Text>
        <Text numberOfLines={1} size={11} color={theme['c-font-label']}>{item.interval || ''}</Text>
      </View>
    </TouchableOpacity>
  ), [handlePlayEpisode, theme])

  const keyExtractor = useCallback((item: EpisodeItem, index: number) => `${item.songmid}_${index}`, [])

  const renderHeader = () => (
    <View style={{ ...styles.header, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
      <View style={styles.headerContent}>
        <View style={{ ...styles.headerImg, width: IMAGE_WIDTH, height: IMAGE_WIDTH }}>
          <Image url={albumInfo.img} style={{ flex: 1, borderRadius: 4 }} />
        </View>
        <View style={styles.headerText}>
          <Text size={14} numberOfLines={2}>{albumInfo.name}</Text>
          {albumInfo.author ? <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{albumInfo.author}</Text> : null}
          {albumInfo.desc ? <Text size={11} color={theme['c-font-label']} numberOfLines={2}>{albumInfo.desc}</Text> : null}
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
          <Text color={theme['c-font-label']} size={14} onPress={loadEpisodes}>{errorMsg}</Text>
        </View>
      )
    }
    return (
      <View style={styles.emptyContainer}>
        <Text color={theme['c-font-label']} size={14}>暂无剧集</Text>
      </View>
    )
  }

  return (
    <PageContent>
      <StatusBar />
      <FlatList
        style={styles.list}
        data={episodes}
        renderItem={renderEpisode}
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
      <PlayerBar />
    </PageContent>
  )
}

const styles = createStyle({
  list: {
    flex: 1,
  },
  header: {
    borderBottomWidth: BorderWidths.normal,
    paddingBottom: 10,
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
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: BorderWidths.normal,
  },
  episodeIndex: {
    width: 30,
    textAlign: 'center',
    marginRight: 10,
  },
  episodeInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
})