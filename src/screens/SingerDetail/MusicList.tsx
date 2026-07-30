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
const FETCH_TIMEOUT = 15000

const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

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
    console.log(`[SingerDetail] fetchList source=${info.source} id=${id} name=${info.name} page=${page}`)
    const sdk = musicSdk[info.source]
    if (!sdk) throw new Error('source not found: ' + info.source)

    // KG has a working singer API - use it directly
    if (info.source === 'kg' && sdk.singer?.getSingerSongList) {
      const result = await withTimeout(
        sdk.singer.getSingerSongList(id, page, LIMIT),
        FETCH_TIMEOUT,
        'KG singer song list timeout'
      )
      console.log(`[SingerDetail] KG singer API result: list=${result?.list?.length} total=${result?.total}`)
      if (result && result.list && result.list.length > 0) {
        return {
          list: result.list,
          total: result.total || 0,
          allPage: result.allPage || Math.ceil((result.total || 0) / LIMIT),
          info: result.info || { name: info.name, img: info.img, desc: '' },
        }
      }
    }

    // For all other sources: use musicSearch by singer name
    const searchName = info.name || ''
    if (!searchName) throw new Error('Singer name is empty')
    console.log(`[SingerDetail] using musicSearch for name=${searchName} source=${info.source}`)
    if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + info.source)
    
    const result = await withTimeout(
      sdk.musicSearch.search(searchName, page, LIMIT),
      FETCH_TIMEOUT,
      `musicSearch timeout for source: ${info.source}`
    )
    console.log(`[SingerDetail] musicSearch result: list=${result?.list?.length} total=${result?.total}`)
    return {
      list: result.list || [],
      total: result.total || 0,
      allPage: result.allPage || 1,
      info: {
        name: info.name || searchName,
        img: info.img,
        desc: info.song_count ? `${info.song_count} 首歌曲${info.album_count ? ` · ${info.album_count} 张专辑` : ''}` : '',
      },
    }
  }

  useImperativeHandle(ref, () => ({
    loadList(source, id) {
      singerIdRef.current = id
      listRef.current?.setList([])
      listRef.current?.setStatus('loading')
      headerRef.current?.setInfo({
        name: info.name || '',
        desc: info.song_count ? `${info.song_count} 首歌曲${info.album_count ? ` · ${info.album_count} 张专辑` : ''}` : '',
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
        listRef.current?.setList(result.list)
        listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
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
    }).catch((err) => {
      console.error(`[SingerDetail] loadMore error: ${err?.message || err}`)
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
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