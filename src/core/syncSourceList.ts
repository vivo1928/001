// import { dateFormat } from '@/utils/common'
import { setListUpdateTime } from '@/utils/data'
import { overwriteListMusics, setFetchingListStatus } from './list'
import { getListDetailAll } from '@/core/songlist'
import { getListDetailAll as getBoardListAll } from '@/core/leaderboard'
import { getAlbumSongs } from './singerAlbum'

// 收藏的专辑 sourceListId 形如 `${source}__${albumId}`，与普通歌单（纯 id）区分
const ALBUM_LIST_ID_RXP = /^(kg|kw|tx|wy|mg|bd)__/

const fetchList = async(id: string, source: LX.OnlineSource, sourceListId: string, name: string) => {
  setFetchingListStatus(id, true)

  let promise
  if (/^board__/.test(sourceListId)) {
    const id = sourceListId.replace(/^board__/, '')
    promise = id ? getBoardListAll(id, true) : Promise.reject(new Error('id not defined: ' + sourceListId))
  } else if (ALBUM_LIST_ID_RXP.test(sourceListId)) {
    const albumId = sourceListId.replace(ALBUM_LIST_ID_RXP, '')
    promise = getAlbumSongs(albumId, source, name).then(list => {
      // 拉取失败时 getAlbumSongs 会返回空数组，此处抛错以避免覆盖并清空原有歌曲
      if (!list.length) throw new Error('album songs empty: ' + sourceListId)
      return list
    })
  } else {
    promise = getListDetailAll(source, sourceListId, true)
  }
  return promise.finally(() => {
    setFetchingListStatus(id, false)
  })
}

export default async(targetListInfo: LX.List.UserListInfo) => {
  // console.log(targetListInfo)
  if (!targetListInfo.source || !targetListInfo.sourceListId) return
  const list = await fetchList(targetListInfo.id, targetListInfo.source, targetListInfo.sourceListId, targetListInfo.name)
  // console.log(list)
  void overwriteListMusics(targetListInfo.id, list)
  const now = Date.now()
  void setListUpdateTime(targetListInfo.id, now)
  // TODO
  // setUpdateTime(targetListInfo.id, dateFormat(now))
}
