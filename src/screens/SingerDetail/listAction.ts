import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import { toNewMusicInfo } from '@/utils'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

export const handlePlay = async(id: string, source: LX.OnlineSource, list: LX.Music.MusicInfoOnline[], index = 0) => {
  const listId = getListId(id, source)
  const targetList = list.map(s => toNewMusicInfo(s) as LX.Music.MusicInfoOnline)
  await setTempList(listId, [...targetList])
  void playList(LIST_IDS.TEMP, index)
}