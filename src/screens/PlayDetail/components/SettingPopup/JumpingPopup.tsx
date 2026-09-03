import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View, ActivityIndicator, findNodeHandle, AccessibilityInfo } from 'react-native'
import Modal, { type ModalType } from '@/components/common/Modal'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

export interface JumpingPopupType {
  show: () => void
  close: () => void
}

/**
 * 跳转过渡界面
 * 跳转歌手/专辑时以全屏过渡界面承接读屏焦点并朗读"正在跳转"，
 * 避免设置弹窗关闭瞬间焦点落回播放封面；跳转完成后关闭并露出目标页。
 * 用 state 直接控制 Modal 显示，避免 ref+rAF 早于挂载导致不显示。
 */
export default forwardRef<JumpingPopupType, {}>((_props, ref) => {
  const theme = useTheme()
  const t = useI18n()
  const modalRef = useRef<ModalType>(null)
  const [visible, setVisible] = useState(false)
  const focusRef = useRef<View>(null)

  const focusAccessibility = () => {
    // 等 Modal 真正渲染后再移动焦点并朗读，覆盖动画挂载时序
    setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(t('jumping'))
      const node = findNodeHandle(focusRef.current)
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node)
    }, 100)
  }

  useImperativeHandle(ref, () => ({
    show() {
      setVisible(true)
      focusAccessibility()
    },
    close() {
      modalRef.current?.setVisible(false)
    },
  }), [t])

  return visible ? (
    <Modal ref={modalRef} bgColor={theme['c-content-background']} statusBarPadding={false}>
      <View style={styles.center}>
        <View ref={focusRef} accessible style={styles.box} accessibilityRole="header">
          <ActivityIndicator size="large" color={theme['c-primary']} style={styles.spinner} />
          <Text size={18} color={theme['c-font']}>{t('jumping')}</Text>
        </View>
      </View>
    </Modal>
  ) : null
})

const styles = createStyle({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginBottom: 18,
  },
})
