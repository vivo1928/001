import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import type { InitState as SearchState } from '@/store/search/state'
import type { Source as MusicSource } from '@/store/search/music/state'
import type { Source as SongListSource } from '@/store/search/songlist/state'
import MusicList, { type MusicListType } from './MusicList'
import SonglistList, { type MusicListType as SonglistListType } from './SonglistList'
import AlbumList, { type AlbumListType } from './AlbumList'
import SingerList, { type SingerListType } from './SingerList'
import BlankView, { type BlankViewType } from './BlankView'
interface ListProps {
  onSearch: (keyword: string) => void
}
export interface ListType {
  loadList: (text: string, source: MusicSource | SongListSource, type: SearchState['searchType']) => void
}

export default forwardRef<ListType, ListProps>(({ onSearch }, ref) => {
  const [listType, setListType] = useState<SearchState['searchType']>('music')
  const [showBlankView, setShowListView] = useState(true)
  const [loadSeq, setLoadSeq] = useState(0)
  const musicListRef = useRef<MusicListType>(null)
  const songlistListRef = useRef<SonglistListType>(null)
  const albumListRef = useRef<AlbumListType>(null)
  const singerListRef = useRef<SingerListType>(null)
  const blankViewRef = useRef<BlankViewType>(null)
  const pendingLoadRef = useRef<{ text: string, source: MusicSource | SongListSource, type: SearchState['searchType'] } | null>(null)

  useImperativeHandle(ref, () => ({
    loadList(text, source, type) {
      if (text) {
        setShowListView(false)
        setListType(type)
        pendingLoadRef.current = { text, source, type }
        setLoadSeq(n => n + 1)
      } else {
        pendingLoadRef.current = null
        setShowListView(true)
        setTimeout(() => {
          blankViewRef.current?.show(source)
        })
      }
    },
  }), [])

  // commit 之后派发：此时目标子组件已挂载、ref 已赋值，
  // 避免 requestAnimationFrame 时序竞争导致 loadList 被静默丢弃（歌手搜索首次不加载的根因）
  useEffect(() => {
    const req = pendingLoadRef.current
    if (!req) return
    pendingLoadRef.current = null
    switch (req.type) {
      case 'music':
        musicListRef.current?.loadList(req.text, req.source as any)
        break
      case 'songlist':
        songlistListRef.current?.loadList(req.text, req.source as any)
        break
      case 'album':
        albumListRef.current?.loadList(req.text, req.source as any)
        break
      case 'singer':
        singerListRef.current?.loadList(req.text, req.source as any)
        break
    }
  }, [loadSeq, listType])

  return (
    showBlankView
      ? <BlankView ref={blankViewRef} onSearch={onSearch} />
      : (
          <View style={{ flex: 1 }}>
            {listType === 'music' && <MusicList ref={musicListRef} />}
            {listType === 'songlist' && <SonglistList ref={songlistListRef} />}
            {listType === 'album' && <AlbumList ref={albumListRef} />}
            {listType === 'singer' && <SingerList ref={singerListRef} />}
          </View>
        )
  )
})
