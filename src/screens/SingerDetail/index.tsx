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
        {/* 用 display:none 切换 tab（而非 absolute+opacity 叠放）：与排行榜一致的普通流式布局，
            RecyclerListView 的 cell 依赖 absolute 定位 + 回收复用，叠放容器下触摸浏览会命中隐藏列表的
            "幽灵 cell" 导致焦点框坐标漂移；display:none 不占布局、不产生无障碍节点，且保留列表实例与滚动状态 */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, display: activeTab === 'song' ? 'flex' : 'none' }}>
            <MusicList ref={musicListRef} componentId={componentId} activeTab={activeTab} onTabChange={handleTabChange} />
          </View>
          <View style={{ flex: 1, display: activeTab === 'album' ? 'flex' : 'none' }}>
            <AlbumList ref={albumListRef} componentId={componentId} activeTab={activeTab} onTabChange={handleTabChange} />
          </View>
        </View>
      </SingerInfoContext.Provider>
      <PlayerBar />
    </PageContent>
  )
}
