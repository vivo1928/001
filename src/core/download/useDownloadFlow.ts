import { useRef } from 'react'
import DownloadManager, { type DownloadEventListener } from './manager'
import { requestStoragePermission } from '@/utils/permissions'
import { toast } from '@/utils/tools'
import { useI18n } from '@/lang'

// 结构化句柄：与具体组件解耦，便于测试与替换实现
export interface DownloadProgressModalHandle {
  show: (title: string, options: { onCancel: () => void }) => void
  updateProgress: (progress: number, statusText?: string) => void
  close: () => void
}

export interface DownloadQualityModalHandle {
  show: (musicInfo: LX.Music.MusicInfoOnline, options: { onSelect: (quality: LX.Quality) => void, showFileSize?: boolean }) => void
}

export interface FailedSongInfo {
  name: string
  singer: string
  error?: string
}

export interface DownloadFailedModalHandle {
  show: (options: { message: string, onRetry: () => void, onCancel: () => void }) => void
  showFailedSongs: (failedSongs: FailedSongInfo[], options: { onRetryAll: () => void, onCancel: () => void }) => void
}

export interface ConfirmAlertHandle {
  setVisible: (visible: boolean) => void
}

export interface DownloadFlowRefs {
  progress: { current: DownloadProgressModalHandle | null }
  quality?: { current: DownloadQualityModalHandle | null }
  failed?: { current: DownloadFailedModalHandle | null }
  confirmAlert?: { current: ConfirmAlertHandle | null }
}

export interface DownloadSingleOptions {
  /** 指定音质则跳过音质选择弹窗 */
  quality?: LX.Quality
  /** 音质选择弹窗是否展示文件大小 */
  showFileSize?: boolean
  /** 进度弹窗标题，默认歌曲名 */
  title?: string
}

export interface DownloadBatchOptions {
  /** 子目录（歌单/专辑名） */
  subDir?: string
  /** 进度弹窗标题，默认 download_batch */
  title?: string
}

export interface DownloadFlow {
  downloadSingle: (musicInfo: LX.Music.MusicInfoOnline, options?: DownloadSingleOptions) => void
  downloadBatch: (list: LX.Music.MusicInfoOnline[], options?: DownloadBatchOptions) => void
  /** 带加载阶段的批量下载：进度弹窗展示加载态，loader 返回完整列表后进入音质选择 */
  downloadBatchWithLoader: (loader: () => Promise<LX.Music.MusicInfoOnline[]>, options?: DownloadBatchOptions) => Promise<void>
  getManager: () => DownloadManager
}

export type BatchSettleAction = 'wait' | 'retry' | 'settle'

/**
 * 批量下载收尾判定（纯逻辑，供测试直调）
 * - wait：任务未全部结束
 * - retry：首轮结束且有失败，进入重试
 * - settle：收尾（首轮全成功，或重试轮结束）
 */
export const getBatchSettleAction = (
  phase: 'first' | 'retry',
  done: number,
  total: number,
  firstPassFailedCount: number,
): BatchSettleAction => {
  if (done < total) return 'wait'
  if (phase === 'first') return firstPassFailedCount > 0 ? 'retry' : 'settle'
  return 'settle'
}

interface BatchState {
  taskIds: string[]
  total: number
  phase: 'first' | 'retry'
  firstPassFailed: FailedSongInfo[]
  retryList: LX.Music.MusicInfoOnline[]
  retryIds: string[]
}

/**
 * 统一下载流程控制器：
 * 权限申请、音质选择、进度弹窗、取消语义、完成/失败/降级提示、批量统计与一次重试。
 * 事件经 manager.on() 订阅，多个流程可并存且互不覆盖（取代旧的整体覆盖回调写法）。
 */
export default function useDownloadFlow(refs: DownloadFlowRefs): DownloadFlow {
  const t = useI18n()
  const managerRef = useRef<DownloadManager | null>(null)
  if (!managerRef.current) managerRef.current = new DownloadManager()
  const manager = managerRef.current
  // 单曲流程跟踪的任务集合：同一流程可能有多个任务排队，
  // 全部结束才关闭进度弹窗，避免先完成的任务提前关掉弹窗
  const singleTasksRef = useRef<Set<string>>(new Set())

  const ensurePermission = async(): Promise<boolean> => {
    const granted = await requestStoragePermission()
    if (!granted) refs.confirmAlert?.current?.setVisible(true)
    return granted
  }

  const startSingle = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality, options?: DownloadSingleOptions) => {
    void (async() => {
      if (!await ensurePermission()) return
      const progress = refs.progress.current
      progress?.show(options?.title ?? musicInfo.name, {
        onCancel: () => {
          manager.cancelAll()
          progress?.close()
        },
      })
      const taskId = manager.addToQueue(musicInfo, quality)
      singleTasksRef.current.add(taskId)
      const off = manager.on({
        onProgress: (id, p) => {
          if (id === taskId) progress?.updateProgress(p)
        },
        onComplete: (id, success, error) => {
          if (!singleTasksRef.current.delete(id)) return
          off()
          if (success) {
            toast(t('download_completed') as string)
          } else if (error === 'cancelled') {
            toast(t('download_cancelled') as string)
          } else {
            refs.failed?.current?.show({
              message: `${musicInfo.singer} - ${musicInfo.name} ${t('download_failed_title') as string}`,
              onRetry: () => { startSingle(musicInfo, quality, options) },
              onCancel: () => {},
            })
          }
          if (singleTasksRef.current.size === 0) progress?.close()
        },
      })
    })()
  }

  const downloadSingle = (musicInfo: LX.Music.MusicInfoOnline, options?: DownloadSingleOptions) => {
    if (options?.quality) {
      startSingle(musicInfo, options.quality, options)
      return
    }
    refs.quality?.current?.show(musicInfo, {
      showFileSize: options?.showFileSize ?? false,
      onSelect: (quality) => { startSingle(musicInfo, quality, options) },
    })
  }

  const startBatch = (list: LX.Music.MusicInfoOnline[], quality: LX.Quality, options?: DownloadBatchOptions) => {
    void (async() => {
      if (!await ensurePermission()) return
      const progress = refs.progress.current
      const title = options?.title ?? (t('download_batch') as string)
      const state: BatchState = {
        taskIds: [],
        total: list.length,
        phase: 'first',
        firstPassFailed: [],
        retryList: [],
        retryIds: [],
      }

      let off = () => {}
      const cancelHandler = () => {
        manager.cancelAll()
        progress?.close()
        off()
      }

      const doneCountOf = () => manager.getTasksByIds(state.taskIds)
        .filter(x => x.status === 'completed' || x.status === 'failed').length

      const updateProgressText = (perTaskPercent?: number) => {
        const doneCount = doneCountOf()
        const currentSong = Math.min(doneCount + 1, state.total)
        const percent = state.total > 0 ? Math.min(Math.round((doneCount / state.total) * 100), 100) : 0
        progress?.updateProgress(
          percent,
          perTaskPercent == null
            ? t('download_current_progress', { current: currentSong, total: state.total }) as string
            : `${t('download_current_progress', { current: currentSong, total: state.total }) as string} ${perTaskPercent}%`,
        )
      }

      const settle = () => {
        off()
        progress?.close()
        if (state.phase === 'first') {
          toast(t('download_completed') as string)
          return
        }
        const finalFailed = state.firstPassFailed.filter((f) => {
          const idx = state.retryList.findIndex(item => item.name === f.name && item.singer === f.singer)
          if (idx === -1) return false
          const retryTask = manager.getTasksByIds([state.retryIds[idx]])[0]
          return retryTask ? retryTask.status === 'failed' : false
        })
        if (finalFailed.length > 0) {
          refs.failed?.current?.showFailedSongs(finalFailed, {
            onRetryAll: () => {
              downloadBatch(list.filter(item =>
                finalFailed.some(f => f.name === item.name && f.singer === item.singer),
              ), options)
            },
            onCancel: () => {},
          })
        } else {
          toast(t('download_completed') as string)
        }
      }

      const listener: DownloadEventListener = {
        onProgress: (_id, p) => {
          updateProgressText(p)
        },
        onComplete: (id, success, error) => {
          const task = manager.getTasksByIds([id])[0]
          if (!success && error !== 'cancelled' && state.phase === 'first' && task) {
            state.firstPassFailed.push({ name: task.musicInfo.name, singer: task.musicInfo.singer, error })
          }
          const action = getBatchSettleAction(state.phase, doneCountOf(), state.taskIds.length, state.firstPassFailed.length)
          if (action === 'wait') {
            updateProgressText()
            return
          }
          if (action === 'retry') {
            const retryList = list.filter(item =>
              state.firstPassFailed.some(f => f.name === item.name && f.singer === item.singer),
            )
            if (retryList.length === 0) {
              settle()
              return
            }
            state.phase = 'retry'
            state.retryList = retryList
            progress?.show(title, { onCancel: cancelHandler })
            state.retryIds = manager.addBatchToQueue(retryList, quality, options?.subDir)
            state.taskIds.push(...state.retryIds)
            return
          }
          settle()
        },
      }

      off = manager.on(listener)
      progress?.show(title, { onCancel: cancelHandler })
      state.taskIds = manager.addBatchToQueue(list, quality, options?.subDir)
    })()
  }

  const downloadBatch = (list: LX.Music.MusicInfoOnline[], options?: DownloadBatchOptions) => {
    if (!list.length) return
    refs.quality?.current?.show(list[0], {
      showFileSize: false,
      onSelect: (quality) => { startBatch(list, quality, options) },
    })
  }

  const downloadBatchWithLoader = async(loader: () => Promise<LX.Music.MusicInfoOnline[]>, options?: DownloadBatchOptions) => {
    const progress = refs.progress.current
    let cancelled = false
    progress?.show(options?.title ?? (t('download_batch') as string), {
      onCancel: () => {
        cancelled = true
        progress?.close()
      },
    })
    let list: LX.Music.MusicInfoOnline[] = []
    try {
      list = await loader()
    } catch {
      list = []
    }
    progress?.close()
    if (cancelled || !list.length) return
    downloadBatch(list, options)
  }

  return { downloadSingle, downloadBatch, downloadBatchWithLoader, getManager: () => manager }
}
