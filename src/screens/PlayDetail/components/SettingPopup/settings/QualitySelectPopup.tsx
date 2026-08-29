import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { getMusicUrl } from '@/core/music/online'
import { setResource, setPause, setPlay } from '@/plugins/player'
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

export default forwardRef<QualitySelectPopupType, { onCloseSettingPopup?: (callback?: () => void) => void }>(({ onCloseSettingPopup }, ref) => {
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
        // 后台预取各可用音质的 URL 存入缓存，点击切换时立即命中，无需等待网络请求
        const qualitys = mi.meta._qualitys ?? {}
        for (const q of Object.keys(qualitys) as LX.Quality[]) {
          if (qualitys[q] == null) continue
          void getMusicUrl({ musicInfo: mi, quality: q, isRefresh: false, allowToggleSource: false, onToggleSource: () => {} }).catch(() => {})
        }
      }, 100)
    },
  }))

  const loadQualities = useCallback((mi: LX.Music.MusicInfoOnline) => {
    try {
      // 与 DownloadQualityModal.getAvailableQualities 逻辑一致：
      // 1. _qualitys 中存在的音质都展示（含 extendQualityTypes 补充的高品质）
      // 2. 源质量列表中 flac24bit 以上的高级音质若 _qualitys 缺失也补充展示
      const _qualitys = mi.meta._qualitys ?? {}
      const sourceQualities = global.lx.qualityList?.[mi.source] ?? []
      const allQualities = new Set<LX.Quality>()
      for (const q of Object.keys(_qualitys) as LX.Quality[]) {
        if (_qualitys[q] != null) allQualities.add(q)
      }
      for (const q of sourceQualities) {
        if (_qualitys[q] != null) continue
        const orderIdx = QUALITYS_ORDER.indexOf(q)
        if (orderIdx >= 0 && orderIdx < QUALITYS_ORDER.indexOf('flac24bit')) {
          allQualities.add(q)
        }
      }
      const result = QUALITYS_ORDER.filter(q => allQualities.has(q))
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
    onCloseSettingPopup?.()
    setTimeout(() => {
      setVisible(false)
    }, 300)

    // 立即暂停，让用户明确感知"切换开始"
    await setPause()
    const position = playerState.progress.nowPlayTime
    setTempPlayQuality(q)

    try {
      let url: string | null = null
      // 缓存优先：store 有该音质 URL 缓存则秒回，避免每次重新向 SDK 请求
      try {
        url = await getMusicUrl({ musicInfo, quality: q, isRefresh: false, allowToggleSource: false, onToggleSource: () => {} })
      } catch {}
      // 缓存未命中或获取失败，强制刷新一次
      if (!url) {
        try {
          url = await getMusicUrl({ musicInfo, quality: q, isRefresh: true, allowToggleSource: false, onToggleSource: () => {} })
        } catch {}
      }
      // 仍失败则允许切换音源兜底
      if (!url) {
        try {
          url = await getMusicUrl({ musicInfo, quality: q, isRefresh: true, allowToggleSource: true, onToggleSource: () => {} })
        } catch {}
      }
      if (!url) {
        setTempPlayQuality(null)
        toast(t('切换音质失败：未获取到有效链接'))
        void setPlay()
        return
      }
      setResource(musicInfo, url, position)
    } catch (err: any) {
      setTempPlayQuality(null)
      toast(t('切换音质失败：') + (err?.message ?? t('未知错误')))
      void setPlay()
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
