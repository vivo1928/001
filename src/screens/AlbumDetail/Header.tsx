import { forwardRef, useImperativeHandle, useState } from 'react'
import { View } from 'react-native'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import Image from '@/components/common/Image'
import { useAlbumInfo } from './state'
import { useStatusbarHeight } from '@/store/common/hook'
import ActionBar from './ActionBar'

const IMAGE_WIDTH = 70

export interface DetailInfo {
  name: string
  desc: string
  imgUrl?: string
}

export interface HeaderType {
  setInfo: (info: DetailInfo) => void
}

export interface HeaderProps {
  componentId: string
}

export default forwardRef<HeaderType, HeaderProps>(({ componentId }, ref) => {
  const statusBarHeight = useStatusbarHeight()
  const theme = useTheme()
  const info = useAlbumInfo()
  const [detailInfo, setDetailInfo] = useState<DetailInfo>({
    name: info.name || '',
    desc: info.singer ? `${info.singer}${info.publish_date ? ' · ' + info.publish_date : ''}` : (info.publish_date || ''),
    imgUrl: info.img,
  })

  useImperativeHandle(ref, () => ({
    setInfo(info) {
      setDetailInfo(info)
    },
  }), [])

  return (
    <View style={{ ...styles.container, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
      <View style={{ flexDirection: 'row', flexGrow: 0, flexShrink: 0, padding: 10 }}>
        <View style={{ ...styles.img, width: IMAGE_WIDTH, height: IMAGE_WIDTH }}>
          <Image url={detailInfo.imgUrl} style={{ flex: 1, borderRadius: 4 }} />
        </View>
        <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, paddingLeft: 5 }}>
          <Text size={14} numberOfLines={1}>{detailInfo.name}</Text>
          <View style={{ flexGrow: 0, flexShrink: 1 }}>
            <Text size={13} color={theme['c-font-label']} numberOfLines={4}>{detailInfo.desc}</Text>
          </View>
        </View>
      </View>
      <ActionBar />
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    borderBottomWidth: BorderWidths.normal,
  },
  img: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
})