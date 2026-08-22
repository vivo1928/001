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
        // 使用 requestAnimationFrame 延迟调用，确保子组件已挂载完成
        // 否则首次搜索时 sub-list 组件尚未渲染，ref.current 为 null，调用会被静默丢弃
        requestAnimationFrame(() => {
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
        })
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
            {listType === 'music' && <MusicList ref={musicListRef} />}
            {listType === 'songlist' && <SonglistList ref={songlistListRef} />}
            {listType === 'album' && <AlbumList ref={albumListRef} />}
            {listType === 'singer' && <SingerList ref={singerListRef} />}
          </View>
        )
  )
})
