import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useAlbumInfo } from './state'
import { handlePlay, handlePlayAll } from './listAction'
import musicSdk from '@/utils/musicSdk'
import { toNewMusicInfo } from '@/utils'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import DownloadManager from '@/core/download/manager'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const LIMIT = 30
const FETCH_TIMEOUT = 15000
const downloadManager = new DownloadManager()

const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export default forwardRef<MusicListType, MusicListProps>(({ componentId }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const headerRef = useRef<HeaderType>(null)
  const isUnmountedRef = useRef(false)
  const info = useAlbumInfo()
  const listInfoRef = useRef<{
    list: LX.Music.MusicInfoOnline[]
    page: number
    total: number
    maxPage: number
  }>({ list: [], page: 0, total: 0, maxPage: 0 })
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)

  const fetchList = async(id: string, page: number): Promise<{
    list: LX.Music.MusicInfoOnline[]
    total: number
    allPage: number
    info?: { name?: string; img?: string; desc?: string; author?: string }
  }> => {
    console.log(`[AlbumDetail] fetchList source=${info.source} id=${id} name=${info.name} page=${page}`)
    const sdk = musicSdk[info.source]
    if (!sdk) throw new Error('source not found: ' + info.source)

    // 仅使用 album API 按专辑ID精确获取歌曲，不使用 musicSearch 降级
    // musicSearch 是按名称文本搜索，无专辑ID约束，会返回其他专辑的歌曲
    const albumApi = sdk?.album
    const getDetail = albumApi?.getAlbumDetail || albumApi?.getAlbumListDetail

    if (!getDetail) {
      throw new Error(`Album API not available for source: ${info.source}`)
    }

    console.log(`[AlbumDetail] using album API for source=${info.source}`)
    const result = await withTimeout(
      getDetail.call(albumApi, id, page, undefined, info.name, info.singer),
      FETCH_TIMEOUT,
      `Album API timeout for source: ${info.source}`
    )
    console.log(`[AlbumDetail] album API result: list=${result?.list?.length} total=${result?.total}`)

    if (!result || !result.list || result.list.length === 0) {
      throw new Error(`Album API returned empty list for source: ${info.source}`)
    }

    return {
      list: result.list.map(s => toNewMusicInfo(s) as LX.Music.MusicInfoOnline),
      total: result.total || 0,
      allPage: result.allPage || Math.ceil((result.total || 0) / LIMIT),
      info: result.info,
    }
  }

  useImperativeHandle(ref, () => ({
    loadList(source, id) {
      listRef.current?.setList([])
      listRef.current?.setStatus('loading')
      headerRef.current?.setInfo({
        name: info.name || '',
        desc: info.singer ? `${info.singer}${info.publish_date ? ' · ' + info.publish_date : ''}` : (info.publish_date || ''),
        imgUrl: info.img,
      })
      const page = 1
      return fetchList(id, page).then((result) => {
        if (isUnmountedRef.current) return
        listInfoRef.current = {
          list: result.list,
          page,
          total: result.total,
          maxPage: result.allPage,
        }
        requestAnimationFrame(() => {
          if (result.info) {
            headerRef.current?.setInfo({
              name: result.info.name || info.name || '',
              desc: result.info.desc || result.info.author || (info.singer ? info.singer : ''),
              imgUrl: result.info.img || info.img,
            })
          }
          listRef.current?.setList(result.list)
          listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
        })
      }).catch((err: any) => {
        console.error(`[AlbumDetail] loadList error: ${err?.message || err}`)
        if (!isUnmountedRef.current) {
          listRef.current?.setStatus('error')
        }
      })
    },
  }))

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    const list = listRef.current?.getList()
    if (!list || !list[index]) {
      console.warn(`[AlbumDetail] handlePlayList: invalid index=${index} list.length=${list?.length ?? 'N/A'}`)
      return
    }
    void handlePlay(list[index])
  }
  const handlePlayAllSongs = () => {
    const list = listRef.current?.getList()
    if (!list?.length) return
    void handlePlayAll(info.id, info.source, list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    fetchList(info.id, page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: result.list,
        page,
        total: result.total,
        maxPage: result.allPage,
      }
      requestAnimationFrame(() => {
        if (result.info) {
          headerRef.current?.setInfo({
            name: result.info.name || info.name || '',
            desc: result.info.desc || result.info.author || (info.singer ? info.singer : ''),
            imgUrl: result.info.img || info.img,
          })
        }
        listRef.current?.setList(result.list)
        listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
      })
    }).catch((err) => {
      console.error(`[AlbumDetail] refresh error: ${err?.message || err}`)
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    fetchList(info.id, page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: [...listInfoRef.current.list, ...result.list],
        page,
        total: result.total,
        maxPage: result.allPage,
      }
      requestAnimationFrame(() => {
        listRef.current?.setList(listInfoRef.current.list, true)
        listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
      })
    }).catch((err) => {
      console.error(`[AlbumDetail] loadMore error: ${err?.message || err}`)
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
    })
  }

  const handleBatchDownload = () => {
    const list = listRef.current?.getList()
    if (!list?.length) return
    downloadQualityRef.current?.show(list[0], {
      showFileSize: false,
      onSelect: (quality) => {
        startBatchDownload(list, quality)
      },
    })
  }

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

      if (doneCount >= total) {
        downloadProgressRef.current?.close()

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
    <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAllSongs} onBatchDownload={handleBatchDownload} />
  ), [componentId])

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