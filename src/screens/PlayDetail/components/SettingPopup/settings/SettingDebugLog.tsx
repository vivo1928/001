import { memo } from 'react'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { isDebugLogEnabled, copyAllLogsToClipboard, getLogCount } from '@/utils/debugLogCollector'

const styles = createStyle({
  row: {
    paddingTop: 5,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    overflow: 'hidden',
  },
})

export default memo(() => {
  const theme = useTheme()
  if (!isDebugLogEnabled()) return null

  return (
    <View style={styles.row}>
      <Text>{'调试日志'}</Text>
      <Text size={13} color={theme['c-font-label']}>{`${getLogCount()} 条`}</Text>
      <Text size={13} color={theme['c-primary']} style={styles.btn} onPress={() => { copyAllLogsToClipboard() }}>
        {'复制全部日志'}
      </Text>
    </View>
  )
})