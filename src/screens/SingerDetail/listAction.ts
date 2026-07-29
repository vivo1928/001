import { playList } from '@/core/player/playList'
import { toNewMusicInfo } from '@/utils'

export const handlePlay = (list: LX.Music.MusicInfoOnline[], index: number) => {
  const targetList = list.map(s => toNewMusicInfo(s) as LX.Music.MusicInfoOnline)
  playList(targetList, index)
}