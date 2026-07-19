import { memo, useRef } from 'react'

import { View, StyleSheet, TouchableOpacity } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import { useTheme } from '@/store/theme/hook'
import { usePlayerMusicInfo } from '@/store/player/hook'
import Text from '@/components/common/Text'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import commonState from '@/store/common/state'
import CommentBtn from './CommentBtn'
import Btn from './Btn'
import SettingPopup, { type SettingPopupType } from '../../components/SettingPopup'
import DesktopLyricBtn from './DesktopLyricBtn'
import { useI18n } from '@/lang'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

const Title = () => {
  const theme = useTheme()
  const musicInfo = usePlayerMusicInfo()


  return (
    <View style={styles.titleContent} accessibilityLabel={musicInfo.name + ' ' + (musicInfo.singer ?? '')}>
      <Text numberOfLines={1} style={styles.title} size={14}>{musicInfo.name}</Text>
      <Text numberOfLines={1} style={styles.title} size={12} color={theme['c-font-label']}>{musicInfo.singer}</Text>
    </View>
  )
}

export default memo(() => {
  const popupRef = useRef<SettingPopupType>(null)
  const t = useI18n()

  const back = () => {
    void pop(commonState.componentIds.playDetail!)
  }
  const showSetting = () => {
    popupRef.current?.show()
  }

  return (
    <View style={{ height: HEADER_HEIGHT }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <View style={styles.container}>
        <TouchableOpacity onPress={back} style={{ ...styles.button, width: HEADER_HEIGHT }}
          accessibilityLabel={t('play_detail_back')} accessibilityRole="button">
          <Icon name="chevron-left" size={18} />
        </TouchableOpacity>
        <Title />
        <DesktopLyricBtn />
        <CommentBtn />
        <Btn icon="slider" onPress={showSetting} accessibilityLabel={t('play_detail_settings')} />
      </View>
      <SettingPopup ref={popupRef} position="left" direction="horizontal" />
    </View>
  )
})


const styles = StyleSheet.create({
  container: {
    flex: 0,
    // backgroundColor: '#ccc',
    flexDirection: 'row',
    // justifyContent: 'center',
    height: '100%',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    flex: 0,
  },
  titleContent: {
    flex: 1,
    // alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // flex: 1,
    // textAlign: 'center',
  },
  icon: {
    paddingLeft: 4,
    paddingRight: 4,
  },
})
