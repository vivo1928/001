import { useRef, forwardRef, useImperativeHandle, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'

import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import SearchInput, { type SearchInputType, type SearchInputProps } from '@/screens/Home/Views/Search/HeaderBar/SearchInput'
import { type AudiobookSource } from '@/store/audiobook/state'

const SOURCE_LIST: { label: string; id: AudiobookSource }[] = [
  { label: '喜马拉雅', id: 'xm' },
  { label: '蜻蜓FM', id: 'qt' },
]

export interface HeaderBarProps {
  onSourceChange: (source: AudiobookSource) => void
  onSearch: SearchInputProps['onSubmit']
  onTipSearch: SearchInputProps['onChangeText']
  onHideTipList: SearchInputProps['onBlur']
  onShowTipList: SearchInputProps['onTouchStart']
}

export interface HeaderBarType {
  setSource: (source: AudiobookSource) => void
  setText: SearchInputType['setText']
  blur: SearchInputType['blur']
}

export default forwardRef<HeaderBarType, HeaderBarProps>(({
  onSourceChange, onSearch, onTipSearch, onHideTipList, onShowTipList,
}, ref) => {
  const theme = useTheme()
  const searchInputRef = useRef<SearchInputType>(null)
  const [source, setSource] = useState<AudiobookSource>('xm')
  const [showMenu, setShowMenu] = useState(false)

  useImperativeHandle(ref, () => ({
    setSource(s) {
      setSource(s)
    },
    setText(text) {
      searchInputRef.current?.setText(text)
    },
    blur() {
      searchInputRef.current?.blur()
    },
  }), [])

  const handleSelect = (id: AudiobookSource) => {
    setSource(id)
    setShowMenu(false)
    onSourceChange(id)
  }

  const currentLabel = SOURCE_LIST.find(s => s.id === source)?.label || '喜马拉雅'

  return (
    <View style={{ ...styles.searchBar, borderBottomColor: theme['c-border-background'] }}>
      <View style={styles.selector}>
        <TouchableOpacity style={styles.sourceBtn} onPress={() => setShowMenu(!showMenu)}>
          <Text size={13} numberOfLines={1}>{currentLabel}</Text>
          <Text size={8} color={theme['c-font-label']} style={{ marginLeft: 3 }}>▼</Text>
        </TouchableOpacity>
        {showMenu ? (
          <View style={{ ...styles.menu, backgroundColor: theme['c-content-background'], borderColor: theme['c-border-background'] }}>
            {SOURCE_LIST.map(s => (
              <TouchableOpacity
                key={s.id}
                style={{ ...styles.menuItem, backgroundColor: s.id === source ? theme['c-primary-background-hover'] : 'transparent' }}
                onPress={() => handleSelect(s.id)}
              >
                <Text size={13} color={s.id === source ? theme['c-primary-font-active'] : theme['c-font']}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
      <SearchInput
        ref={searchInputRef}
        onChangeText={onTipSearch}
        onSubmit={onSearch}
        onBlur={onHideTipList}
        onTouchStart={onShowTipList}
      />
    </View>
  )
})

const styles = createStyle({
  searchBar: {
    flexDirection: 'row',
    height: 38,
    zIndex: 2,
    paddingRight: 10,
    borderBottomWidth: BorderWidths.normal,
    alignItems: 'center',
  },
  selector: {
    position: 'relative',
    zIndex: 100,
  },
  sourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 10,
    height: '100%',
    minWidth: 80,
  },
  menu: {
    position: 'absolute',
    top: 38,
    left: 5,
    borderWidth: BorderWidths.normal,
    borderRadius: 4,
    minWidth: 100,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
})