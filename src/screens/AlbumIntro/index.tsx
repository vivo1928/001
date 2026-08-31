import { useEffect, useState } from 'react'
import { ScrollView, View, TouchableOpacity } from 'react-native'

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
import musicSdk from '@/utils/musicSdk'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export interface AlbumIntroInfo {
  id?: string
  name?: string
  singer?: string
  img?: string
  source?: LX.OnlineSource
  publish_date?: string
  song_count?: number
}

const Header = ({ title }: { title: string }) => {
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()

  const back = () => {
    void pop(commonState.componentIds.albumDetail!)
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

interface AlbumIntroData {
  name?: string
  img?: string
  desc?: string
  author?: string
  publish_date?: string
}

export default ({ componentId, info }: { componentId: string, info?: AlbumIntroInfo }) => {
  const theme = useTheme()
  const t = useI18n()
  const name = info?.name ?? ''
  const fallbackImg = info?.img
  const source = info?.source
  const albumId = info?.id
  const [detail, setDetail] = useState<AlbumIntroData>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoaded(false)
    if (!albumId || !source) {
      setLoaded(true)
      return
    }
    // 进入时重新拉取专辑详情，获取最新简介等
    void (async() => {
      try {
        const sdk = musicSdk[source] as { album?: { getAlbumDetail?: (...args: any[]) => Promise<{ info?: AlbumIntroData }>, getAlbumListDetail?: (...args: any[]) => Promise<{ info?: AlbumIntroData }> } } | undefined
        const albumApi = sdk?.album
        const getDetail = albumApi?.getAlbumDetail ?? albumApi?.getAlbumListDetail
        if (getDetail) {
          const res = await getDetail.call(albumApi, albumId, 1, 1)
          if (mounted && res?.info) setDetail(res.info)
        }
      } catch { /* keep basic info */ }
      if (mounted) setLoaded(true)
    })()
    return () => {
      mounted = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, source])

  const albumName = detail.name ?? name
  const albumImg = detail.img ?? fallbackImg
  const author = detail.author ?? info?.singer
  const publishDate = detail.publish_date ?? info?.publish_date
  const desc = (detail.desc ?? '').trim()
  const descParagraphs = desc.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const songCount = info?.song_count
  const hasContent = !!albumName || !!author || !!publishDate || descParagraphs.length > 0

  const infoRows: Array<{ label: string, value: string }> = []
  if (author) infoRows.push({ label: t('album_info_singer'), value: author })
  if (publishDate) infoRows.push({ label: t('album_info_publish'), value: publishDate })
  if (songCount) infoRows.push({ label: t('album_info_count'), value: String(songCount) })

  return (
    <PageContent>
      <Header title={t('album_intro')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {
          albumName
            ? <Text size={20} style={styles.title} color={theme['c-font']}>{albumName}</Text>
            : null
        }
        {
          loaded && !hasContent
            ? <Text size={15} color={theme['c-font-label']} style={styles.empty}>{t('album_intro_empty')}</Text>
            : null
        }
        {
          albumImg
            ? (
                <View style={styles.imgWrap}>
                  <Image url={albumImg} style={styles.img} />
                </View>
              )
            : null
        }
        {
          infoRows.length
            ? (
                <View style={styles.card}>
                  {infoRows.map((row, index) => (
                    <View key={row.label} style={[styles.fieldRow, index < infoRows.length - 1 ? styles.fieldRowBorder : null]}>
                      <Text size={14} color={theme['c-font-label']} style={styles.fieldLabel}>{row.label}</Text>
                      <Text size={14} color={theme['c-font']} style={styles.fieldValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              )
            : null
        }
        {
          descParagraphs.length
            ? <Text size={16} style={styles.sectionTitle} color={theme['c-font']}>{t('album_info_desc')}</Text>
            : null
        }
        {
          descParagraphs.map((p, i) => (
            <Text key={i} size={16} style={styles.paragraph} color={theme['c-font']}>{'\u3000\u3000' + p}</Text>
          ))
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
    width: 160,
    height: 160,
    borderRadius: 8,
  },
  card: {
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  fieldRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  fieldLabel: {
    width: 80,
    flexShrink: 0,
  },
  fieldValue: {
    flex: 1,
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
  empty: {
    textAlign: 'center',
    marginTop: 40,
  },
})
