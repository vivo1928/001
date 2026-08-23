import { useRef, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import QualitySelectPopup, { type QualitySelectPopupType } from './QualitySelectPopup'
import { getTempPlayQuality } from '@/core/music/utils'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'

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
    popupRef.current?.show(musicInfo as LX.Music.MusicInfoOnline)
  }, [])

  // 当前实际使用的音质：临时覆盖 > 全局默认
  const tempQ = getTempPlayQuality()
  const currentQuality = tempQ ?? settingState.setting['player.playQuality']
  const qualityLabel = QUALITY_LABEL_MAP[currentQuality] || currentQuality

  return (
    <View>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={handlePress}
        accessibilityLabel={`${t('play_detail_quality')}，${qualityLabel}`}
        accessibilityRole="button"
      >
        <Text>{t('play_detail_quality')}</Text>
        <Text size={13} color={theme['c-font-label']}>{qualityLabel}</Text>
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