import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react'

import { search } from '@/core/search/album'
import Songlist, { type SonglistProps, type SonglistType } from '@/screens/Home/Views/SongList/components/Songlist'
import searchAlbumState, { type Source } from '@/store/search/album/state'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { type ListInfoItem } from '@/store/songlist/state'
import { createList, removeUserList } from '@/core/list'
import { toast } from '@/utils/tools'
import listState from '@/store/list/state'

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

// 获取收藏标识键
const getCollectKey = (item: ListInfoItem) => `${item.source}__${item.id}`

export default forwardRef<AlbumListType, {}>((props, ref) => {
  const listRef = useRef<SonglistType>(null)
  const searchInfoRef = useRef<{ text: string, source: Source }>({ text: '', source: 'kw' })
  const isUnmountedRef = useRef(false)

  // 收藏状态管理
  const [collectedSet, setCollectedSet] = useState<Set<string>>(() => {
    const set = new Set<string>()
    for (const list of listState.userList) {
      if (list.sourceListId) {
        set.add(list.sourceListId)
      }
    }
    return set
  })

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

  const handleCollect = useCallback((item: ListInfoItem) => {
    const collectKey = getCollectKey(item)
    if (collectedSet.has(collectKey)) {
      // 取消收藏
      const targetList = listState.userList.find(l => l.sourceListId === collectKey)
      if (targetList) {
        removeUserList([targetList.id]).then(() => {
          setCollectedSet(prev => {
            const next = new Set(prev)
            next.delete(collectKey)
            return next
          })
          toast(`已取消收藏：${item.name}`)
        }).catch((err) => {
          console.error('[Search AlbumList] removeUserList error:', err)
          toast('取消收藏失败')
        })
      }
    } else {
      // 收藏
      createList({
        name: item.name,
        source: item.source as LX.OnlineSource,
        sourceListId: collectKey,
      }).then(() => {
        setCollectedSet(prev => {
          const next = new Set(prev)
          next.add(collectKey)
          return next
        })
        toast(`已创建歌单：${item.name}`)
      }).catch((err) => {
        console.error('[Search AlbumList] createList error:', err)
        toast('收藏失败')
      })
    }
  }, [collectedSet])

  // 监听歌单列表变化，同步收藏状态
  useEffect(() => {
    const handleUpdate = (allList: any[]) => {
      // allList[0]=defaultList, allList[1]=loveList, 其余为userList
      const userList = allList.slice(2) as LX.List.UserListInfo[]
      const set = new Set<string>()
      for (const list of userList) {
        if (list.sourceListId) {
          set.add(list.sourceListId)
        }
      }
      setCollectedSet(set)
    }
    global.state_event.on('mylistUpdated', handleUpdate)
    return () => {
      global.state_event.off('mylistUpdated', handleUpdate)
    }
  }, [])

  const loadList = async (text: string, source: Source) => {
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
        requestAnimationFrame(() => {
          const mappedList = list.map(mapToSonglistItem)
          listRef.current?.setList(mappedList, false)
          listRef.current?.setStatus(searchAlbumState.maxPages[searchAlbumState.source] == page ? 'end' : 'idle')
        })
      }).catch(() => {
        listRef.current?.setStatus('error')
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
      listRef.current?.setList(mappedList, true, false)
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
    onCollect={handleCollect}
    collectedSet={collectedSet}
  />
})