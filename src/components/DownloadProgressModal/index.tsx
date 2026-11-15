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
  const [title, setTitle] = useState('')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const onCancelRef = useRef<(() => void) | null>(null)
  // 程序化关闭（下载完成/失败收尾）时抑制隐藏回调，避免误触发取消
  const suppressHideRef = useRef(false)
  const cancelingRef = useRef(false)
  const theme = useTheme()
  const t = useI18n()

  const close = () => {
    suppressHideRef.current = true
    dialogRef.current?.setVisible(false)
    suppressHideRef.current = false
  }

  const doCancel = () => {
    if (cancelingRef.current) return
    cancelingRef.current = true
    const handler = onCancelRef.current
    onCancelRef.current = null
    try {
      handler?.()
    } finally {
      close()
      cancelingRef.current = false
    }
  }

  // 返回键/点背景/关闭按钮隐藏弹窗时按取消处理，保证下载不会在弹窗消失后继续
  const handleHide = () => {
    if (suppressHideRef.current) return
    doCancel()
  }

  useImperativeHandle(ref, () => ({
    show(title, options) {
      setTitle(title)
      setProgress(0)
      setStatusText('')
      onCancelRef.current = options.onCancel
      // 先渲染弹窗内容再显示（与 DownloadQualityModal 一致），
      // Dialog 常驻挂载，ref 始终可用，不存在首显竞态
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
    updateProgress(progress, statusText) {
      setProgress(progress)
      if (statusText != null) setStatusText(statusText)
    },
    close,
  }))

  return (
    <Dialog ref={dialogRef} title={title || t('download_progress_title')} closeBtn={false} onHide={handleHide}>
      <View style={styles.content}>
        <View style={styles.progressBarContainer}>
          <View style={{ ...styles.progressBar, backgroundColor: theme['c-primary-light-200-alpha-700'], width: `${progress}%` as any }} />
        </View>
        <Text style={styles.progressText} size={13} color={theme['c-font-label']}>
          {statusText || t('download_progress', { progress: Math.round(progress) })}
        </Text>
        <View style={styles.btns}>
          <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={doCancel}>
            <Text color={theme['c-button-font']}>{t('download_cancel')}</Text>
          </Button>
        </View>
      </View>
    </Dialog>
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
