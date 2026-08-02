import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { search } from '@/core/search/album'
import Songlist, { type SonglistProps, type SonglistType } from '@/screens/Home/Views/SongList/components/Songlist'
import searchAlbumState, { type Source } from '@/store/search/album/state'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { type ListInfoItem } from '@/store/songlist/state'

export interface AlbumListType {
  loadList: (text: string, source: Source) => void
}

const mapToSonglistItem = (item: any): ListInfoItem => ({
  id: item.id,
  name: item.name,
  author: item.singer || '',
  img: item.img,
  source: item.source,
  play_count: item.song_count ? String(item.song_count) : '',
  desc: item.publish_date || '',
})

export default forwardRef<AlbumListType, {}>((props, ref) => {
  const listRef = useRef<SonglistType>(null)
  const searchInfoRef = useRef<{ text: string, source: Source }>({ text: '', source: 'kw' })
  const isUnmountedRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    retryCountRef.current = 0
  }

  /** 失败后延迟重试，保持loading状态不影响读屏 */
  const scheduleRetry = () => {
    if (isUnmountedRef.current) return
    retryCountRef.current++
    if (retryCountRef.current >= 3) {
      listRef.current?.setStatus('error')
      return
    }
    // 保持loading状态，不显示error，读屏不会额外播报
    retryTimerRef.current = setTimeout(async () => {
      if (isUnmountedRef.current) return
      const { text, source } = searchInfoRef.current
      try {
        const list = await search(text, 1, source)
        if (isUnmountedRef.current) return
        clearRetryTimer()
        requestAnimationFrame(() => {
          const mappedList = list.map(mapToSonglistItem)
          listRef.current?.setList(mappedList, false)
          listRef.current?.setStatus(searchAlbumState.maxPages[searchAlbumState.source] == 1 ? 'end' : 'idle')
        })
      } catch {
        if (!isUnmountedRef.current) {
          scheduleRetry() // 继续重试
        }
      }
    }, 1500)
  }

  const handleOpenDetail = (item: ListInfoItem, index: number) => {
    navigations.pushAlbumDetailScreen(commonState.componentIds.home!, {
      id: item.id,
      name: item.name,
      singer: item.author,
      img: item.img,
      source: item.source,
      publish_date: item.desc,
      song_count: item.play_count ? parseInt(item.play_count) : undefined,
    })
  }

  useImperativeHandle(ref, () => ({
    async loadList(text, source) {
      clearRetryTimer() // 新搜索取消之前的重试
      listRef.current?.setList([], false)
      if (searchAlbumState.searchText == text && searchAlbumState.source == source && searchAlbumState.listInfos[searchAlbumState.source]!.list.length) {
        requestAnimationFrame(() => {
          const mappedList = searchAlbumState.listInfos[searchAlbumState.source]!.list.map(mapToSonglistItem)
          listRef.current?.setList(mappedList, false)
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        searchInfoRef.current.text = text
        searchInfoRef.current.source = source
        return search(text, page, source).then((list) => {
          if (isUnmountedRef.current) return
          clearRetryTimer()
          requestAnimationFrame(() => {
            const mappedList = list.map(mapToSonglistItem)
            listRef.current?.setList(mappedList, false)
            listRef.current?.setStatus(searchAlbumState.maxPages[searchAlbumState.source] == page ? 'end' : 'idle')
          })
        }).catch(() => {
          if (!isUnmountedRef.current) {
            scheduleRetry()
          }
        })
      }
    },
  }), [])

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
      clearRetryTimer()
    }
  }, [])


  const handleRefresh: SonglistProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    search(searchInfoRef.current.text, page, searchInfoRef.current.source).then((list) => {
      if (isUnmountedRef.current) return
      const mappedList = list.map(mapToSonglistItem)
      listRef.current?.setList(mappedList, false)
      listRef.current?.setStatus(searchAlbumState.maxPages[searchAlbumState.source] == page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: SonglistProps['onLoadMore'] = () => {
    const info = searchAlbumState.listInfos[searchInfoRef.current.source]!
    const page = info.list.length ? info.page + 1 : 1
    // 如果已经超过最大页数，直接显示结束，避免无谓的API请求导致"加载失败"
    if (searchAlbumState.maxPages[searchInfoRef.current.source] != null && page > searchAlbumState.maxPages[searchInfoRef.current.source]!) {
      listRef.current?.setStatus('end')
      return
    }
    listRef.current?.setStatus('loading')
    search(searchInfoRef.current.text, page, searchInfoRef.current.source).then((list) => {
      if (isUnmountedRef.current) return
      const mappedList = list.map(mapToSonglistItem)
      listRef.current?.setList(mappedList, false)
      listRef.current?.setStatus(searchAlbumState.maxPages[searchAlbumState.source] == page ? 'end' : 'idle')
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