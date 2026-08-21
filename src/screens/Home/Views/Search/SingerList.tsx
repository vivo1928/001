import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { search, clearListInfo } from '@/core/search/singer'
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
          listRef.current?.setList(mappedList, false, false)
          listRef.current?.setStatus(searchSingerState.maxPages[searchSingerState.source] == 1 ? 'end' : 'idle')
        })
      } catch {
        if (!isUnmountedRef.current) {
          scheduleRetry() // 继续重试
        }
      }
    }, 1500)
  }

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

  const loadList = async (text: string, source: Source) => {
    clearRetryTimer() // 新搜索取消之前的重试
    listRef.current?.setList([], false, false)
    // 新搜索时清除旧缓存，避免上次搜索结果残留
    if (searchSingerState.searchText != text) {
      clearListInfo(source)
      if (searchSingerState.source != source) clearListInfo(searchSingerState.source)
    }
    if (searchSingerState.searchText == text && searchSingerState.source == source && searchSingerState.listInfos[searchSingerState.source]!.list.length) {
      requestAnimationFrame(() => {
        const mappedList = searchSingerState.listInfos[searchSingerState.source]!.list.map(mapToSonglistItem)
        listRef.current?.setList(mappedList, false, false)
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
          listRef.current?.setList(mappedList, false, false)
          listRef.current?.setStatus(searchSingerState.maxPages[searchSingerState.source] == page ? 'end' : 'idle')
        })
      }).catch(() => {
        if (!isUnmountedRef.current) {
          scheduleRetry()
        }
      })
    }
  }

  useImperativeHandle(ref, () => ({
    loadList,
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
      listRef.current?.setList(mappedList, false, false)
      listRef.current?.setStatus(searchSingerState.maxPages[searchSingerState.source] == page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: SonglistProps['onLoadMore'] = () => {
    const info = searchSingerState.listInfos[searchInfoRef.current.source]!
    const page = info.list.length ? info.page + 1 : 1
    // 如果已经超过最大页数，直接显示结束
    if (searchSingerState.maxPages[searchInfoRef.current.source] != null && page > searchSingerState.maxPages[searchInfoRef.current.source]!) {
      listRef.current?.setStatus('end')
      return
    }
    listRef.current?.setStatus('loading')
    search(searchInfoRef.current.text, page, searchInfoRef.current.source).then((list) => {
      if (isUnmountedRef.current) return
      const mappedList = list.map(mapToSonglistItem)
      listRef.current?.setList(mappedList, true, false)
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