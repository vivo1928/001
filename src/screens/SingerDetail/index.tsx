import { useEffect, useRef, useState } from 'react'

import MusicList, { type MusicListType } from './MusicList'
import AlbumList, { type AlbumListType } from './AlbumList'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import PlayerBar from '@/components/player/PlayerBar'
import { SingerInfoContext, type SingerDetailInfo, type SingerTabType } from './state'

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
    setActiveTab(tab)
    if (tab === 'album' && info?.source && info?.id) {
      albumListRef.current?.loadList(info.source, info.id)
    } else if (tab === 'song' && info?.source && info?.id) {
      musicListRef.current?.loadList(info.source, info.id)
    }
  }

  return (
    <PageContent>
      <StatusBar />
      <SingerInfoContext.Provider value={safeInfo}>
        {activeTab === 'song'
          ? <MusicList ref={musicListRef} componentId={componentId} activeTab={activeTab} onTabChange={handleTabChange} />
          : <AlbumList ref={albumListRef} componentId={componentId} activeTab={activeTab} onTabChange={handleTabChange} />
        }
      </SingerInfoContext.Provider>
      <PlayerBar />
    </PageContent>
  )
}