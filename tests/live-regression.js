// 修复后实测回归：用真实源码模块 + 真实网络请求验证五源搜索。
// httpFetch 按 src/utils/request.js 的序列化语义用 node fetch 替身实现。
// 运行：node tests/live-regression.js
const crypto = require('crypto')
const { loadModule } = require('./helpers/loadModule')

const md5Hex = (t) => crypto.createHash('md5').update(String(t), 'utf8').digest('hex')
const sha1Hex = (t) => crypto.createHash('sha1').update(String(t), 'utf8').digest('hex')

// 原生 aesEncryptSync(textB64, keyB64, ivB64, mode) 的等价实现（PKCS7，eapi 实测可用）
const aesEncryptSync = (textB64, keyB64, ivB64) => {
  const key = Buffer.from(keyB64, 'base64')
  const iv = ivB64 ? Buffer.from(ivB64, 'base64') : null
  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null)
  const enc = Buffer.concat([cipher.update(Buffer.from(textB64, 'base64')), cipher.final()])
  return enc.toString('base64')
}

const nativeCryptoMock = {
  hashSHA1: async(t) => sha1Hex(t),
  aesEncryptSync,
  aesDecryptSync: () => { throw new Error('not needed') },
  AES_MODE: { ECB_128_NoPadding: 0, CBC_128_PKCS7Padding: 1 },
  RSA_PADDING: { NoPadding: 0 },
}

// request.js 语义：form → urlencoded；对象 body → JSON.stringify
const httpFetch = (url, options = {}) => {
  const opts = { ...options }
  const headers = { Accept: 'application/json', ...(opts.headers || {}) }
  const method = (opts.method || 'get').toUpperCase()
  let body
  if (method === 'POST') {
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      body = Object.entries(opts.form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    } else {
      headers['Content-Type'] = 'application/json'
      body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    }
  }
  const promise = fetch(url, { method, headers, body }).then(async(res) => {
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = text }
    return { body: json, statusCode: res.status, headers: {}, ok: res.ok }
  })
  return { promise, cancel: () => {} }
}

const requestMock = { httpFetch }
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
  toMD5: md5Hex,
}

const modules = {
  kw: loadModule('src/utils/musicSdk/kw/musicSearch.js', {
    '../../request': requestMock, '../../index': indexMock, './util': { formatSinger: singerUtilsMock.formatSingerName },
  }).default,
  kg: loadModule('src/utils/musicSdk/kg/musicSearch.js', {
    '../../request': requestMock, '../../index': indexMock, '../utils': singerUtilsMock,
  }).default,
  tx: loadModule('src/utils/musicSdk/tx/musicSearch.js', {
    '../../index': indexMock, '../utils': singerUtilsMock, './utils': loadModule('src/utils/musicSdk/tx/utils/index.js', {
      '@/utils/request': requestMock, './crypto': loadModule('src/utils/musicSdk/tx/utils/crypto.js', { '@/utils/nativeModules/crypto': nativeCryptoMock }),
    }),
  }).default,
  wy: loadModule('src/utils/musicSdk/wy/musicSearch.js', {
    '../../index': indexMock,
    './utils/index': loadModule('src/utils/musicSdk/wy/utils/index.js', {
      '../../../request': requestMock,
      './crypto': loadModule('src/utils/musicSdk/wy/utils/crypto.js', {
        '@/utils/nativeModules/crypto': nativeCryptoMock, 'react-native-quick-base64': { btoa: (s) => Buffer.from(s, 'utf8').toString('base64') }, '../../utils': { toMD5: md5Hex },
      }),
    }),
  }).default,
  mg: loadModule('src/utils/musicSdk/mg/musicSearch.js', {
    '../../request': requestMock, '../../index': indexMock, '../utils': singerUtilsMock,
  }).default,
}

const run = async() => {
  let failed = 0
  for (const [id, mod] of Object.entries(modules)) {
    try {
      const result = await mod.search('起风了', 1, 5)
      const ok = Array.isArray(result?.list) && result.source === id
      const first = result?.list?.[0]
      console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${result?.list?.length ?? 0} 条, total=${result?.total}` + (first ? `, 首条: ${first.name} - ${first.singer}` : ''))
      if (!ok) failed++
    } catch (err) {
      failed++
      console.log(`FAIL ${id}: ${err.message}`)
    }
  }
  console.log(failed ? `\n${failed} 个源失败` : '\n全部通过')
  process.exit(failed ? 1 : 0)
}

run()
