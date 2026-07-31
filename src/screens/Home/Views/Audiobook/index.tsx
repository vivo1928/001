import { View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

export default () => {
  const theme = useTheme()
  const t = useI18n()

  return (
    <View style={styles.container}>
      <Text size={16} color={theme['c-500']}>{t('nav_audiobook')}</Text>
      <Text size={13} color={theme['c-400']} style={styles.hint}>听书功能即将上线，敬请期待</Text>
    </View>
  )
}

const styles = createStyle({
  container: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  hint: {
    marginTop: 8,
  },
})