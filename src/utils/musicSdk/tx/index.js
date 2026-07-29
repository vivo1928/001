import leaderboard from './leaderboard'
import { apis } from '../api-source'
import songList from './songList'
import musicSearch from './musicSearch'
import albumSearch from './albumSearch'
import singerSearch from './singerSearch'
import pic from './pic'
import lyric from './lyric'
import hotSearch from './hotSearch'
import comment from './comment'
// import tipSearch from './tipSearch'

const tx = {
  // tipSearch,
  leaderboard,
  songList,
  musicSearch,
  albumSearch,
  singerSearch,
  hotSearch,
  comment,

  getMusicUrl(songInfo, type) {
    return apis('tx').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    // let singer = songInfo.singer.indexOf('、') > -1 ? songInfo.singer.split('、')[0] : songInfo.singer
    return lyric.getLyric(songInfo.songmid)
  },
  async getPic(songInfo) {
    return `https://y.gtimg.cn/music/photo_new/T002R500x500M000${songInfo.albumId}.jpg`
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://y.qq.com/n/yqq/song/${songInfo.songmid}.html`
  },
}

export default tx
