import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { View, ScrollView } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Button from '@/components/common/Button'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

interface FailedSong {
  name: string
  singer: string
  error?: string
}

export interface DownloadFailedModalType {
  show: (options: { message: string, onRetry: () => void, onCancel: () => void }) => void
  showFailedSongs: (failedSongs: FailedSong[], options: { onRetryAll: () => void, onCancel: () => void }) => void
}

export default forwardRef<DownloadFailedModalType>((_props, ref) => {
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [failedSongs, setFailedSongs] = useState<FailedSong[] | null>(null)
  const [onRetry, setOnRetry] = useState<(() => void) | null>(null)
  const [onRetryAll, setOnRetryAll] = useState<(() => void) | null>(null)
  const [onCancel, setOnCancel] = useState<(() => void) | null>(null)
  const theme = useTheme()
  const t = useI18n()

  const openDialog = () => {
    if (visible) {
      dialogRef.current?.setVisible(true)
    } else {
      setVisible(true)
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    }
  }

  useImperativeHandle(ref, () => ({
    show(options) {
      setMessage(options.message)
      setFailedSongs(null)
      setOnRetry(() => options.onRetry)
      setOnRetryAll(null)
      setOnCancel(() => options.onCancel)
      openDialog()
    },
    showFailedSongs(failedSongs, options) {
      setMessage('')
      setFailedSongs(failedSongs)
      setOnRetry(null)
      setOnRetryAll(() => options.onRetryAll)
      setOnCancel(() => options.onCancel)
      openDialog()
    },
  }))

  const handleRetry = () => {
    onRetry?.()
    dialogRef.current?.setVisible(false)
  }

  const handleRetryAll = () => {
    onRetryAll?.()
    dialogRef.current?.setVisible(false)
  }

  const handleCancel = () => {
    onCancel?.()
    dialogRef.current?.setVisible(false)
  }

  return (
    visible
      ? (
        <Dialog ref={dialogRef} title={t('download_failed_title')} closeBtn={true}>
          <View style={styles.content}>
            {message
              ? (
                  <Text style={styles.message} size={14} color={theme['c-font']}>{message}</Text>
                )
              : null}
            {failedSongs
              ? (
                  <>
                    <Text style={styles.failedTitle} size={14} color={theme['c-font']}>{t('download_failed_songs')}</Text>
                    <ScrollView style={styles.songList}>
                      {failedSongs.map((song, index) => (
                        <View key={index} style={styles.songItem}>
                          <Text size={13} color={theme['c-font']} numberOfLines={1}>
                            {song.singer} - {song.name}
                          </Text>
                          {song.error
                            ? (
                                <Text size={12} color={theme['c-font-label']} style={styles.songError}>
                                  {song.error}
                                </Text>
                              )
                            : null}
                        </View>
                      ))}
                    </ScrollView>
                  </>
                )
              : null}
            <View style={styles.btns}>
              {onRetry
                ? (
                    <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleRetry}>
                      <Text color={theme['c-button-font']}>{t('download_failed_retry')}</Text>
                    </Button>
                  )
                : null}
              {onRetryAll
                ? (
                    <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleRetryAll}>
                      <Text color={theme['c-button-font']}>{t('download_retry_all')}</Text>
                    </Button>
                  )
                : null}
              <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleCancel}>
                <Text color={theme['c-button-font']}>{t('cancel')}</Text>
              </Button>
            </View>
          </View>
        </Dialog>
      )
      : null
  )
})

const styles = createStyle({
  content: {
    marginTop: 10,
    marginBottom: 20,
    marginLeft: 5,
    marginRight: 5,
  },
  message: {
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 10,
  },
  failedTitle: {
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  songList: {
    maxHeight: 200,
    marginLeft: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  songItem: {
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 5,
    paddingRight: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  songError: {
    marginTop: 2,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 10,
  },
  btn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 4,
    marginHorizontal: 5,
    alignItems: 'center',
  },
})