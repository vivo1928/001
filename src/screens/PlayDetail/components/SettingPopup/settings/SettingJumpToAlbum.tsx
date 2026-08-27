import { useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import playerState from '@/store/player/state'
import { jumpToAlbum } from './jumpAction'

interface AlbumJumpInfo {
  albumId: string | number
  albumName: string
  source: string
  singer: string
  picUrl?: string | null
}

// 提取当前在线歌曲的专辑信息；本地/下载任务或缺失专辑 id 返回 null
const getAlbumJumpInfo = (): AlbumJumpInfo | null => {
  const musicInfo = playerState.playMusicInfo.musicInfo
  // 本地歌曲（含 progress 字段）或下载任务（Download.ListItem）不提供跳转
  if (!musicInfo || 'progress' in musicInfo) return null
  const mi = musicInfo as { source?: unknown, singer?: unknown, meta?: { albumId?: unknown, albumName?: unknown, picUrl?: unknown } }
  const meta = mi.meta
  const albumId = meta?.albumId
  if (!meta || albumId == null) return null
  const source = typeof mi.source === 'string' ? mi.source : ''
  if (!source) return null
  return {
    albumId: albumId as string | number,
    albumName: typeof meta.albumName === 'string' ? meta.albumName : '',
    source,
    singer: typeof mi.singer === 'string' ? mi.singer : '',
    picUrl: typeof meta.picUrl === 'string' ? meta.picUrl : null,
  }
}

export default ({ onCloseSettingPopup }: { onCloseSettingPopup?: () => void }) => {
  const theme = useTheme()
  const t = useI18n()

  const handlePress = useCallback(() => {
    const info = getAlbumJumpInfo()
    if (!info) return
    jumpToAlbum({
      source: info.source,
      name: info.albumName || '',
      singer: info.singer,
      meta: {
        albumId: info.albumId,
        albumName: info.albumName,
        picUrl: info.picUrl,
      },
    }, onCloseSettingPopup)
  }, [onCloseSettingPopup])

  const info = getAlbumJumpInfo()

  // 无在线歌曲或缺失专辑 id 时不渲染
  if (!info) return null

  return (
    <View>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={handlePress}
        accessibilityLabel={`${t('play_detail_setting_jump_album')}，${info.albumName}`}
        accessibilityRole="button"
      >
        <Text>{t('play_detail_setting_jump_album')}</Text>
        <Text size={13} color={theme['c-font-label']} numberOfLines={1} style={styles.value}>{info.albumName}</Text>
      </TouchableOpacity>
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
