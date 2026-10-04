import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
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
import JumpingOverlay from '@/screens/JumpingScreen/JumpingOverlay'
import type { JumpingScreenInfo } from '@/screens/JumpingScreen'

export interface SettingPopupProps extends Omit<PopupProps, 'children'> {
  direction: 'vertical' | 'horizontal'
}

export interface SettingPopupType {
  show: () => void
}

export default forwardRef<SettingPopupType, SettingPopupProps>(({ direction, ...props }, ref) => {
  const [visible, setVisible] = useState(false)
  const [jumpInfo, setJumpInfo] = useState<JumpingScreenInfo | null>(null)
  const popupRef = useRef<PopupType>(null)
  // console.log('render import export')
  const t = useI18n()
  // 弹窗关闭时要执行的回调（如播放音质设置项）。
  // 注意：RN Modal 的 onDismiss 回调只在 iOS 生效，Android 上不会触发，
  // 因此不能依赖它在两侧都可靠地先关弹窗再执行动作。
  const closeSettingPopup = useRef((callback?: () => void) => {
    // 关闭播放设置弹窗前先对读屏隐藏其内容：避免 Modal 关闭瞬间 TalkBack 把焦点归还给弹窗元素
    // （"播放设置"标题），抢走后续页面的焦点
    popupRef.current?.setAccessibilityHidden(true)
    popupRef.current?.setVisible(false)
    if (callback) setTimeout(callback, 350)
  }).current

  // 跳转歌手/专辑：不关闭设置弹窗，直接把同一个 Modal 窗口的内容切换成全屏跳转页，
  // 点完跳转后立即呈现"正在跳转"，弹窗不关不重开，读屏不会空窗或重复播报"播放设置"。
  const handleJumpTo = useCallback((info: JumpingScreenInfo) => {
    setJumpInfo(info)
  }, [])

  // 跳转流程结束：成功则关闭弹窗落到目标页；失败则回到设置页，可重试
  const handleJumpFinished = useCallback((success: boolean) => {
    if (success) {
      popupRef.current?.setAccessibilityHidden(true)
      setJumpInfo(null)
      popupRef.current?.setVisible(false)
    } else {
      setJumpInfo(null)
      popupRef.current?.setAccessibilityHidden(false)
    }
  }, [])

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
        <Popup ref={popupRef} title={t('play_detail_setting_title')} {...props}
          fullScreen={!!jumpInfo} keyHide={!jumpInfo} bgHide={!jumpInfo}>
          {
            jumpInfo
              ? <JumpingOverlay info={jumpInfo} onFinished={handleJumpFinished} />
              : (
                <ScrollView>
                  <View onStartShouldSetResponder={() => true}>
                    <SettingLyricProgress />
                    <SettingVolume />
                    <SettingPlaybackRate />
                    <SettingPlayQuality onCloseSettingPopup={closeSettingPopup} />
                    <SettingDownload />
                    <SettingJumpToSinger onJumpTo={handleJumpTo} />
                    <SettingJumpToAlbum onJumpTo={handleJumpTo} />
                    <SettingLrcFontSize direction={direction} />
                    <SettingLrcAlign />
                    <SettingEqualizer />
                  </View>
                </ScrollView>
              )
          }
        </Popup>
        )
      : null
  )
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
