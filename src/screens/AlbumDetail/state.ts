import { createContext, useContext } from 'react'

export interface AlbumDetailInfo {
  id: string
  name: string
  singer?: string
  img?: string
  source: LX.OnlineSource
  publish_date?: string
  song_count?: number
}

export const AlbumInfoContext = createContext<AlbumDetailInfo>({
  id: '',
  name: '',
  source: 'kw',
})

export const useAlbumInfo = () => {
  return useContext(AlbumInfoContext)
}