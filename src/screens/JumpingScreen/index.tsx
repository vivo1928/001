import { useEffect, useRef, useState } from 'react'
import { View, AccessibilityInfo } from 'react-native'
import { Navigation } from 'react-native-navigation'

import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
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
 * 跳转过渡浮层（RNN overlay，全屏）
 * 流程：弹出浮层显示"正在跳转" → 完成反查歌手 id 等准备 → 显示"跳转已完成"
 * → 直接把目标页 push 到导航栈（在浮层之下），随后 dismiss 浮层落到目标页，读屏焦点跟随到目标页。
 * 采用 overlay 而非独立页面：目标页只需一次 push，不需要"pop 跳转页 + push 目标页"，
 * 避免 Android 上该连环操作不可靠或延迟导致读屏/触摸浏览长时间停留在播放详情。
 * 浮层配置 interceptTouchOutside=true，跳转期间触摸会被浮层拦截，不会穿透到播放详情。
 */
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export default ({ componentId, info }: { componentId: string, info: JumpingScreenInfo }) => {
  const theme = useTheme()
  const t = useI18n()
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  const [phase, setPhase] = useState<'jumping' | 'done' | 'failed'>('jumping')
  const [failMessage, setFailMessage] = useState('')

  useEffect(() => {
    mountedRef.current = true
    // 浮层出现时播报"正在跳转"，让读屏立刻感知已离开播放详情
    AccessibilityInfo.announceForAccessibility(t('jumping'))
    if (startedRef.current) return
    startedRef.current = true
    void (async() => {
      const playDetailId = commonState.componentIds.playDetail
      try {
        if (!playDetailId) throw new Error('play detail not found')
        let singerId: string | null = null
        let albumInfo: { id: string, name: string, singer: string, img?: string, source: LX.OnlineSource } | null = null
        if (info.type === 'singer' && info.singerName && info.source) {
          singerId = await findSingerId(info.singerName, info.source)
          if (!singerId) throw new Error('singer not found')
        } else if (info.type === 'album' && info.musicInfo) {
          const musicInfo = info.musicInfo
          const albumId = musicInfo.meta?.albumId
          if (albumId == null) throw new Error('album id not found')
          albumInfo = {
            id: String(albumId),
            name: musicInfo.meta?.albumName ?? musicInfo.name,
            singer: musicInfo.singer,
            img: musicInfo.meta?.picUrl != null ? musicInfo.meta.picUrl : undefined,
            source: musicInfo.source as LX.OnlineSource,
          }
        } else {
          throw new Error('invalid jump target')
        }
        if (!mountedRef.current) return
        // 跳转准备完成：先展示"跳转已完成"，稍作停留让读屏/用户感知
        setPhase('done')
        AccessibilityInfo.announceForAccessibility(t('jumping_done'))
        await wait(450)
        if (!mountedRef.current) return
        // 直接在浮层之下 push 目标页，再 dismiss 浮层：读屏焦点直接落到目标页，不会经过播放详情
        if (singerId) {
          navigations.pushSingerDetailScreen(playDetailId, {
            id: singerId,
            name: info.singerName!,
            source: info.source!,
          })
        } else if (albumInfo) {
          navigations.pushAlbumDetailScreen(playDetailId, albumInfo)
        }
        // 目标页 push 走 rAF 派发，稍等其下发到原生并提交后再关闭浮层，避免中间露出播放详情
        await wait(150)
        if (!mountedRef.current) return
        void Navigation.dismissOverlay(componentId).catch(() => {})
      } catch {
        if (!mountedRef.current) return
        // 跳转失败：展示失败原因，稍作停留后关闭浮层回播放详情，并 Toast + 读屏播报提示
        const message = info.type === 'singer'
          ? t('play_detail_setting_jump_singer_failed')
          : t('play_detail_setting_jump_album_failed')
        setFailMessage(message)
        setPhase('failed')
        toast(message)
        AccessibilityInfo.announceForAccessibility(message)
        await wait(1000)
        if (!mountedRef.current) return
        void Navigation.dismissOverlay(componentId).catch(() => {})
      }
    })()
    return () => {
      mountedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PageContent>
      <StatusBar />
      {phase === 'jumping' ? (
        <View style={styles.center} accessible accessibilityRole="header"
          accessibilityLabel={t('jumping')}>
          <Loading size={40} color={theme['c-primary']} label={t('jumping')} />
          <Text size={15} color={theme['c-font-label']} style={styles.tip}>{t('jumping_tip')}</Text>
        </View>
      ) : phase === 'done' ? (
        <View style={styles.center} accessible accessibilityRole="header"
          accessibilityLabel={t('jumping_done')}>
          <Text size={17} color={theme['c-primary']}>{t('jumping_done')}</Text>
        </View>
      ) : (
        <View style={styles.center} accessible accessibilityRole="header"
          accessibilityLabel={failMessage}>
          <Text size={15} color={theme['c-danger'] || '#ff4444'} style={styles.tip}>{failMessage}</Text>
        </View>
      )}
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
