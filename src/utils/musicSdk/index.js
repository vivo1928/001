import kw from './kw'
import kg from './kg'
import tx from './tx'
import wy from './wy'
import mg from './mg'
// import bd from './bd'
import { supportQuality } from './api-source'
import { versionChars } from './versionChars'
import BackgroundTimer from 'react-native-background-timer'


const sources = {
  sources: [
    {
      name: '酷我音乐',
      id: 'kw',
    },
    {
      name: '酷狗音乐',
      id: 'kg',
    },
    {
      name: 'QQ音乐',
      id: 'tx',
    },
    {
      name: '网易音乐',
      id: 'wy',
    },
    {
      name: '咪咕音乐',
      id: 'mg',
    },
    // {
    //   name: '百度音乐',
    //   id: 'bd',
    // },
  ],
  kw,
  kg,
  tx,
  wy,
  mg,
  // bd,
}
export default {
  ...sources,
  supportQuality,
}

export const init = () => {
  const tasks = []
  for (let source of sources.sources) {
    let sm = sources[source.id]
    sm && sm.init && tasks.push(sm.init())
  }
  return Promise.all(tasks)
}

// ── 换源 / 歌曲匹配用工具（模块级，供 searchMusic/findMusic 复用）──
const SINGERS_RXP = /、|&|;|；|\/|,|，|\|/
const sortSingle = singer => SINGERS_RXP.test(singer)
  ? singer.split(SINGERS_RXP).sort((a, b) => a.localeCompare(b)).join('、')
  : (singer || '')
const trimStr = str => typeof str == 'string' ? str.trim() : str
const filterStr = str => typeof str == 'string' ? str.replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '') : String(str || '')
const getIntv = (interval) => {
  if (!interval) return 0
  // if (musicInfo._interval) return musicInfo._interval
  let intvArr = interval.split(':')
  let intv = 0
  let unit = 1
  while (intvArr.length) {
    intv += parseInt(intvArr.pop()) * unit
    unit *= 60
  }
  return intv
}

// 并发收集多个 Promise 结果：全部完成或超过预算时长即返回（未完成项为 null）。
// onSettled 在每次有结果返回时被调用，返回 true 可提前结束等待（用于“已找到强匹配”）。
// 目的：个别源网络慢 / 接口不稳定（含重试与 15s 超时）时，不再拖慢整个换源流程。
const collectSearchResults = (promises, budget = 2500, onSettled) => new Promise((resolve) => {
  if (!promises.length) return resolve([])
  const results = new Array(promises.length).fill(null)
  let remaining = promises.length
  let done = false
  const finish = () => {
    if (done) return
    done = true
    resolve(results)
  }
  promises.forEach((p, i) => {
    p.then(r => { results[i] = r ?? null })
      .catch(() => { results[i] = null })
      .finally(() => {
        if (done) return
        remaining--
        if (onSettled && onSettled(i, results[i]) === true) return finish()
        if (remaining === 0) finish()
      })
  })
  if (budget > 0) BackgroundTimer.setTimeout(finish, budget)
})

export const searchMusic = async({ name, singer, source: s, limit = 25 }) => {
  const musicName = trimStr(name)
  const tasks = []
  for (const source of sources.sources) {
    if (!sources[source.id].musicSearch || source.id == s) continue
    tasks.push(sources[source.id].musicSearch.search(`${musicName} ${singer || ''}`.trim(), 1, limit).catch(_ => null))
  }
  if (!tasks.length) return []
  // 有预算地等待：避免个别源（慢 / 超时 / 重试）拖慢手动换源弹窗与自动换源
  const results = await collectSearchResults(tasks, 2500)
  return results.filter(s => s)
}

export const findMusic = async(musicInfo) => {
  const { name, singer, albumName, interval, source: s } = musicInfo

  const tasks = []
  for (const source of sources.sources) {
    if (!sources[source.id].musicSearch || source.id == s) continue
    tasks.push(sources[source.id].musicSearch.search(`${trimStr(name)} ${singer || ''}`.trim(), 1, 25).catch(_ => null))
  }

  const fMusicName = filterStr(name).toLowerCase()
  const fSinger = filterStr(sortSingle(singer)).toLowerCase()
  const fAlbumName = filterStr(albumName).toLowerCase()
  const fInterval = getIntv(interval)
  // 任一源返回结果即做“强匹配”检查（歌名完全一致 + 歌手一致 + 时长一致），
  // 命中即可提前结束搜索等待，显著缩短自动换源耗时
  const onSettled = (_i, list) => {
    if (!list || !Array.isArray(list.list)) return false
    for (const item of list.list) {
      const itemIntv = getIntv(item.interval)
      if (Math.abs((fInterval || itemIntv) - (itemIntv || fInterval)) > 5) continue
      if (filterStr(String(item.name ?? '').toLowerCase()) != fMusicName) continue
      if (fSinger) {
        const itemF = filterStr(sortSingle(item.singer).toLowerCase())
        if (!(fSinger.includes(itemF) || itemF.includes(fSinger))) continue
      }
      return true
    }
    return false
  }
  const lists = (await collectSearchResults(tasks, 2500, onSettled)).filter(s => s)

  const isEqualsInterval = (intv) => Math.abs((fInterval || intv) - (intv || fInterval)) <= 5
  const isEqualsVersionMusicNameChar = (name) => {
    for (const char of versionChars) {
      if (name.includes(char) != fMusicName.includes(char)) return false
    }
    return true
  }
  const isIncludesName = (name) => (fMusicName.includes(name) || name.includes(fMusicName)) && isEqualsVersionMusicNameChar(name)
  const isIncludesSinger = (singer) => fSinger ? (fSinger.includes(singer) || singer.includes(fSinger)) : true
  const isEqualsAlbum = (album) => fAlbumName ? fAlbumName == album : true

  const sortMusic = (arr, callback) => {
    const tempResult = []
    for (let i = arr.length - 1; i > -1; i--) {
      const item = arr[i]
      if (callback(item)) {
        delete item.fSinger
        delete item.fMusicName
        delete item.fAlbumName
        delete item.fInterval
        tempResult.push(item)
        arr.splice(i, 1)
      }
    }
    tempResult.reverse()
    return tempResult
  }

  const result = lists.map(source => {
    for (const item of source.list) {
      item.name = trimStr(item.name)
      item.singer = trimStr(item.singer)
      item.fSinger = filterStr(sortSingle(item.singer).toLowerCase())
      item.fMusicName = filterStr(String(item.name ?? '').toLowerCase())
      item.fAlbumName = filterStr(String(item.albumName ?? '').toLowerCase())
      item.fInterval = getIntv(item.interval)
      // console.log(fMusicName, item.fMusicName, item.source)
      if (!isEqualsInterval(item.fInterval)) {
        item.name = null
        continue
      }
      if (item.fMusicName == fMusicName && isIncludesSinger(item.fSinger)) return item
    }
    for (const item of source.list) {
      if (item.name == null) continue
      if (item.fSinger == fSinger && isIncludesName(item.fMusicName)) return item
    }
    for (const item of source.list) {
      if (item.name == null) continue
      if (isEqualsAlbum(item.fAlbumName) && isIncludesSinger(item.fSinger) && isIncludesName(item.fMusicName)) return item
    }
    return null
  }).filter(s => s)
  const newResult = []
  if (result.length) {
    newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.fMusicName == fMusicName && item.interval == interval))
    newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName && item.fSinger == fSinger && item.fAlbumName == fAlbumName))
    newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.fMusicName == fMusicName))
    newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName && item.interval == interval))
    newResult.push(...sortMusic(result, item => item.fSinger == fSinger && item.interval == interval))
    newResult.push(...sortMusic(result, item => item.interval == interval))
    newResult.push(...sortMusic(result, item => item.fMusicName == fMusicName))
    newResult.push(...sortMusic(result, item => item.fSinger == fSinger))
    newResult.push(...sortMusic(result, item => item.fAlbumName == fAlbumName))
    for (const item of result) {
      delete item.fSinger
      delete item.fMusicName
      delete item.fAlbumName
      delete item.fInterval
    }
    newResult.push(...result)
  }
  // console.log(newResult)
  return newResult
}
