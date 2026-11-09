import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'


import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const isSmartCache = useSettingValue('player.isSmartCache')
  const setIsSmartCache = (isSmartCache: boolean) => {
    updateSetting({ 'player.isSmartCache': isSmartCache })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem check={isSmartCache} label={t('setting_basic_smart_cache')} onChange={setIsSmartCache} />
    </View>
  )
})


const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
