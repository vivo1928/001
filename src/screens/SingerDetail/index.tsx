import { useEffect, useRef } from 'react'

import MusicList, { type MusicListType } from './MusicList'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import PlayerBar from '@/components/player/PlayerBar'
import { SingerInfoContext, type SingerDetailInfo } from './state'

export default ({ componentId, info }: { componentId: string, info: SingerDetailInfo }) => {
  const musicListRef = useRef<MusicListType>(null)
  const isUnmountedRef = useRef(false)

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

  return (
    <PageContent>
      <StatusBar />
      <SingerInfoContext.Provider value={safeInfo}>
        <MusicList ref={musicListRef} componentId={componentId} />
      </SingerInfoContext.Provider>
      <PlayerBar />
    </PageContent>
  )
}