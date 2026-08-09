import { memo } from 'react'
import { View, Platform, TouchableOpacity } from 'react-native'
import { createStyle } from '@/utils/tools'
import { type ListInfoItem } from '@/store/songlist/state'
import Text from '@/components/common/Text'
import { scaleSizeW } from '@/utils/pixelRatio'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { useTheme } from '@/store/theme/hook'
import Image from '@/components/common/Image'

const gap = scaleSizeW(15)
export default memo(({ item, index, width, showSource, onPress, onCollect, isCollected }: {
  item: ListInfoItem
  index: number
  showSource: boolean
  width: number
  onPress: (item: ListInfoItem, index: number) => void
  onCollect?: (item: ListInfoItem) => void
  isCollected?: boolean
}) => {
  const theme = useTheme()
  const itemWidth = width - gap
  const handlePress = () => {
    onPress(item, index)
  }
  const handleCollect = () => {
    if (onCollect) {
      onCollect(item)
    }
  }
  const accessibilityDesc = item.author ? ` · ${item.author}` : ''
  const accessibilitySource = showSource && item.source ? ` · ${item.source}` : ''
  return (
    item.source
      ? (
          <TouchableOpacity activeOpacity={0.5} onPress={handlePress} accessibilityLabel={`${index + 1} ${item.name}${accessibilityDesc}${accessibilitySource}`} style={{ ...styles.listItem, width: itemWidth }}>
            <View style={{ ...styles.listItemImg, backgroundColor: theme['c-content-background'] }}>
              <Image url={item.img} nativeID={`${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_from_${item.id}`} style={{ width: itemWidth, height: itemWidth, borderRadius: 4 }} />
              { showSource ? <Text style={styles.sourceLabel} size={9} color="#fff" >{item.source}</Text> : null }
              { onCollect ? (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={handleCollect}
                  style={{
                    ...styles.collectButton,
                    backgroundColor: isCollected ? 'rgba(0, 150, 255, 0.75)' : 'rgba(0, 0, 0, 0.45)',
                  }}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityLabel={isCollected ? '取消收藏' : '收藏'}
                >
                  <Text size={14} color="#fff" style={styles.collectIcon}>{isCollected ? '✓' : '+'}</Text>
                </TouchableOpacity>
              ) : null }
            </View>
            <Text style={styles.listItemTitle} numberOfLines={ 2 }>{item.name}</Text>
          </TouchableOpacity>
        )
      : <View style={{ ...styles.listItem, width: itemWidth }} accessible={false} importantForAccessibility="no" />
  )
})

const styles = createStyle({
  listItem: {
    // width: 90,
    margin: 10,
  },
  listItemImg: {
    // backgroundColor: '#eee',
    borderRadius: 4,
    marginBottom: 5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 1,
        },
        shadowOpacity: 0.20,
        shadowRadius: 1.41,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sourceLabel: {
    paddingLeft: 4,
    paddingBottom: 2,
    paddingRight: 4,
    position: 'absolute',
    top: 0,
    right: 0,
    borderBottomLeftRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  collectButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectIcon: {
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  listItemTitle: {
    fontSize: 12,
    // overflow: 'hidden',
    marginBottom: 5,
  },
})