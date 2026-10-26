import { memo } from 'react'
import { View } from 'react-native'
import Button from '@/components/common/Button'

import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'

export interface ActionBarProps {
  onPlayAll?: () => void
  onBatchDownload?: () => void
}

// 返回按钮已移至顶部栏，这里只保留两个操作，等宽大触点，读屏时各占一个焦点
export default memo(({ onPlayAll, onBatchDownload }: ActionBarProps) => {
  const theme = useTheme()
  const t = useI18n()

  const handlePlayAll = () => {
    onPlayAll?.()
  }

  const handleBatchDownload = () => {
    onBatchDownload?.()
  }

  return (
    <View style={styles.container}>
      <Button onPress={handlePlayAll} style={styles.controlBtn} accessibilityLabel={t('play_all')} accessibilityRole="button">
        <Text style={{ ...styles.controlBtnText, color: theme['c-button-font'] }}>{t('play_all')}</Text>
      </Button>
      <Button onPress={handleBatchDownload} style={styles.controlBtn} accessibilityLabel={t('download_all')} accessibilityRole="button">
        <Text style={{ ...styles.controlBtnText, color: theme['c-button-font'] }}>{t('download_all')}</Text>
      </Button>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  controlBtn: {
    flexGrow: 1,
    flexShrink: 1,
    width: '50%',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 10,
    paddingRight: 10,
  },
  controlBtnText: {
    fontSize: 13,
    textAlign: 'center',
  },
})
