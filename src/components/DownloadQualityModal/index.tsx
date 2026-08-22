import { useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { View, TouchableHighlight, ScrollView } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

const QUALITY_MAP: Record<LX.Quality, string> = {
  '128k': 'download_quality_standard',
  '320k': 'download_quality_high',
  flac: 'download_quality_lossless',
  flac24bit: 'download_quality_24bit',
  '192k': 'download_quality_high',
  ape: 'download_quality_lossless',
  wav: 'download_quality_lossless',
  '64k': 'download_quality_standard',
  '32k': 'download_quality_standard',
  hires: 'download_quality_hires',
  master: 'download_quality_master',
  atmos: 'download_quality_atmos',
  atmos_plus: 'download_quality_atmos_plus',
}

// 音质显示顺序（低→高）
const QUALITY_DISPLAY_ORDER: LX.Quality[] = ['32k', '64k', '128k', '192k', '320k', 'ape', 'wav', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master']

export interface DownloadQualityModalType {
  show: (musicInfo: LX.Music.MusicInfoOnline, options: { onSelect: (quality: LX.Quality) => void, showFileSize?: boolean }) => void
}

export default forwardRef<DownloadQualityModalType>((_props, ref) => {
  const dialogRef = useRef<DialogType>(null)
  const [musicInfo, setMusicInfo] = useState<LX.Music.MusicInfoOnline | null>(null)
  const [onSelect, setOnSelect] = useState<((quality: LX.Quality) => void) | null>(null)
  const [showFileSize, setShowFileSize] = useState(false)
  const theme = useTheme()
  const t = useI18n()

  useImperativeHandle(ref, () => ({
    show(musicInfo, options) {
      setMusicInfo(musicInfo)
      setOnSelect(() => options.onSelect)
      setShowFileSize(options.showFileSize ?? false)
      // 始终先渲染 Dialog 再显示
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }))

  const handleSelect = useCallback((quality: LX.Quality) => {
    requestAnimationFrame(() => {
      onSelect?.(quality)
      dialogRef.current?.setVisible(false)
    })
  }, [onSelect])

  const getFileSize = (quality: LX.Quality): string | null => {
    if (!musicInfo || !showFileSize) return null
    // 先尝试 qualitys 数组
    const qualityInfo = musicInfo.meta.qualitys?.find(q => q.type === quality)
    if (qualityInfo?.size) return qualityInfo.size
    // 回退到 _qualitys 字典
    const q = musicInfo.meta._qualitys?.[quality]
    return q?.size ?? null
  }

  const getAvailableQualities = (): LX.Quality[] => {
    if (!musicInfo) return []
    const _qualitys = musicInfo.meta._qualitys
    // 从歌曲 _qualitys 和源 qualityList 合并去重，按 QUALITY_DISPLAY_ORDER 排序
    const sourceQualities = global.lx.qualityList[musicInfo.source] ?? []
    const allQualities = new Set<LX.Quality>()
    for (const q of Object.keys(_qualitys) as LX.Quality[]) {
      if (_qualitys[q] != null) allQualities.add(q)
    }
    for (const q of sourceQualities) {
      if (!_qualitys[q]) allQualities.add(q)
    }
    // 通用高级音质补全：即使源 qualityList 未声明，也确保下载可选
    for (const q of ['hires', 'atmos', 'atmos_plus', 'master'] as LX.Quality[]) {
      allQualities.add(q)
    }
    return QUALITY_DISPLAY_ORDER.filter(q => allQualities.has(q))
  }

  return (
    <Dialog ref={dialogRef} title={t('download_quality_title')} closeBtn={true} keyHide={true} bgHide={true}>
      <ScrollView style={styles.list}>
        {
          musicInfo && getAvailableQualities().map(quality => {
            const size = getFileSize(quality)
            return (
              <TouchableHighlight
                key={quality}
                style={styles.item}
                underlayColor={theme['c-primary-dark-200-alpha-600']}
                onPress={() => handleSelect(quality)}
                accessibilityRole="button"
                accessibilityLabel={size
                  ? `${t(QUALITY_MAP[quality] as any)}，${t('download_file_size', { size })}`
                  : t(QUALITY_MAP[quality] as any)}
              >
                <View style={styles.itemContent}>
                  <Text size={14} color={theme['c-font']}>{t(QUALITY_MAP[quality] as any)}</Text>
                  {size
                    ? (
                        <Text size={12} color={theme['c-font-label']} style={styles.fileSize}>
                          {t('download_file_size', { size })}
                        </Text>
                      )
                    : null}
                </View>
              </TouchableHighlight>
            )
          })
        }
      </ScrollView>
    </Dialog>
  )
})

const styles = createStyle({
  list: {
    maxHeight: 300,
    marginTop: 5,
    marginBottom: 15,
    marginLeft: 5,
    marginRight: 5,
  },
  item: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 4,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileSize: {
    marginLeft: 10,
  },
})
