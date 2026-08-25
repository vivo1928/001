import { useRef, useCallback, memo } from 'react'
import { View, Linking } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { requestStoragePermission } from '@/utils/permissions'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import DownloadManager from '@/core/download/manager'
import playerState from '@/store/player/state'

const downloadManager = new DownloadManager()

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)
  const confirmAlertRef = useRef<ConfirmAlertType>(null)

  const startSingleDownload = useCallback(async(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
    // 下载前先申请存储权限
    const granted = await requestStoragePermission()
    if (!granted) {
      confirmAlertRef.current?.setVisible(true)
      return
    }

    // 显示进度弹窗
    downloadProgressRef.current?.show(musicInfo.name, {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })

    // 添加下载任务
    const taskId = downloadManager.addToQueue(musicInfo, quality)

    // 设置进度回调
    const originalOnProgress = (downloadManager as any).onProgress
    ;(downloadManager as any).onProgress = (id: string, progress: number) => {
      if (id === taskId) {
        downloadProgressRef.current?.updateProgress(progress)
      }
    }

    // 设置完成回调
    const originalOnComplete = (downloadManager as any).onComplete
    ;(downloadManager as any).onComplete = (id: string, success: boolean, error?: string) => {
      if (id !== taskId) return
      downloadProgressRef.current?.close()
      if (success) {
        // 下载成功，关闭弹窗
      } else if (error === 'cancelled') {
        // 用户取消了下载
        toast(t('download_cancelled'))
      } else {
        // 下载失败，显示失败弹窗
        downloadFailedRef.current?.show({
          message: `${musicInfo.singer} - ${musicInfo.name} ${t('download_failed_title')}`,
          onRetry: () => {
            void startSingleDownload(musicInfo, quality)
          },
          onCancel: () => {},
        })
      }
      // 恢复回调
      ;(downloadManager as any).onProgress = originalOnProgress
      ;(downloadManager as any).onComplete = originalOnComplete
    }
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
      <ConfirmAlert
        ref={confirmAlertRef}
        title={t('download_storage_permission_title')}
        text={t('download_storage_permission_denied')}
        confirmText={t('open_settings')}
        onConfirm={() => { void Linking.openSettings() }}
      />
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
