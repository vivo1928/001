import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo, type SingerTabType } from './state'
import { clearListDetail, getListDetail, getListDetailAll, setListDetail, setListDetailInfo } from '@/core/singerDetail'
import singerDetailState from '@/store/singerDetail/state'
import singerDetailActions from '@/store/singerDetail/action'
import { handlePlay, handlePlayAll } from './listAction'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import DownloadManager, { type DownloadTask } from '@/core/download/manager'

export interface MusicListProps {
  componentId: string
  activeTab: SingerTabType
  onTabChange: (tab: SingerTabType) => void
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

// 构建歌手简介文本
const buildDesc = (info: { name?: string; song_count?: number; album_count?: number; desc?: string; img?: string }): string => {
  if (info.desc) return info.desc
  const parts: string[] = []
  if (info.song_count) parts.push(`${info.song_count} 首歌曲`)
  if (info.album_count) parts.push(`${info.album_count} 张专辑`)
  return parts.join(' · ')
}

const downloadManager = new DownloadManager()

export default forwardRef<MusicListType, MusicListProps>(({ componentId, activeTab, onTabChange }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const headerRef = useRef<HeaderType>(null)
  const isUnmountedRef = useRef(false)
  const info = useSingerInfo()
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
      const compositeId = `${source}__${id}`
      const listDetailInfo = singerDetailState.listDetailInfo
      listRef.current?.setList([])
      if (listDetailInfo.id == compositeId && listDetailInfo.source == source && listDetailInfo.list.length) {
        requestAnimationFrame(() => {
          listRef.current?.setList(listDetailInfo.list)
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        setListDetailInfo(compositeId)
        singerDetailActions.setSingerName(info.name || '')
        singerDetailActions.setSingerInfo(null)
        headerRef.current?.setInfo({
          name: info.name || '',
          desc: buildDesc(info),
          imgUrl: info.img,
        })
        return getListDetail(compositeId, page).then((listDetail) => {
          const result = setListDetail(listDetail, compositeId, page)
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            // 用 API 返回的歌手简介更新 Header
            const singerInfo = singerDetailState.singerInfo
            headerRef.current?.setInfo({
              name: singerInfo?.name || info.name || '',
              desc: buildDesc({ ...info, ...singerInfo }),
              imgUrl: singerInfo?.img || info.img,
            })
            listRef.current?.setList(result.list)
            listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
          })
        }).catch(() => {
          if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
          listRef.current?.setStatus('error')
        })
      }
    },
  }), [])

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    const listDetailInfo = singerDetailState.listDetailInfo
    const list = listDetailInfo.list
    if (!list || !list[index]) {
      console.warn(`[SingerDetail] handlePlayList: invalid index=${index} list.length=${list?.length ?? 'N/A'}`)
      return
    }
    // 匹配排行榜模式：传入 id、当前列表、索引
    void handlePlay(listDetailInfo.id, list, index)
  }
  const handlePlayAllSongs = () => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    void handlePlayAll(info.id, info.source, list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    getListDetail(singerDetailState.listDetailInfo.id, page, true).then((listDetail) => {
      const result = setListDetail(listDetail, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      requestAnimationFrame(() => {
        listRef.current?.setList(result.list)
        listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
      })
    }).catch(() => {
      if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = singerDetailState.listDetailInfo.list.length ? singerDetailState.listDetailInfo.page + 1 : 1
    getListDetail(singerDetailState.listDetailInfo.id, page).then((listDetail) => {
      const result = setListDetail(listDetail, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(result.list, true)
      listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }

  const handleBatchDownload = async () => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    const { id } = singerDetailState.listDetailInfo
    // 先显示加载中
    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })
    try {
      const fullList = await getListDetailAll(id)
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

  // 原有的批量下载逻辑（用于单页情况）
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
        downloadProgressRef.current?.updateProgress(
          total > 0 ? Math.round((doneCount / total) * 100) : 0,
          `${global.i18n.t('download_current_progress', { current: doneCount + 1, total })}`,
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
    <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAllSongs} onBatchDownload={handleBatchDownload} activeTab={activeTab} onTabChange={onTabChange} />
  ), [componentId, activeTab, onTabChange])

  return (
    <>
      <OnlineList
        ref={listRef}
        onPlayList={handlePlayList}
        onRefresh={handleRefresh}
        onLoadMore={handleLoadMore}
        ListHeaderComponent={header}
        rowType='medium'
      />
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
    </>
  )
})