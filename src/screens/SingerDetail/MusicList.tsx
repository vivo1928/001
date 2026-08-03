import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo, type SingerTabType } from './state'
import { clearListDetail, getListDetail, setListDetail, setListDetailInfo } from '@/core/singerDetail'
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

  // ============ 批量下载（渐进式加载） ============
  const handleBatchDownload = () => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    // 立即显示音质选择，不等待加载全部页面
    downloadQualityRef.current?.show(list[0], {
      showFileSize: false,
      onSelect: (quality) => {
        startProgressiveDownload(list, quality)
      },
    })
  }

  const startProgressiveDownload = (initialList: LX.Music.MusicInfoOnline[], quality: LX.Quality) => {
    const { id, maxPage, page, total } = singerDetailState.listDetailInfo
    // 如果只有一页，直接用现有逻辑
    if (page >= maxPage) {
      startBatchDownload(initialList, quality)
      return
    }

    // 估算总歌曲数（用于进度显示，后续会更新为精确值）
    let totalSongs = total > 0 ? total : initialList.length * maxPage

    // 显示进度弹窗
    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })

    // 先添加当前页的歌曲到队列，开始下载
    const taskIds = downloadManager.addBatchToQueue(initialList, quality)
    const allTasks: DownloadTask[] = downloadManager.getQueue().filter(t => taskIds.includes(t.id))
    const failedSongs: Array<{ name: string, singer: string, error?: string }> = []
    let totalAdded = initialList.length
    let allPagesLoaded = false
    let isRetrying = false

    // 设置进度回调
    const originalOnProgress = downloadManager['onProgress']
    downloadManager['onProgress'] = (id, progress) => {
      const stats = downloadManager.getStats()
      const doneCount = stats.completed + stats.failed
      const currentSong = doneCount + 1
      // 显示当前歌曲序号，如"正在下载第2首/共100首 50%"
      const progressText = `${global.i18n.t('download_current_progress', { current: currentSong, total: totalSongs })} ${progress}%`
      downloadProgressRef.current?.updateProgress(
        totalSongs > 0 ? Math.round((doneCount / totalSongs) * 100) : 0,
        progressText,
      )
    }

    // 设置完成回调
    const originalOnComplete = downloadManager['onComplete']
    downloadManager['onComplete'] = (taskId, success, error) => {
      const task = allTasks.find(t => t.id === taskId)
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

      // 更新进度
      if (doneCount < totalAdded) {
        downloadProgressRef.current?.updateProgress(
          totalSongs > 0 ? Math.round((doneCount / totalSongs) * 100) : 0,
          `${global.i18n.t('download_current_progress', { current: doneCount + 1, total: totalSongs })}`,
        )
      }

      // 当前批次所有任务完成
      if (doneCount >= totalAdded) {
        if (!allPagesLoaded && !isRetrying) {
          // 继续加载下一页（异步，不阻塞下载完成流程）
          loadNextPage()
        } else {
          // 已加载完所有页面，或正在重试中
          finishDownload()
        }
      }
    }

    // 异步加载下一页
    const loadNextPage = async () => {
      let nextPage = singerDetailState.listDetailInfo.page + 1
      if (nextPage > maxPage) {
        allPagesLoaded = true
        finishDownload()
        return
      }

      try {
        const listDetail = await getListDetail(id, nextPage)
        const result = setListDetail(listDetail, id, nextPage)
        const newSongs = result.list
        if (!newSongs.length) {
          allPagesLoaded = true
          finishDownload()
          return
        }

        // 更新总歌曲数（从 API 返回的精确值）
        if (result.total > 0) totalSongs = result.total

        // 更新列表显示
        const currentList = singerDetailState.listDetailInfo.list
        listRef.current?.setList([...currentList, ...newSongs], true)

        // 添加新歌曲到下载队列
        const newTaskIds = downloadManager.addBatchToQueue(newSongs, quality)
        const newTasks = downloadManager.getQueue().filter(t => newTaskIds.includes(t.id))
        allTasks.push(...newTasks)
        totalAdded = allTasks.length

        // 继续加载下一页
        if (nextPage < maxPage) {
          await loadNextPage()
        } else {
          allPagesLoaded = true
          // 如果当前批次已全部完成，触发 finishDownload
          const stats = downloadManager.getStats()
          const doneCount = stats.completed + stats.failed
          if (doneCount >= totalAdded) {
            finishDownload()
          }
        }
      } catch (err) {
        console.error('Failed to load next page:', err)
        allPagesLoaded = true
        finishDownload()
      }
    }

    // 完成下载（检查失败并处理重试）
    const finishDownload = () => {
      downloadProgressRef.current?.close()

      if (failedSongs.length > 0 && !isRetrying) {
        isRetrying = true
        const retryList = initialList.filter(item =>
          failedSongs.some(f => f.name === item.name && f.singer === item.singer),
        )
        if (retryList.length > 0) {
          downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
            onCancel: () => {
              downloadManager.cancelAll()
              downloadProgressRef.current?.close()
            },
          })
          const retryIds = downloadManager.addBatchToQueue(retryList, quality)
          const retryTasks = downloadManager.getQueue().filter(t => retryIds.includes(t.id))
          allTasks.push(...retryTasks)
          totalAdded = allTasks.length

          const retryOnComplete = downloadManager['onComplete']
          downloadManager['onComplete'] = (retryId, retrySuccess, retryError) => {
            const retryStats = downloadManager.getStats()
            if (retryStats.completed + retryStats.failed >= totalAdded) {
              downloadProgressRef.current?.close()
              isRetrying = false
              const finalFailed = failedSongs.filter(f => {
                const retryTask = allTasks.find(t =>
                  t.musicInfo.name === f.name && t.musicInfo.singer === f.singer && t.status === 'failed',
                )
                return retryTask != null
              })
              if (finalFailed.length > 0) {
                downloadFailedRef.current?.showFailedSongs(finalFailed, {
                  onRetryAll: () => {
                    startProgressiveDownload(
                      initialList.filter(item =>
                        finalFailed.some(f => f.name === item.name && f.singer === item.singer),
                      ),
                      quality,
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

      // 恢复回调
      downloadManager['onProgress'] = originalOnProgress
      downloadManager['onComplete'] = originalOnComplete
    }

    // 开始加载下一页
    if (page < maxPage) {
      loadNextPage()
    }
  }

  // 原有的批量下载逻辑（用于单页情况）
  const startBatchDownload = (list: LX.Music.MusicInfoOnline[], quality: LX.Quality) => {
    const total = list.length
    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })

    const taskIds = downloadManager.addBatchToQueue(list, quality)
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
            const retryIds = downloadManager.addBatchToQueue(retryList, quality)
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