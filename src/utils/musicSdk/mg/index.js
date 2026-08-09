import { apis } from '../api-source'
import leaderboard from './leaderboard'
import songList from './songList'
import musicSearch from './musicSearch'
import albumSearch from './albumSearch'
import singerSearch from './singerSearch'
import album from './album'
import singer from './singer'
import pic from './pic'
import lyric from './lyric'
import hotSearch from './hotSearch'
import comment from './comment'
// import tipSearch from './tipSearch'

const mg = {
  // tipSearch,
  songList,
  musicSearch,
  albumSearch,
  singerSearch,
  album,
  singer,
  leaderboard,
  hotSearch,
  comment,
  getMusicUrl(songInfo, type) {
    return apis('mg').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    return lyric.getLyric(songInfo)
  },
  getPic(songInfo) {
    return pic.getPic(songInfo)
  },
  getMusicDetailPageUrl(songInfo) {
    return `http://music.migu.cn/v3/music/song/${songInfo.copyrightId}`
  },
}

export default mg
