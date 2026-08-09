import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import MusicList, { type MusicListType } from './MusicList'
import AlbumList, { type AlbumListType } from './AlbumList'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import PlayerBar from '@/components/player/PlayerBar'
import { SingerInfoContext, type SingerDetailInfo, type SingerTabType } from './state'
import { search as searchAlbum } from '@/core/singerAlbum'

export default ({ componentId, info }: { componentId: string, info: SingerDetailInfo }) => {
  const musicListRef = useRef<MusicListType>(null)
  const albumListRef = useRef<AlbumListType>(null)
  const isUnmountedRef = useRef(false)
  const [activeTab, setActiveTab] = useState<SingerTabType>('song')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.singerDetail, componentId)
    isUnmountedRef.current = false

    if (info && info.source && info.id) {
      musicListRef.current?.loadList(info.source, info.id)
      // 后台预加载专辑缓存，切换到专辑选项卡时可直接使用缓存，无需等待API请求
      searchAlbum(info.id, info.name, info.source, 1).catch(() => {})
    }

    return () => {
      isUnmountedRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 确保 context 值始终是有效对象，防止渲染崩溃
  const safeInfo: SingerDetailInfo = info && info.source
    ? info
    : { id: '', name: '', source: 'kw' }

  const handleTabChange = (tab: SingerTabType) => {
    const prevTab = activeTab
    setActiveTab(tab)
    // 仅在首次切换到该选项卡时加载数据
    if (tab === 'album' && prevTab !== 'album' && info?.source && info?.id) {
      albumListRef.current?.loadList(info.source, info.id)
    } else if (tab === 'song' && prevTab !== 'song' && info?.source && info?.id) {
      musicListRef.current?.loadList(info.source, info.id)
    }
  }

  return (
    <PageContent>
      <StatusBar />
      <SingerInfoContext.Provider value={safeInfo}>
        <View style={{ flex: 1 }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: activeTab === 'song' ? 1 : 0 }} pointerEvents={activeTab === 'song' ? 'auto' : 'none'}>
            <MusicList ref={musicListRef} componentId={componentId} activeTab={activeTab} onTabChange={handleTabChange} />
          </View>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: activeTab === 'album' ? 1 : 0 }} pointerEvents={activeTab === 'album' ? 'auto' : 'none'}>
            <AlbumList ref={albumListRef} componentId={componentId} activeTab={activeTab} onTabChange={handleTabChange} />
          </View>
        </View>
      </SingerInfoContext.Provider>
      <PlayerBar />
    </PageContent>
  )
}