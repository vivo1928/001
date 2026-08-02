import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
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
  const musicListRef = useRef<MusicListType>(null)
  const songlistListRef = useRef<SonglistListType>(null)
  const albumListRef = useRef<AlbumListType>(null)
  const singerListRef = useRef<SingerListType>(null)
  const blankViewRef = useRef<BlankViewType>(null)

  useImperativeHandle(ref, () => ({
    loadList(text, source, type) {
      if (text) {
        setShowListView(false)
        setListType(type)
        // 直接调用对应 ref，组件已挂载无需等待
        switch (type) {
          case 'music':
            musicListRef.current?.loadList(text, source as any)
            break
          case 'songlist':
            songlistListRef.current?.loadList(text, source as any)
            break
          case 'album':
            albumListRef.current?.loadList(text, source as any)
            break
          case 'singer':
            singerListRef.current?.loadList(text, source as any)
            break
        }
      } else {
        setShowListView(true)
        setTimeout(() => {
          blankViewRef.current?.show(source)
        })
      }
    },
  }), [])

  return (
    showBlankView
      ? <BlankView ref={blankViewRef} onSearch={onSearch} />
      : (
          <View style={{ flex: 1 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: listType === 'music' ? 1 : 0 }} pointerEvents={listType === 'music' ? 'auto' : 'none'}>
              <MusicList ref={musicListRef} />
            </View>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: listType === 'songlist' ? 1 : 0 }} pointerEvents={listType === 'songlist' ? 'auto' : 'none'}>
              <SonglistList ref={songlistListRef} />
            </View>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: listType === 'album' ? 1 : 0 }} pointerEvents={listType === 'album' ? 'auto' : 'none'}>
              <AlbumList ref={albumListRef} />
            </View>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: listType === 'singer' ? 1 : 0 }} pointerEvents={listType === 'singer' ? 'auto' : 'none'}>
              <SingerList ref={singerListRef} />
            </View>
          </View>
        )
  )
})
