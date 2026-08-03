import singerDetailState from '@/store/singerDetail/state'
import singerDetailActions from '@/store/singerDetail/action'
import { toNewMusicInfo } from '@/utils'
import musicSdk from '@/utils/musicSdk'

const LIMIT = 30
const FETCH_TIMEOUT = 15000

const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export const setListDetailInfo = (source: LX.OnlineSource, id: string) => {
  clearListDetail()
  singerDetailActions.setListDetailInfo(source, id)
}

export const setListDetail = (result: { list: LX.Music.MusicInfoOnline[], total: number, allPage: number }, id: string, page: number) => {
  return singerDetailActions.setListDetail(result, id, page)
}

export const clearListDetail = () => {
  singerDetailActions.clearListDetail()
}

/**
 * 获取歌手单曲列表
 * @param source 源
 * @param singerId 歌手id
 * @param singerName 歌手名称（降级搜索用）
 * @param page 页数
 * @returns
 */
export const getListDetail = async(source: LX.OnlineSource, singerId: string, singerName: string, page: number): Promise<{
  list: LX.Music.MusicInfoOnline[]
  total: number
  allPage: number
  singerInfo?: { name?: string; img?: string; desc?: string }
}> => {
  const sdk = musicSdk[source]
  if (!sdk) throw new Error('source not found: ' + source)

  // 策略：优先使用 singer API（按歌手ID获取歌曲，可获取歌手简介），失败则降级到 musicSearch
  const hasSingerApi = !!(sdk.singer?.getSingerSongList)

  if (hasSingerApi) {
    try {
      const result = await withTimeout(
        sdk.singer.getSingerSongList(singerId, page, LIMIT),
        FETCH_TIMEOUT,
        `Singer API timeout for source: ${source}`
      )
      if (result && result.list && result.list.length > 0) {
        return {
          list: result.list.map(s => toNewMusicInfo(s) as LX.Music.MusicInfoOnline),
          total: result.total || 0,
          allPage: result.allPage || Math.ceil((result.total || 0) / LIMIT),
          singerInfo: result.info || undefined,
        }
      }
    } catch (err: any) {
      console.log(`[singerDetail] singer API failed, falling back to musicSearch: ${err?.message || err}`)
    }
  }

  // 降级：使用 musicSearch 按歌手名称搜索歌曲
  if (!singerName) throw new Error('Singer name is empty')
  if (!sdk?.musicSearch) throw new Error('musicSearch not supported for source: ' + source)

  const result = await withTimeout(
    sdk.musicSearch.search(singerName, page, LIMIT),
    FETCH_TIMEOUT,
    `musicSearch timeout for source: ${source}`
  )
  return {
    list: (result.list || []).map(s => toNewMusicInfo(s) as LX.Music.MusicInfoOnline),
    total: result.total || 0,
    allPage: result.allPage || 1,
  }
}