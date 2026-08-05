import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import { clearListDetail, getListDetail, getListDetailAll, setListDetail, setListDetailInfo } from '@/core/songlist'
import songlistState from '@/store/songlist/state'
import { handlePlay } from './listAction'
import Header, { type HeaderType } from './Header'
import { useListInfo } from './state'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import DownloadManager, { type DownloadTask } from '@/core/download/manager'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, listId: string) => void
}

const downloadManager = new DownloadManager()

export default forwardRef<MusicListType, MusicListProps>(({ componentId }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const headerRef = useRef<HeaderType>(null)
  const isUnmountedRef = useRef(false)
  const info = useListInfo()
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
      clearListDetail()
      const listDetailInfo = songlistState.listDetailInfo
      listRef.current?.setList([])
      if (listDetailInfo.id == id && listDetailInfo.source == source && listDetailInfo.list.length) {
        requestAnimationFrame(() => {
          listRef.current?.setList(listDetailInfo.list)
          headerRef.current?.setInfo({
            name: (info.name || listDetailInfo.info.name) ?? '',
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            desc: listDetailInfo.info.desc || info.desc || '',
            playCount: (info.play_count ?? listDetailInfo.info.play_count) ?? '',
            imgUrl: info.img ?? listDetailInfo.info.img,
          })
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        setListDetailInfo(info.source, info.id)
        headerRef.current?.setInfo({
          name: (info.name || listDetailInfo.info.name) ?? '',
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          desc: listDetailInfo.info.desc || info.desc || '',
          playCount: (info.play_count ?? listDetailInfo.info.play_count) ?? '',
          imgUrl: info.img ?? listDetailInfo.info.img,
        })
        return getListDetail(id, source, page).then((listDetail) => {
          const result = setListDetail(listDetail, id, page)
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            headerRef.current?.setInfo({
              name: (info.name || listDetailInfo.info.name) ?? '',
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              desc: listDetailInfo.info.desc || info.desc || '',
              playCount: (info.play_count ?? listDetailInfo.info.play_count) ?? '',
              imgUrl: info.img ?? listDetailInfo.info.img,
            })
            listRef.current?.setList(result.list)
            listRef.current?.setStatus(songlistState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
          })
        }).catch(() => {
          if (songlistState.listDetailInfo.list.length && page == 1) clearListDetail()
          listRef.current?.setStatus('error')
        })
      }
    },
  }))

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])


  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    const listDetailInfo = songlistState.listDetailInfo
    // console.log(songlistState.listDetailInfo)
    void handlePlay(listDetailInfo.id, listDetailInfo.source, listDetailInfo.list, index)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    getListDetail(songlistState.listDetailInfo.id, songlistState.listDetailInfo.source, page, true).then((listDetail) => {
      const result = setListDetail(listDetail, songlistState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(result.list)
      listRef.current?.setStatus(songlistState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      if (songlistState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = songlistState.listDetailInfo.list.length ? songlistState.listDetailInfo.page + 1 : 1
    getListDetail(songlistState.listDetailInfo.id, songlistState.listDetailInfo.source, page).then((listDetail) => {
      const result = setListDetail(listDetail, songlistState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(result.list, true)
      listRef.current?.setStatus(songlistState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      if (songlistState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }

  const handleBatchDownload = async () => {
    const list = songlistState.listDetailInfo.list
    if (!list?.length) return
    const { id, source } = songlistState.listDetailInfo
    // 先显示加载中
    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })
    try {
      const fullList = await getListDetailAll(source, id)
      downloadProgressRef.current?.close()
      downloadQualityRef.current?.show(fullList[0], {
        showFileSize: false,
        onSelect: (quality) => {
          const subDir = info.name || undefined
          startBatchDownload(fullList, quality, subDir)
        },
      })
    } catch {
      downloadProgressRef.current?.close()
      // 降级：使用当前已加载列表
      downloadQualityRef.current?.show(list[0], {
        showFileSize: false,
        onSelect: (quality) => {
          const subDir = info.name || undefined
          startBatchDownload(list, quality, subDir)
        },
      })
    }
  }

  const startBatchDownload = (list: LX.Music.MusicInfoOnline[], quality: LX.Quality, subDir?: string) => {
    const total = list.length
    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })

    const taskIds = downloadManager.addBatchToQueue(list, quality, subDir)
    const allTasks = downloadManager.getQueue().filter(t => taskIds.includes(t.id))
    const failedSongs: Array<{ name: string, singer: string, error?: string }> = []

    // 设置进度回调
    const originalOnProgress = downloadManager['onProgress']
    downloadManager['onProgress'] = (id, progress) => {
      const stats = downloadManager.getStats()
      const doneCount = stats.completed + stats.failed
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
      if (!success && error !== 'cancelled') {
        failedSongs.push({
          name: task.musicInfo.name,
          singer: task.musicInfo.singer,
          error,
        })
      }

      const stats = downloadManager.getStats()
      const doneCount = stats.completed + stats.failed

      if (doneCount < total) {
        const currentSong = doneCount + 1
        downloadProgressRef.current?.updateProgress(
          total > 0 ? Math.round((doneCount / total) * 100) : 0,
          `${global.i18n.t('download_current_progress', { current: currentSong, total })}`,
        )
      }

      // 所有任务完成
      if (doneCount >= total) {
        downloadProgressRef.current?.close()

        // 如果有失败，尝试重试一次
        if (failedSongs.length > 0) {
          const retryList = list.filter(item =>
            failedSongs.some(f => f.name === item.name && f.singer === item.singer),
          )
          if (retryList.length > 0) {
            downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
              onCancel: () => {
                downloadManager.cancelAll()
                downloadProgressRef.current?.close()
              },
            })
            const retryIds = downloadManager.addBatchToQueue(retryList, quality, subDir)
            const retryTasks = downloadManager.getQueue().filter(t => retryIds.includes(t.id))
            allTasks.push(...retryTasks)

            const retryOnComplete = downloadManager['onComplete']
            downloadManager['onComplete'] = (retryId, retrySuccess, retryError) => {
              const retryStats = downloadManager.getStats()
              if (retryStats.completed + retryStats.failed >= allTasks.length) {
                downloadProgressRef.current?.close()
                const finalFailed = failedSongs.filter(f => {
                  const retryTask = allTasks.find(t =>
                    t.musicInfo.name === f.name && t.musicInfo.singer === f.singer && t.status === 'failed',
                  )
                  return retryTask != null
                })
                if (finalFailed.length > 0) {
                  downloadFailedRef.current?.showFailedSongs(finalFailed, {
                    onRetryAll: () => {
                      startBatchDownload(
                        list.filter(item =>
                          finalFailed.some(f => f.name === item.name && f.singer === item.singer),
                        ),
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

        downloadManager['onProgress'] = originalOnProgress
        downloadManager['onComplete'] = originalOnComplete
      }
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const header = useMemo(() => (
    <Header ref={headerRef} componentId={componentId} onBatchDownload={handleBatchDownload} />
  ), [componentId])

  return (
    <>
      <OnlineList
        ref={listRef}
        onPlayList={handlePlayList}
        onRefresh={handleRefresh}
        onLoadMore={handleLoadMore}
        ListHeaderComponent={header}
      />
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
    </>
  )
})