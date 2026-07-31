import { useRef, useState, useEffect, useCallback } from 'react'
import { View } from 'react-native'

import HeaderBar, { type HeaderBarProps, type HeaderBarType } from './HeaderBar'
import TypeSelector from './TypeSelector'
import AudiobookList, { type AudioListType } from './AudiobookList'
import { search, setSearchText, clearListInfo } from '@/core/audiobook/search'
import audiobookState, { type AudiobookSource, type AudiobookType, type SearchListItem } from '@/store/audiobook/state'
import { createStyle } from '@/utils/tools'

export default () => {
  const headerBarRef = useRef<HeaderBarType>(null)
  const listRef = useRef<AudioListType>(null)
  const [searchType, setSearchType] = useState<AudiobookType>('album')
  const [searchSource, setSearchSource] = useState<AudiobookSource>('xm')
  // 单独保存最近一次的搜索文本，避免 search 抛错时 state 未更新导致重试失败
  const lastSearchTextRef = useRef<string>('')
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handleSourceChange: HeaderBarProps['onSourceChange'] = useCallback((source) => {
    setSearchSource(source)
    if (lastSearchTextRef.current) {
      performSearch(lastSearchTextRef.current, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTypeChange = useCallback((type: AudiobookType) => {
    setSearchType(type)
    if (lastSearchTextRef.current) {
      performSearch(lastSearchTextRef.current, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const performSearch = useCallback((text: string, page: number) => {
    if (!text) return
    // 在调用 search() 前立即保存文本，确保异常路径下重试仍能取到
    setSearchText(text)
    lastSearchTextRef.current = text
    // 新搜索时清空列表（对齐 SonglistList/AlbumList 的模式）
    if (page === 1) {
      listRef.current?.setList([])
    }
    listRef.current?.setStatus('loading')
    search(text, page, searchSource, searchType).then(() => {
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
        // 首次搜索失败时清理列表，避免残留旧数据
        if (page === 1) {
          listRef.current?.setList([])
        }
        listRef.current?.setStatus('error')
      }
    })
  }, [searchSource, searchType])

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
    // 优先使用 lastSearchTextRef，避免 search() 抛错时 state.searchText 仍为旧值
    const text = lastSearchTextRef.current || audiobookState.searchText
    performSearch(text, page)
  }, [performSearch])

  const handleOpenDetail = useCallback((item: SearchListItem, index: number) => {
    // TODO: 打开专辑详情或主播详情页面
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