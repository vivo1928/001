import { useRef, useCallback, memo } from 'react'
import { View, Linking } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import useDownloadFlow from '@/core/download/useDownloadFlow'
import playerState from '@/store/player/state'

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)
  const confirmAlertRef = useRef<ConfirmAlertType>(null)
  // 统一下载流程：权限、音质选择、进度弹窗、取消、完成提示、失败重试
  const downloadFlow = useDownloadFlow({
    progress: downloadProgressRef,
    quality: downloadQualityRef,
    failed: downloadFailedRef,
    confirmAlert: confirmAlertRef,
  })

  const handlePress = useCallback(() => {
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo || 'progress' in musicInfo) return
    downloadFlow.downloadSingle(musicInfo as LX.Music.MusicInfoOnline, { showFileSize: true })
  }, [downloadFlow])

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
