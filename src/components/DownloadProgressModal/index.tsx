import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { View } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Button from '@/components/common/Button'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

export interface DownloadProgressModalType {
  show: (title: string, options: { onCancel: () => void }) => void
  updateProgress: (progress: number, statusText?: string) => void
  close: () => void
}

export default forwardRef<DownloadProgressModalType>((_props, ref) => {
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [title, setTitle] = useState('')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [onCancel, setOnCancel] = useState<(() => void) | null>(null)
  const theme = useTheme()
  const t = useI18n()

  useImperativeHandle(ref, () => ({
    show(title, options) {
      setTitle(title)
      setProgress(0)
      setStatusText('')
      setOnCancel(() => options.onCancel)
      if (visible) {
        dialogRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
      }
    },
    updateProgress(progress, statusText) {
      setProgress(progress)
      if (statusText != null) setStatusText(statusText)
    },
    close() {
      dialogRef.current?.setVisible(false)
    },
  }))

  const handleCancel = () => {
    onCancel?.()
  }

  return (
    visible
      ? (
        <Dialog ref={dialogRef} title={title || t('download_progress_title')} closeBtn={false}>
          <View style={styles.content}>
            <View style={styles.progressBarContainer}>
              <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-200-alpha-700'], width: `${progress}%` as any }} />
            </View>
            <Text style={styles.progressText} size={13} color={theme['c-font-label']}>
              {statusText || t('download_progress', { progress: Math.round(progress) })}
            </Text>
            <View style={styles.btns}>
              <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleCancel}>
                <Text color={theme['c-button-font']}>{t('download_cancel')}</Text>
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
    marginTop: 15,
    marginBottom: 25,
    marginLeft: 10,
    marginRight: 10,
    alignItems: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    marginTop: 8,
  },
  btns: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
})