import { useRef, useState, useEffect, useCallback } from 'react'
import { View } from 'react-native'

import HeaderBar, { type HeaderBarProps, type HeaderBarType } from './HeaderBar'
import TypeSelector from './TypeSelector'
import AudiobookList, { type AudioListType } from './AudiobookList'
import { search, setSearchText } from '@/core/audiobook/search'
import audiobookState, { type AudiobookSource, type AudiobookType, type SearchListItem } from '@/store/audiobook/state'
import { createStyle } from '@/utils/tools'

export default () => {
  const headerBarRef = useRef<HeaderBarType>(null)
  const listRef = useRef<AudioListType>(null)
  const [searchType, setSearchType] = useState<AudiobookType>('album')
  const [searchSource, setSearchSource] = useState<AudiobookSource>('xm')
  // 用 ref 保存最新值，避免 useCallback 闭包过期问题
  const searchTypeRef = useRef<AudiobookType>('album')
  const searchSourceRef = useRef<AudiobookSource>('xm')
  const lastSearchTextRef = useRef<string>('')
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  // 同步 ref 与 state
  useEffect(() => { searchTypeRef.current = searchType }, [searchType])
  useEffect(() => { searchSourceRef.current = searchSource }, [searchSource])

  // performSearch 全部通过 ref 读取最新值，无闭包依赖，永不变化
  const performSearch = useCallback((text: string, page: number) => {
    if (!text) return
    setSearchText(text)
    lastSearchTextRef.current = text
    if (page === 1) {
      listRef.current?.setList([])
    }
    listRef.current?.setStatus('loading')
    search(text, page, searchSourceRef.current, searchTypeRef.current).then(() => {
      if (isUnmountedRef.current) return
      requestAnimationFrame(() => {
        listRef.current?.setList(audiobookState.listInfo.list)
        listRef.current?.setStatus(
          audiobookState.listInfo.maxPage <= page ? 'end' : 'idle'
        )
      })
    }).catch((err: any) => {
      console.error('[Audiobook] search error:', err?.message || err)
      if (!isUnmountedRef.current) {
        if (page === 1) {
          listRef.current?.setList([])
        }
        listRef.current?.setStatus('error')
      }
    })
  }, [])

  const handleSourceChange: HeaderBarProps['onSourceChange'] = useCallback((source) => {
    setSearchSource(source)
    searchSourceRef.current = source
    if (lastSearchTextRef.current) {
      performSearch(lastSearchTextRef.current, 1)
    }
  }, [performSearch])

  const handleTypeChange = useCallback((type: AudiobookType) => {
    setSearchType(type)
    searchTypeRef.current = type
    if (lastSearchTextRef.current) {
      performSearch(lastSearchTextRef.current, 1)
    }
  }, [performSearch])

  const handleSearch: HeaderBarProps['onSearch'] = useCallback((text) => {
    headerBarRef.current?.blur()
    performSearch(text, 1)
  }, [performSearch])

  const handleRefresh = useCallback(() => {
    listRef.current?.setStatus('refreshing')
    performSearch(lastSearchTextRef.current, 1)
  }, [performSearch])

  const handleLoadMore = useCallback(() => {
    const listInfo = audiobookState.listInfo
    const page = listInfo.list.length ? listInfo.page + 1 : 1
    const text = lastSearchTextRef.current || audiobookState.searchText
    performSearch(text, page)
  }, [performSearch])

  const handleOpenDetail = useCallback((item: SearchListItem, index: number) => {
    console.log('Open detail:', item.name, item.id)
  }, [])

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
          type={searchType}
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