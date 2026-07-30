import { setTempList, addListMusics } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import settingState from '@/store/setting/state'
import { getListMusicSync } from '@/utils/listManage'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

/**
 * 播放单首歌曲 - 与默认 OnlineList 完全相同的逻辑
 */
export const handlePlay = (musicInfo: LX.Music.MusicInfoOnline) => {
  console.log(`[AlbumDetail] handlePlay single: id=${musicInfo.id} name=${musicInfo.name}`)
  void addListMusics(LIST_IDS.DEFAULT, [musicInfo], settingState.setting['list.addMusicLocationType']).then(() => {
    const index = getListMusicSync(LIST_IDS.DEFAULT).findIndex(m => m.id == musicInfo.id)
    if (index < 0) {
      console.warn(`[AlbumDetail] handlePlay: song not found in DEFAULT list after add`)
      return
    }
    void playList(LIST_IDS.DEFAULT, index)
  })
}

/**
 * 播放全部歌曲
 */
export const handlePlayAll = async(id: string, source: LX.OnlineSource, list: LX.Music.MusicInfoOnline[], index = 0) => {
  console.log(`[AlbumDetail] handlePlayAll: id=${id} source=${source} list.length=${list?.length} index=${index}`)
  if (!list?.length) {
    console.warn('[AlbumDetail] handlePlayAll: list is empty')
    return
  }
  if (index < 0 || index >= list.length) {
    console.warn(`[AlbumDetail] handlePlayAll: index ${index} out of bounds (list.length=${list.length})`)
    return
  }

  const listId = getListId(id, source)
  try {
    // 注意：list 在 MusicList.tsx 的 fetchList 中已经通过 toNewMusicInfo 转换过格式
    // 不要再次调用 toNewMusicInfo
    await setTempList(listId, [...list])
    console.log(`[AlbumDetail] handlePlayAll: setTempList done, calling playList for song: ${list[index]?.name}`)
    void playList(LIST_IDS.TEMP, index)
  } catch (err: any) {
    console.error(`[AlbumDetail] handlePlayAll error: ${err?.message || err}`)
  }
}