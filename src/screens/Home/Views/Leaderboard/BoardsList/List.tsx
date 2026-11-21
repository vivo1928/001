import { forwardRef, useImperativeHandle, useState } from 'react'
import { View, FlatList } from 'react-native'

import { createStyle } from '@/utils/tools'
import { type Position } from './ListMenu'
import ListItem, { type ListItemProps } from './ListItem'
import { type BoardItem } from '@/store/leaderboard/state'

export interface ListProps {
  onBoundChange: (listId: string) => void
  onShowMenu: (info: { listId: string, name: string, index: number }, position: Position) => void
}
export interface ListType {
  setList: (list: BoardItem[], activeId: string) => void
  hideMenu: () => void
}

export default forwardRef<ListType, ListProps>(({ onBoundChange, onShowMenu }, ref) => {
  const [activeId, setActiveId] = useState('')
  const [longPressIndex, setLongPressIndex] = useState(-1)
  const [list, setList] = useState<BoardItem[]>([])

  useImperativeHandle(ref, () => ({
    setList(list, activeId) {
      setList(list)
      setActiveId(activeId)
    },
    hideMenu() {
      setLongPressIndex(-1)
    },
  }), [])

  const handleBoundChange = (item: BoardItem) => {
    setActiveId(item.id)
    onBoundChange(item.id)
  }

  const handleShowMenu: ListItemProps['onShowMenu'] = (listId, name, index, position: Position) => {
    setLongPressIndex(index)
    onShowMenu({ listId, name, index }, position)
  }

  return (
    <FlatList
      style={styles.scrollView}
      data={list}
      keyboardShouldPersistTaps={'always'}
      keyExtractor={item => item.id}
      initialNumToRender={12}
      windowSize={9}
      removeClippedSubviews={false}
      renderItem={({ item, index }) => (
        <ListItem
          item={item}
          index={index}
          longPressIndex={longPressIndex}
          activeId={activeId}
          onShowMenu={handleShowMenu}
          onBoundChange={handleBoundChange}
        />
      )}
    />
  )
})


const styles = createStyle({
  scrollView: {
    flexShrink: 1,
  },
})

