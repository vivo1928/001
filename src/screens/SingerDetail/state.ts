import { createContext, useContext } from 'react'

export interface SingerDetailInfo {
  id: string
  name: string
  img?: string
  source: LX.OnlineSource
  song_count?: number
  album_count?: number
}

export const SingerInfoContext = createContext<SingerDetailInfo>({
  id: '',
  name: '',
  source: 'kw',
})

export const useSingerInfo = () => {
  return useContext(SingerInfoContext)
}

export type SingerTabType = 'song' | 'album'