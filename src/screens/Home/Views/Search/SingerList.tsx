import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { search } from '@/core/search/singer'
import Songlist, { type SonglistProps, type SonglistType } from '@/screens/Home/Views/SongList/components/Songlist'
import searchSingerState, { type Source } from '@/store/search/singer/state'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { type ListInfoItem } from '@/store/songlist/state'

export interface SingerListType {
  loadList: (text: string, source: Source) => void
}

const mapToSonglistItem = (item: any): ListInfoItem => ({
  id: item.id,
  name: item.name,
  author: '',
  img: item.img,
  source: item.source,
  play_count: item.song_count ? String(item.song_count) : '',
  desc: item.album_count ? `${item.album_count} 张专辑` : '',
})

export default forwardRef<SingerListType, {}>((props, ref) => {
  const listRef = useRef<SonglistType>(null)
  const searchInfoRef = useRef<{ text: string, source: Source }>({ text: '', source: 'kw' })
  const isUnmountedRef = useRef(false)

  const handleOpenDetail = (item: ListInfoItem, index: number) => {
    const albumCount = item.desc ? parseInt(item.desc) : undefined
    navigations.pushSingerDetailScreen(commonState.componentIds.home!, {
      id: item.id,
      name: item.name,
      img: item.img,
      source: item.source,
      song_count: item.play_count ? parseInt(item.play_count) : undefined,
      album_count: isNaN(albumCount as number) ? undefined : albumCount,
    })
  }

  useImperativeHandle(ref, () => ({
    async loadList(text, source) {
      listRef.current?.setList([], false)
      if (searchSingerState.searchText == text && searchSingerState.source == source && searchSingerState.listInfos[searchSingerState.source]!.list.length) {
        requestAnimationFrame(() => {
          const mappedList = searchSingerState.listInfos[searchSingerState.source]!.list.map(mapToSonglistItem)
          listRef.current?.setList(mappedList, false)
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        searchInfoRef.current.text = text
        searchInfoRef.current.source = source
        return search(text, page, source).then((list) => {
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            const mappedList = list.map(mapToSonglistItem)
            listRef.current?.setList(mappedList, false)
            listRef.current?.setStatus(searchSingerState.maxPages[searchSingerState.source] == page ? 'end' : 'idle')
          })
        }).catch(() => {
          if (!isUnmountedRef.current) {
            listRef.current?.setStatus('error')
          }
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


  const handleRefresh: SonglistProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    search(searchInfoRef.current.text, page, searchInfoRef.current.source).then((list) => {
      if (isUnmountedRef.current) return
      const mappedList = list.map(mapToSonglistItem)
      listRef.current?.setList(mappedList, false)
      listRef.current?.setStatus(searchSingerState.maxPages[searchSingerState.source] == page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: SonglistProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const info = searchSingerState.listInfos[searchInfoRef.current.source]!
    const page = info.list.length ? info.page + 1 : 1
    search(searchInfoRef.current.text, page, searchInfoRef.current.source).then((list) => {
      if (isUnmountedRef.current) return
      const mappedList = list.map(mapToSonglistItem)
      listRef.current?.setList(mappedList, false)
      listRef.current?.setStatus(searchSingerState.maxPages[searchSingerState.source] == page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }

  return <Songlist
    ref={listRef}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    onOpenDetail={handleOpenDetail}
  />
})