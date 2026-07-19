import { memo, useMemo, useEffect, useState, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Header from './components/Header'
import { Icon } from '@/components/common/Icon'
import CommentHot from './CommentHot'
import CommentNew from './CommentNew'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { COMPONENT_IDS } from '@/config/constant'
import { setComponentId } from '@/core/common'
import PageContent from '@/components/PageContent'
import playerState from '@/store/player/state'
import { scaleSizeH } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'

type ActiveId = 'hot' | 'new'

const BAR_HEIGHT = scaleSizeH(34)

const HeaderItem = ({ id, label, isActive, onPress }: {
  id: ActiveId
  label: string
  isActive: boolean
  onPress: (id: ActiveId) => void
}) => {
  const theme = useTheme()
  const components = useMemo(() => (
    <TouchableOpacity style={styles.tabBtn} onPress={() => { !isActive && onPress(id) }}
        accessibilityLabel={label} accessibilityRole="tab" accessibilityState={{ selected: isActive }}>
      <Text color={isActive ? theme['c-primary-font-active'] : theme['c-font']}>{label}</Text>
    </TouchableOpacity>
  ), [isActive, theme, label, onPress, id])

  return components
}

const getMusicInfo = (musicInfo: LX.Player.PlayMusic | null) => {
  if (!musicInfo) return null
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}
export default memo(({ componentId }: {
  componentId: string
}) => {
  const [activeId, setActiveId] = useState<ActiveId>('hot')
  const [musicInfo, setMusicInfo] = useState<LX.Music.MusicInfo | null>(getMusicInfo(playerState.playMusicInfo.musicInfo))
  const t = useI18n()
  const theme = useTheme()
  const [total, setTotal] = useState({ hot: 0, new: 0 })

  useEffect(() => {
    setComponentId(COMPONENT_IDS.comment, componentId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = useMemo(() => {
    return [
      { id: 'hot' as const, label: t('comment_tab_hot', { total: total.hot ? `(${total.hot})` : '' }) },
      { id: 'new' as const, label: t('comment_tab_new', { total: total.new ? `(${total.new})` : '' }) },
    ]
  }, [total, t])

  const toggleTab = useCallback((id: ActiveId) => {
    setActiveId(id)
  }, [])

  const refreshComment = useCallback(() => {
    if (!playerState.playMusicInfo.musicInfo) return
    let playerMusicInfo = playerState.playMusicInfo.musicInfo
    if ('progress' in playerMusicInfo) playerMusicInfo = playerMusicInfo.metadata.musicInfo

    if (musicInfo && musicInfo.id == playerMusicInfo.id) {
      toast(t('comment_refresh', { name: musicInfo.name }))
      return
    }
    setMusicInfo(playerMusicInfo)
  }, [musicInfo, t])

  const setHotTotal = useCallback((total: number) => {
    setTotal(totalInfo => ({ ...totalInfo, hot: total }))
  }, [])
  const setNewTotal = useCallback((total: number) => {
    setTotal(totalInfo => ({ ...totalInfo, new: total }))
  }, [])

  const commentComponent = useMemo(() => {
    return (
      <View style={styles.container}>
        <View style={{ ...styles.tabHeader, borderBottomColor: theme['c-border-background'], height: BAR_HEIGHT }}>
          <View style={styles.left}>
            {tabs.map(({ id, label }) => <HeaderItem id={id} label={label} key={id} isActive={activeId == id} onPress={toggleTab} />)}
          </View>
          <View>
            <TouchableOpacity onPress={refreshComment} style={{ ...styles.btn, width: BAR_HEIGHT }}>
              <Icon name="available_updates" size={20} color={theme['c-600']} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.pageStyle}>
          { activeId == 'hot' ? <CommentHot musicInfo={musicInfo as LX.Music.MusicInfoOnline} onUpdateTotal={setHotTotal} /> : null }
          { activeId == 'new' ? <CommentNew musicInfo={musicInfo as LX.Music.MusicInfoOnline} onUpdateTotal={setNewTotal} /> : null }
        </View>
      </View>
    )
  }, [activeId, musicInfo, refreshComment, setHotTotal, setNewTotal, tabs, theme, toggleTab])

  return (
    <PageContent>
      {
        musicInfo == null
          ? null
          : <>
            <Header musicInfo={musicInfo} />
            {
              musicInfo.source == 'local'
                ? (
                <View style={{ ...styles.container, alignItems: 'center', justifyContent: 'center' }}>
                  <Text>{t('comment_not support')}</Text>
                </View>
                  )
                : commentComponent
            }
        </>
      }
    </PageContent>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  tabHeader: {
    flexDirection: 'row',
    paddingRight: 10,
    borderBottomWidth: BorderWidths.normal,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    paddingLeft: 5,
  },
  tabBtn: {
    paddingLeft: 10,
    paddingRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  pageStyle: {
    flex: 1,
    overflow: 'hidden',
  },
})