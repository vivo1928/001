import { useEffect, useRef } from 'react'

import MusicList, { type MusicListType } from './MusicList'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import PlayerBar from '@/components/player/PlayerBar'
import { AlbumInfoContext, type AlbumDetailInfo } from './state'

export default ({ componentId, info }: { componentId: string, info: AlbumDetailInfo }) => {
  const musicListRef = useRef<MusicListType>(null)
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.albumDetail, componentId)

    isUnmountedRef.current = false

    musicListRef.current?.loadList(info.source, info.id)

    return () => {
      isUnmountedRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PageContent>
      <StatusBar />
      <AlbumInfoContext.Provider value={info}>
        <MusicList ref={musicListRef} componentId={componentId} />
      </AlbumInfoContext.Provider>
      <PlayerBar />
    </PageContent>
  )
}