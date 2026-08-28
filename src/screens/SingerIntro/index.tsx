import { useEffect, useState, useRef, useCallback } from 'react'
import { ScrollView, View, TouchableOpacity, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { scaleSizeH } from '@/utils/pixelRatio'
import commonState from '@/store/common/state'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import PageContent from '@/components/PageContent'
import { getSingerFullInfo, getSingerAlbumPage, type SingerLatestAlbum, type SingerLatestSong } from '@/core/singerInfo'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export interface SingerIntroInfo {
  name?: string
  img?: string
  source?: LX.OnlineSource
  id?: string
}

const Header = ({ title }: { title: string }) => {
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()

  const back = () => {
    void pop(commonState.componentIds.singerDetail!)
  }

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}>
      <StatusBar />
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={back} style={{ ...styles.headerBtn, width: HEADER_HEIGHT }}
          accessibilityLabel={t('back')} accessibilityRole="button">
          <Icon name="chevron-left" size={18} />
        </TouchableOpacity>
        <Text numberOfLines={1} size={16} style={styles.headerTitle}>{title}</Text>
      </View>
    </View>
  )
}

export default ({ componentId, info }: { componentId: string, info?: SingerIntroInfo }) => {
  const theme = useTheme()
  const t = useI18n()
  const name = info?.name ?? ''
  const fallbackImg = info?.img
  const source = info?.source
  const singerId = info?.id
  const [profileName, setProfileName] = useState(name)
  const [img, setImg] = useState<string | null>(fallbackImg ?? null)
  const [biography, setBiography] = useState('')
  const [awards, setAwards] = useState<string[]>([])
  const [latestSongs, setLatestSongs] = useState<SingerLatestSong[]>([])
  const [latestAlbums, setLatestAlbums] = useState<SingerLatestAlbum[]>([])
  const [hasMoreAlbums, setHasMoreAlbums] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const albumPageRef = useRef(1)
  const mountedRef = useRef(true)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    let mounted = true
    mountedRef.current = true
    albumPageRef.current = 1
    setLoaded(false)
    setAwards([])
    setLatestSongs([])
    setLatestAlbums([])
    setHasMoreAlbums(false)
    if (!name || !source || !singerId) {
      setLoaded(true)
      return
    }
    void getSingerFullInfo(source, singerId, name).then((res) => {
      if (!mounted) return
      setProfileName(res.name ?? name)
      setImg(res.img ?? fallbackImg ?? null)
      setBiography(res.biography)
      setAwards(res.awards)
      setLatestSongs(res.latestSongs)
      setLatestAlbums(res.latestAlbums)
      setHasMoreAlbums(res.latestMore)
      setLoaded(true)
    })
    return () => {
      mounted = false
      mountedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const loadMoreAlbums = useCallback(async() => {
    if (!source || !singerId || !hasMoreAlbums || loadingMoreRef.current || loadingMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const page = albumPageRef.current + 1
      const res = await getSingerAlbumPage(source, singerId, page)
      if (!mountedRef.current) return
      albumPageRef.current = page
      if (res.list.length) setLatestAlbums(prev => [...prev, ...res.list])
      setHasMoreAlbums(res.more)
    } finally {
      loadingMoreRef.current = false
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [source, singerId, hasMoreAlbums, loadingMore])

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    // 接近底部时加载下一页
    if (contentSize.height - (layoutMeasurement.height + contentOffset.y) < 80) void loadMoreAlbums()
  }

  const biographyParagraphs = biography.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const hasBiography = biographyParagraphs.length > 0
  const hasAwards = awards.length > 0
  const hasSongs = latestSongs.length > 0
  const hasAlbums = latestAlbums.length > 0
  const hasLatest = hasSongs || hasAlbums
  const hasContent = hasBiography || hasAwards || hasLatest

  return (
    <PageContent>
      <Header title={t('singer_intro')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        onScroll={handleScroll} scrollEventThrottle={64}>
        {
          profileName
            ? <Text size={20} style={styles.title} color={theme['c-font']}>{profileName}</Text>
            : null
        }
        {
          loaded && !hasContent
            ? <Text size={15} color={theme['c-font-label']} style={styles.empty}>{t('singer_intro_empty')}</Text>
            : null
        }
        {
          img
            ? (
                <View style={styles.imgWrap}>
                  <Image url={img} style={styles.img} />
                </View>
              )
            : null
        }
        {
          hasBiography
            ? <Text size={16} style={styles.sectionTitle} color={theme['c-font']}>{t('singer_info_career')}</Text>
            : null
        }
        {
          hasBiography
            ? biographyParagraphs.map((p, i) => (
                <Text key={i} size={16} style={styles.paragraph} color={theme['c-font']}>{'\u3000\u3000' + p}</Text>
            ))
            : null
        }
        {
          hasAwards
            ? <Text size={16} style={styles.sectionTitle} color={theme['c-font']}>{t('singer_info_awards')}</Text>
            : null
        }
        {
          hasAwards
            ? awards.map((award, i) => (
                <Text key={i} size={16} style={styles.paragraph} color={theme['c-font']}>{'\u3000\u3000' + award}</Text>
            ))
            : null
        }
        {
          hasSongs
            ? <Text size={16} style={styles.sectionTitle} color={theme['c-font']}>{t('singer_info_latest_songs')}</Text>
            : null
        }
        {
          hasSongs
            ? latestSongs.map((song) => (
                <View key={`${song.songId}_${song.publishDate}`} style={styles.albumRow}>
                  {
                    song.img
                      ? <Image url={song.img} style={styles.albumImg} />
                      : <View style={styles.albumImgPlaceholder} />
                  }
                  <View style={styles.albumInfo}>
                    <Text size={15} numberOfLines={1} color={theme['c-font']} style={styles.albumName}>{song.name}</Text>
                    <Text size={13} color={theme['c-font-label']}>{song.publishDate}{song.albumName ? ` · ${song.albumName}` : ''}</Text>
                  </View>
                </View>
            ))
            : null
        }
        {
          hasAlbums
            ? <Text size={16} style={styles.sectionTitle} color={theme['c-font']}>{t('singer_info_latest_albums')}</Text>
            : null
        }
        {
          hasAlbums
            ? latestAlbums.map((album) => (
                <View key={`${album.albumId}_${album.publishDate}`} style={styles.albumRow}>
                  {
                    album.img
                      ? <Image url={album.img} style={styles.albumImg} />
                      : <View style={styles.albumImgPlaceholder} />
                  }
                  <View style={styles.albumInfo}>
                    <Text size={15} numberOfLines={1} color={theme['c-font']} style={styles.albumName}>{album.name}</Text>
                    <Text size={13} color={theme['c-font-label']}>{album.publishDate}</Text>
                  </View>
                </View>
            ))
            : null
        }
        {
          hasMoreAlbums && loadingMore
            ? <Text size={13} color={theme['c-font-label']} style={styles.loadingMore}>{t('loading')}</Text>
            : null
        }
      </ScrollView>
    </PageContent>
  )
}

const styles = createStyle({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 40,
  },
  headerBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  imgWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  img: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 28,
    marginBottom: 14,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  albumImg: {
    width: 52,
    height: 52,
    borderRadius: 6,
  },
  albumImgPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  albumInfo: {
    flex: 1,
    marginLeft: 12,
  },
  albumName: {
    marginBottom: 4,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
  },
  loadingMore: {
    textAlign: 'center',
    paddingVertical: 12,
  },
})
