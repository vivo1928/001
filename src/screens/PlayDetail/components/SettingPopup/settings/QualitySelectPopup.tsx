import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { getMusicUrl } from '@/core/music/online'
import { setResource } from '@/plugins/player'
import { setTempPlayQuality, getTempPlayQuality } from '@/core/music/utils'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'

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

const QUALITYS_ORDER: import('@/types/common').LX.Quality[] = [
  'master', 'atmos_plus', 'atmos', 'flac24bit', 'hires',
  'flac', 'ape', 'wav', '320k', '192k', '128k', '64k', '32k',
]

export interface QualitySelectPopupType {
  show: (musicInfo: LX.Music.MusicInfoOnline) => void
}

export default forwardRef<QualitySelectPopupType, { onCloseSettingPopup?: () => void }>(({ onCloseSettingPopup }, ref) => {
  const theme = useTheme()
  const t = useI18n()
  const popupRef = useRef<PopupType>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [qualities, setQualities] = useState<LX.Quality[]>([])
  const [musicInfo, setMusicInfo] = useState<LX.Music.MusicInfoOnline | null>(null)
  const [error, setError] = useState('')

  useImperativeHandle(ref, () => ({
    show(mi: LX.Music.MusicInfoOnline) {
      setMusicInfo(mi)
      setError('')
      setQualities([])
      setLoading(true)
      if (visible) popupRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => popupRef.current?.setVisible(true))
      }
      setTimeout(() => {
        loadQualities(mi)
      }, 100)
    },
  }))

  const loadQualities = useCallback((mi: LX.Music.MusicInfoOnline) => {
    try {
      const _qualitys = mi.meta._qualitys ?? {}
      const result: LX.Quality[] = []
      for (const q of QUALITYS_ORDER) {
        if (_qualitys[q] != null) result.push(q)
      }
      setQualities(result)
      if (result.length === 0) {
        setError(t('play_detail_quality_no_available'))
      }
    } catch (e: any) {
      setError(e.message || t('play_detail_quality_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const handleSelect = useCallback(async (q: LX.Quality) => {
    if (!musicInfo) return
    setLoading(false)
    setQualities([])
    popupRef.current?.setVisible(false)
    // 关闭 SettingPopup
    onCloseSettingPopup?.()
    setTimeout(() => {
      setVisible(false)
    }, 300)

    try {
      const position = playerState.progress.nowPlayTime
      setTempPlayQuality(q)
      // isRefresh=true 已保证绕过 URL 缓存获取新 URL，无需额外清除播放缓存
      // 保留旧缓存可避免 CDN 慢时播放器无资源可用
      const url = await getMusicUrl({ musicInfo, quality: q, isRefresh: true, allowToggleSource: false, onToggleSource: () => {} })
      if (!url) {
        setTempPlayQuality(null)
        return
      }
      setResource(musicInfo, url, position)
    } catch (err) {
      setTempPlayQuality(null)
    }
  }, [musicInfo])

  const currentQuality = getTempPlayQuality() ?? settingState.setting['player.playQuality']

  return visible ? (
    <Popup ref={popupRef} title={t('play_detail_quality_title')}>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={theme['c-primary']} />
            <Text style={styles.loadingText}>{t('play_detail_quality_loading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text color={theme['c-danger'] || '#ff4444'}>{error}</Text>
          </View>
        ) : (
          <ScrollView style={styles.listWrap}>
            {qualities.map((q) => {
              const label = QUALITY_LABEL_MAP[q] || q
              const isActive = currentQuality === q
              return (
                <TouchableOpacity
                  key={q}
                  style={[styles.qualityRow, isActive && { backgroundColor: theme['c-primary-alpha'] || 'rgba(0,0,0,0.05)' }]}
                  onPress={() => handleSelect(q)}
                >
                  <Text
                    size={15}
                    color={isActive ? theme['c-primary'] : theme['c-font']}
                  >
                    {label}
                  </Text>
                  {isActive && <Text size={12} color={theme['c-primary']}>{t('play_detail_quality_current')}</Text>}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>
    </Popup>
  ) : null
})

const styles = createStyle({
  container: {
    minHeight: 120,
    paddingBottom: 20,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
  },
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  listWrap: {
    maxHeight: 300,
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
})
