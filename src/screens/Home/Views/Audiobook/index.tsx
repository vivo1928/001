import { useRef, useEffect } from 'react'
import { View } from 'react-native'

import HeaderBar, { type HeaderBarProps, type HeaderBarType } from './HeaderBar'
import TypeSelector from './TypeSelector'
import AudiobookList, { type AudioListType } from './AudiobookList'
import { search } from '@/core/audiobook/search'
import audiobookState, { type AudiobookSource, type AudiobookType, type SearchListItem } from '@/store/audiobook/state'
import { createStyle } from '@/utils/tools'

interface SearchInfo {
  source: AudiobookSource
  type: AudiobookType
}

export default () => {
  const headerBarRef = useRef<HeaderBarType>(null)
  const listRef = useRef<AudioListType>(null)
  const searchInfo = useRef<SearchInfo>({ source: 'xm', type: 'album' })
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handleSourceChange: HeaderBarProps['onSourceChange'] = (source) => {
    searchInfo.current.source = source
    if (audiobookState.searchText) {
      performSearch(audiobookState.searchText, 1)
    }
  }

  const handleTypeChange = (type: AudiobookType) => {
    searchInfo.current.type = type
    if (audiobookState.searchText) {
      performSearch(audiobookState.searchText, 1)
    }
  }

  const performSearch = async (text: string, page: number) => {
    if (!text) return
    listRef.current?.setStatus(page === 1 ? 'loading' : 'loading')
    try {
      await search(text, page, searchInfo.current.source, searchInfo.current.type)
      if (isUnmountedRef.current) return
      requestAnimationFrame(() => {
        listRef.current?.setList(audiobookState.listInfo.list)
        listRef.current?.setStatus(
          audiobookState.listInfo.maxPage <= page ? 'end' : 'idle'
        )
      })
    } catch {
      if (!isUnmountedRef.current) {
        listRef.current?.setStatus('error')
      }
    }
  }

  const handleSearch: HeaderBarProps['onSearch'] = (text) => {
    headerBarRef.current?.blur()
    performSearch(text, 1)
  }

  const handleRefresh = () => {
    listRef.current?.setStatus('refreshing')
    performSearch(audiobookState.searchText, 1)
  }

  const handleLoadMore = () => {
    const listInfo = audiobookState.listInfo
    const page = listInfo.list.length ? listInfo.page + 1 : 1
    performSearch(audiobookState.searchText, page)
  }

  const handleOpenDetail = (item: SearchListItem, index: number) => {
    // TODO: 打开专辑详情或主播详情页面
    console.log('Open detail:', item.name, item.id)
  }

  return (
    <View style={styles.container}>
      <HeaderBar
        ref={headerBarRef}
        onSourceChange={handleSourceChange}
        onSearch={handleSearch}
        onTipSearch={() => {}}
        onHideTipList={() => {}}
        onShowTipList={() => {}}
      />
      <View style={styles.typeSelector}>
        <TypeSelector onTypeChange={handleTypeChange} />
      </View>
      <View style={styles.content}>
        <AudiobookList
          ref={listRef}
          onRefresh={handleRefresh}
          onLoadMore={handleLoadMore}
          onOpenDetail={handleOpenDetail}
          type={searchInfo.current.type}
        />
      </View>
    </View>
  )
}

const styles = createStyle({
  container: {
    width: '100%',
    flex: 1,
  },
  typeSelector: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
  },
  content: {
    flex: 1,
  },
})