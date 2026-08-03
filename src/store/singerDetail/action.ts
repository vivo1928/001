import state, { type ListDetailInfo } from './state'

export default {
  setListDetailInfo(source: LX.OnlineSource, id: string) {
    state.listDetailInfo.source = source
    state.listDetailInfo.id = id
  },
  setListDetail(result: ListDetailInfo, id: string, page: number) {
    state.listDetailInfo.list = page == 1 ? [...result.list] : [...state.listDetailInfo.list, ...result.list]
    state.listDetailInfo.id = id
    state.listDetailInfo.source = result.source
    if (page == 1 || (result.total && result.list.length)) state.listDetailInfo.total = result.total
    else state.listDetailInfo.total = result.limit * page
    state.listDetailInfo.limit = result.limit
    state.listDetailInfo.page = page
    state.listDetailInfo.maxPage = Math.ceil(state.listDetailInfo.total / result.limit)

    return state.listDetailInfo
  },
  clearListDetail() {
    state.listDetailInfo.list = []
    state.listDetailInfo.id = ''
    state.listDetailInfo.source = null
    state.listDetailInfo.total = 0
    state.listDetailInfo.limit = 30
    state.listDetailInfo.page = 1
    state.listDetailInfo.maxPage = 1
    state.listDetailInfo.key = null
  },
  setSingerName(name: string) {
    state.singerName = name
  },
  setSingerInfo(info: { name?: string; img?: string; desc?: string } | null) {
    state.singerInfo = info
  },
}