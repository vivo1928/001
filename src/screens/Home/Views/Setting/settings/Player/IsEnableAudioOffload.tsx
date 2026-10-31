import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'
import { applyAudioModeForQuality } from '@/core/music/audioMode'
import { getPlayQuality } from '@/core/music/utils'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'


import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const isEnableAudioOffload = useSettingValue('player.isEnableAudioOffload')
  const setHandleAudioFocus = (isEnableAudioOffload: boolean) => {
    updateSetting({ 'player.isEnableAudioOffload': isEnableAudioOffload })
    // 立即按当前播放音质重新应用输出模式，无需重启或切歌即可生效
    const musicInfo = playerState.playMusicInfo.musicInfo
    let quality: LX.Quality | null = null
    if (musicInfo && musicInfo.source != 'local' && !('progress' in musicInfo)) {
      quality = getPlayQuality(settingState.setting['player.playQuality'], musicInfo as LX.Music.MusicInfoOnline)
    }
    void applyAudioModeForQuality(quality)
    toast(t('setting_play_audio_offload_tip'))
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isEnableAudioOffload}
        onChange={setHandleAudioFocus}
        helpDesc={t('setting_play_audio_offload_tip')}
        label={t('setting_play_audio_offload')}
      />
    </View>
  )
})


const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
