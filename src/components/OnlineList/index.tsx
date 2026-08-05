import { useRef, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { View, Linking, AccessibilityInfo } from 'react-native'
// import LoadingMask, { LoadingMaskType } from '@/components/common/LoadingMask'
import List, { type ListProps, type ListType, type Status, type RowInfoType } from './List'
import ListMenu, { type ListMenuType, type Position, type SelectInfo } from './ListMenu'
import ListMusicMultiAdd, { type MusicMultiAddModalType as ListAddMultiType } from '@/components/MusicMultiAddModal'
import ListMusicAdd, { type MusicAddModalType as ListMusicAddType } from '@/components/MusicAddModal'
import MultipleModeBar, { type MultipleModeBarType, type SelectMode } from './MultipleModeBar'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import RangeSelectModal, { type RangeSelectModalType } from '@/components/RangeSelectModal'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import { handleDislikeMusic, handlePlay, handlePlayLater, handleShare, handleShowMusicSourceDetail } from './listAction'
import { createStyle } from '@/utils/tools'
import { requestStoragePermission } from '@/utils/permissions'
import { useBackHandler } from '@/utils/hooks/useBackHandler'
import DownloadManager, { type DownloadTask } from '@/core/download/manager'

export interface OnlineListProps {
  onRefresh: ListProps['onRefresh']
  onLoadMore: ListProps['onLoadMore']
  onPlayList?: ListProps['onPlayList']
  progressViewOffset?: ListProps['progressViewOffset']
  ListHeaderComponent?: ListProps['ListHeaderComponent']
  checkHomePagerIdle?: boolean
  rowType?: RowInfoType
  // 批量下载回调（可选，由外部决定是否展示批量下载按钮）
  onBatchDownload?: (selectedList: LX.Music.MusicInfoOnline[]) => void
}
export interface OnlineListType {
  setList: (list: LX.Music.MusicInfoOnline[], isAppend?: boolean, showSource?: boolean) => void
  setStatus: (val: Status) => void
  getList: () => LX.Music.MusicInfoOnline[]
  getSelectedList: () => LX.Music.MusicInfoOnline[]
  selectRange: (list: LX.Music.MusicInfoOnline[]) => void
  startBatchDownload: (list: LX.Music.MusicInfoOnline[], subDir?: string) => void
}

const downloadManager = new DownloadManager(
  // onProgress
  (taskId, progress) => {
    // 进度更新由具体的下载流程控制
  },
  // onComplete
  (taskId, success, error) => {
    // 完成回调由具体的下载流程控制
  },
)

export default forwardRef<OnlineListType, OnlineListProps>(({
  onRefresh,
  onLoadMore,
  onPlayList,
  progressViewOffset,
  ListHeaderComponent,
  checkHomePagerIdle = false,
  rowType,
  onBatchDownload,
}, ref) => {
  const listRef = useRef<ListType>(null)
  const multipleModeBarRef = useRef<MultipleModeBarType>(null)
  const listMusicAddRef = useRef<ListMusicAddType>(null)
  const listMusicMultiAddRef = useRef<ListAddMultiType>(null)
  const listMenuRef = useRef<ListMenuType>(null)
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)
  const rangeSelectRef = useRef<RangeSelectModalType>(null)
  const confirmAlertRef = useRef<ConfirmAlertType>(null)
  // const loadingMaskRef = useRef<LoadingMaskType>(null)

  // 当前正在下载的上下文
  const downloadContextRef = useRef<{
    tasks: DownloadTask[]
    quality: LX.Quality
    isBatch: boolean
    failedSongs: Array<{ name: string, singer: string, error?: string }>
  }>({ tasks: [], quality: '128k', isBatch: false, failedSongs: [] })

  useImperativeHandle(ref, () => ({
    setList(list, isAppend = false, showSource = false) {
      listRef.current?.setList(list, isAppend, showSource)
      multipleModeBarRef.current?.setIsSelectAll(false)
    },
    setStatus(val) {
      listRef.current?.setStatus(val)
    },
    getList() {
      return listRef.current?.getList() ?? []
    },
    getSelectedList() {
      return listRef.current?.getSelectedList() ?? []
    },
    selectRange(list) {
      listRef.current?.selectRange(list)
    },
    startBatchDownload(list, subDir) {
      handleStartDownload(list, subDir)
    },
  }))

  // ============ 多选模式 ============
  const hancelMultiSelect = useCallback(() => {
    multipleModeBarRef.current?.show()
    listRef.current?.setIsMultiSelectMode(true)
  }, [])
  const hancelSwitchSelectMode = useCallback((mode: SelectMode) => {
    multipleModeBarRef.current?.setSwitchMode(mode)
    listRef.current?.setSelectMode(mode)
  }, [])
  const handleRangeSelect = useCallback(() => {
    const list = listRef.current?.getList() ?? []
    if (list.length === 0) return
    rangeSelectRef.current?.show(list.length, {
      onConfirm: (start, end) => {
        // 选中区间 [start-1, end-1] 的歌曲
        const selected = list.slice(start - 1, end)
        listRef.current?.selectRange(selected)
      },
    })
  }, [])
  const hancelExitSelect = useCallback(() => {
    multipleModeBarRef.current?.exitSelectMode()
    listRef.current?.setIsMultiSelectMode(false)
    // 无障碍播报：已退出多选模式
    AccessibilityInfo.announceForAccessibility(
      global.i18n.t('download_multi_select_exit') || '已退出多选模式',
    )
  }, [])

  // 多选模式下按返回键退出多选模式，而不是返回上一级
  useBackHandler(useCallback(() => {
    if (!listRef.current?.isMultiSelectMode()) return false
    hancelExitSelect()
    return true
  }, [hancelExitSelect]))

  // 切换首页模块（排行榜/歌单等）时自动退出多选模式
  useEffect(() => {
    const handleHomePageChange = () => {
      if (!listRef.current?.isMultiSelectMode()) return
      hancelExitSelect()
    }
    global.state_event.on('homePageChange', handleHomePageChange)
    return () => {
      global.state_event.off('homePageChange', handleHomePageChange)
    }
  }, [hancelExitSelect])

  const showMenu = (musicInfo: LX.Music.MusicInfoOnline, index: number, position: Position) => {
    listMenuRef.current?.show({
      musicInfo,
      index,
      single: false,
      selectedList: listRef.current!.getSelectedList(),
    }, position)
  }

  // ============ 单个歌曲下载 ============
  const handleSingleDownload = (info: SelectInfo) => {
    const musicInfo = info.musicInfo
    // 显示音质选择（含文件大小）
    downloadQualityRef.current?.show(musicInfo, {
      showFileSize: true,
      onSelect: (quality) => {
        void startSingleDownload(musicInfo, quality)
      },
    })
  }

  const startSingleDownload = async(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
    // 下载前先申请存储权限
    const granted = await requestStoragePermission()
    if (!granted) {
      confirmAlertRef.current?.setVisible(true)
      return
    }

    downloadContextRef.current = { tasks: [], quality, isBatch: false, failedSongs: [] }
    // 显示进度弹窗
    downloadProgressRef.current?.show(musicInfo.name, {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })

    // 添加下载任务
    const taskId = downloadManager.addToQueue(musicInfo, quality)
    const task = downloadManager.getQueue().find(t => t.id === taskId)!

    // 设置进度回调
    const originalOnProgress = downloadManager['onProgress']
    downloadManager['onProgress'] = (id, progress) => {
      if (id === taskId) {
        downloadProgressRef.current?.updateProgress(progress)
      }
    }

    // 设置完成回调
    const originalOnComplete = downloadManager['onComplete']
    downloadManager['onComplete'] = (id, success, error) => {
      if (id !== taskId) return
      downloadProgressRef.current?.close()
      if (success) {
        // 下载成功，关闭弹窗
      } else {
        // 下载失败，显示失败弹窗
        downloadFailedRef.current?.show({
          message: `${musicInfo.singer} - ${musicInfo.name} 下载失败`,
          onRetry: () => {
            void startSingleDownload(musicInfo, quality)
          },
          onCancel: () => {},
        })
      }
      // 恢复回调
      downloadManager['onProgress'] = originalOnProgress
      downloadManager['onComplete'] = originalOnComplete
    }
  }

  // ============ 批量下载 ============
  const handleBatchDownload = useCallback(() => {
    const selectedList = listRef.current?.getSelectedList() ?? []
    if (!selectedList.length) return
    handleStartDownload(selectedList)
  }, [])

  const handleStartDownload = (list: LX.Music.MusicInfoOnline[], subDir?: string) => {
    if (!list.length) return
    // 显示音质选择（不显示文件大小）
    downloadQualityRef.current?.show(list[0], {
      showFileSize: false,
      onSelect: (quality) => {
        void startBatchDownload(list, quality, subDir)
      },
    })
  }

  const startBatchDownload = async(list: LX.Music.MusicInfoOnline[], quality: LX.Quality, subDir?: string) => {
    const total = list.length

    // 下载前先申请存储权限
    const granted = await requestStoragePermission()
    if (!granted) {
      confirmAlertRef.current?.setVisible(true)
      return
    }

    downloadContextRef.current = {
      tasks: [],
      quality,
      isBatch: true,
      failedSongs: [],
    }

    // 显示进度弹窗
    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
        downloadContextRef.current.failedSongs = []
      },
    })

    // 添加所有任务到队列
    const taskIds = downloadManager.addBatchToQueue(list, quality, subDir)
    const allTasks = downloadManager.getQueue().filter(t => taskIds.includes(t.id))
    downloadContextRef.current.tasks = allTasks

    let completedCount = 0
    let failedCount = 0
    const failedSongs: Array<{ name: string, singer: string, error?: string }> = []

    // 设置进度回调
    const originalOnProgress = downloadManager['onProgress']
    downloadManager['onProgress'] = (id, progress) => {
      const task = allTasks.find(t => t.id === id)
      if (!task) return
      task.progress = progress
      const currentCompleted = downloadManager.getStats().completed
      const currentFailed = downloadManager.getStats().failed
      const doneCount = currentCompleted + currentFailed
      const currentSong = doneCount + 1
      downloadProgressRef.current?.updateProgress(
        total > 0 ? Math.round((doneCount / total) * 100) : 0,
        `${global.i18n.t('download_current_progress', { current: currentSong, total })} ${progress}%`,
      )
    }

    // 设置完成回调
    const originalOnComplete = downloadManager['onComplete']
    downloadManager['onComplete'] = (id, success, error) => {
      const task = allTasks.find(t => t.id === id)
      if (!task) return
      if (success) {
        completedCount++
      } else if (error !== 'cancelled') {
        failedCount++
        failedSongs.push({
          name: task.musicInfo.name,
          singer: task.musicInfo.singer,
          error,
        })
      }

      const stats = downloadManager.getStats()
      const doneCount = stats.completed + stats.failed
      const totalProgress = total > 0 ? Math.round((doneCount / total) * 100) : 0

      if (doneCount < total) {
        const currentSong = doneCount + 1
        downloadProgressRef.current?.updateProgress(
          totalProgress,
          `${global.i18n.t('download_current_progress', { current: currentSong, total })}`,
        )
      }

      // 所有任务完成
      if (doneCount >= total) {
        downloadProgressRef.current?.close()

        // 如果有失败的任务，尝试重试一次
        if (failedSongs.length > 0) {
          // 先重试失败的歌曲
          const retryList = list.filter((_, i) => failedSongs.some(f => f.name === list[i].name && f.singer === list[i].singer))
          if (retryList.length > 0) {
            // 更新进度
            downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
              onCancel: () => {
                downloadManager.cancelAll()
                downloadProgressRef.current?.close()
              },
            })
            // 重试失败的歌曲
            const retryIds = downloadManager.addBatchToQueue(retryList, quality, subDir)
            const retryTasks = downloadManager.getQueue().filter(t => retryIds.includes(t.id))
            allTasks.push(...retryTasks)

            // 重试完成后检查最终结果
            const retryOnComplete = downloadManager['onComplete']
            downloadManager['onComplete'] = (retryId, retrySuccess, retryError) => {
              const retryStats = downloadManager.getStats()
              if (retryStats.completed + retryStats.failed >= allTasks.length) {
                downloadProgressRef.current?.close()
                // 检查最终失败列表
                const finalFailed = failedSongs.filter(f => {
                  const retryTask = allTasks.find(t =>
                    t.musicInfo.name === f.name && t.musicInfo.singer === f.singer && t.status === 'failed',
                  )
                  return retryTask != null
                })
                if (finalFailed.length > 0) {
                  downloadFailedRef.current?.showFailedSongs(finalFailed, {
                    onRetryAll: () => {
                      // 重新下载所有失败的歌曲
                      startBatchDownload(
                        list.filter((_, i) => finalFailed.some(f => f.name === list[i].name && f.singer === list[i].singer)),
                        quality,
                        subDir,
                      )
                    },
                    onCancel: () => {},
                  })
                }
                downloadManager['onComplete'] = retryOnComplete
              }
            }
            return
          }
        }

        // 没有失败，全部完成
        // 恢复回调
        downloadManager['onProgress'] = originalOnProgress
        downloadManager['onComplete'] = originalOnComplete
      }
    }
  }

  const handleAddMusic = (info: SelectInfo) => {
    if (info.selectedList.length) {
      listMusicMultiAddRef.current?.show({ selectedList: info.selectedList, listId: '', isMove: false })
    } else {
      listMusicAddRef.current?.show({ musicInfo: info.musicInfo, listId: '', isMove: false })
    }
  }

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <List
          ref={listRef}
          onShowMenu={showMenu}
          onMuiltSelectMode={hancelMultiSelect}
          onSelectAll={isAll => multipleModeBarRef.current?.setIsSelectAll(isAll)}
          onRefresh={onRefresh}
          onLoadMore={onLoadMore}
          onPlayList={onPlayList}
          progressViewOffset={progressViewOffset}
          ListHeaderComponent={ListHeaderComponent}
          checkHomePagerIdle={checkHomePagerIdle}
          rowType={rowType}
        />
        <MultipleModeBar
          ref={multipleModeBarRef}
          onSwitchMode={hancelSwitchSelectMode}
          onSelectAll={isAll => listRef.current?.selectAll(isAll)}
          onExitSelectMode={hancelExitSelect}
          onBatchDownload={handleBatchDownload}
          onRangeSelect={handleRangeSelect}
        />
      </View>
      <ListMusicAdd ref={listMusicAddRef} onAdded={() => { hancelExitSelect() }} />
      <ListMusicMultiAdd ref={listMusicMultiAddRef} onAdded={() => { hancelExitSelect() }} />
      <ListMenu
        ref={listMenuRef}
        onPlay={info => { handlePlay(info.musicInfo) }}
        onPlayLater={info => { hancelExitSelect(); handlePlayLater(info.musicInfo, info.selectedList, hancelExitSelect) }}
        onDownload={handleSingleDownload}
        onCopyName={info => { handleShare(info.musicInfo) }}
        onAdd={handleAddMusic}
        onMusicSourceDetail={info => { void handleShowMusicSourceDetail(info.musicInfo) }}
        onDislikeMusic={info => { void handleDislikeMusic(info.musicInfo) }}
      />
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
      <RangeSelectModal ref={rangeSelectRef} />
      <ConfirmAlert
        ref={confirmAlertRef}
        title={global.i18n.t('download_storage_permission_title')}
        text={global.i18n.t('download_storage_permission_denied')}
        confirmText={global.i18n.t('open_settings')}
        onConfirm={() => { void Linking.openSettings() }}
      />
      {/* <LoadingMask ref={loadingMaskRef} /> */}
    </View>
  )
})


const styles = createStyle({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  exitMultipleModeBtn: {
    height: 40,
  },
})