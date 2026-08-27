import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import Popup, { type PopupType } from '@/components/common/Popup'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

export interface SingerSelectModalType {
  show: (singers: string[]) => void
}

export default forwardRef<SingerSelectModalType, { onSelect: (singer: string) => void }>(({ onSelect }, ref) => {
  const theme = useTheme()
  const t = useI18n()
  const popupRef = useRef<PopupType>(null)
  const [visible, setVisible] = useState(false)
  const [singers, setSingers] = useState<string[]>([])

  useImperativeHandle(ref, () => ({
    show(list) {
      setSingers(list)
      if (visible) popupRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => popupRef.current?.setVisible(true))
      }
    },
  }), [visible])

  const handleSelect = (singer: string) => {
    popupRef.current?.setVisible(false)
    onSelect(singer)
  }
  const handleClose = () => {
    popupRef.current?.setVisible(false)
  }

  return visible ? (
    <Popup ref={popupRef} title={t('play_detail_setting_jump_singer_select_title')}>
      <View style={styles.container}>
        {singers.map((singer, index) => (
          <TouchableOpacity
            key={`${singer}_${index}`}
            style={styles.singerRow}
            onPress={() => { handleSelect(singer) }}
            accessibilityRole="button"
            accessibilityLabel={singer}
          >
            <Text size={15} color={theme['c-font']}>{singer}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={t('cancel')}
        >
          <Text size={15} color={theme['c-font-label']}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>
    </Popup>
  ) : null
})

const styles = createStyle({
  container: {
    paddingBottom: 20,
  },
  singerRow: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
})
