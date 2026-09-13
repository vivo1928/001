import { useRef, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import playerState from '@/store/player/state'
import SingerSelectModal, { type SingerSelectModalType } from './SingerSelectModal'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { splitSingers } from './splitSingers'

interface SingerJumpInfo {
  singer: string
  source: LX.OnlineSource
}

// 提取当前在线歌曲的歌手与来源；本地/下载任务返回 null
const getJumpInfo = (): SingerJumpInfo | null => {
  const musicInfo = playerState.playMusicInfo.musicInfo
  // 本地歌曲（含 progress 字段）或下载任务（Download.ListItem）不提供跳转
  if (!musicInfo || 'progress' in musicInfo) return null
  const mi = musicInfo as { source?: unknown, singer?: unknown }
  const source = typeof mi.source === 'string' ? mi.source as LX.OnlineSource : null
  const singer = typeof mi.singer === 'string' ? mi.singer : ''
  if (!source || !singer) return null
  return { singer, source }
}

export default ({ onCloseSettingPopup }: { onCloseSettingPopup?: (callback?: () => void) => void }) => {
  const theme = useTheme()
  const t = useI18n()
  const modalRef = useRef<SingerSelectModalType>(null)

  const handleJumpToSinger = useCallback((singerName: string, source: LX.OnlineSource) => {
    // 先关闭设置弹窗（隐藏其读屏内容），等弹窗完全关闭后再 push 独立的"跳转中"页面，
    // 确保读屏焦点直接落在跳转页面，不会落回"播放设置"
    onCloseSettingPopup?.(() => {
      navigations.pushJumpingScreen(commonState.componentIds.playDetail!, {
        type: 'singer',
        singerName,
        source,
      })
    })
  }, [onCloseSettingPopup])

  const handlePress = useCallback(() => {
    const info = getJumpInfo()
    if (!info) return
    const list = splitSingers(info.singer)
    if (list.length <= 1) {
      // 单歌手直接跳转
      handleJumpToSinger(list[0] || info.singer, info.source)
    } else {
      // 合唱：弹出歌手选择
      modalRef.current?.show(list)
    }
  }, [handleJumpToSinger])

  const info = getJumpInfo()

  // 无在线歌曲时不渲染（本地/无播放）
  if (!info) return null

  return (
    <View>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={handlePress}
        accessibilityLabel={`${t('play_detail_setting_jump_singer')}，${info.singer}`}
        accessibilityRole="button"
      >
        <Text>{t('play_detail_setting_jump_singer')}</Text>
        <Text size={13} color={theme['c-font-label']} numberOfLines={1} style={styles.value}>{info.singer}</Text>
      </TouchableOpacity>
      <SingerSelectModal
        ref={modalRef}
        onSelect={(singer) => { handleJumpToSinger(singer, info.source) }}
      />
    </View>
  )
}

const styles = createStyle({
  settingRow: {
    paddingTop: 5,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    flexShrink: 1,
    marginLeft: 10,
  },
})
