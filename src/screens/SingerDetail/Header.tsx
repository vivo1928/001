import { forwardRef, useImperativeHandle, useState } from 'react'
import { View, TouchableOpacity, Alert } from 'react-native'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { pop } from '@/navigation'
import commonState from '@/store/common/state'
import { useStatusbarHeight } from '@/store/common/hook'
import ActionBar from './ActionBar'
import { useSingerInfo, type SingerTabType } from './state'

const BAR_HEIGHT = 38

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

// 与排行榜 HeaderBar 一致的紧凑头部：顶栏（返回 + 歌手名 + 歌手信息）+ 操作栏 + 选项卡，
// 减少读屏焦点停留次数，歌手简介改为按需弹窗查看，避免每次滑动都要读完长文本
const TAB_LIST: { labelKey: 'singer_tab_song' | 'singer_tab_album', key: SingerTabType }[] = [
  { labelKey: 'singer_tab_song', key: 'song' },
  { labelKey: 'singer_tab_album', key: 'album' },
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

  const back = () => {
    void pop(commonState.componentIds.singerDetail!)
  }

  const showIntro = () => {
    Alert.alert(detailInfo.name || info.name || t('singer_intro'), detailInfo.desc || t('singer_intro'), [
      { text: t('ok') },
    ])
  }

  return (
    <View style={{ ...styles.container, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={back} accessibilityLabel={t('back')} accessibilityRole="button">
          <Icon name="chevron-left" size={18} />
        </TouchableOpacity>
        <Text numberOfLines={1} size={16} style={styles.title} accessibilityLabel={detailInfo.name}>{detailInfo.name}</Text>
        <TouchableOpacity style={styles.introButton} onPress={showIntro} accessibilityLabel={t('singer_intro')} accessibilityRole="button">
          <Text size={13} color={theme['c-font-label']}>{t('singer_intro')}</Text>
        </TouchableOpacity>
      </View>
      { activeTab === 'song' ? <ActionBar onPlayAll={onPlayAll} onBatchDownload={onBatchDownload} /> : null }
      {/* 选项卡 */}
      <View style={styles.tabBar}>
        {TAB_LIST.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onTabChange(tab.key)}
            accessibilityLabel={t(tab.labelKey)}
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
              {t(tab.labelKey)}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: 4,
  },
  backButton: {
    width: 44,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  introButton: {
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 12,
    height: '100%',
  },
  tabBar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
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
