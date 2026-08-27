import leaderboard from './leaderboard'
import { apis } from '../api-source'
import songList from './songList'
import musicSearch from './musicSearch'
import albumSearch from './albumSearch'
import album from './album'
import singerSearch from './singerSearch'
import singer from './singer'
import getLyric from './lyric'
import getMusicInfo from './musicInfo'
import hotSearch from './hotSearch'
import comment from './comment'
// import tipSearch from './tipSearch'

const wy = {
  // tipSearch,
  leaderboard,
  songList,
  musicSearch,
  albumSearch,
  album,
  singerSearch,
  singer,
  hotSearch,
  comment,
  getMusicUrl(songInfo, type) {
    return apis('wy').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    return getLyric(songInfo.songmid)
  },
  getPic(songInfo) {
    const requestObj = getMusicInfo(songInfo.songmid)
    return requestObj.promise.then(info => info.al.picUrl)
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://music.163.com/#/song?id=${songInfo.songmid}`
  },
}

export default wy
