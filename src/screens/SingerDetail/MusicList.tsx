import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo } from './state'
import musicSdk from '@/utils/musicSdk'
import { handlePlay } from './listAction'

export interface MusicListProps {
  componentId: string
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

const LIMIT = 30

export default forwardRef<MusicListType, MusicListProps>(({ componentId }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const headerRef = useRef<HeaderType>(null)
  const isUnmountedRef = useRef(false)
  const info = useSingerInfo()
  const singerIdRef = useRef<string>('')
  const listInfoRef = useRef<{
    list: LX.Music.MusicInfoOnline[]
    page: number
    total: number
    maxPage: number
  }>({ list: [], page: 0, total: 0, maxPage: 0 })

  const fetchList = async (page: number): Promise<{
    list: LX.Music.MusicInfoOnline[]
    total: number
    allPage: number
    singerInfo?: { name?: string; img?: string; desc?: string }
  }> => {
    const sdk = musicSdk[info.source]
    if (!sdk) throw new Error('source not found: ' + info.source)

    // 策略：优先使用 singer API（按歌手ID获取歌曲，可获取歌手简介），失败则降级到 musicSearch
    const hasSingerApi = !!(sdk.singer?.getSingerSongList)

    if (hasSingerApi) {
      try {
        const result = await sdk.singer.getSingerSongList(singerIdRef.current, page, LIMIT)
        console.log(`[SingerDetail] singer API result: list=${result?.list?.length} total=${result?.total}`)
        if (result && result.list && result.list.length > 0) {
          return {
            list: result.list,
            total: result.total || 0,
            allPage: result.allPage || Math.ceil((result.total || 0) / LIMIT),
            singerInfo: result.info || undefined,
          }
        }
        console.log('[SingerDetail] singer API returned empty list, falling back to musicSearch')
      } catch (err: any) {
        console.log(`[SingerDetail] singer API failed, falling back to musicSearch: ${err?.message || err}`)
      }
    }

    // 降级：使用 musicSearch 按歌手名称搜索歌曲（和搜索页面歌曲选项卡相同方式）
    const searchName = info.name || ''
    if (!searchName) throw new Error('Singer name is empty')
    console.log(`[SingerDetail] using musicSearch for name="${searchName}" source=${info.source} page=${page}`)
    if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + info.source)

    const result = await sdk.musicSearch.search(searchName, page, LIMIT)
    console.log(`[SingerDetail] musicSearch result: list=${result?.list?.length} total=${result?.total}`)
    return {
      list: result.list || [],
      total: result.total || 0,
      allPage: result.allPage || 1,
    }
  }

  // 构建歌手简介文本
  const buildDesc = (singerInfo?: { name?: string; img?: string; desc?: string }): string => {
    if (singerInfo?.desc) return singerInfo.desc
    // 没有简介时显示歌曲数和专辑数
    const parts: string[] = []
    if (info.song_count) parts.push(`${info.song_count} 首歌曲`)
    if (info.album_count) parts.push(`${info.album_count} 张专辑`)
    return parts.join(' · ')
  }

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
      singerIdRef.current = id
      listRef.current?.setList([])
      listRef.current?.setStatus('loading')
      headerRef.current?.setInfo({
        name: info.name || '',
        desc: buildDesc(),
        imgUrl: info.img,
      })
      const page = 1
      return fetchList(page).then((result) => {
        if (isUnmountedRef.current) return
        listInfoRef.current = {
          list: result.list,
          page,
          total: result.total,
          maxPage: result.allPage,
        }
        requestAnimationFrame(() => {
          // 用 API 返回的歌手简介更新 Header
          headerRef.current?.setInfo({
            name: result.singerInfo?.name || info.name || '',
            desc: buildDesc(result.singerInfo),
            imgUrl: result.singerInfo?.img || info.img,
          })
          listRef.current?.setList(result.list)
          listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
        })
      }).catch((err: any) => {
        console.error(`[SingerDetail] loadList error: ${err?.message || err}`)
        if (!isUnmountedRef.current) {
          listRef.current?.setStatus('error')
        }
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
  const handlePlayAll = () => {
    if (!listInfoRef.current.list.length) return
    void handlePlay(info.id, info.source, listInfoRef.current.list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    fetchList(page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: result.list,
        page,
        total: result.total,
        maxPage: result.allPage,
      }
      requestAnimationFrame(() => {
        listRef.current?.setList(result.list)
        listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
      })
    }).catch((err) => {
      console.error(`[SingerDetail] refresh error: ${err?.message || err}`)
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    fetchList(page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: [...listInfoRef.current.list, ...result.list],
        page,
        total: result.total,
        maxPage: result.allPage,
      }
      requestAnimationFrame(() => {
        listRef.current?.setList(listInfoRef.current.list, true)
        listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
      })
    }).catch((err) => {
      console.error(`[SingerDetail] loadMore error: ${err?.message || err}`)
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const header = useMemo(() => <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAll} />, [componentId])

  return <OnlineList
    ref={listRef}
    onPlayList={handlePlayList}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    ListHeaderComponent={header}
  />
})