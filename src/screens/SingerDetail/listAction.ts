import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { getListDetail, getListDetailAll } from '@/core/singerDetail'
import { LIST_IDS } from '@/config/constant'
import listState from '@/store/list/state'

const getListId = (id: string) => `singer__${id}`

/**
 * 播放歌手歌曲 - 完全匹配排行榜模式
 * 1. 立即用当前已加载列表创建临时歌单并播放
 * 2. 后台加载全部歌曲，加载完成后替换临时歌单
 */
export const handlePlay = async(id: string, list?: LX.Music.MusicInfoOnline[], index = 0) => {
  let isPlayingList = false
  const listId = getListId(id)
  if (!list?.length) list = (await getListDetail(id, 1)).list
  if (list?.length) {
    await setTempList(listId, [...list])
    void playList(LIST_IDS.TEMP, index)
    isPlayingList = true
  }
  const fullList = await getListDetailAll(id)
  if (!fullList.list.length) return
  if (isPlayingList) {
    if (listState.tempListMeta.id == listId) {
      await setTempList(listId, [...fullList.list])
    }
  } else {
    await setTempList(listId, [...fullList.list])
    void playList(LIST_IDS.TEMP, index)
  }
}

/**
 * 播放全部歌曲 - 将当前已加载的列表存入临时列表播放
 */
export const handlePlayAll = async(id: string, source: LX.OnlineSource, list: LX.Music.MusicInfoOnline[], index = 0) => {
  if (!list?.length) return
  const listId = getListId(id)
  try {
    await setTempList(listId, [...list])
    void playList(LIST_IDS.TEMP, index)
  } catch (err: any) {
    console.error(`[SingerDetail] handlePlayAll error: ${err?.message || err}`)
  }
}