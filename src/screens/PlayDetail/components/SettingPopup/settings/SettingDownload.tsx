import { useRef, useCallback, memo } from 'react'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import DownloadManager from '@/core/download/manager'
import { requestStoragePermission } from '@/utils/nativeModules/utils'
import playerState from '@/store/player/state'

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)

  const startSingleDownload = useCallback(async(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
    const granted = await requestStoragePermission()
    if (!granted) {
      toast(t('download_storage_permission_denied'))
      return
    }

    const downloadManager = new DownloadManager(
      (id, progress) => {
        downloadProgressRef.current?.updateProgress(progress)
      },
      (id, success, error) => {
        downloadProgressRef.current?.close()
        if (success) {
          toast(t('download_completed'))
        } else if (error === 'cancelled') {
          toast(t('download_cancelled'))
        } else {
          downloadFailedRef.current?.show({
            message: `${musicInfo.singer} - ${musicInfo.name} ${t('download_failed_title')}`,
            onRetry: () => {
              void startSingleDownload(musicInfo, quality)
            },
            onCancel: () => {},
          })
        }
      },
    )

    downloadProgressRef.current?.show(musicInfo.name, {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })

    downloadManager.addToQueue(musicInfo, quality)
  }, [t])

  const handlePress = useCallback(() => {
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo || 'progress' in musicInfo) return
    downloadQualityRef.current?.show(musicInfo as LX.Music.MusicInfoOnline, {
      showFileSize: true,
      onSelect: (quality) => {
        void startSingleDownload(musicInfo as LX.Music.MusicInfoOnline, quality)
      },
    })
  }, [startSingleDownload])

  return (
    <>
      <View style={styles.row}>
        <Text size={15}>{t('download')}</Text>
        <Text
          size={13}
          color={theme['c-primary']}
          style={styles.btn}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={t('download')}
        >
          {t('download')}
        </Text>
      </View>
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
    </>
  )
})

const styles = createStyle({
  row: {
    paddingTop: 5,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    overflow: 'hidden',
  },
})
