import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useAlbumInfo } from './state'
import { handlePlayAll } from './listAction'
import musicSdk from '@/utils/musicSdk'
import { toNewMusicInfo, normalizeAlbumDesc } from '@/utils'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import useDownloadFlow from '@/core/download/useDownloadFlow'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const FETCH_TIMEOUT = 15000

const withTimeout = async <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => { reject(new Error(msg)) }, ms)),
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
  // 统一下载流程：权限、音质选择、进度弹窗、取消、完成提示、批量重试
  const downloadFlow = useDownloadFlow({
    progress: downloadProgressRef,
    quality: downloadQualityRef,
    failed: downloadFailedRef,
  })

  const fetchList = async(id: string, page: number): Promise<{
    list: LX.Music.MusicInfoOnline[]
    total: number
    allPage: number
    info?: { name?: string, img?: string, desc?: string, author?: string }
  }> => {
    console.log(`[AlbumDetail] fetchList source=${info.source} id=${id} name=${info.name} page=${page}`)
    const sdk = musicSdk[info.source] as {
      album?: { getAlbumDetail?: (...args: any[]) => Promise<{ list: any[], total: number, limit: number, allPage: number, info?: any }>, getAlbumListDetail?: (...args: any[]) => Promise<{ list: any[], total: number, limit: number, allPage: number, info?: any }> }
    }
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
      `Album API timeout for source: ${info.source}`,
    )
    console.log(`[AlbumDetail] album API result: list=${result?.list?.length} total=${result?.total}`)

    if (!result?.list || result.list.length === 0) {
      throw new Error(`Album API returned empty list for source: ${info.source}`)
    }

    return {
      list: result.list.map(s => toNewMusicInfo(s) as LX.Music.MusicInfoOnline),
      total: result.total || 0,
      // 多数音源接口不返回 allPage，需按源接口的 total/limit 计算总页数，不能使用前端本地 LIMIT
      allPage: result.allPage || Math.ceil((result.total || result.list.length) / (result.limit || result.list.length)),
      info: result.info,
    }
  }

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
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
              desc: normalizeAlbumDesc(result.info.desc) || result.info.author || (info.singer ? info.singer : ''),
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
    if (!list?.[index]) {
      console.warn(`[AlbumDetail] handlePlayList: invalid index=${index} list.length=${list?.length ?? 'N/A'}`)
      return
    }
    void handlePlayAll(info.id, info.source, list, index)
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

  const fetchAllAlbumSongs = async(): Promise<LX.Music.MusicInfoOnline[]> => {
    const { page, maxPage } = listInfoRef.current
    if (page >= maxPage) {
      return listInfoRef.current.list
    }
    const allSongs = [...listInfoRef.current.list]
    for (let p = page + 1; p <= maxPage; p++) {
      const result = await fetchList(info.id, p)
      allSongs.push(...result.list)
    }
    return allSongs
  }

  const handleBatchDownload = async() => {
    const list = listRef.current?.getList()
    if (!list?.length) return
    const subDir = info.name || undefined
    await downloadFlow.downloadBatchWithLoader(async() => {
      try {
        return await fetchAllAlbumSongs()
      } catch {
        // 降级：使用当前已加载列表
        return list
      }
    }, { subDir })
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
