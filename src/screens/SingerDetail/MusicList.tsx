import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo, type SingerTabType } from './state'
import { clearListDetail, getListDetail, setListDetail, setListDetailInfo } from '@/core/singerDetail'
import singerDetailState from '@/store/singerDetail/state'
import { handlePlay, handlePlayAll } from './listAction'

export interface MusicListProps {
  componentId: string
  activeTab: SingerTabType
  onTabChange: (tab: SingerTabType) => void
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

// 构建歌手简介文本
const buildDesc = (info: { name?: string; song_count?: number; album_count?: number; desc?: string; img?: string }): string => {
  if (info.desc) return info.desc
  const parts: string[] = []
  if (info.song_count) parts.push(`${info.song_count} 首歌曲`)
  if (info.album_count) parts.push(`${info.album_count} 张专辑`)
  return parts.join(' · ')
}

export default forwardRef<MusicListType, MusicListProps>(({ componentId, activeTab, onTabChange }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const headerRef = useRef<HeaderType>(null)
  const isUnmountedRef = useRef(false)
  const info = useSingerInfo()

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
      clearListDetail()
      const listDetailInfo = singerDetailState.listDetailInfo
      listRef.current?.setList([])
      if (listDetailInfo.id == id && listDetailInfo.source == source && listDetailInfo.list.length) {
        requestAnimationFrame(() => {
          listRef.current?.setList(listDetailInfo.list)
          listRef.current?.setStatus(listDetailInfo.maxPage <= 1 ? 'end' : 'idle')
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        setListDetailInfo(source, id)
        headerRef.current?.setInfo({
          name: info.name || '',
          desc: buildDesc(info),
          imgUrl: info.img,
        })
        return getListDetail(source, id, info.name || '', page).then((result) => {
          const listDetail = setListDetail(result, id, page)
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            // 用 API 返回的歌手简介更新 Header
            headerRef.current?.setInfo({
              name: result.singerInfo?.name || info.name || '',
              desc: buildDesc({ ...info, ...result.singerInfo }),
              imgUrl: result.singerInfo?.img || info.img,
            })
            listRef.current?.setList(listDetail.list)
            listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
          })
        }).catch(() => {
          if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
          listRef.current?.setStatus('error')
        })
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
    const list = listRef.current?.getList()
    if (!list || !list[index]) {
      console.warn(`[SingerDetail] handlePlayList: invalid index=${index} list.length=${list?.length ?? 'N/A'}`)
      return
    }
    void handlePlay(list[index])
  }
  const handlePlayAllSongs = () => {
    const list = listRef.current?.getList()
    if (!list?.length) return
    void handlePlayAll(info.id, info.source, list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    getListDetail(singerDetailState.listDetailInfo.source!, singerDetailState.listDetailInfo.id, info.name || '', page).then((result) => {
      const listDetail = setListDetail(result, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      requestAnimationFrame(() => {
        listRef.current?.setList(listDetail.list)
        listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
      })
    }).catch(() => {
      if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = singerDetailState.listDetailInfo.list.length ? singerDetailState.listDetailInfo.page + 1 : 1
    getListDetail(singerDetailState.listDetailInfo.source!, singerDetailState.listDetailInfo.id, info.name || '', page).then((result) => {
      const listDetail = setListDetail(result, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(listDetail.list, true)
      listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }

  const header = useMemo(() => (
    <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAllSongs} activeTab={activeTab} onTabChange={onTabChange} />
  ), [componentId, activeTab, onTabChange])

  return <OnlineList
    ref={listRef}
    onPlayList={handlePlayList}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    ListHeaderComponent={header}
    rowType='medium'
  />
})