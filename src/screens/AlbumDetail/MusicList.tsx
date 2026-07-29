import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useAlbumInfo } from './state'
import { handlePlay } from './listAction'
import musicSdk from '@/utils/musicSdk'

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
  const info = useAlbumInfo()
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
    info?: { name?: string; img?: string; desc?: string; author?: string }
  }> => {
    console.log(`[AlbumDetail] fetchList source=${info.source} id=${id} name=${info.name} page=${page}`)
    const sdk = musicSdk[info.source]
    if (!sdk) throw new Error('source not found: ' + info.source)

    const albumApi = sdk?.album

    // Try album API first (kw, kg, mg have album APIs)
    if (albumApi) {
      const getDetail = albumApi.getAlbumDetail || albumApi.getAlbumListDetail
      if (getDetail) {
        try {
          console.log(`[AlbumDetail] trying album API for source=${info.source}`)
          const result = await getDetail.call(albumApi, id, page)
          console.log(`[AlbumDetail] album API result: list=${result?.list?.length} total=${result?.total}`)
          if (result && result.list && result.list.length > 0) {
            return {
              list: result.list,
              total: result.total || 0,
              allPage: result.allPage || Math.ceil((result.total || 0) / (result.limit || LIMIT)),
              info: result.info,
            }
          }
          console.log(`[AlbumDetail] album API returned empty list, falling back to musicSearch`)
        } catch (err) {
          console.log(`[AlbumDetail] album API failed, falling back to music search: ${err}`)
        }
      }
    }

    // Fallback: use music search by album/singer name
    const searchName = info.name || info.singer || ''
    console.log(`[AlbumDetail] falling back to musicSearch for name=${searchName}`)
    if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + info.source)
    const result = await sdk.musicSearch.search(searchName, page, LIMIT)
    console.log(`[AlbumDetail] musicSearch result: list=${result?.list?.length} total=${result?.total}`)
    return {
      list: result.list || [],
      total: result.total || 0,
      allPage: result.allPage || 1,
    }
  }

  useImperativeHandle(ref, () => ({
    loadList(source, id) {
      listRef.current?.setList([])
      listRef.current?.setStatus('loading')
      headerRef.current?.setInfo({
        name: info.name || '',
        desc: info.singer ? `${info.singer}${info.publish_date ? ' · ' + info.publish_date : ''}` : (info.publish_date || ''),
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
            desc: result.info.desc || result.info.author || (info.singer ? info.singer : ''),
            imgUrl: result.info.img || info.img,
          })
        }
        requestAnimationFrame(() => {
          listRef.current?.setList(result.list)
          listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
        })
      }).catch((err: any) => {
        console.error(`[AlbumDetail] loadList error: ${err?.message || err}`)
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
    fetchList(info.id, page).then((result) => {
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
          desc: result.info.desc || result.info.author || (info.singer ? info.singer : ''),
          imgUrl: result.info.img || info.img,
        })
      }
      listRef.current?.setList(result.list)
      listRef.current?.setStatus(result.allPage <= page ? 'end' : 'idle')
    }).catch((err) => {
      console.error(`[AlbumDetail] refresh error: ${err?.message || err}`)
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = listInfoRef.current.list.length ? listInfoRef.current.page + 1 : 1
    fetchList(info.id, page).then((result) => {
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
      console.error(`[AlbumDetail] loadMore error: ${err?.message || err}`)
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