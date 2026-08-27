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
import { getSingerFullInfo, type SingerField } from '@/core/singerInfo'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export interface SingerIntroInfo {
  name?: string
  img?: string
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
  const [profileName, setProfileName] = useState(name)
  const [img, setImg] = useState<string | null>(fallbackImg ?? null)
  const [fields, setFields] = useState<SingerField[]>([])
  const [biography, setBiography] = useState('')
  const [desc, setDesc] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoaded(false)
    if (!name) {
      setLoaded(true)
      return
    }
    // 每次进入都重新拉取，保证从艺历程等资料动态最新
    void getSingerFullInfo(name, true).then((res) => {
      if (!mounted) return
      setProfileName(res.name ?? name)
      setImg(res.img ?? fallbackImg ?? null)
      setFields(res.fields)
      setBiography(res.biography)
      setDesc(res.desc)
      setLoaded(true)
    })
    return () => {
      mounted = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const biographyParagraphs = biography.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const hasBiography = biographyParagraphs.length > 0
  const hasFields = fields.length > 0
  const hasDesc = desc.length > 0
  const hasContent = hasFields || hasBiography || hasDesc

  return (
    <PageContent>
      <Header title={t('singer_intro')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
          hasFields
            ? (
                <View style={styles.card}>
                  {fields.map((field, index) => (
                    <View key={field.label} style={[styles.fieldRow, index < fields.length - 1 ? styles.fieldRowBorder : null]}>
                      <Text size={14} color={theme['c-font-label']} style={styles.fieldLabel}>{field.label}</Text>
                      <Text size={14} color={theme['c-font']} style={styles.fieldValue}>{field.value}</Text>
                    </View>
                  ))}
                </View>
              )
            : null
        }
        {
          hasBiography || hasDesc
            ? (
                <Text size={16} style={styles.sectionTitle} color={theme['c-font']}>{t('singer_info_career')}</Text>
              )
            : null
        }
        {
          hasDesc
            ? (
                <Text size={16} style={styles.paragraph} color={theme['c-font']}>{'\u3000\u3000' + desc}</Text>
              )
            : null
        }
        {
          hasBiography
            ? biographyParagraphs.map((p, i) => (
                // 去除维基章节标题残留（如 "早年"、"音乐事业"），作为非缩进段落展示
                <Text key={i} size={16} style={styles.paragraph} color={theme['c-font']}>
                  {(/^==|^===\s*$/.test(p)) || ((/^[^，。？！]{1,20}$/.test(p)) && p.length <= 12) ? p : '\u3000\u3000' + p}
                </Text>
            ))
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
