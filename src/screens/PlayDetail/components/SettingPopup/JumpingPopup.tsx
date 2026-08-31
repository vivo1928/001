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
 * 跳转中弹窗
 * 跳转歌手/专辑时先显示此弹窗并把读屏焦点移动到它上面，
 * 避免设置弹窗关闭瞬间焦点落回播放封面；跳转完成后关闭并露出目标页。
 * 用 state 直接控制 Modal 显示，避免 ref+rAF 早于挂载导致弹窗不显示。
 */
export default forwardRef<JumpingPopupType, {}>((_props, ref) => {
  const theme = useTheme()
  const t = useI18n()
  const modalRef = useRef<ModalType>(null)
  const [visible, setVisible] = useState(false)
  const focusRef = useRef<View>(null)

  const focusAccessibility = () => {
    // 等 Modal 真正渲染后再移动焦点，多试一次以覆盖动画挂载时序
    setTimeout(() => {
      const node = findNodeHandle(focusRef.current)
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node)
    }, 80)
  }

  useImperativeHandle(ref, () => ({
    show() {
      setVisible(true)
      focusAccessibility()
    },
    close() {
      modalRef.current?.setVisible(false)
    },
  }), [])

  return visible ? (
    <Modal ref={modalRef} bgColor="rgba(50,50,50,0.3)" statusBarPadding={false}>
      <View style={styles.center}>
        <View ref={focusRef} accessible style={styles.box} accessibilityRole="text">
          <ActivityIndicator size="small" color={theme['c-primary']} style={styles.spinner} />
          <Text size={15} color={theme['c-font']}>{t('jumping')}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  spinner: {
    marginRight: 12,
  },
})
