import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { getRandom } from '@/utils/common'
import { getListMusicSync } from '@/utils/listManage'
import { filterList } from './utils'

/**
 * 随机模式预抽队列：把"接下来会随机到的歌"一次性无放回抽成确定序列。
 * 无放回抽样与逐首实时抽取同分布（整轮就是列表的一个均匀随机排列），随机语义不变；
 * 预缓存窗口沿队列预取、playNext 消费队头，预测与实播完全同序，不再错位白下。
 */
let queue: LX.Player.PlayMusicInfo[] = []

export const resetRandomQueue = () => {
  queue = []
}

// 失效条目剔除：被手动点播/历史回放播过的（已在 playedList）、
// 已移出列表的、换了播放列表的，都不能再作为未来随机结果
const pruneQueue = (listId: string, list: LX.Player.PlayMusic[], playedList: readonly LX.Player.PlayMusicInfo[]) => {
  queue = queue.filter(entry =>
    entry.listId == listId &&
    list.some(m => m.id == entry.musicInfo.id) &&
    !playedList.some(p => p.musicInfo.id == entry.musicInfo.id))
}

const ensureRandomQueue = async(count: number) => {
  if (settingState.setting['player.togglePlayMethod'] != 'random') {
    if (queue.length) queue = []
    return
  }
  const playInfo = playerState.playInfo
  const listId = playInfo.playerListId
  if (!listId) return
  const list = getListMusicSync(listId)
  pruneQueue(listId, list, playerState.playedList)
  while (queue.length < count) {
    const playedList = playerState.playedList
    const { filteredList } = await filterList({
      listId,
      list,
      playedList,
      playerMusicInfo: list[playInfo.playerPlayIndex],
      isNext: true,
    })
    const pending = filteredList.filter(m => !queue.some(q => q.musicInfo.id == m.id))
    // 池内可抽歌曲已全部在队列里（或池已空）：现有队列即本轮剩余全部，停止补抽
    if (!pending.length) break
    queue.push({ musicInfo: pending[getRandom(0, pending.length)], listId, isTempPlay: false })
  }
}

/** 取未来 count 首的确定随机序列（只读不消费，多次调用结果稳定） */
export const getRandomQueue = async(count: number): Promise<LX.Player.PlayMusicInfo[]> => {
  if (count <= 0) return []
  await ensureRandomQueue(count)
  return queue.slice(0, count)
}

/** 消费队头（playNext 用），与 getRandomQueue 同源同序 */
export const shiftRandomQueue = async(): Promise<LX.Player.PlayMusicInfo | null> => {
  await ensureRandomQueue(1)
  return queue.shift() ?? null
}
