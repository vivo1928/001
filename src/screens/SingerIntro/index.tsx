import { memo, useMemo } from 'react'
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
import singerDetailState from '@/store/singerDetail/state'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export interface SingerIntroInfo {
  name?: string
  img?: string
}

const Header = memo(() => {
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
        <Text numberOfLines={1} size={16} style={styles.headerTitle}>{t('singer_intro')}</Text>
      </View>
    </View>
  )
})

export default memo(({ componentId, info }: { componentId: string, info?: SingerIntroInfo }) => {
  const theme = useTheme()
  const t = useI18n()
  const singerInfo = singerDetailState.singerInfo
  const name = singerInfo?.name || info?.name || ''
  const img = singerInfo?.img || info?.img || ''
  const desc = singerInfo?.desc || ''

  const paragraphs = useMemo(() => {
    return desc.split(/\n+/).map(s => s.trim()).filter(Boolean)
  }, [desc])

  return (
    <PageContent>
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {
          name
            ? <Text size={20} style={styles.title} color={theme['c-font']}>{name}</Text>
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
          paragraphs.length
            ? paragraphs.map((p, i) => (
                <Text key={i} size={16} style={styles.paragraph} color={theme['c-font']}>{'\u3000\u3000' + p}</Text>
              ))
            : <Text size={15} color={theme['c-font-label']} style={styles.empty}>{t('singer_intro_empty')}</Text>
        }
      </ScrollView>
    </PageContent>
  )
})

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
