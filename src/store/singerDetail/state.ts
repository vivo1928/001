export interface SingerDetailListInfo {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  maxPage: number
  key: string | null
  source: LX.OnlineSource | null
  id: string
}

const state: { listDetailInfo: SingerDetailListInfo } = {
  listDetailInfo: {
    list: [],
    total: 0,
    page: 1,
    maxPage: 1,
    key: null,
    source: null,
    id: '',
  },
}

export default state