import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

export const handlePlay = async(id: string, source: LX.OnlineSource, list: LX.Music.MusicInfoOnline[], index = 0) => {
  const listId = getListId(id, source)
  // 注意：list 在 MusicList.tsx 的 fetchList 中已经通过 toNewMusicInfo 转换过格式
  // 不要再次调用 toNewMusicInfo，否则会将已转换的 meta._qualitys 覆盖为 undefined
  await setTempList(listId, [...list])
  void playList(LIST_IDS.TEMP, index)
}