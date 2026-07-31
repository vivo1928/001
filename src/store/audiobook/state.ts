/**
 * 听书状态管理
 * 
 * 类似搜索模块，但只有两个子类型: album(专辑) 和 anchor(主播)
 * 数据源: xm(喜马拉雅), qt(蜻蜓FM)
 */

export type AudiobookType = 'album' | 'anchor'
export type AudiobookSource = 'xm' | 'qt'

export interface AlbumInfo {
  id: string
  name: string
  author: string
  img: string
  desc: string
  playCount: number
  trackCount: number
  source: AudiobookSource
  categoryId?: string
  categoryName?: string
}

export interface AnchorInfo {
  id: string
  name: string
  author: string
  img: string
  desc: string
  followerCount: number
  albumCount: number
  source: AudiobookSource
  isAnchor: boolean
}

export type SearchListItem = AlbumInfo | AnchorInfo

export interface ListInfo {
  list: SearchListItem[]
  total: number
  page: number
  limit: number
  maxPage: number
  key: string | null
  source: AudiobookSource
}

export interface InitState {
  searchText: string
  searchType: AudiobookType
  source: AudiobookSource
  sources: AudiobookSource[]
  listInfo: ListInfo
}

const state: InitState = {
  searchText: '',
  searchType: 'album',
  source: 'xm',
  sources: ['xm', 'qt'],
  listInfo: {
    list: [],
    total: 0,
    page: 1,
    limit: 30,
    maxPage: 1,
    key: null,
    source: 'xm',
  },
}

export default state