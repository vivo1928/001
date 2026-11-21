import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const isBackgroundOnly = useSettingValue('player.isSmartCacheBackgroundOnly')
  const setIsBackgroundOnly = (value: boolean) => {
    updateSetting({ 'player.isSmartCacheBackgroundOnly': value })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isBackgroundOnly}
        label={t('setting_basic_smart_cache_background_only')}
        onChange={setIsBackgroundOnly}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
