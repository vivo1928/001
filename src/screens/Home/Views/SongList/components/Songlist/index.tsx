import { useRef, forwardRef, useImperativeHandle } from 'react'
import { type ListInfoItem } from '@/store/songlist/state'
// import LoadingMask, { LoadingMaskType } from '@/components/common/LoadingMask'
import List, { type ListProps, type ListType, type Status } from './List'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'

export interface SonglistProps {
  onRefresh: ListProps['onRefresh']
  onLoadMore: ListProps['onLoadMore']
  onOpenDetail?: (item: ListInfoItem, index: number) => void
  onCollect?: (item: ListInfoItem) => void
  ListHeaderComponent?: ListProps['ListHeaderComponent']
}
export interface SonglistType {
  setList: (list: ListInfoItem[], isAppend?: boolean, showSource?: boolean) => void
  setStatus: (val: Status) => void
}

export default forwardRef<SonglistType, SonglistProps>(({
  onRefresh,
  onLoadMore,
  onOpenDetail,
  onCollect,
  ListHeaderComponent,
}, ref) => {
  const listRef = useRef<ListType>(null)
  // const loadingMaskRef = useRef<LoadingMaskType>(null)

  useImperativeHandle(ref, () => ({
    setList(list, isAppend, showSource) {
      listRef.current?.setList(list, isAppend, showSource)
    },
    setStatus(val) {
      listRef.current?.setStatus(val)
    },
  }))

  const handleOpenDetail = (item: ListInfoItem, index: number) => {
    if (onOpenDetail) {
      onOpenDetail(item, index)
    } else {
      navigations.pushSonglistDetailScreen(commonState.componentIds.home!, item)
    }
  }

  return (
    <List
      ref={listRef}
      onRefresh={onRefresh}
      onLoadMore={onLoadMore}
      onOpenDetail={handleOpenDetail}
      onCollect={onCollect}
      ListHeaderComponent={ListHeaderComponent}
    />
  )
})