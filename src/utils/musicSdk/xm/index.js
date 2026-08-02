import { formatPlayTime } from '../../index'
import { apis } from '../api-source'
import { aesDecryptSync, AES_MODE } from '../../nativeModules/crypto'
import { stringMd5 } from 'react-native-quick-md5'
import { btoa } from 'react-native-quick-base64'

// ============================================================
// 喜马拉雅音频URL解密（AES-128-ECB + PKCS7）
// 逆向自 ximalaya.com 前端 webpack 模块
// 参考: https://www.52pojie.cn/thread-2061283-1-1.html
// ============================================================

// AES-128-ECB 密钥（hex格式: aaad3e4fd540b0f79dca95606e72bf93）
// 转换为 base64 供原生 CryptoModule 使用
const XM_AES_KEY_B64 = btoa('aaad3e4fd540b0f79dca95606e72bf93'.match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join(''))

/**
 * 喜马拉雅音频 URL 解密
 * 使用 AES-128-ECB + PKCS7 padding
 *
 * @param {string} encryptedUrl - 加密的音频 URL（URL-safe base64）
 * @returns {string} 解密后的音频 URL
 */
const decryptXmUrl = (encryptedUrl) => {
  try {
    // 1. 将 URL-safe base64 转换为标准 base64
    const b64 = encryptedUrl.replace(/-/g, '+').replace(/_/g, '/')

    // 2. AES-ECB 解密（NoPadding 模式，手动处理 PKCS7）
    const decryptedB64 = aesDecryptSync(b64, XM_AES_KEY_B64, '', AES_MODE.ECB_128_NoPadding)

    // 3. 从 base64 解码为 Buffer
    const buf = Buffer.from(decryptedB64, 'base64')

    // 4. 手动剥离 PKCS7 padding
    const padLen = buf[buf.length - 1]
    if (padLen > 0 && padLen <= 16) {
      return buf.subarray(0, buf.length - padLen).toString('utf8')
    }
    return buf.toString('utf8')
  } catch (e) {
    console.warn('[xm decryptXmUrl] decrypt failed:', e.message)
    return encryptedUrl
  }
}

/**
 * 生成 xm-sign 签名（旧版算法，device=web 可用）
 * 格式: MD5("himalaya-" + serverTime) + "(" + random1 + ")" + serverTime + "(" + random2 + ")" + nowTime
 *
 * @param {string} serverTime - 从 /revision/time 获取的服务器时间
 * @returns {string} xm-sign 签名
 */
const generateXmSign = (serverTime) => {
  const nowTime = Date.now().toString()
  const md5Hash = stringMd5('himalaya-' + serverTime)
  const random1 = Math.floor(Math.random() * 100)
  const random2 = Math.floor(Math.random() * 100)
  return `${md5Hash}(${random1})${serverTime}(${random2})${nowTime}`
}

// 服务器时间缓存（30秒有效期）
let cachedServerTime = null
let cachedServerTimeTs = 0

/**
 * 获取喜马拉雅服务器时间（带缓存）
 * @returns {Promise<string|null>}
 */
const getXmServerTime = async () => {
  if (cachedServerTime && Date.now() - cachedServerTimeTs < 30000) {
    return cachedServerTime
  }
  try {
    const resp = await global.fetch('https://www.ximalaya.com/revision/time', {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    const text = await resp.text()
    if (text && text.trim().length > 5) {
      cachedServerTime = text.trim()
      cachedServerTimeTs = Date.now()
      return cachedServerTime
    }
  } catch (e) {
    console.warn('[xm getXmServerTime] failed:', e.message)
  }
  return null
}

// ============================================================
// 喜马拉雅音频URL解密（getSoundCryptLink 算法 — 用于 www2/mweb2 设备）
// 逆向自 ximalaya.com 前端 webpack 模块 D.getSoundCryptLink
// 参考: https://github.com/844704781/ximalaya_downloader
// ============================================================

// 替换表 o — 用于 www2 / mweb2 设备（当前主流）
const XM_SUBST_O = new Uint8Array([183, 174, 108, 16, 131, 159, 250, 5, 239, 110, 193, 202, 153, 137, 251, 176, 119, 150, 47, 204, 97, 237, 1, 71, 177, 42, 88, 218, 166, 82, 87, 94, 14, 195, 69, 127, 215, 240, 225, 197, 238, 142, 123, 44, 219, 50, 190, 29, 181, 186, 169, 98, 139, 185, 152, 13, 141, 76, 6, 157, 200, 132, 182, 49, 20, 116, 136, 43, 155, 194, 101, 231, 162, 242, 151, 213, 53, 60, 26, 134, 211, 56, 28, 223, 107, 161, 199, 15, 229, 61, 96, 41, 66, 158, 254, 21, 165, 253, 103, 89, 3, 168, 40, 246, 81, 95, 58, 31, 172, 78, 99, 45, 148, 187, 222, 124, 55, 203, 235, 64, 68, 149, 180, 35, 113, 207, 118, 111, 91, 38, 247, 214, 7, 212, 209, 189, 241, 18, 115, 173, 25, 236, 121, 249, 75, 57, 216, 10, 175, 112, 234, 164, 70, 206, 198, 255, 140, 230, 12, 32, 83, 46, 245, 0, 62, 227, 72, 191, 156, 138, 248, 114, 220, 90, 84, 170, 128, 19, 24, 122, 146, 80, 39, 37, 8, 34, 22, 11, 93, 130, 63, 154, 244, 160, 144, 79, 23, 133, 92, 54, 102, 210, 65, 67, 27, 196, 201, 106, 143, 52, 74, 100, 217, 179, 48, 233, 126, 117, 184, 226, 85, 171, 167, 86, 2, 147, 17, 135, 228, 252, 105, 30, 192, 129, 178, 120, 36, 145, 51, 163, 77, 205, 73, 4, 188, 125, 232, 33, 243, 109, 224, 104, 208, 221, 59, 9])

// 第二层 XOR key a — 用于 www2 / mweb2 设备
const XM_KEY_A = new Uint8Array([204, 53, 135, 197, 39, 73, 58, 160, 79, 24, 12, 83, 180, 250, 101, 60, 206, 30, 10, 227, 36, 95, 161, 16, 135, 150, 235, 116, 242, 116, 165, 171])

// 替换表 r — 用于非 www2 设备（旧版桌面/移动端）
const XM_SUBST_R = new Uint8Array([188, 174, 178, 234, 171, 147, 70, 82, 76, 72, 192, 132, 60, 17, 30, 127, 184, 233, 48, 105, 38, 232, 240, 21, 47, 252, 41, 229, 209, 213, 71, 40, 63, 152, 156, 88, 51, 141, 139, 145, 133, 2, 160, 191, 11, 100, 10, 78, 253, 151, 42, 166, 92, 22, 185, 140, 164, 91, 194, 175, 239, 217, 177, 75, 19, 225, 94, 107, 125, 138, 242, 31, 182, 150, 15, 24, 226, 29, 80, 116, 168, 118, 28, 1, 186, 220, 158, 79, 59, 244, 119, 9, 189, 161, 74, 130, 221, 56, 216, 241, 212, 26, 218, 170, 85, 165, 153, 69, 238, 93, 255, 142, 3, 159, 215, 67, 33, 249, 53, 176, 77, 254, 222, 25, 115, 101, 148, 16, 13, 237, 197, 5, 58, 157, 135, 248, 223, 61, 198, 211, 110, 44, 54, 111, 52, 227, 4, 46, 205, 7, 219, 136, 14, 87, 114, 64, 104, 50, 39, 203, 81, 196, 43, 163, 173, 109, 108, 187, 102, 195, 37, 235, 65, 190, 113, 149, 143, 8, 27, 155, 207, 134, 123, 224, 129, 245, 62, 66, 172, 122, 126, 12, 162, 214, 90, 247, 251, 124, 201, 236, 117, 183, 73, 95, 89, 246, 181, 179, 83, 228, 193, 99, 6, 45, 112, 32, 154, 128, 230, 131, 206, 243, 57, 84, 146, 0, 35, 96, 250, 137, 36, 208, 103, 34, 68, 204, 231, 144, 120, 98, 202, 49, 210, 23, 200, 18, 86, 55, 121, 20, 199, 97, 167, 180, 169, 106])

// 第二层 XOR key n — 用于非 www2 设备
const XM_KEY_N = new Uint8Array([20, 234, 159, 167, 230, 233, 58, 255, 158, 36, 210, 254, 133, 166, 59, 63, 209, 177, 184, 155, 85, 235, 94, 1, 242, 87, 228, 232, 191, 3, 69, 178])

// Base64 解码表
const XM_B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
const XM_B64_LOOKUP = {}
for (let i = 0; i < XM_B64_CHARS.length; i++) XM_B64_LOOKUP[XM_B64_CHARS[i]] = i

/**
 * 自定义 Base64 解码（用于 getSoundCryptLink）
 */
const xmBase64Decode = (str) => {
  str = str.replace(/\s+/g, '')
  str += '=='.slice(2 - (3 & str.length))
  let result = ''
  for (let i = 0; i < str.length;) {
    const a = XM_B64_LOOKUP[str.charAt(i++)] << 18 | XM_B64_LOOKUP[str.charAt(i++)] << 12 | (XM_B64_LOOKUP[str.charAt(i++)] || 0) << 6 | (XM_B64_LOOKUP[str.charAt(i++)] || 0)
    result += String.fromCharCode((a >> 16) & 255, (a >> 8) & 255, a & 255)
  }
  return result
}

/**
 * XOR 操作（用于 getSoundCryptLink）
 */
const xmXorBlock = (data, offset, key) => {
  const len = Math.min(data.length - offset, key.length)
  for (let i = 0; i < len; i++) data[offset + i] ^= key[i]
}

/**
 * 字节数组解码为 UTF-8 字符串（用于 getSoundCryptLink）
 */
const xmBytesToUtf8 = (bytes) => {
  let result = ''
  let i = 0
  while (i < bytes.length) {
    const byte = bytes[i++]
    if (byte < 0x80) {
      result += String.fromCharCode(byte)
    } else if (byte < 0xE0 && i < bytes.length) {
      result += String.fromCharCode((31 & byte) << 6 | 63 & bytes[i++])
    } else if (byte < 0xF0 && i + 1 < bytes.length) {
      result += String.fromCharCode((15 & byte) << 12 | (63 & bytes[i++]) << 6 | 63 & bytes[i++])
    }
  }
  return result
}

/**
 * 喜马拉雅音频 URL 解密算法（替换表 + XOR + Base64）
 * 逆向自 ximalaya.com 前端 D.getSoundCryptLink
 * 用于 device=www2/mweb2 的 mobile-playpage API 返回的加密URL
 *
 * @param {Object} param - { link: 加密URL, deviceType: 设备类型 }
 * @returns {string} 解密后的音频 URL
 */
const getSoundCryptLink = ({ link, deviceType = 'www2' }) => {
  const isWww2 = ['www2', 'mweb2'].includes(deviceType)
  const subst = isWww2 ? XM_SUBST_O : XM_SUBST_R
  const key2 = isWww2 ? XM_KEY_A : XM_KEY_N

  try {
    const b64 = link.replace(/_/g, '/').replace(/-/g, '+')
    const decoded = xmBase64Decode(b64)
    if (decoded.length < 16) return link

    const data = new Uint8Array(decoded.length - 16)
    for (let i = 0; i < decoded.length - 16; i++) data[i] = decoded.charCodeAt(i)

    const iv = new Uint8Array(16)
    for (let i = 0; i < 16; i++) iv[i] = decoded.charCodeAt(decoded.length - 16 + i)

    for (let i = 0; i < data.length; i++) data[i] = subst[data[i]]
    for (let i = 0; i < data.length; i += 16) xmXorBlock(data, i, iv)
    for (let i = 0; i < data.length; i += 32) xmXorBlock(data, i, key2)

    return xmBytesToUtf8(data)
  } catch (e) {
    console.warn('[xm getSoundCryptLink] failed:', e.message)
    return link
  }
}

// ============================================================
// 喜马拉雅 Cookie 配置（VIP内容必需）
// ============================================================
// 用户在此填入喜马拉雅登录Cookie以解锁VIP/付费内容
// 获取方式: 浏览器登录喜马拉雅 → F12 → Console → document.cookie
// 关键字段: 1&_token=xxx
const XM_COOKIE = '' // 例: '1&_token=38899111&C817857...; wfp=ACM5MG...; ...'

/**
 * 构建喜马拉雅请求头（含可选Cookie）
 */
const buildXmHeaders = (extra = {}) => {
  const headers = {
    ...pcHeaders,
    ...extra,
  }
  if (XM_COOKIE) headers['Cookie'] = XM_COOKIE
  return headers
}

/**
 * 通过 track 搜索 API 获取音频播放地址（主要方案，无需签名）
 * 使用 revision/search?core=track&kw={trackId} 搜索
 * 搜索结果直接包含 play_path_64 / play_path_32 明文音频URL
 *
 * 优点：无需 xm-sign 签名，无需解密，URL 直接可播放
 * 缺点：部分付费内容可能不返回 URL
 *
 * @param {string} trackId - 音频 track ID
 * @param {string} quality - 音质 ('128k' | '64k' | '32k')
 * @returns {Promise<string|null>} 音频播放 URL，失败返回 null
 */
const fetchAudioUrlFromTrackSearch = async (trackId, quality = '128k') => {
  const url = `${XM_SEARCH_FALLBACK_API}?core=track&kw=${encodeURIComponent(String(trackId))}&page=1&rows=5&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`

  console.log(`[xm fetchAudioUrlFromTrackSearch] trackId:${trackId}, quality:${quality}`)

  let body
  try {
    body = await fetchJson(url, buildXmHeaders())
  } catch (e) {
    console.warn('[xm fetchAudioUrlFromTrackSearch] fetch error:', e.message)
    return null
  }

  if (!body || body.ret !== 200) {
    console.warn('[xm fetchAudioUrlFromTrackSearch] API error:', body?.msg || 'ret=' + body?.ret)
    return null
  }

  const docs = body.data?.result?.response?.docs || []
  if (docs.length === 0) {
    console.warn('[xm fetchAudioUrlFromTrackSearch] no search results')
    return null
  }

  // 精确匹配 trackId
  const track = docs.find(d => String(d.id) === String(trackId)) || docs[0]
  if (!track) {
    console.warn('[xm fetchAudioUrlFromTrackSearch] track not found in results')
    return null
  }

  // 根据音质选择 URL
  // play_path_64 = 64kbps (对应 '64k' 音质)
  // play_path_32 = 32kbps (对应 '32k' 音质)
  // 128k 音质优先使用 play_path_64（喜马拉雅免费内容通常只有64k）
  let playUrl = null
  if (quality === '32k') {
    playUrl = track.play_path_32 || track.play_path_64
  } else {
    // 128k 和 64k 都使用 play_path_64
    playUrl = track.play_path_64 || track.play_path_32
  }

  if (playUrl && playUrl.startsWith('http')) {
    console.log('[xm fetchAudioUrlFromTrackSearch] success:', playUrl.substring(0, 80))
    return playUrl
  }

  console.warn('[xm fetchAudioUrlFromTrackSearch] no valid URL in search result')
  return null
}

/**
 * 通过 mobile-playpage/track/v3/baseInfo API 获取音频播放地址（降级方案）
 * 需要旧版 xm-sign 签名认证（部分场景可能返回 ret:1001）
 * 返回的 URL 使用 AES-128-ECB 加密，需要解密
 *
 * @param {string} trackId - 音频 track ID
 * @param {string} quality - 音质 ('128k' | '64k' | '32k')
 * @returns {Promise<string|null>} 解密后的音频播放 URL，失败返回 null
 */
const XM_MOBILE_PLAY_PAGE_API = 'https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo'

const fetchAudioUrlFromMobilePlaypage = async (trackId, quality = '128k') => {
  const ts = Date.now()
  const url = `${XM_MOBILE_PLAY_PAGE_API}/${ts}`
  // trackQualityLevel: 2=128k, 1=64k, 0=32k/24k
  const qualityLevel = quality === '128k' ? '2' : quality === '64k' ? '1' : '0'

  console.log(`[xm fetchAudioUrlFromMobilePlaypage] trackId:${trackId}, quality:${quality}, level:${qualityLevel}`)

  // 获取服务器时间生成 xm-sign
  const serverTime = await getXmServerTime()
  if (!serverTime) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypage] failed to get server time')
    return null
  }
  const xmSign = generateXmSign(serverTime)

  let body
  try {
    body = await fetchJson(url + `?device=web&trackId=${trackId}&trackQualityLevel=${qualityLevel}`, buildXmHeaders({
      'xm-sign': xmSign,
      'Referer': `https://www.ximalaya.com/sound/${trackId}`,
    }))
  } catch (e) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypage] fetch error:', e.message)
    return null
  }

  if (!body || body.ret !== 0) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypage] API error:', body?.msg || 'ret=' + body?.ret)
    return null
  }

  const trackInfo = body.trackInfo
  if (!trackInfo) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypage] no trackInfo')
    return null
  }

  const playUrlList = trackInfo.playUrlList || []
  if (playUrlList.length === 0) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypage] empty playUrlList')
    return null
  }

  // 音质类型优先级
  const qualityPrefs = {
    '128k': ['M4A_128', 'MP3_128', 'M4A_64', 'MP3_64'],
    '64k': ['M4A_64', 'MP3_64', 'M4A_128', 'MP3_128'],
    '32k': ['MP3_32', 'AAC_24', 'M4A_24', 'M4A_64', 'MP3_64'],
  }
  const prefs = qualityPrefs[quality] || qualityPrefs['128k']

  // 按音质优先级排序并解密
  const sortedUrls = playUrlList
    .filter(item => item.url)
    .sort((a, b) => {
      const aIdx = prefs.indexOf(a.type)
      const bIdx = prefs.indexOf(b.type)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })

  for (const item of sortedUrls) {
    console.log(`[xm fetchAudioUrlFromMobilePlaypage] decrypting type:${item.type}`)
    const decryptedUrl = decryptXmUrl(item.url)
    if (decryptedUrl && decryptedUrl.startsWith('http')) {
      console.log('[xm fetchAudioUrlFromMobilePlaypage] success:', decryptedUrl.substring(0, 80))
      return decryptedUrl
    }
  }

  console.warn('[xm fetchAudioUrlFromMobilePlaypage] no valid CDN URL after decryption')
  return null
}

/**
 * 通过 mobile-playpage/track/v3/baseInfo API 获取音频播放地址（www2/mweb2 方案）
 * 使用 device=www2 或 device=mweb2，配合 getSoundCryptLink 替换表解密
 * VIP内容需要配置 XM_COOKIE
 *
 * @param {string} trackId - 音频 track ID
 * @param {string} quality - 音质 ('128k' | '64k' | '32k')
 * @param {string} device - 设备类型 ('www2' | 'mweb2')
 * @returns {Promise<string|null>} 解密后的音频播放 URL，失败返回 null
 */
const fetchAudioUrlFromMobilePlaypageWww2 = async (trackId, quality = '128k', device = 'www2') => {
  const ts = Date.now()
  const url = `${XM_MOBILE_PLAY_PAGE_API}/${ts}?device=${device}&trackId=${trackId}&trackQualityLevel=2`

  console.log(`[xm fetchAudioUrlFromMobilePlaypageWww2] trackId:${trackId}, quality:${quality}, device:${device}`)

  let body
  try {
    body = await fetchJson(url, buildXmHeaders({
      'Referer': `https://www.ximalaya.com/sound/${trackId}`,
    }))
  } catch (e) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypageWww2] fetch error:', e.message)
    return null
  }

  if (!body) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypageWww2] no response body')
    return null
  }

  // 速率限制检测
  if (body.ret === 999 || body.ret === 1001) {
    console.warn(`[xm fetchAudioUrlFromMobilePlaypageWww2] rate limited (ret:${body.ret})`)
    return null
  }

  if (body.ret !== 0) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypageWww2] API error:', body.msg || 'ret=' + body.ret)
    return null
  }

  const playUrlList = body.trackInfo?.playUrlList
  if (!playUrlList || playUrlList.length === 0) {
    console.warn('[xm fetchAudioUrlFromMobilePlaypageWww2] empty playUrlList (VIP content needs Cookie)')
    return null
  }

  // 音质类型优先级
  const qualityPrefs = {
    '128k': ['M4A_128', 'MP3_128', 'M4A_64', 'MP3_64'],
    '64k': ['M4A_64', 'MP3_64', 'M4A_128', 'MP3_128'],
    '32k': ['MP3_32', 'AAC_24', 'M4A_24', 'M4A_64', 'MP3_64'],
  }
  const prefs = qualityPrefs[quality] || qualityPrefs['128k']

  // 按音质优先级排序并解密
  const sortedUrls = playUrlList
    .filter(item => item.url)
    .sort((a, b) => {
      const aIdx = prefs.indexOf(a.type)
      const bIdx = prefs.indexOf(b.type)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })

  for (const item of sortedUrls) {
    console.log(`[xm fetchAudioUrlFromMobilePlaypageWww2] decrypting type:${item.type} with getSoundCryptLink`)
    const decryptedUrl = getSoundCryptLink({ link: item.url, deviceType: device })
    if (decryptedUrl && decryptedUrl.startsWith('http')) {
      console.log('[xm fetchAudioUrlFromMobilePlaypageWww2] success:', decryptedUrl.substring(0, 80))
      return decryptedUrl
    }
  }

  console.warn('[xm fetchAudioUrlFromMobilePlaypageWww2] no valid URL after decryption')
  return null
}

/**
 * 通过 mpay API 获取付费内容音频URL（需要Cookie）
 * URL: https://mpay.ximalaya.com/mobile/track/pay/{trackId}/?device=pc
 *
 * @param {string} trackId - 音频 track ID
 * @returns {Promise<string|null>} 音频播放 URL，失败返回 null
 */
const fetchAudioUrlFromMpay = async (trackId) => {
  if (!XM_COOKIE) {
    console.warn('[xm fetchAudioUrlFromMpay] no cookie configured')
    return null
  }

  const url = `https://mpay.ximalaya.com/mobile/track/pay/${trackId}/?device=pc`
  console.log(`[xm fetchAudioUrlFromMpay] trackId:${trackId}`)

  let body
  try {
    body = await fetchJson(url, buildXmHeaders({
      'Referer': `https://www.ximalaya.com/sound/${trackId}`,
    }))
  } catch (e) {
    console.warn('[xm fetchAudioUrlFromMpay] fetch error:', e.message)
    return null
  }

  if (!body) return null

  if (body.ret === 401) {
    console.warn('[xm fetchAudioUrlFromMpay] cookie expired (ret:401)')
    return null
  }

  if (body.ret !== 0) {
    console.warn('[xm fetchAudioUrlFromMpay] API error:', body.msg || 'ret=' + body.ret)
    return null
  }

  const d = body.data || body
  // 尝试多种响应格式
  if (d.downloadUrl && d.downloadUrl.startsWith('http')) {
    console.log('[xm fetchAudioUrlFromMpay] success via downloadUrl')
    return d.downloadUrl
  }
  if (d.domain && d.fileId) {
    const audioUrl = `${d.domain}/download/${d.apiVersion || 'v1'}/${d.fileId}`
    if (audioUrl.startsWith('http')) {
      console.log('[xm fetchAudioUrlFromMpay] success via domain+fileId')
      return audioUrl
    }
  }
  // 遍历可能的URL字段
  for (const key of ['url', 'playUrl', 'src', 'play_url', 'downloadURL']) {
    if (d[key] && typeof d[key] === 'string' && d[key].startsWith('http')) {
      console.log(`[xm fetchAudioUrlFromMpay] success via ${key}`)
      return d[key]
    }
  }

  console.warn('[xm fetchAudioUrlFromMpay] no valid URL in response')
  return null
}

/**
 * 检查Cookie有效性（通过 getCurrentUser API）
 * @returns {Promise<{valid: boolean, isVip: boolean, nickname: string, reason: string}>}
 */
const checkXmCookieStatus = async () => {
  if (!XM_COOKIE) return { valid: false, isVip: false, nickname: '', reason: '未配置Cookie' }
  try {
    const body = await fetchJson('https://www.ximalaya.com/revision/main/getCurrentUser', buildXmHeaders({
      'Referer': 'https://www.ximalaya.com/',
    }))
    if (!body) return { valid: false, isVip: false, nickname: '', reason: '无响应' }
    if (body.ret === 401) return { valid: false, isVip: false, nickname: '', reason: 'Cookie已过期' }
    if (body.ret !== 200) return { valid: false, isVip: false, nickname: '', reason: `ret:${body.ret}` }
    const user = body.data
    return {
      valid: true,
      isVip: !!user?.isVip,
      nickname: user?.nickname || '',
      reason: user?.isVip ? 'VIP会员' : '普通用户(非VIP)',
    }
  } catch (e) {
    return { valid: false, isVip: false, nickname: '', reason: e.message }
  }
}

/**
 * 通过 revision/play/v1/audio API 获取音频播放地址（旧方案，降级使用）
 *
 * @param {string} trackId - 音频 track ID
 * @param {string|null} cacheKey - 缓存键
 * @param {number} attempt - 尝试次数
 * @returns {Promise<string|null>} 音频播放 URL，失败返回 null
 */
const fetchAudioUrlFromRevision = async (trackId, cacheKey, attempt = 0) => {
  // 端点列表
  const endpoints = [
    { url: `${XM_REVISION_API}/play/v1/audio?id=${trackId}&ptype=1`, name: 'play/v1/audio?ptype=1' },
    { url: `${XM_REVISION_API}/play/v1/audio?id=${trackId}&ptype=2`, name: 'play/v1/audio?ptype=2' },
  ]

  // 如果超过当前尝试索引，返回 null
  if (attempt >= endpoints.length) {
    console.warn('[xm fetchAudioUrlFromRevision] all endpoints exhausted')
    return null
  }

  const { url, name } = endpoints[attempt]
  console.log(`[xm fetchAudioUrlFromRevision] attempt ${attempt + 1}/${endpoints.length}: ${name}`)

  let body
  try {
    body = await fetchJson(url, buildXmHeaders())
  } catch (e) {
    console.warn(`[xm fetchAudioUrlFromRevision] ${name} fetch error:`, e.message)
    // 尝试下一个端点
    return fetchAudioUrlFromRevision(trackId, cacheKey, attempt + 1)
  }

  // 解析响应
  if (body.ret === 200 && body.data?.src) {
    const playUrl = body.data.src
    console.log(`[xm fetchAudioUrlFromRevision] ${name} success:`, playUrl.substring(0, 60))

    // 写入缓存
    if (cacheKey) {
      trackUrlCache.set(cacheKey, playUrl)
      if (trackUrlCache.size > 200) {
        const firstKey = trackUrlCache.keys().next().value
        trackUrlCache.delete(firstKey)
      }
    }

    return playUrl
  }

  // 检查是否需要降级
  if (body.ret !== 200) {
    console.warn(`[xm fetchAudioUrlFromRevision] ${name} ret=${body.ret}:`, body.msg || '')
  } else if (!body.data?.src) {
    console.warn(`[xm fetchAudioUrlFromRevision] ${name} no src in response:`, JSON.stringify(body.data).substring(0, 200))
  }

  // 尝试下一个端点
  return fetchAudioUrlFromRevision(trackId, cacheKey, attempt + 1)
}

/**
 * 喜马拉雅FM 听书源
 *
 * 提供两个搜索端点，互相作为 fallback:
 * 1. SEO 端点: /revision/search/seo — 无需 xm-sign 签名，为搜索引擎爬虫设计
 * 2. 普通端点: /revision/search — 同样无需签名，响应结构不同
 * 3. Mobile 端点: mobile.ximalaya.com — 用于专辑详情和主播详情
 *
 * 全部使用原生 global.fetch，避免 request.js 管道中 cache:'no-store' 等
 * 选项在 React Native 上的兼容性问题
 *
 * 重试策略（对齐歌曲搜索 SDK 的实现）:
 * - 最多重试 3 次
 * - 每次重试切换端点（SEO → 普通 → SEO）
 * - 网络错误 / API 错误 / 风控 都触发重试
 */

console.log('[xm sdk] 喜马拉雅听书 SDK 模块已加载')

const XM_SEARCH_API = 'https://www.ximalaya.com/revision/search/seo'
const XM_SEARCH_FALLBACK_API = 'https://www.ximalaya.com/revision/search'
const XM_MOBILE_API = 'https://mobile.ximalaya.com'
const XM_REVISION_API = 'https://www.ximalaya.com/revision'
const XM_API_PROXY = 'https://apis.netstart.cn/ximalaya'

const MAX_RETRY = 3
const FETCH_TIMEOUT = 15000

// 桌面浏览器请求头
const pcHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.ximalaya.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

const mobileHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://m.ximalaya.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

/**
 * 构建封面图片完整 URL
 */
const buildCoverUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return 'https://imagev2.xmcdn.com/' + path
}

/**
 * 构建主播页 URL
 */
const buildAnchorUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return 'https://www.ximalaya.com' + path
}

/**
 * 安全解析响应体，处理非 JSON 响应
 */
const safeParseBody = (resp) => {
  const { body } = resp
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body
  }
  if (typeof body === 'string' && body.trim().startsWith('{')) {
    try {
      return JSON.parse(body)
    } catch (e) {
      console.error('[xm] JSON parse failed:', e.message)
      return null
    }
  }
  console.error('[xm] unexpected body type:', typeof body, 'value:', String(body).substring(0, 200))
  return null
}

/**
 * 从响应中提取 docs 和 total
 * 兼容两种端点格式:
 * - SEO 格式: { ret: 200, data: { album/user: { docs: [...], total: N } } }
 * - 普通格式: { ret: 200, data: { result: { response: { docs: [...], numFound: N } } } }
 */
const extractDocs = (body, core) => {
  if (!body || body.ret !== 200) return null

  const data = body.data
  if (!data) return null

  // 风控拦截
  if (data.reason) {
    console.warn('[xm] risk control:', data.reason)
    return null
  }

  // SEO 格式: data.album 或 data.user
  if (data[core] && data[core].docs) {
    return {
      docs: data[core].docs,
      total: data[core].total || 0,
      totalPage: data[core].totalPage || 0,
    }
  }

  // 普通格式: data.result.response.docs
  if (data.result && data.result.response) {
    const resp = data.result.response
    return {
      docs: resp.docs || [],
      total: resp.numFound || resp.total || 0,
      totalPage: resp.totalPage || 0,
    }
  }

  return null
}

/**
 * 执行一次 HTTP 请求，返回解析后的 JSON body
 * 使用原生 global.fetch + AbortController 超时控制
 * 避免 request.js 封装中 cache:'no-store' 等选项在 React Native 上的兼容性问题
 *
 * @param {string} url 请求 URL
 * @param {object} [headers=pcHeaders] 自定义请求头
 * @returns {Promise<object>} 解析后的 JSON 响应体
 */
const fetchJson = async (url, headers = pcHeaders) => {
  console.log('[xm fetch]', url.substring(0, 120))
  const controller = new global.AbortController()
  const timeoutId = setTimeout(() => {
    console.warn('[xm fetch] timeout, aborting')
    controller.abort()
  }, FETCH_TIMEOUT)

  try {
    const resp = await global.fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    console.log('[xm fetch] status:', resp.status, 'ok:', resp.ok)

    const text = await resp.text()
    console.log('[xm fetch] body length:', text.length)

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`)
    }

    let body
    try {
      body = JSON.parse(text)
    } catch (e) {
      console.error('[xm fetch] JSON parse failed:', e.message, 'body:', text.substring(0, 200))
      throw new Error('响应解析异常: ' + text.substring(0, 100))
    }

    return body
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw err
  }
}

// ==================== 专辑搜索 ====================

/**
 * 构建 SEO 专辑搜索 URL
 */
const buildSeoAlbumUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=album&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true&page=${page}&rows=${limit}`
}

/**
 * 构建普通专辑搜索 URL
 */
const buildNormalAlbumUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_FALLBACK_API}?core=album&kw=${encodeURIComponent(keyword)}&page=${page}&rows=${limit}&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`
}

/**
 * 专辑搜索（带重试 + 端点 fallback）
 * 对齐歌曲搜索 SDK 的重试模式: 最多重试 MAX_RETRY 次，每次切换端点
 */
const searchAlbum = async (keyword, page = 1, limit = 30, retryCount = 0) => {
  // 交替使用 SEO 端点和普通端点
  const useSeo = retryCount % 2 === 0
  const url = useSeo
    ? buildSeoAlbumUrl(keyword, page, limit)
    : buildNormalAlbumUrl(keyword, page, limit)

  console.log(`[xm searchAlbum] attempt ${retryCount + 1}/${MAX_RETRY} endpoint: ${useSeo ? 'seo' : 'normal'} url:`, url)

  let body
  try {
    body = await fetchJson(url)
  } catch (err) {
    console.error(`[xm searchAlbum] attempt ${retryCount + 1} fetch error:`, err?.message || err)
    if (retryCount < MAX_RETRY - 1) return searchAlbum(keyword, page, limit, retryCount + 1)
    throw new Error('喜马拉雅搜索专辑失败: ' + (err?.message || err))
  }

  // 提取数据
  const extracted = extractDocs(body, 'album')
  if (!extracted) {
    console.warn(`[xm searchAlbum] attempt ${retryCount + 1} extract failed, body.ret:`, body?.ret, 'has reason:', !!body?.data?.reason)
    if (retryCount < MAX_RETRY - 1) return searchAlbum(keyword, page, limit, retryCount + 1)
    const errMsg = body?.data?.reason
      ? '喜马拉雅搜索被风控拦截: ' + body.data.reason
      : (body?.msg || '响应数据格式异常')
    throw new Error('喜马拉雅搜索专辑失败: ' + errMsg)
  }

  const { docs, total } = extracted
  console.log(`[xm searchAlbum] attempt ${retryCount + 1} OK, found ${docs.length} albums, total: ${total}`)

  const list = docs.map(item => ({
    id: String(item.albumId || item.id),
    name: item.title || item.name || '',
    author: item.nickname || '',
    img: buildCoverUrl(item.coverPath || item.cover_path || item.img),
    desc: item.intro || '',
    playCount: item.playCount || item.play || 0,
    trackCount: item.tracksCount || item.tracks || 0,
    source: 'xm',
    categoryId: String(item.categoryId || item.category_id || ''),
    categoryName: item.categoryTitle || item.category_title || '',
    isPaid: item.isPaid || item.is_paid || false,
    anchorId: String(item.uid || ''),
    anchorUrl: buildAnchorUrl(item.anchorUrl || item.anchor_url),
    albumUrl: item.url ? ('https://www.ximalaya.com' + item.url) : '',
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
  }
}

// ==================== 主播搜索 ====================

/**
 * 构建 SEO 主播搜索 URL
 */
const buildSeoAnchorUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_API}?kw=${encodeURIComponent(keyword)}&core=user&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true&page=${page}&rows=${limit}`
}

/**
 * 构建普通主播搜索 URL
 */
const buildNormalAnchorUrl = (keyword, page, limit) => {
  return `${XM_SEARCH_FALLBACK_API}?core=user&kw=${encodeURIComponent(keyword)}&page=${page}&rows=${limit}&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`
}

/**
 * 主播搜索（带重试 + 端点 fallback）
 */
const searchAnchor = async (keyword, page = 1, limit = 30, retryCount = 0) => {
  const useSeo = retryCount % 2 === 0
  const url = useSeo
    ? buildSeoAnchorUrl(keyword, page, limit)
    : buildNormalAnchorUrl(keyword, page, limit)

  console.log(`[xm searchAnchor] attempt ${retryCount + 1}/${MAX_RETRY} endpoint: ${useSeo ? 'seo' : 'normal'} url:`, url)

  let body
  try {
    body = await fetchJson(url)
  } catch (err) {
    console.error(`[xm searchAnchor] attempt ${retryCount + 1} fetch error:`, err?.message || err)
    if (retryCount < MAX_RETRY - 1) return searchAnchor(keyword, page, limit, retryCount + 1)
    throw new Error('喜马拉雅搜索主播失败: ' + (err?.message || err))
  }

  // 提取数据（普通端点 user 搜索的 core 是 'user'，但 data.result.response 同样适用）
  const extracted = extractDocs(body, 'user')
  if (!extracted) {
    console.warn(`[xm searchAnchor] attempt ${retryCount + 1} extract failed, body.ret:`, body?.ret, 'has reason:', !!body?.data?.reason)
    if (retryCount < MAX_RETRY - 1) return searchAnchor(keyword, page, limit, retryCount + 1)
    const errMsg = body?.data?.reason
      ? '喜马拉雅搜索被风控拦截: ' + body.data.reason
      : (body?.msg || '响应数据格式异常')
    throw new Error('喜马拉雅搜索主播失败: ' + errMsg)
  }

  const { docs, total } = extracted
  console.log(`[xm searchAnchor] attempt ${retryCount + 1} OK, found ${docs.length} anchors, total: ${total}`)

  const list = docs.map(item => ({
    id: String(item.uid || item.id),
    name: item.nickname || '',
    author: '',
    img: buildCoverUrl(item.logoPic || item.logo_pic || item.smallPic || item.small_pic || item.img),
    desc: item.description || item.personDescribe || item.person_describe || '',
    followerCount: item.followersCount || item.followers_counts || 0,
    albumCount: item.albumCount || item.album_counts || 0,
    trackCount: item.tracksCount || item.tracks_counts || 0,
    source: 'xm',
    isAnchor: true,
    anchorGrade: item.anchorGrade || item.anchor_grade || 0,
    verifyType: item.verifyType || item.verify_type || 0,
    isVerified: item.isVerified || item.is_verified || false,
    anchorUrl: item.url ? ('https://www.ximalaya.com' + item.url) : '',
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
  }
}

/**
 * 搜索: type = 'album' | 'anchor'
 */
const search = async (keyword, page = 1, type = 'album', limit = 30) => {
  console.log('[xm sdk search] 被调用:', { keyword, page, type, limit })
  if (type === 'album') {
    return searchAlbum(keyword, page, limit)
  } else {
    return searchAnchor(keyword, page, limit)
  }
}

// ==================== 专辑详情 ====================

/**
 * 获取专辑章节列表（剧集/单集）
 * 使用 revision/play/album API 作为主端点（带音频src）
 * 失败时降级到 mobile API 获取元数据
 *
 * 参考开源项目: https://github.com/leileiluoluo/ximalaya-downloader
 * revision/play/album 返回的数据包含 src 字段（直接可播放的音频URL）
 */
const getAlbumDetail = async (albumId, page = 1, limit = 30) => {
  console.log('[xm getAlbumDetail] albumId:', albumId, 'page:', page, 'limit:', limit)

  // 主端点：revision/play/album — 直接返回带 src 的音频列表
  const playAlbumUrl = `${XM_REVISION_API}/play/album?albumId=${albumId}&pageNum=${page}&sort=-1&pageSize=${limit}`

  let body
  try {
    body = await fetchJson(playAlbumUrl, pcHeaders)
  } catch (e) {
    console.warn('[xm getAlbumDetail] revision/play/album failed, trying mobile fallback:', e.message)
    return getAlbumDetailMobileFallback(albumId, page, limit)
  }

  // 解析 revision/play/album 响应
  if (body.ret === 200 && body.data?.tracksAudioPlay?.length) {
    const tracksAudioPlay = body.data.tracksAudioPlay
    const albumInfo = body.data.albumInfo || body.data.album || {}
    const total = body.data.trackTotalCount || tracksAudioPlay.length

    console.log('[xm getAlbumDetail] revision API OK, got', tracksAudioPlay.length, 'tracks, total:', total)

    const list = tracksAudioPlay.map((item) => ({
      singer: item.anchorName || albumInfo.anchorName || item.nickname || '',
      name: item.trackName || item.title || '',
      albumName: albumInfo.albumTitle || albumInfo.title || '',
      albumId: String(albumId),
      songmid: String(item.trackId || item.id),
      source: 'xm',
      interval: formatPlayTime(parseInt(item.duration || '0')),
      img: item.coverLarge || item.cover_url || albumInfo.coverLarge || albumInfo.cover || '',
      lrc: null,
      hash: String(item.trackId || item.id),
      otherSource: null,
      types: [
        { type: '128k', size: null },
        { type: '64k', size: null },
        { type: '32k', size: null },
      ],
      _types: {
        '128k': { size: null },
        '64k': { size: null },
        '32k': { size: null },
      },
      typeUrl: {
        '128k': item.src || '',
        '64k': '',
        '32k': '',
      },
      isAudiobook: true,
      trackId: item.trackId || item.id,
      playUrl: item.src || '',
      playSize: 0,
    }))

    return {
      list,
      total,
      page,
      limit,
      allPage: Math.ceil(total / limit) || 1,
      source: 'xm',
      info: {
        name: albumInfo.albumTitle || albumInfo.title || '',
        img: albumInfo.coverLarge || albumInfo.cover || '',
        desc: albumInfo.albumIntro || albumInfo.intro || '',
        author: albumInfo.anchorName || albumInfo.nickname || '',
      },
    }
  }

  // 降级到 mobile API
  console.warn('[xm getAlbumDetail] revision/play/album returned unexpected format, trying mobile fallback')
  return getAlbumDetailMobileFallback(albumId, page, limit)
}

/**
 * mobile API 降级获取专辑详情（仅获取元数据，不包含音频src）
 */
const getAlbumDetailMobileFallback = async (albumId, page = 1, limit = 200) => {
  const ts = Math.floor(Date.now() / 1000)
  const url = `${XM_MOBILE_API}/mobile/v1/album/track/ts-${ts}?albumId=${albumId}&device=android&isAsc=true&pageId=${page}&pageSize=${limit}`
  const altUrl = `${XM_MOBILE_API}/mobile/v1/album/track?albumId=${albumId}&device=android&isAsc=true&pageId=${page}&pageSize=${limit}`

  console.log('[xm getAlbumDetailMobileFallback] albumId:', albumId, 'page:', page)

  let body
  try {
    body = await fetchJson(url, mobileHeaders)
  } catch (e) {
    console.warn('[xm getAlbumDetailMobileFallback] primary URL failed:', e.message, 'trying alt URL')
    try {
      body = await fetchJson(altUrl, mobileHeaders)
    } catch (e2) {
      throw new Error('喜马拉雅获取专辑详情失败: ' + (e2?.message || e2))
    }
  }

  if (!body || body.ret !== 0) {
    throw new Error('喜马拉雅获取专辑详情失败: ' + (body?.msg || 'unknown'))
  }

  const data = body.data
  if (!data) {
    return {
      list: [], total: 0, page, limit, allPage: 0, source: 'xm',
      info: { name: '', img: '', desc: '', author: '' },
    }
  }

  const tracks = data.tracks?.list || data.list || []
  const albumInfo = data.album || data.albumInfo || {}
  const total = data.tracks?.totalCount || data.totalCount || 0

  console.log('[xm getAlbumDetailMobileFallback] got', tracks.length, 'tracks, total:', total)

  const list = tracks.map((item) => ({
    singer: item.nickname || item.anchorName || albumInfo.nickname || '',
    name: item.title || item.trackTitle || '',
    albumName: albumInfo.albumTitle || albumInfo.title || '',
    albumId: String(albumId),
    songmid: String(item.trackId || item.id),
    source: 'xm',
    interval: formatPlayTime(parseInt(item.duration || '0')),
    img: item.coverLarge || item.cover_url || albumInfo.coverLarge || albumInfo.cover || '',
    lrc: null,
    hash: String(item.trackId || item.id),
    otherSource: null,
    types: [
      { type: '128k', size: item.playSize64 || null },
      { type: '64k', size: item.playSize32 || null },
      { type: '32k', size: null },
    ],
    _types: {
      '128k': { size: item.playSize64 || null },
      '64k': { size: item.playSize32 || null },
      '32k': { size: null },
    },
    typeUrl: {
      '128k': item.playUrl64 || item.play_path_64 || item.playUrl32 || item.play_path_32 || '',
      '64k': item.playUrl32 || item.play_path_32 || '',
      '32k': item.playPath32 || '',
    },
    isAudiobook: true,
    trackId: item.trackId || item.id,
    playUrl: item.playUrl64 || item.playUrl32 || item.play_path_64 || item.play_path_32 || '',
    playSize: item.playSize64 || item.playSize32 || 0,
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit),
    source: 'xm',
    info: {
      name: albumInfo.albumTitle || albumInfo.title || '',
      img: albumInfo.coverLarge || albumInfo.cover || '',
      desc: albumInfo.albumIntro || albumInfo.intro || '',
      author: albumInfo.nickname || albumInfo.anchorName || '',
    },
  }
}

/**
 * 通过搜索API获取主播的专辑列表
 * 替代已失效的 apis.netstart.cn 代理
 * 使用搜索API: revision/search?core=album&kw=主播昵称
 * 通过 uid 过滤确保只返回该主播的专辑
 */
const getAnchorAlbumBySearch = async (anchorId, anchorName, page = 1, limit = 30) => {
  console.log('[xm getAnchorAlbumBySearch] anchorId:', anchorId, 'name:', anchorName, 'page:', page)

  // 用主播昵称搜索专辑
  const url = `${XM_SEARCH_FALLBACK_API}?core=album&kw=${encodeURIComponent(anchorName)}&page=${page}&rows=${limit}&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`

  let body
  try {
    body = await fetchJson(url)
  } catch (err) {
    throw new Error('喜马拉雅获取主播专辑列表失败: ' + (err?.message || err))
  }

  if (body.ret !== 200) {
    throw new Error('喜马拉雅获取主播专辑列表失败: ' + (body?.msg || 'ret=' + body.ret))
  }

  const data = body.data
  if (!data) {
    return { list: [], total: 0, page, limit, allPage: 0, source: 'xm', info: { name: anchorName, img: '', desc: '', author: '' } }
  }

  // 从搜索结果中提取数据
  const result = data.result?.response
  if (!result) {
    return { list: [], total: 0, page, limit, allPage: 0, source: 'xm', info: { name: anchorName, img: '', desc: '', author: '' } }
  }

  const docs = result.docs || []
  const total = result.numFound || 0

  // 按 uid 过滤，只保留该主播的专辑
  const anchorIdStr = String(anchorId)
  const filteredDocs = docs.filter(d => String(d.uid) === anchorIdStr)

  console.log('[xm getAnchorAlbumBySearch] found', docs.length, 'total,', filteredDocs.length, 'matching uid')

  const list = filteredDocs.map(item => ({
    id: String(item.id || ''),
    name: item.title || '',
    author: item.nickname || '',
    img: item.cover_path ? buildCoverUrl(item.cover_path) : '',
    desc: item.intro || '',
    playCount: item.play || 0,
    trackCount: item.tracks || 0,
    source: 'xm',
    categoryId: String(item.category_id || ''),
    categoryName: item.category_title || '',
  }))

  return {
    list,
    total,
    page,
    limit,
    allPage: Math.ceil(total / limit) || 1,
    source: 'xm',
    info: {
      name: anchorName || '',
      img: '',
      desc: '',
      author: '',
    },
  }
}

/**
 * 获取主播的专辑列表
 * 使用搜索API获取主播专辑，通过 uid 过滤
 * 如果 anchorName 未提供，尝试通过搜索主播获取昵称
 */
const getAnchorDetail = async (anchorId, page = 1, limit = 30, anchorName = '') => {
  console.log('[xm getAnchorDetail] anchorId:', anchorId, 'page:', page, 'anchorName:', anchorName)

  if (anchorName) {
    return getAnchorAlbumBySearch(anchorId, anchorName, page, limit)
  }

  // 如果没有 anchorName，先通过搜索API获取主播昵称
  // 直接用主播ID作为搜索关键词，从搜索结果中匹配
  console.log('[xm getAnchorDetail] no anchorName, trying to find by id')
  const searchUrl = `${XM_SEARCH_FALLBACK_API}?core=user&kw=${encodeURIComponent(String(anchorId))}&page=1&rows=1&spellchecker=true&device=iPhone&condition=relation&isGrayFilter=true`

  try {
    const body = await fetchJson(searchUrl)
    if (body.ret === 200) {
      const docs = body.data?.result?.response?.docs || []
      const anchor = docs.find(d => String(d.uid) === String(anchorId))
      if (anchor) {
        const name = anchor.nickname || ''
        console.log('[xm getAnchorDetail] found anchor name:', name)
        return getAnchorAlbumBySearch(anchorId, name, page, limit)
      }
    }
  } catch (e) {
    console.warn('[xm getAnchorDetail] failed to find anchor name:', e.message)
  }

  throw new Error('喜马拉雅获取主播专辑列表失败: 无法找到主播信息')
}

// ==================== 音质解析（对齐音乐 SDK 的 getMusicUrl 接口） ====================
// 现在使用 apis() 路由，与歌曲模块（kg/kw/tx/wy/mg）完全一致
// 调用链: player → getMusicUrl → handleGetOnlineMusicUrl → musicSdk['xm'].getMusicUrl(songInfo, quality).promise
//                                        → apis('xm').getMusicUrl(songInfo, quality).promise
//                                        → global.lx.apis['xm'].getMusicUrl(songInfo, quality)（自定义音源）
//                                        → 内置降级实现（无自定义音源时）

/**
 * 喜马拉雅单集音频 URL 内存缓存
 * 避免重复调用 track detail API
 */
const trackUrlCache = new Map()

/**
 * 内置降级实现：直接通过喜马拉雅 API 获取音频 URL
 * 当用户未启用自定义音源时使用
 *
 * 六级降级策略（VIP内容支持）：
 * 1. track搜索API — 免费内容直接返回明文URL
 * 2. mobile-playpage device=web — AES-ECB解密（免费内容）
 * 3. mobile-playpage device=www2 — getSoundCryptLink解密（VIP内容需Cookie）
 * 4. mobile-playpage device=mweb2 — 同上，备用设备类型
 * 5. mpay API — 付费内容专用接口（需要Cookie）
 * 6. revision/play/v1/audio — 旧版API（大概率404）
 */
const builtInGetMusicUrl = async (songInfo, quality) => {
  console.log('[xm builtInGetMusicUrl] called:', { name: songInfo?.name, quality, hasTypeUrl: !!songInfo?.typeUrl, hasPlayUrl: !!songInfo?.playUrl })

  // 1. 优先使用 typeUrl（已缓存的音质映射）
  if (songInfo?.typeUrl?.[quality]) {
    console.log('[xm builtInGetMusicUrl] found in typeUrl:', songInfo.typeUrl[quality].substring(0, 60))
    return { url: songInfo.typeUrl[quality], type: quality }
  }

  // 2. 退而求其次，使用 playUrl
  if (songInfo?.playUrl) {
    console.log('[xm builtInGetMusicUrl] using playUrl:', songInfo.playUrl.substring(0, 60))
    return { url: songInfo.playUrl, type: '128k' }
  }

  // 3. 检查缓存
  const trackId = songInfo?.hash || songInfo?.songmid
  const cacheKey = trackId ? `${trackId}_${quality}` : null
  if (cacheKey && trackUrlCache.has(cacheKey)) {
    const cachedUrl = trackUrlCache.get(cacheKey)
    console.log('[xm builtInGetMusicUrl] cache hit:', cachedUrl.substring(0, 60))
    return { url: cachedUrl, type: quality }
  }

  // 缓存写入辅助函数
  const cacheUrl = (url) => {
    if (cacheKey) {
      trackUrlCache.set(cacheKey, url)
      if (trackUrlCache.size > 200) {
        const firstKey = trackUrlCache.keys().next().value
        trackUrlCache.delete(firstKey)
      }
    }
  }

  if (trackId) {
    console.log('[xm builtInGetMusicUrl] fetching audio URL, trackId:', trackId)

    // 方案1: track 搜索 API（免费内容，直接返回明文URL）
    const searchUrl = await fetchAudioUrlFromTrackSearch(trackId, quality)
    if (searchUrl) {
      cacheUrl(searchUrl)
      return { url: searchUrl, type: quality }
    }
    console.log('[xm builtInGetMusicUrl] track search failed, trying mobile-playpage web')

    // 方案2: mobile-playpage device=web（AES-ECB解密，免费内容）
    const playpageWebUrl = await fetchAudioUrlFromMobilePlaypage(trackId, quality)
    if (playpageWebUrl) {
      cacheUrl(playpageWebUrl)
      return { url: playpageWebUrl, type: quality }
    }
    console.log('[xm builtInGetMusicUrl] mobile-playpage web failed, trying www2')

    // 方案3: mobile-playpage device=www2（getSoundCryptLink解密，VIP内容需Cookie）
    const playpageWww2Url = await fetchAudioUrlFromMobilePlaypageWww2(trackId, quality, 'www2')
    if (playpageWww2Url) {
      cacheUrl(playpageWww2Url)
      return { url: playpageWww2Url, type: quality }
    }
    console.log('[xm builtInGetMusicUrl] mobile-playpage www2 failed, trying mweb2')

    // 方案4: mobile-playpage device=mweb2（备用设备类型）
    const playpageMweb2Url = await fetchAudioUrlFromMobilePlaypageWww2(trackId, quality, 'mweb2')
    if (playpageMweb2Url) {
      cacheUrl(playpageMweb2Url)
      return { url: playpageMweb2Url, type: quality }
    }
    console.log('[xm builtInGetMusicUrl] mobile-playpage mweb2 failed, trying mpay')

    // 方案5: mpay API（付费内容专用，需要Cookie）
    const mpayUrl = await fetchAudioUrlFromMpay(trackId)
    if (mpayUrl) {
      cacheUrl(mpayUrl)
      return { url: mpayUrl, type: quality }
    }
    console.log('[xm builtInGetMusicUrl] mpay failed, trying revision fallback')

    // 方案6: 旧版 revision/play/v1/audio API（最后降级）
    const playUrl = await fetchAudioUrlFromRevision(trackId, cacheKey, 0)
    if (playUrl) {
      return { url: playUrl, type: '128k' }
    }

    // 所有端点都失败 — 提供精确的错误诊断
    if (XM_COOKIE) {
      const cookieStatus = await checkXmCookieStatus()
      if (!cookieStatus.valid) {
        throw new Error(`喜马拉雅VIP内容获取失败: ${cookieStatus.reason}`)
      }
      if (!cookieStatus.isVip) {
        throw new Error(`喜马拉雅VIP内容获取失败: 账号${cookieStatus.nickname}非VIP会员，无法播放付费内容`)
      }
      throw new Error(`喜马拉雅VIP内容获取失败: 所有接口均不可用（账号: ${cookieStatus.nickname}，可能被速率限制，请稍后重试）`)
    }
    throw new Error('喜马拉雅获取音频URL失败: 所有播放接口均不可用（VIP内容需配置Cookie，见 xm/index.js 顶部 XM_COOKIE）')
  }

  throw new Error('喜马拉雅获取音频URL失败: 缺少trackId')
}

/**
 * 获取喜马拉雅单集音频 URL
 * 使用 apis() 路由，与歌曲模块完全一致
 * 当自定义音源激活时 → 走自定义音源脚本
 * 当自定义音源未激活时 → 走内置降级实现
 *
 * @param {Object} songInfo - 歌曲信息（旧格式，通过 toOldMusicInfo 转换）
 * @param {string} quality - 请求的音质 ('128k' | '64k' | '32k')
 * @returns {{ promise: Promise<{ url: string, type: string }> }}
 */
const getMusicUrl = (songInfo, quality) => {
  // 优先使用 apis() 路由（与 kg/kw/tx/wy/mg 完全一致）
  try {
    console.log('[xm getMusicUrl] trying apis(xm) route...')
    const apiResult = apis('xm').getMusicUrl(songInfo, quality)
    if (apiResult && apiResult.promise) {
      console.log('[xm getMusicUrl] using apis(xm) route')
      return apiResult
    }
  } catch (err) {
    console.log('[xm getMusicUrl] apis(xm) not available, using built-in fallback:', err.message)
  }

  // 降级：使用内置实现
  console.log('[xm getMusicUrl] using built-in fallback')
  const promise = builtInGetMusicUrl(songInfo, quality)
  return { promise }
}

/**
 * 获取喜马拉雅单集封面图
 * 对齐音乐 SDK 的 getPic 接口格式
 *
 * @param {Object} songInfo - 歌曲信息（旧格式）
 * @returns {Promise<string>} 封面图 URL
 */
const getPic = (songInfo) => {
  console.log('[xm getPic] called:', { name: songInfo?.name, hasImg: !!songInfo?.img })
  if (songInfo?.img) return Promise.resolve(songInfo.img)
  return Promise.resolve('')
}

/**
 * 获取喜马拉雅单集歌词（听书一般无歌词，返回空）
 * 对齐音乐 SDK 的 getLyric 接口格式
 *
 * @param {Object} songInfo - 歌曲信息（旧格式）
 * @returns {{ promise: Promise<{ lyric: string, tlyric: string, rlyric: string, lxlyric: string }> }}
 */
const getLyric = (songInfo) => {
  const promise = Promise.resolve({
    lyric: '',
    tlyric: '',
    rlyric: '',
    lxlyric: '',
  })
  return { promise }
}

export default {
  search,
  getAlbumDetail,
  getAnchorDetail,
  getMusicUrl,
  getPic,
  getLyric,
}