import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo } from './state'
import { search } from '@/core/search/music'
import searchMusicState from '@/store/search/music/state'
import { handlePlay } from './listAction'

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
      return search(info.name, page, source).then((list) => {
        if (isUnmountedRef.current) return
        const listInfo = searchMusicState.listInfos[source]!
        listInfoRef.current = {
          list: list,
          page: listInfo.page,
          total: listInfo.total,
          maxPage: listInfo.maxPage,
        }
        requestAnimationFrame(() => {
          listRef.current?.setList(list)
          listRef.current?.setStatus(listInfo.maxPage <= page ? 'end' : 'idle')
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
    search(info.name, page, info.source).then((list) => {
      if (isUnmountedRef.current) return
      const listInfo = searchMusicState.listInfos[info.source]!
      listInfoRef.current = {
        list: list,
        page: listInfo.page,
        total: listInfo.total,
        maxPage: listInfo.maxPage,
      }
      listRef.current?.setList(list)
      listRef.current?.setStatus(listInfo.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    search(info.name, page, info.source).then((list) => {
      if (isUnmountedRef.current) return
      const listInfo = searchMusicState.listInfos[info.source]!
      listInfoRef.current = {
        list: [...listInfoRef.current.list, ...list],
        page: listInfo.page,
        total: listInfo.total,
        maxPage: listInfo.maxPage,
      }
      listRef.current?.setList(listInfoRef.current.list, true)
      listRef.current?.setStatus(listInfo.maxPage <= page ? 'end' : 'idle')
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