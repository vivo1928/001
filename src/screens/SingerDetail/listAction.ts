import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import { handlePlay as defaultHandlePlay } from '@/components/OnlineList/listAction'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

export const handlePlay = async(id: string, source: LX.OnlineSource, list: LX.Music.MusicInfoOnline[], index = 0) => {
  console.log(`[SingerDetail] handlePlay called: id=${id} source=${source} list.length=${list?.length} index=${index}`)
  if (!list?.length) {
    console.warn('[SingerDetail] handlePlay: list is empty, fallback to default play')
    return
  }
  if (index < 0 || index >= list.length) {
    console.warn(`[SingerDetail] handlePlay: index ${index} out of bounds (list.length=${list.length})`)
    return
  }

  const listId = getListId(id, source)
  try {
    // 注意：list 在 MusicList.tsx 的 fetchList 中已经通过 toNewMusicInfo 转换过格式
    // 不要再次调用 toNewMusicInfo，否则会将已转换的 meta._qualitys 覆盖为 undefined
    await setTempList(listId, [...list])
    console.log(`[SingerDetail] setTempList done, calling playList for song: ${list[index]?.name} id=${list[index]?.id}`)
    void playList(LIST_IDS.TEMP, index)
  } catch (err: any) {
    console.error(`[SingerDetail] handlePlay error: ${err?.message || err}, fallback to default play`)
    // 降级：使用默认播放方式（添加到默认列表后播放）
    if (list[index]) {
      defaultHandlePlay(list[index])
    }
  }
}