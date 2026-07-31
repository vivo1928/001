import { useMemo, useState } from 'react'
import { ScrollView, TouchableOpacity } from 'react-native'

import { createStyle } from '@/utils/tools'
import { type AudiobookType } from '@/store/audiobook/state'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { BorderWidths } from '@/theme'

const AUDIOBOOK_TYPE_LIST: AudiobookType[] = ['album', 'anchor']

export default ({ onTypeChange }: {
  onTypeChange: (type: AudiobookType) => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const [type, setType] = useState<AudiobookType>('album')

  const list = useMemo(() => {
    return AUDIOBOOK_TYPE_LIST.map(type => ({ label: t(`audiobook_type_${type}`), id: type }))
  }, [t])

  const handleTypeChange = (type: AudiobookType) => {
    setType(type)
    onTypeChange(type)
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps={'always'} horizontal={true}>
      {
        list.map(t => (
          <TouchableOpacity style={styles.button} onPress={() => { handleTypeChange(t.id) }} key={t.id}
            accessibilityLabel={t.label} accessibilityRole="tab" accessibilityState={{ selected: type == t.id }}>
            <Text style={{ ...styles.buttonText, borderBottomColor: type == t.id ? theme['c-primary-background-active'] : 'transparent' }} color={type == t.id ? theme['c-primary-font-active'] : theme['c-font']}>{t.label}</Text>
          </TouchableOpacity>
        ))
      }
    </ScrollView>
  )
}

const styles = createStyle({
  container: {
    height: '100%',
    flexGrow: 0,
    flexShrink: 1,
  },
  button: {
    justifyContent: 'center',
    paddingLeft: 8,
    paddingRight: 8,
  },
  buttonText: {
    textAlign: 'center',
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 3,
    paddingBottom: 3,
    borderBottomWidth: BorderWidths.normal3,
  },
})