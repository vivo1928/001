import { useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { View, TextInput } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'

export interface RangeSelectModalType {
  show: (maxIndex: number, options: { onConfirm: (start: number, end: number) => void }) => void
}

export default forwardRef<RangeSelectModalType>((_props, ref) => {
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [maxIndex, setMaxIndex] = useState(0)
  const [onConfirm, setOnConfirm] = useState<((start: number, end: number) => void) | null>(null)
  const [errorText, setErrorText] = useState('')
  const theme = useTheme()
  const t = useI18n()

  useImperativeHandle(ref, () => ({
    show(maxIndex, options) {
      setMaxIndex(maxIndex)
      setOnConfirm(() => options.onConfirm)
      setStartText('')
      setEndText('')
      setErrorText('')
      if (visible) {
        dialogRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
      }
    },
  }))

  const handleConfirm = useCallback(() => {
    const start = parseInt(startText, 10)
    const end = parseInt(endText, 10)

    if (isNaN(start) || isNaN(end)) {
      setErrorText('请输入有效的数字')
      return
    }

    if (start < 1 || end < 1) {
      setErrorText('序号必须大于0')
      return
    }

    if (start > end) {
      setErrorText('起始序号不能大于结尾序号')
      return
    }

    if (end > maxIndex) {
      setErrorText(`结尾序号不能超过 ${maxIndex}`)
      return
    }

    setErrorText('')
    onConfirm?.(start, end)
    dialogRef.current?.setVisible(false)
  }, [startText, endText, maxIndex, onConfirm])

  return (
    visible
      ? (
        <Dialog ref={dialogRef} title={t('download_choose_range')} closeBtn={true} bgHide={false}>
          <View style={styles.container}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text size={13} color={theme['c-font-label']} style={styles.label}>{t('download_range_start')}</Text>
                <TextInput
                  style={{
                    ...styles.input,
                    backgroundColor: theme['c-primary-input-background'],
                    color: theme['c-font'],
                    borderColor: theme['c-border-background'],
                  }}
                  value={startText}
                  onChangeText={setStartText}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={theme['c-font-label']}
                  accessibilityLabel={t('download_range_start')}
                />
              </View>
              <Text size={14} color={theme['c-font']} style={styles.separator} importantForAccessibility="no-hide-descendants">—</Text>
              <View style={styles.inputGroup}>
                <Text size={13} color={theme['c-font-label']} style={styles.label}>{t('download_range_end')}</Text>
                <TextInput
                  style={{
                    ...styles.input,
                    backgroundColor: theme['c-primary-input-background'],
                    color: theme['c-font'],
                    borderColor: theme['c-border-background'],
                  }}
                  value={endText}
                  onChangeText={setEndText}
                  keyboardType="number-pad"
                  placeholder={`${maxIndex}`}
                  placeholderTextColor={theme['c-font-label']}
                  accessibilityLabel={t('download_range_end')}
                />
              </View>
            </View>
            {errorText ? (
              <Text size={12} color="#FF4444" style={styles.errorText}>{errorText}</Text>
            ) : null}
            <View style={styles.btnRow}>
              <Button onPress={() => dialogRef.current?.setVisible(false)} style={styles.btn}
                accessibilityLabel={t('cancel')}>
                <Text color={theme['c-button-font']}>{t('cancel')}</Text>
              </Button>
              <Button onPress={handleConfirm} style={styles.btn}
                accessibilityLabel={t('download_range_confirm')}>
                <Text color={theme['c-button-font']}>{t('download_range_confirm')}</Text>
              </Button>
            </View>
          </View>
        </Dialog>
      )
      : null
  )
})

const styles = createStyle({
  container: {
    paddingTop: 10,
    paddingBottom: 15,
    paddingLeft: 5,
    paddingRight: 5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
    paddingRight: 10,
  },
  inputGroup: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    marginBottom: 6,
  },
  separator: {
    marginLeft: 10,
    marginRight: 10,
    paddingBottom: 8,
  },
  input: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderRadius: 4,
    paddingLeft: 10,
    paddingRight: 10,
    textAlign: 'center',
    fontSize: 16,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 8,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 15,
    gap: 15,
  },
  btn: {
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 4,
  },
})