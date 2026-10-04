import { useEffect, useRef, useState } from 'react'
import { View, AccessibilityInfo } from 'react-native'

import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import StatusBar from '@/components/common/StatusBar'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { findSingerId } from '@/screens/PlayDetail/components/SettingPopup/settings/jumpAction'
import type { JumpingScreenInfo } from './index'

/**
 * 跳转过渡页（渲染在设置弹窗的同一个 Modal 窗口里）
 *
 * 采用"设置弹窗原地变身跳转页"：点击跳转后不关闭、重开任何窗口，
 * 直接把弹窗内容切换为全屏"正在跳转/跳转已完成"，目标页在窗口之下 push，
 * 完成后关闭弹窗落到目标页。
 *
 * 相比"关弹窗→弹浮层"：没有窗口切换，读屏不会空窗，也不会在过渡中重复播报弹窗标题，
 * 触摸浏览全程只会落在跳转页上。
 */
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

interface Props {
  info: JumpingScreenInfo
  /** 跳转流程结束（成功/失败）后回调，由父层决定关弹窗或回到设置页 */
  onFinished: (success: boolean) => void
}

export default ({ info, onFinished }: Props) => {
  const theme = useTheme()
  const t = useI18n()
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  const [phase, setPhase] = useState<'jumping' | 'done' | 'failed'>('jumping')
  const [failMessage, setFailMessage] = useState('')

  useEffect(() => {
    mountedRef.current = true
    // 页面出现即播报"正在跳转"，让读屏立刻感知已离开设置页
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
        // 跳转准备完成：展示"跳转已完成"，稍作停留让读屏/用户感知
        setPhase('done')
        AccessibilityInfo.announceForAccessibility(t('jumping_done'))
        await wait(450)
        if (!mountedRef.current) return
        // 直接在弹窗之下 push 目标页，完成后关弹窗落到目标页
        if (singerId) {
          navigations.pushSingerDetailScreen(playDetailId, {
            id: singerId,
            name: info.singerName!,
            source: info.source!,
          })
        } else if (albumInfo) {
          navigations.pushAlbumDetailScreen(playDetailId, albumInfo)
        }
        // 目标页 push 走 rAF 派发，稍等其下发到原生并提交后再关弹窗，避免中间露出播放详情
        await wait(150)
        if (!mountedRef.current) return
        onFinished(true)
      } catch {
        if (!mountedRef.current) return
        // 跳转失败：展示失败原因，稍作停留后回到设置页，并 Toast + 读屏播报提示
        const message = info.type === 'singer'
          ? t('play_detail_setting_jump_singer_failed')
          : t('play_detail_setting_jump_album_failed')
        setFailMessage(message)
        setPhase('failed')
        toast(message)
        AccessibilityInfo.announceForAccessibility(message)
        await wait(1000)
        if (!mountedRef.current) return
        onFinished(false)
      }
    })()
    return () => {
      mountedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: theme['c-content-background'] }}>
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
    </View>
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
