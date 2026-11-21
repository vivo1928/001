import { useTheme } from '@/store/theme/hook'
import { useMemo, useRef, useImperativeHandle, forwardRef } from 'react'
import { Pressable, type PressableProps, StyleSheet, type View, type ViewProps } from 'react-native'
import { appLog } from '@/utils/appLog'
// import { AppColors } from '@/theme'


export interface BtnProps extends PressableProps {
  ripple?: PressableProps['android_ripple']
  style?: ViewProps['style']
  onChangeText?: (value: string) => void
  onClearText?: () => void
  children: React.ReactNode
}


export interface BtnType {
  measure: (callback: (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void) => void
}

export default forwardRef<BtnType, BtnProps>(({ ripple: propsRipple = {}, disabled, children, style, accessibilityLabel, onPress, onLongPress, ...props }, ref) => {
  const theme = useTheme()
  const btnRef = useRef<View>(null)
  const ripple = useMemo(() => ({
    color: theme['c-primary-light-200-alpha-700'],
    ...propsRipple,
  }), [theme, propsRipple])

  useImperativeHandle(ref, () => ({
    measure(callback) {
      btnRef.current?.measure(callback)
    },
  }))

  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined)
  const handlePress: PressableProps['onPress'] = (e) => {
    appLog('tap', { label, disabled: !!disabled })
    onPress?.(e)
  }
  const handleLongPress: PressableProps['onLongPress'] = (e) => {
    appLog('longtap', { label, disabled: !!disabled })
    onLongPress?.(e)
  }

  return (
    <Pressable
      android_ripple={ripple}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      style={StyleSheet.compose({ opacity: disabled ? 0.3 : 1 }, style)}
      {...props}
      ref={btnRef}
    >
      {children}
    </Pressable>
  )
})

