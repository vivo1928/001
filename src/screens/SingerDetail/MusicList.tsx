import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Alert, View } from 'react-native'
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
const buildDesc = (info: { name?: string, song_count?: number, album_count?: number, desc?: string, img?: string }): string => {
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
  const retriedRef = useRef(false)
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
          // 首次加载失败自动重试一次（偶发 SDK 超时），避免用户手动点"重新加载"
          if (!retriedRef.current && page == 1) {
            retriedRef.current = true
            return getListDetail(compositeId, page, true).then((listDetail) => {
              const result = setListDetail(listDetail, compositeId, page)
              if (isUnmountedRef.current) return
              requestAnimationFrame(() => {
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
    if (!list?.[index]) {
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
      // 已有歌曲时刷新失败：保留已加载内容，仅回到 idle，不整页标 error
      if (singerDetailState.listDetailInfo.list.length) {
        listRef.current?.setStatus('idle')
        return
      }
      if (page == 1) clearListDetail()
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
      // 已有歌曲时加载更多失败：保留已加载内容，不整页标 error（避免"有歌却显示加载失败"）
      if (singerDetailState.listDetailInfo.list.length) {
        listRef.current?.setStatus('idle')
        return
      }
      if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }

  const handleBatchDownload = async() => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    const { id } = singerDetailState.listDetailInfo
    // 先显示获取歌曲数量中
    downloadProgressRef.current?.show(global.i18n.t('download_getting_song_count'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
      },
    })
    const showQualityPicker = (fullList: LX.Music.MusicInfoOnline[]) => {
      downloadQualityRef.current?.show(fullList[0], {
        showFileSize: false,
        onSelect: (quality) => {
          const subDir = info.name || undefined
          startBatchDownload(fullList, quality, subDir)
        },
      })
    }
    try {
      const result = await getListDetailAll(id)
      downloadProgressRef.current?.close()
      if (!result.isComplete) {
        // 获取不完整，提示后由用户决定是否继续
        Alert.alert(
          global.i18n.t('download_get_incomplete_title'),
          global.i18n.t('download_get_incomplete_desc', { total: result.total, fetched: result.list.length }),
          [
            { text: global.i18n.t('cancel'), style: 'cancel' },
            { text: global.i18n.t('agree'), onPress: () => { showQualityPicker(result.list) } },
          ],
        )
        return
      }
      showQualityPicker(result.list)
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

    const originalOnProgress = downloadManager['onProgress']
    const originalOnComplete = downloadManager['onComplete']
    const restoreCallbacks = () => {
      downloadManager['onProgress'] = originalOnProgress
      downloadManager['onComplete'] = originalOnComplete
    }

    downloadProgressRef.current?.show(global.i18n.t('download_batch'), {
      onCancel: () => {
        downloadManager.cancelAll()
        downloadProgressRef.current?.close()
        restoreCallbacks()
      },
    })

    const taskIds = downloadManager.addBatchToQueue(list, quality, subDir)
    const allTasks = downloadManager.getTasksByIds(taskIds)
    const failedSongs: Array<{ name: string, singer: string, error?: string }> = []

    const getBatchStats = () => downloadManager.getBatchStats(taskIds)
    const doneCountOf = (stats: ReturnType<typeof getBatchStats>) => stats.completed + stats.failed

    // 设置进度回调
    downloadManager['onProgress'] = (id, progress) => {
      const stats = getBatchStats()
      const doneCount = doneCountOf(stats)
      const currentSong = Math.min(doneCount + 1, total)
      downloadProgressRef.current?.updateProgress(
        total > 0 ? Math.min(Math.round((doneCount / total) * 100), 100) : 0,
        `${global.i18n.t('download_current_progress', { current: currentSong, total })} ${progress}%`,
      )
    }

    // 设置完成回调
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

      const stats = getBatchStats()
      const doneCount = doneCountOf(stats)

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
                restoreCallbacks()
              },
            })
            const retryIds = downloadManager.addBatchToQueue(retryList, quality, subDir)
            taskIds.push(...retryIds)
            allTasks.push(...downloadManager.getTasksByIds(retryIds))

            const retryOnComplete = downloadManager['onComplete']
            downloadManager['onComplete'] = (retryId, retrySuccess, retryError) => {
              const retryStats = getBatchStats()
              if (doneCountOf(retryStats) >= taskIds.length) {
                downloadProgressRef.current?.close()
                const finalFailed = failedSongs.filter(f => {
                  const idx = retryList.findIndex(item => item.name === f.name && item.singer === f.singer)
                  if (idx === -1) return false
                  const retryTask = downloadManager.getTasksByIds([retryIds[idx]])[0]
                  return retryTask ? retryTask.status === 'failed' : false
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
                restoreCallbacks()
              }
            }
            return
          }
        }

        restoreCallbacks()
      }
    }
  }

  return (
    <>
      <View style={{ flex: 1 }}>
        <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAllSongs} onBatchDownload={handleBatchDownload} activeTab={activeTab} onTabChange={onTabChange} />
        <OnlineList
          ref={listRef}
          onPlayList={handlePlayList}
          onRefresh={handleRefresh}
          onLoadMore={handleLoadMore}
          rowType='medium'
        />
      </View>
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
    </>
  )
})
