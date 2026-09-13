import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Navigation } from 'react-native-navigation'

import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import StatusBar from '@/components/common/StatusBar'
import PageContent from '@/components/PageContent'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { findSingerId } from '@/screens/PlayDetail/components/SettingPopup/settings/jumpAction'

export interface JumpingScreenInfo {
  /** 跳转目标类型：singer 歌手详情 / album 专辑详情 */
  type: 'singer' | 'album'
  singerName?: string
  source?: LX.OnlineSource
  musicInfo?: {
    source: string
    name: string
    singer: string
    meta?: {
      albumId?: string | number | null
      albumName?: string
      picUrl?: string | null
    }
  }
}

/**
 * 跳转过渡页面（独立 RNN 页面）
 * 跳转歌手/专辑时 push 本页面：RNN push 新页面后读屏会自动聚焦页面首个可聚焦元素，
 * 读屏朗读"正在跳转"，不会落回播放设置弹窗（弹窗在关闭前已对读屏隐藏）。
 * 页面内完成反查歌手 id 等准备后，无动画移除本页并 push 目标页，读屏焦点落到目标页。
 */
export default ({ componentId, info }: { componentId: string, info: JumpingScreenInfo }) => {
  const theme = useTheme()
  const t = useI18n()
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void (async() => {
      const playDetailId = commonState.componentIds.playDetail
      try {
        if (info.type === 'singer' && info.singerName && info.source) {
          const singerId = await findSingerId(info.singerName, info.source)
          if (!singerId) throw new Error('singer not found')
          // 先无动画移除跳转页（回播放详情），再 push 目标页：
          // 播放详情弹窗已在关闭前对读屏隐藏，pop 不会读"播放设置"；push 后焦点落到目标页
          await Navigation.pop(componentId, { animations: { pop: { enabled: false } } }).catch(() => {})
          if (playDetailId) {
            navigations.pushSingerDetailScreen(playDetailId, {
              id: singerId,
              name: info.singerName,
              source: info.source,
            })
          }
        } else if (info.type === 'album' && info.musicInfo) {
          const musicInfo = info.musicInfo
          const albumId = musicInfo.meta?.albumId
          if (albumId == null) throw new Error('album id not found')
          await Navigation.pop(componentId, { animations: { pop: { enabled: false } } }).catch(() => {})
          if (playDetailId) {
            navigations.pushAlbumDetailScreen(playDetailId, {
              id: String(albumId),
              name: musicInfo.meta?.albumName ?? musicInfo.name,
              singer: musicInfo.singer,
              img: musicInfo.meta?.picUrl != null ? musicInfo.meta.picUrl : undefined,
              source: musicInfo.source as LX.OnlineSource,
            })
          }
        } else {
          throw new Error('invalid jump target')
        }
      } catch {
        // 跳转失败：移除跳转页回播放详情
        void Navigation.pop(componentId).catch(() => {})
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PageContent>
      <StatusBar />
      <View style={styles.center} accessible accessibilityRole="header"
        accessibilityLabel={t('jumping')}>
        <Loading size={40} color={theme['c-primary']} label={t('jumping')} />
        <Text size={15} color={theme['c-font-label']} style={styles.tip}>{t('jumping_tip')}</Text>
      </View>
    </PageContent>
  )
}

const styles = createStyle({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tip: {
    marginTop: 14,
  },
})
