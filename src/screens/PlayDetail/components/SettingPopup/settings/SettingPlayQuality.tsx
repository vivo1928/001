import { useRef, useCallback, useMemo } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import QualitySelectPopup, { type QualitySelectPopupType } from './QualitySelectPopup'
import { getTempPlayQuality } from '@/core/music/utils'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'

const QUALITYS_ORDER: import('@/types/common').LX.Quality[] = [
  'master', 'atmos_plus', 'atmos', 'flac24bit', 'hires',
  'flac', 'ape', 'wav', '320k', '192k', '128k', '64k', '32k',
]

const QUALITY_LABEL_MAP: Record<string, string> = {
  '128k': '128k',
  '192k': '192k',
  '320k': '320k',
  flac: 'FLAC',
  flac24bit: '24bit',
  hires: 'Hi-Res',
  atmos: '全景声',
  atmos_plus: '杜比全景声',
  master: '母带',
  ape: 'APE',
  wav: 'WAV',
}

export default ({ onCloseSettingPopup }: { onCloseSettingPopup?: () => void }) => {
  const theme = useTheme()
  const t = useI18n()
  const popupRef = useRef<QualitySelectPopupType>(null)

  const handlePress = useCallback(() => {
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo || 'progress' in musicInfo) return
    popupRef.current?.show(musicInfo as import('@/types/music').LX.Music.MusicInfoOnline)
  }, [])

  // 根据当前歌曲的 _qualitys 计算实际可用的音质标签
  const currentQualityLabel = useMemo(() => {
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo || 'progress' in musicInfo) {
      const tempQ = getTempPlayQuality()
      const q = tempQ ?? settingState.setting['player.playQuality']
      return QUALITY_LABEL_MAP[q] || q
    }
    const _qualitys = (musicInfo as any).meta?._qualitys ?? {}
    // 优先使用临时覆盖音质
    const tempQ = getTempPlayQuality()
    if (tempQ && _qualitys[tempQ] != null) return QUALITY_LABEL_MAP[tempQ] || tempQ
    // 再使用全局设置音质，检查当前歌曲是否支持
    const settingQ = settingState.setting['player.playQuality']
    if (_qualitys[settingQ] != null) return QUALITY_LABEL_MAP[settingQ] || settingQ
    // 都不支持时，取当前歌曲实际可用的最高音质
    for (const q of QUALITYS_ORDER) {
      if (_qualitys[q] != null) return QUALITY_LABEL_MAP[q] || q
    }
    return settingQ
  }, [playerState.playMusicInfo])

  return (
    <View>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={handlePress}
        accessibilityLabel={`${t('play_detail_quality')}，${currentQualityLabel}`}
        accessibilityRole="button"
      >
        <Text>{t('play_detail_quality')}</Text>
        <Text size={13} color={theme['c-font-label']}>{currentQualityLabel}</Text>
      </TouchableOpacity>
      <QualitySelectPopup ref={popupRef} onCloseSettingPopup={onCloseSettingPopup} />
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
})