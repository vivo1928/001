import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useAlbumInfo } from './state'
import { handlePlay } from './listAction'
import musicSdk from '@/utils/musicSdk'
import { search } from '@/core/search/music'
import searchMusicState from '@/store/search/music/state'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const LIMIT = 30

const fetchAlbumDetail = async(id: string, name: string, source: LX.OnlineSource, page: number): Promise<{
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  maxPage: number
  info?: { name?: string; img?: string; desc?: string; author?: string }
}> => {
  const albumApi = musicSdk[source]?.album
  if (albumApi) {
    // kw uses getAlbumListDetail, kg/mg use getAlbumDetail
    const getDetail = albumApi.getAlbumDetail || albumApi.getAlbumListDetail
    if (getDetail) {
      const result = await getDetail.call(albumApi, id, page)
      return {
        list: result.list || [],
        total: result.total || 0,
        page: result.page || page,
        maxPage: result.allPage || Math.ceil((result.total || 0) / LIMIT),
        info: result.info,
      }
    }
  }
  // Fallback: use music search for sources without album API (tx, wy)
  const list = await search(name, page, source)
  const listInfo = searchMusicState.listInfos[source]!
  return {
    list,
    total: listInfo.total,
    page: listInfo.page,
    maxPage: listInfo.maxPage,
  }
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
      return fetchAlbumDetail(id, info.name, source, page).then((result) => {
        if (isUnmountedRef.current) return
        listInfoRef.current = {
          list: result.list,
          page: result.page,
          total: result.total,
          maxPage: result.maxPage,
        }
        if (result.info) {
          headerRef.current?.setInfo({
            name: result.info.name || info.name || '',
            desc: result.info.desc || result.info.author || (info.singer ? info.singer : ''),
            imgUrl: result.info.img || info.img,
          })
        }
        requestAnimationFrame(() => {
          listRef.current?.setList(result.list)
          listRef.current?.setStatus(result.maxPage <= page ? 'end' : 'idle')
        })
      }).catch(() => {
        listRef.current?.setStatus('error')
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
    void handlePlay(info.id, info.source, listInfoRef.current.list, index)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    fetchAlbumDetail(info.id, info.name, info.source, page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: result.list,
        page: result.page,
        total: result.total,
        maxPage: result.maxPage,
      }
      if (result.info) {
        headerRef.current?.setInfo({
          name: result.info.name || info.name || '',
          desc: result.info.desc || result.info.author || (info.singer ? info.singer : ''),
          imgUrl: result.info.img || info.img,
        })
      }
      listRef.current?.setList(result.list)
      listRef.current?.setStatus(result.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    fetchAlbumDetail(info.id, info.name, info.source, page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: [...listInfoRef.current.list, ...result.list],
        page: result.page,
        total: result.total,
        maxPage: result.maxPage,
      }
      listRef.current?.setList(listInfoRef.current.list, true)
      listRef.current?.setStatus(result.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
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