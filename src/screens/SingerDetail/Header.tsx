import { forwardRef, useImperativeHandle, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import Image from '@/components/common/Image'
import { Icon } from '@/components/common/Icon'
import { navigations } from '@/navigation'
import { useI18n } from '@/lang'
import { useSingerInfo, type SingerTabType } from './state'
import { useStatusbarHeight } from '@/store/common/hook'
import ActionBar from './ActionBar'

const IMAGE_WIDTH = 70

export interface DetailInfo {
  name: string
  desc: string
  imgUrl?: string
}

export interface HeaderType {
  setInfo: (info: DetailInfo) => void
}

export interface HeaderProps {
  componentId: string
  onPlayAll?: () => void
  onBatchDownload?: () => void
  activeTab: SingerTabType
  onTabChange: (tab: SingerTabType) => void
}

const TAB_LIST: { label: string; key: SingerTabType }[] = [
  { label: '单曲', key: 'song' },
  { label: '专辑', key: 'album' },
]

export default forwardRef<HeaderType, HeaderProps>(({ componentId, onPlayAll, onBatchDownload, activeTab, onTabChange }, ref) => {
  const statusBarHeight = useStatusbarHeight()
  const theme = useTheme()
  const t = useI18n()
  const info = useSingerInfo()
  const [detailInfo, setDetailInfo] = useState<DetailInfo>({ name: info.name || '', desc: '', imgUrl: info.img })

  useImperativeHandle(ref, () => ({
    setInfo(info) {
      setDetailInfo(info)
    },
  }), [])

  const handleOpenIntro = () => {
    navigations.pushSingerIntroScreen(componentId, { name: detailInfo.name, img: detailInfo.imgUrl })
  }

  return (
    <View style={{ ...styles.container, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
      <View style={{ flexDirection: 'row', flexGrow: 0, flexShrink: 0, padding: 10 }}>
        <View style={{ ...styles.img, width: IMAGE_WIDTH, height: IMAGE_WIDTH }}>
          <Image url={detailInfo.imgUrl} style={{ flex: 1, borderRadius: 4 }} />
        </View>
        <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, paddingLeft: 5 }}>
          <Text size={15} numberOfLines={1} style={{ fontWeight: 'bold' }}>{detailInfo.name}</Text>
          <View style={{ flexGrow: 0, flexShrink: 1, marginTop: 2 }}>
            <TouchableOpacity
              onPress={handleOpenIntro}
              accessibilityRole="button"
              accessibilityLabel={t('singer_intro')}
              style={styles.introBtn}
            >
              <View style={styles.introTextWrap} importantForAccessibility="no-hide-descendants">
                <Text size={13} color={theme['c-font-label']} numberOfLines={2}>{detailInfo.desc || t('singer_intro')}</Text>
              </View>
              <Icon name="chevron-right" size={14} color={theme['c-font-label']} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      { activeTab === 'song' ? <ActionBar onPlayAll={onPlayAll} onBatchDownload={onBatchDownload} /> : null }
      {/* 选项卡 */}
      <View style={styles.tabBar}>
        {TAB_LIST.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onTabChange(tab.key)}
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text
              style={{
                ...styles.tabText,
                borderBottomColor: activeTab === tab.key ? theme['c-primary-background-active'] : 'transparent',
              }}
              color={activeTab === tab.key ? theme['c-primary-font-active'] : theme['c-font']}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    borderBottomWidth: BorderWidths.normal,
  },
  img: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  introBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 2,
  },
  introTextWrap: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 38,
    alignItems: 'center',
    paddingLeft: 5,
  },
  tabButton: {
    justifyContent: 'center',
    paddingLeft: 8,
    paddingRight: 8,
    height: '100%',
  },
  tabText: {
    textAlign: 'center',
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 3,
    paddingBottom: 3,
    borderBottomWidth: BorderWidths.normal3,
  },
})