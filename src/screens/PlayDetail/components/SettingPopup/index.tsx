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

  const closeSettingPopup = useRef(() => {
    popupRef.current?.setVisible(false)
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
