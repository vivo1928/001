import music from '@/utils/musicSdk'

export type { ListInfoItem } from '@/store/songlist/state'

export type SearchListInfo = {
  page: number
  limit: number
  total: number
  list: any[]
  key: string | null
}

interface ListInfos extends Partial<Record<LX.OnlineSource, SearchListInfo>> {
  'all': SearchListInfo
}

export type Source = LX.OnlineSource | 'all'

export interface InitState {
  searchText: string
  source: Source
  sources: Source[]
  listInfos: ListInfos
  maxPages: Partial<Record<Source, number>>
}

const state: InitState = {
  searchText: '',
  source: 'kw',
  sources: [],
  listInfos: {
    all: {
      page: 1,
      limit: 20,
      total: 0,
      list: [],
      key: null,
    },
  },
  maxPages: {},
}

for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.singerSearch) continue
  state.sources.push(source.id as LX.OnlineSource)
  state.listInfos[source.id as LX.OnlineSource] = {
    page: 1,
    limit: 20,
    total: 0,
    list: [],
    key: null,
  }
  state.maxPages[source.id as LX.OnlineSource] = 0
}
state.sources.push('all')

export default state