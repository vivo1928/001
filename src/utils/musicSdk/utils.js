import { stringMd5 } from 'react-native-quick-md5'
import { decodeName } from '../index'

/**
 * 获取音乐音质
 * @param {*} info
 * @param {*} type
 */

export const QUALITYS = ['master', 'atmos', 'flac24bit', 'flac', 'wav', 'ape', '320k', '192k', '128k']

/**
 * 扩展歌曲音质列表：将源 qualityList 中缺失的高品质补入 _types
 * 确保自定义源声明的高级音质（如 master/atmos/hires）在 UI 中可选
 * 兼容 raw SDK 格式（_types 在顶层）和 toNewMusicInfo 转换后的格式（在 meta._qualitys）
 */
export const extendQualityTypes = (musicInfo) => {
  if (!musicInfo || !musicInfo.source) return
  const sourceQualitys = global.lx.qualityList[musicInfo.source]
  if (!sourceQualitys?.length) return
  const types = musicInfo.types || musicInfo.meta?.qualitys
  const _types = musicInfo._types || musicInfo.meta?._qualitys
  if (!types || !_types) return
  for (const q of sourceQualitys) {
    if (_types[q] != null) continue
    types.push({ type: q, size: '' })
    _types[q] = { size: '' }
  }
}

export const getMusicType = (info, type) => {
  const list = global.lx.qualityList[info.source]
  if (!list) return '128k'
  if (!list.includes(type)) type = list[list.length - 1]
  const rangeType = QUALITYS.slice(QUALITYS.indexOf(type))
  for (const type of rangeType) {
    if (info._types[type]) return type
  }
  return '128k'
}

export const toMD5 = str => stringMd5(str)


/**
 * 格式化歌手
 * @param singers 歌手数组
 * @param nameKey 歌手名键值
 * @param join 歌手分割字符
 */
export const formatSingerName = (singers, nameKey = 'name', join = '、') => {
  if (Array.isArray(singers)) {
    const singer = []
    singers.forEach(item => {
      let name = item[nameKey]
      if (!name) return
      singer.push(name)
    })
    return decodeName(singer.join(join))
  }
  return decodeName(String(singers ?? ''))
}
