import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo } from './state'
import musicSdk from '@/utils/musicSdk'
import { search } from '@/core/search/music'
import searchMusicState from '@/store/search/music/state'
import { handlePlay } from './listAction'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const LIMIT = 30

const fetchSingerSongList = async(id: string, name: string, source: LX.OnlineSource, page: number): Promise<{
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  maxPage: number
  info?: { name?: string; img?: string; desc?: string }
}> => {
  const singerApi = musicSdk[source]?.singer
  if (singerApi?.getSingerSongList) {
    const result = await singerApi.getSingerSongList(id, page, LIMIT)
    return {
      list: result.list || [],
      total: result.total || 0,
      page: result.page || page,
      maxPage: result.allPage || Math.ceil((result.total || 0) / LIMIT),
      info: result.info,
    }
  }
  // Fallback: use music search for sources without singer API (kw, tx, wy)
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
  const info = useSingerInfo()
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
        desc: '',
        imgUrl: info.img,
      })
      const page = 1
      return fetchSingerSongList(id, info.name, source, page).then((result) => {
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
            desc: result.info.desc || '',
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
    fetchSingerSongList(info.id, info.name, info.source, page).then((result) => {
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
          desc: result.info.desc || '',
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
    fetchSingerSongList(info.id, info.name, info.source, page).then((result) => {
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