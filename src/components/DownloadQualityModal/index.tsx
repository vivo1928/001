import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { View, TouchableHighlight, ScrollView } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

const QUALITY_MAP: Record<LX.Quality, string> = {
  '128k': 'download_quality_standard',
  '320k': 'download_quality_high',
  'flac': 'download_quality_lossless',
  'flac24bit': 'download_quality_24bit',
  '192k': 'download_quality_high',
  'ape': 'download_quality_lossless',
  'wav': 'download_quality_lossless',
  '64k': 'download_quality_standard',
  '32k': 'download_quality_standard',
}

export interface DownloadQualityModalType {
  show: (musicInfo: LX.Music.MusicInfoOnline, options: { onSelect: (quality: LX.Quality) => void, showFileSize?: boolean }) => void
}

export default forwardRef<DownloadQualityModalType>((_props, ref) => {
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
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
      if (visible) {
        dialogRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
      }
    },
  }))

  const handleSelect = (quality: LX.Quality) => {
    onSelect?.(quality)
    dialogRef.current?.setVisible(false)
  }

  const getFileSize = (quality: LX.Quality): string | null => {
    if (!musicInfo || !showFileSize) return null
    const qualityInfo = musicInfo.meta.qualitys.find(q => q.type === quality)
    return qualityInfo?.size ?? null
  }

  const getAvailableQualities = (): LX.Quality[] => {
    if (!musicInfo) return []
    const _qualitys = musicInfo.meta._qualitys
    const qualities = Object.keys(_qualitys) as LX.Quality[]
    return qualities.filter(q => _qualitys[q] != null)
  }

  return (
    visible && musicInfo
      ? (
        <Dialog ref={dialogRef} title={t('download_quality_title')} closeBtn={true}>
          <ScrollView style={styles.list}>
            {
              getAvailableQualities().map(quality => {
                const size = getFileSize(quality)
                return (
                  <TouchableHighlight
                    key={quality}
                    style={styles.item}
                    underlayColor={theme['c-primary-dark-200-alpha-600']}
                    onPress={() => handleSelect(quality)}
                    accessibilityRole="button"
                    accessibilityLabel={t(QUALITY_MAP[quality] as any)}
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
      : null
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