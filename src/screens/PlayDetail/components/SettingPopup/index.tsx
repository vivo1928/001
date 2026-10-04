import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import Popup, { type PopupType, type PopupProps } from '@/components/common/Popup'
import { useI18n } from '@/lang'

import SettingLyricProgress from './settings/SettingLyricProgress'
import SettingVolume from './settings/SettingVolume'
import SettingPlaybackRate from './settings/SettingPlaybackRate'
import SettingLrcFontSize from './settings/SettingLrcFontSize'
import SettingLrcAlign from './settings/SettingLrcAlign'
import SettingEqualizer from './settings/SettingEqualizer'
import SettingPlayQuality from './settings/SettingPlayQuality'
import SettingDownload from './settings/SettingDownload'
import SettingJumpToSinger from './settings/SettingJumpToSinger'
import SettingJumpToAlbum from './settings/SettingJumpToAlbum'

export interface SettingPopupProps extends Omit<PopupProps, 'children'> {
  direction: 'vertical' | 'horizontal'
}

export interface SettingPopupType {
  show: () => void
}

export default forwardRef<SettingPopupType, SettingPopupProps>(({ direction, ...props }, ref) => {
  const [visible, setVisible] = useState(false)
  const popupRef = useRef<PopupType>(null)
  // console.log('render import export')
  const t = useI18n()
  // 弹窗关闭时要执行的回调（如跳转导航）。
  // 注意：RN Modal 的 onDismiss 回调只在 iOS 生效，Android 上不会触发，
  // 因此不能依赖它在两侧都可靠地先关弹窗再执行动作。
  // 跳转类回调：先立即执行回调把全屏跳转浮层弹到原生层上（位于弹窗之下），
  // 稍作延迟再关闭设置弹窗，弹窗淡出后露出的直接就是跳转浮层，
  // 消除"弹窗关闭动画期间读屏/触摸浏览一瞬间落在播放详情"的空窗。
  const closeSettingPopup = useRef((callback?: () => void) => {
    // 关闭播放设置弹窗前先对读屏隐藏其内容：避免 Modal 关闭瞬间 TalkBack 把焦点归还给弹窗元素
    // （"播放设置"标题），抢走后续跳转页面的焦点
    popupRef.current?.setAccessibilityHidden(true)
    if (callback) {
      callback()
      setTimeout(() => popupRef.current?.setVisible(false), 100)
    } else {
      popupRef.current?.setVisible(false)
    }
  }).current

  useImperativeHandle(ref, () => ({
    show() {
      // 每次重新打开都要恢复对读屏可见（关闭时曾被隐藏，用于过渡期避免读屏读回弹窗）
      if (visible) {
        popupRef.current?.setAccessibilityHidden(false)
        popupRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          popupRef.current?.setAccessibilityHidden(false)
          popupRef.current?.setVisible(true)
        })
      }
    },
  }))


  return (
    visible
      ? (
        <Popup ref={popupRef} title={t('play_detail_setting_title')} {...props}>
          <ScrollView>
            <View onStartShouldSetResponder={() => true}>
              <SettingLyricProgress />
              <SettingVolume />
              <SettingPlaybackRate />
              <SettingPlayQuality onCloseSettingPopup={closeSettingPopup} />
              <SettingDownload />
              <SettingJumpToSinger onCloseSettingPopup={closeSettingPopup} />
              <SettingJumpToAlbum onCloseSettingPopup={closeSettingPopup} />
              <SettingLrcFontSize direction={direction} />
              <SettingLrcAlign />
              <SettingEqualizer />
            </View>
          </ScrollView>
        </Popup>
        )
      : null
  )
})
