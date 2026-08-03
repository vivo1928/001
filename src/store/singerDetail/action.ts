import state from './state'

export default {
  setListDetailInfo(source: LX.OnlineSource, id: string) {
    state.listDetailInfo.source = source
    state.listDetailInfo.id = id
  },
  setListDetail(result: { list: LX.Music.MusicInfoOnline[], total: number, allPage: number }, id: string, page: number) {
    state.listDetailInfo.list = page == 1 ? [...result.list] : [...state.listDetailInfo.list, ...result.list]
    state.listDetailInfo.id = id
    state.listDetailInfo.total = result.total
    state.listDetailInfo.page = page
    state.listDetailInfo.maxPage = result.allPage
    return state.listDetailInfo
  },
  clearListDetail() {
    state.listDetailInfo.list = []
    state.listDetailInfo.id = ''
    state.listDetailInfo.source = null
    state.listDetailInfo.total = 0
    state.listDetailInfo.page = 1
    state.listDetailInfo.maxPage = 1
    state.listDetailInfo.key = null
  },
}