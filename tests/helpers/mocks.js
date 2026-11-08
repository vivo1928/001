const crypto = require('crypto')

const sha1Hex = (text) => crypto.createHash('sha1').update(String(text), 'utf8').digest('hex')
const md5Hex = (text) => crypto.createHash('md5').update(String(text), 'utf8').digest('hex')

// 各模块共用的 RN 依赖替身，被测逻辑仍走真实源码
const commonMocks = {
  '@/utils/nativeModules/crypto': {
    hashSHA1: async(text) => sha1Hex(text),
    aesEncryptSync: () => { throw new Error('aesEncryptSync 不应在本测试中调用') },
    aesDecryptSync: () => { throw new Error('aesDecryptSync 不应在本测试中调用') },
    AES_MODE: { ECB_128_NoPadding: 0, CBC_128_PKCS7Padding: 1 },
    RSA_PADDING: { NoPadding: 0 },
  },
  'react-native-quick-md5': { stringMd5: (text) => md5Hex(text) },
}

const makeHttpFetchMock = (impl) => {
  const calls = []
  const httpFetch = (url, options) => {
    calls.push({ url, options })
    return { promise: Promise.resolve(impl(url, options, calls.length)), cancel: () => {} }
  }
  httpFetch.calls = calls
  return httpFetch
}

// ../../index（musicSdk 入口）的纯函数替身
const indexMock = {
  formatPlayTime: (time) => {
    if (!time || time < 0) return null
    const m = Math.floor(time / 60)
    const s = Math.floor(time % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },
  sizeFormate: (size) => {
    if (size == null || isNaN(size)) return null
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let n = Number(size)
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(2)}${units[i]}`
  },
  decodeName: (str) => str,
}

const singerUtilsMock = {
  formatSingerName: (singers) => Array.isArray(singers) ? singers.map(s => s.name ?? s).join('、') : String(singers ?? ''),
  formatSinger: (singers) => Array.isArray(singers) ? singers.map(s => s.name ?? s).join('、') : String(singers ?? ''),
  toMD5: (text) => md5Hex(text),
}

module.exports = { sha1Hex, md5Hex, commonMocks, makeHttpFetchMock, indexMock, singerUtilsMock }
