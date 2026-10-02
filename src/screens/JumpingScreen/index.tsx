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
 * 跳转过渡页面（独立 RNN 页面，全屏）
 * 流程：push 本页 → 显示"正在跳转" → 完成反查歌手 id 等准备 → 显示"跳转已完成"
 * → 稍作停留后无动画移除本页并 push 目标页，读屏焦点落到目标页。
 * 弹窗在关闭前已对读屏隐藏，因此读屏会直接聚焦本页，不会落回播放设置弹窗。
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
        // 跳转准备完成：先展示"跳转已完成"，稍作停留让读屏/用户感知，再过渡到目标页
        setPhase('done')
        AccessibilityInfo.announceForAccessibility(t('jumping_done'))
        await wait(600)
        if (!mountedRef.current) return
        // 无动画移除跳转页（回播放详情），再 push 目标页：
        // 播放详情弹窗已在关闭前对读屏隐藏，pop 不会读"播放设置"；push 后焦点落到目标页
        await Navigation.pop(componentId, { animations: { pop: { enabled: false } } }).catch(() => {})
        if (!mountedRef.current) return
        if (singerId) {
          navigations.pushSingerDetailScreen(playDetailId, {
            id: singerId,
            name: info.singerName!,
            source: info.source!,
          })
        } else if (albumInfo) {
          navigations.pushAlbumDetailScreen(playDetailId, albumInfo)
        }
      } catch {
        if (!mountedRef.current) return
        // 跳转失败：展示失败原因，稍作停留后无动画移除本页回播放详情，并 Toast + 读屏播报提示
        const message = info.type === 'singer'
          ? t('play_detail_setting_jump_singer_failed')
          : t('play_detail_setting_jump_album_failed')
        setFailMessage(message)
        setPhase('failed')
        toast(message)
        AccessibilityInfo.announceForAccessibility(message)
        await wait(1200)
        if (!mountedRef.current) return
        void Navigation.pop(componentId, { animations: { pop: { enabled: false } } }).catch(() => {})
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
