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
  // 弹窗完全关闭（onDismiss）后要执行的回调（如跳转导航），
  // 确保设置弹窗彻底关闭且已对读屏隐藏后再进入跳转页，避免读屏焦点落回弹窗
  const pendingAfterCloseRef = useRef<(() => void) | null>(null)

  const closeSettingPopup = useRef((callback?: () => void) => {
    pendingAfterCloseRef.current = callback ?? null
    // 关闭播放设置弹窗前先对读屏隐藏其内容：避免 Modal 关闭瞬间 TalkBack 把焦点归还给弹窗元素
    // （"播放设置"标题），抢走后续跳转页面的焦点
    popupRef.current?.setAccessibilityHidden(true)
    popupRef.current?.setVisible(false)
  }).current

  const handlePopupDismiss = useRef(() => {
    const cb = pendingAfterCloseRef.current
    pendingAfterCloseRef.current = null
    cb?.()
  }).current

  useImperativeHandle(ref, () => ({
    show() {
      if (visible) popupRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          popupRef.current?.setVisible(true)
        })
      }
    },
  }))


  return (
    visible
      ? (
        <Popup ref={popupRef} title={t('play_detail_setting_title')} {...props} onDismiss={handlePopupDismiss}>
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
