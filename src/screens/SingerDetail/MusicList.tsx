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

  const fetchList = async(id: string, page: number): Promise<{
    list: LX.Music.MusicInfoOnline[]
    total: number
    allPage: number
    info?: { name?: string; img?: string; desc?: string }
  }> => {
    const sdk = musicSdk[info.source]
    if (!sdk) throw new Error('source not found: ' + info.source)

    // Try singer API first (kg, mg have getSingerSongList)
    const singerApi = sdk.singer
    if (singerApi?.getSingerSongList) {
      try {
        const result = await singerApi.getSingerSongList(id, page, LIMIT)
        if (result && result.list) {
          return {
            list: result.list,
            total: result.total || 0,
            allPage: result.allPage || Math.ceil((result.total || 0) / (result.limit || LIMIT)),
            info: result.info,
          }
        }
      } catch (_) {
        // Fall through to music search
      }
    }

    // Fallback: use music search by singer name
    if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + info.source)
    const result = await sdk.musicSearch.search(info.name, page, LIMIT)
    return {
      list: result.list || [],
      total: result.total || 0,
      allPage: result.allPage || 1,
    }
  }

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
      singerIdRef.current = id
      listRef.current?.setList([])
      listRef.current?.setStatus('loading')
      headerRef.current?.setInfo({
        name: info.name || '',
        desc: '',
        imgUrl: info.img,
      })
      const page = 1
      return fetchList(id, page).then((result) => {
        if (isUnmountedRef.current) return
        listInfoRef.current = {
          list: result.list,
          page,
          total: result.total,
          maxPage: result.allPage,
        }
        if (result.info) {
          headerRef.current?.setInfo({
            name: result.info.name || info.name || '',
            desc: result.info.desc || '',
            imgUrl: result.info.img || info.img,
          })
        }
        requestAnimationFrame(() => {
          listRef.current?.setList(result.list)
          listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
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
  const handlePlayAll = () => {
    if (!listInfoRef.current.list.length) return
    void handlePlay(info.id, info.source, listInfoRef.current.list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    fetchList(singerIdRef.current, page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: result.list,
        page,
        total: result.total,
        maxPage: result.allPage,
      }
      if (result.info) {
        headerRef.current?.setInfo({
          name: result.info.name || info.name || '',
          desc: result.info.desc || '',
          imgUrl: result.info.img || info.img,
        })
      }
      listRef.current?.setList(result.list)
      listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    fetchList(singerIdRef.current, page).then((result) => {
      if (isUnmountedRef.current) return
      listInfoRef.current = {
        list: [...listInfoRef.current.list, ...result.list],
        page,
        total: result.total,
        maxPage: result.allPage,
      }
      listRef.current?.setList(listInfoRef.current.list, true)
      listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }

  const header = useMemo(() => <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAll} />, [componentId])

  return <OnlineList
    ref={listRef}
    onPlayList={handlePlayList}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    ListHeaderComponent={header}
  />
})