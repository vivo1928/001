import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo, type SingerTabType } from './state'
import { clearListDetail, getListDetail, setListDetail, setListDetailInfo } from '@/core/singerDetail'
import singerDetailState from '@/store/singerDetail/state'
import singerDetailActions from '@/store/singerDetail/action'
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
      const compositeId = `${source}__${id}`
      const listDetailInfo = singerDetailState.listDetailInfo
      listRef.current?.setList([])
      if (listDetailInfo.id == compositeId && listDetailInfo.source == source && listDetailInfo.list.length) {
        requestAnimationFrame(() => {
          listRef.current?.setList(listDetailInfo.list)
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        setListDetailInfo(compositeId)
        singerDetailActions.setSingerName(info.name || '')
        singerDetailActions.setSingerInfo(null)
        headerRef.current?.setInfo({
          name: info.name || '',
          desc: buildDesc(info),
          imgUrl: info.img,
        })
        return getListDetail(compositeId, page).then((listDetail) => {
          const result = setListDetail(listDetail, compositeId, page)
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            // 用 API 返回的歌手简介更新 Header
            const singerInfo = singerDetailState.singerInfo
            headerRef.current?.setInfo({
              name: singerInfo?.name || info.name || '',
              desc: buildDesc({ ...info, ...singerInfo }),
              imgUrl: singerInfo?.img || info.img,
            })
            listRef.current?.setList(result.list)
            listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
          })
        }).catch(() => {
          if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
          listRef.current?.setStatus('error')
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

  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    const listDetailInfo = singerDetailState.listDetailInfo
    const list = listDetailInfo.list
    if (!list || !list[index]) {
      console.warn(`[SingerDetail] handlePlayList: invalid index=${index} list.length=${list?.length ?? 'N/A'}`)
      return
    }
    // 匹配排行榜模式：传入 id、当前列表、索引
    void handlePlay(listDetailInfo.id, list, index)
  }
  const handlePlayAllSongs = () => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    void handlePlayAll(info.id, info.source, list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    getListDetail(singerDetailState.listDetailInfo.id, page, true).then((listDetail) => {
      const result = setListDetail(listDetail, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      requestAnimationFrame(() => {
        listRef.current?.setList(result.list)
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
    getListDetail(singerDetailState.listDetailInfo.id, page).then((listDetail) => {
      const result = setListDetail(listDetail, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(result.list, true)
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