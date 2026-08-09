import { forwardRef, useImperativeHandle, useRef, useMemo, useState, useCallback, useEffect } from 'react'

import Songlist, { type SonglistProps, type SonglistType } from '@/screens/Home/Views/SongList/components/Songlist'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { type ListInfoItem } from '@/store/songlist/state'
import { useSingerInfo, type SingerTabType } from './state'
import Header from './Header'
import { search, getAlbumSongs } from '@/core/singerAlbum'
import { createList, removeUserList } from '@/core/list'
import { toast } from '@/utils/tools'
import listState from '@/store/list/state'

export interface AlbumListProps {
  componentId: string
  activeTab: SingerTabType
  onTabChange: (tab: SingerTabType) => void
}

export interface AlbumListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const mapToAlbumItem = (item: any): ListInfoItem => ({
  id: item.id,
  name: item.name,
  author: item.singer || item.author || '',
  img: item.img,
  source: item.source,
  play_count: item.song_count ? String(item.song_count) : '',
  desc: item.publish_date || '',
})

// 获取收藏标识键
const getCollectKey = (item: ListInfoItem) => `${item.source}__${item.id}`

export default forwardRef<AlbumListType, AlbumListProps>(({ componentId, activeTab, onTabChange }, ref) => {
  const listRef = useRef<SonglistType>(null)
  const info = useSingerInfo()
  const isUnmountedRef = useRef(false)
  const pageRef = useRef(1)
  const maxPageRef = useRef(0)
  const sourceRef = useRef<LX.OnlineSource>('kw')
  const singerIdRef = useRef('')

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

  const handleCollect = useCallback((item: ListInfoItem) => {
    const collectKey = getCollectKey(item)
    if (collectedSet.has(collectKey)) {
      // 取消收藏：找到对应的歌单并删除
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
          console.error('[AlbumList] removeUserList error:', err)
          toast('取消收藏失败')
        })
      }
    } else {
      // 收藏：先获取专辑歌曲，再创建歌单并填充歌曲
      toast(`正在获取专辑歌曲：${item.name}`)
      getAlbumSongs(item.id, item.source as LX.OnlineSource, item.name, item.author).then((songs) => {
        createList({
          name: item.name,
          source: item.source as LX.OnlineSource,
          sourceListId: collectKey,
          list: songs as LX.Music.MusicInfo[],
        }).then(() => {
          setCollectedSet(prev => {
            const next = new Set(prev)
            next.add(collectKey)
            return next
          })
          toast(`已创建歌单：${item.name}（${songs.length}首）`)
        }).catch((err) => {
          console.error('[AlbumList] createList error:', err)
          toast('收藏失败')
        })
      }).catch((err) => {
        console.error('[AlbumList] getAlbumSongs error:', err)
        toast('获取专辑歌曲失败，已创建空歌单')
        // 降级：创建空歌单
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
        }).catch((err2) => {
          console.error('[AlbumList] createList fallback error:', err2)
          toast('收藏失败')
        })
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

  useImperativeHandle(ref, () => ({
    loadList(source, id) {
      sourceRef.current = source
      singerIdRef.current = id
      pageRef.current = 1
      maxPageRef.current = 0
      listRef.current?.setList([], false)
      listRef.current?.setStatus('loading')
      search(id, info.name, source, 1).then((result) => {
        if (isUnmountedRef.current) return
        const mappedList = result.list.map(mapToAlbumItem)
        maxPageRef.current = result.allPage
        listRef.current?.setList(mappedList, false)
        listRef.current?.setStatus(result.allPage <= 1 ? 'end' : 'idle')
      }).catch(() => {
        if (!isUnmountedRef.current) {
          listRef.current?.setStatus('error')
        }
      })
    },
  }), [info.name])

  const handleOpenDetail = (item: ListInfoItem, _index: number) => {
    navigations.pushAlbumDetailScreen(commonState.componentIds.singerDetail!, {
      id: item.id,
      name: item.name,
      singer: item.author,
      img: item.img,
      source: item.source as LX.OnlineSource,
      publish_date: item.desc,
      song_count: item.play_count ? parseInt(item.play_count) : undefined,
    })
  }

  const handleRefresh: SonglistProps['onRefresh'] = () => {
    pageRef.current = 1
    listRef.current?.setStatus('refreshing')
    search(singerIdRef.current, info.name, sourceRef.current, 1, true).then((result) => {
      if (isUnmountedRef.current) return
      const mappedList = result.list.map(mapToAlbumItem)
      maxPageRef.current = result.allPage
      listRef.current?.setList(mappedList, false)
      listRef.current?.setStatus(result.allPage <= 1 ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: SonglistProps['onLoadMore'] = () => {
    const nextPage = pageRef.current + 1
    if (maxPageRef.current > 0 && nextPage > maxPageRef.current) {
      listRef.current?.setStatus('end')
      return
    }
    listRef.current?.setStatus('loading')
    search(singerIdRef.current, info.name, sourceRef.current, nextPage).then((result) => {
      if (isUnmountedRef.current) return
      pageRef.current = nextPage
      maxPageRef.current = result.allPage
      const mappedList = result.list.map(mapToAlbumItem)
      listRef.current?.setList(mappedList, true)
      listRef.current?.setStatus(result.allPage <= nextPage ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }

  const header = useMemo(() => (
    <Header componentId={componentId} activeTab={activeTab} onTabChange={onTabChange} />
  ), [componentId, activeTab, onTabChange])

  return <Songlist
    ref={listRef}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    onOpenDetail={handleOpenDetail}
    onCollect={handleCollect}
    collectedSet={collectedSet}
    ListHeaderComponent={header}
  />
})