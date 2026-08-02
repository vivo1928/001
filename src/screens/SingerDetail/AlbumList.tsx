import { forwardRef, useImperativeHandle, useRef, useMemo } from 'react'

import Songlist, { type SonglistProps, type SonglistType } from '@/screens/Home/Views/SongList/components/Songlist'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { type ListInfoItem } from '@/store/songlist/state'
import { useSingerInfo, type SingerTabType } from './state'
import Header from './Header'
import musicSdk from '@/utils/musicSdk'

export interface AlbumListProps {
  componentId: string
  activeTab: SingerTabType
  onTabChange: (tab: SingerTabType) => void
}

export interface AlbumListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const LIMIT = 20

const mapToAlbumItem = (item: any): ListInfoItem => ({
  id: item.id,
  name: item.name,
  author: item.singer || item.author || '',
  img: item.img,
  source: item.source,
  play_count: item.song_count ? String(item.song_count) : '',
  desc: item.publish_date || '',
})

export default forwardRef<AlbumListType, AlbumListProps>(({ componentId, activeTab, onTabChange }, ref) => {
  const listRef = useRef<SonglistType>(null)
  const info = useSingerInfo()
  const isUnmountedRef = useRef(false)
  const pageRef = useRef(1)
  const maxPageRef = useRef(0)
  const sourceRef = useRef<LX.OnlineSource>('kw')

  useImperativeHandle(ref, () => ({
    loadList(source, _id) {
      sourceRef.current = source
      pageRef.current = 1
      maxPageRef.current = 0
      listRef.current?.setList([], false)
      listRef.current?.setStatus('loading')
      fetchAlbumList(info.name, source, 1).then((result) => {
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

  const fetchAlbumList = async (singerName: string, source: LX.OnlineSource, page: number): Promise<{ list: any[], allPage: number }> => {
    const sdk = musicSdk[source]
    if (!sdk) throw new Error('Source not found: ' + source)

    // 优先使用 singer.getSingerAlbumList API（按歌手ID获取专辑）
    const hasSingerAlbumApi = !!(sdk.singer?.getSingerAlbumList)
    if (hasSingerAlbumApi) {
      try {
        const result = await sdk.singer.getSingerAlbumList(info.id, page, LIMIT)
        if (result && result.albums && result.albums.length > 0) {
          return {
            list: result.albums,
            allPage: result.allPage || Math.ceil((result.total || 0) / LIMIT) || 99,
          }
        }
      } catch (err: any) {
        console.log(`[SingerDetail] singer album API failed, falling back to albumSearch: ${err?.message || err}`)
      }
    }

    // 降级：使用 albumSearch 按歌手名称搜索专辑
    if (!sdk?.albumSearch) throw new Error('albumSearch not supported for source: ' + source)
    const result = await sdk.albumSearch.search(singerName, page, LIMIT)
    // 过滤出与歌手名匹配的专辑
    const filteredList = (result.list || []).filter((item: any) => {
      const singer = (item.singer || item.author || '').toLowerCase()
      return singer.includes(singerName.toLowerCase())
    })
    return {
      list: filteredList,
      allPage: result.allPage || 1,
    }
  }

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
    fetchAlbumList(info.name, sourceRef.current, 1).then((result) => {
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
    fetchAlbumList(info.name, sourceRef.current, nextPage).then((result) => {
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
    ListHeaderComponent={header}
  />
})