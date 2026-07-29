import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useAlbumInfo } from './state'
import { handlePlay } from './listAction'
import musicSdk from '@/utils/musicSdk'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
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
      try {
        // Try to use platform-specific album detail API
        const albumApi = musicSdk[source]?.album
        if (albumApi?.getAlbumDetail) {
          const result = await albumApi.getAlbumDetail(id, page)
          if (isUnmountedRef.current) return
          if (result.info) {
            headerRef.current?.setInfo({
              name: result.info.name || info.name || '',
              desc: result.info.desc || (info.singer ? info.singer : ''),
              imgUrl: result.info.img || info.img,
            })
          }
          listInfoRef.current = {
            list: result.list || [],
            page: result.page || page,
            total: result.total || 0,
            maxPage: Math.ceil((result.total || 0) / (result.limit || 20)),
          }
          requestAnimationFrame(() => {
            listRef.current?.setList(result.list || [])
            listRef.current?.setStatus(listInfoRef.current.maxPage <= page ? 'end' : 'idle')
          })
        } else {
          listRef.current?.setStatus('idle')
        }
      } catch {
        listRef.current?.setStatus('error')
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
    void handlePlay(listInfoRef.current.list, index)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    const albumApi = musicSdk[info.source]?.album
    if (albumApi?.getAlbumDetail) {
      albumApi.getAlbumDetail(info.id, page).then((result: any) => {
        if (isUnmountedRef.current) return
        listInfoRef.current = {
          list: result.list || [],
          page: result.page || page,
          total: result.total || 0,
          maxPage: Math.ceil((result.total || 0) / (result.limit || 20)),
        }
        if (result.info) {
          headerRef.current?.setInfo({
            name: result.info.name || info.name || '',
            desc: result.info.desc || (info.singer ? info.singer : ''),
            imgUrl: result.info.img || info.img,
          })
        }
        listRef.current?.setList(result.list || [])
        listRef.current?.setStatus(listInfoRef.current.maxPage <= page ? 'end' : 'idle')
      }).catch(() => {
        listRef.current?.setStatus('error')
      })
    }
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    const albumApi = musicSdk[info.source]?.album
    if (albumApi?.getAlbumDetail) {
      albumApi.getAlbumDetail(info.id, page).then((result: any) => {
        if (isUnmountedRef.current) return
        listInfoRef.current = {
          list: [...listInfoRef.current.list, ...(result.list || [])],
          page: result.page || page,
          total: result.total || 0,
          maxPage: Math.ceil((result.total || 0) / (result.limit || 20)),
        }
        listRef.current?.setList(listInfoRef.current.list, true)
        listRef.current?.setStatus(listInfoRef.current.maxPage <= page ? 'end' : 'idle')
      }).catch(() => {
        listRef.current?.setStatus('error')
      })
    }
  }

  const header = useMemo(() => <Header ref={headerRef} componentId={componentId} />, [componentId])

  return <OnlineList
    ref={listRef}
    onPlayList={handlePlayList}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    ListHeaderComponent={header}
  />
})