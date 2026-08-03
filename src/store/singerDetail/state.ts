export declare interface ListDetailInfo {
  list: LX.Music.MusicInfoOnline[]
  total: number
  maxPage: number
  page: number
  source: LX.OnlineSource | null
  limit: number
  key: string | null
  id: string
}

export interface InitState {
  listDetailInfo: ListDetailInfo
  singerName: string
  singerInfo: { name?: string; img?: string; desc?: string } | null
}

const state: InitState = {
  listDetailInfo: {
    list: [],
    total: 0,
    page: 1,
    maxPage: 1,
    limit: 30,
    key: null,
    source: null,
    id: '',
  },
  singerName: '',
  singerInfo: null,
}

export default state