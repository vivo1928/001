import { TouchableOpacity } from 'react-native'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export default ({ icon, color, onPress, accessibilityLabel }: {
  icon: string
  color?: string
  onPress: () => void
  accessibilityLabel?: string
}) => {
  return (
    <TouchableOpacity onPress={onPress} style={{ ...styles.button, width: HEADER_HEIGHT }}
      accessibilityLabel={accessibilityLabel} accessibilityRole="button">
      <Icon name={icon} color={color} size={18} />
    </TouchableOpacity>
  )
}

const styles = createStyle({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    flex: 0,
  },
})
