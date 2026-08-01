/*!
 * @name 国内聚合音源 v3.8 极速版
 * @description 全平台无损完整版：预编译正则、三阶段竞速、单次URL分析、Set化域名检查，极致速度
 * @version v3.12.0
 * @author 基于 v3.7 深度速度优化
 * 
 * === v3.12.0 喜马拉雅API全面升级：新增音频URL解密 ===
 * 1. 喜马拉雅废弃 revision/play/v1/audio，改用 mobile-playpage/track/v3/baseInfo
 * 2. 新增 getSoundCryptLink 解密算法（替换表 + XOR + Base64）
 * 3. 新增 XM_SUBST_O/XM_KEY_A/XM_SUBST_R/XM_KEY_N 四组解密常量
 * 4. 新增 xmBase64Decode/xmXorBlock/xmBytesToUtf8 解密工具函数
 * 5. reqXmDirect 降级策略：新API解密 → 旧API fallback
 * 6. 更新 CDN 域名集包含 audios.ximalaya.com
 * 
 * === v3.11.0 新增喜马拉雅(xm)平台支持 ===
 * 1. 新增 xm 平台音质解析（128k/64k/32k）
 * 2. 使用喜马拉雅官方 track detail API 获取音频 URL
 * 3. 添加 64k/32k 音质匹配正则和评分
 * 4. 更新 CDN 域名集包含 ximalaya.com
 * 
 * === v3.10.1 酷狗API速度优化 ===
 * 1. 所有策略并行竞速（gateway/v5/wwwapi/CDN同时发射），不再串行等待
 * 2. 单请求超时从 5000ms 降至 3000ms
 * 3. CDN 端点从 6 个减至 2 个（trackercdn + tracker，cmd=25）
 * 4. 整体最快可在 500ms 内返回（取决于网络延迟最低的端点）
 * 
 * === v3.10.0 酷狗API基于LX Music官方方案完全重写 ===
 * 参考: https://github.com/MeoProject/lx-music-api-server
 * 核心修复：
 * 1. 新增 tracker.kugou.com/v5/url 端点（LX Music API Server 官方端点）
 * 2. 正确实现签名算法：MD5("OIlwieks28dk2k092lksi2UIkp" + sorted_params + "OIlwieks28dk2k092lksi2UIkp")
 * 3. key 公式修正：MD5(hash+"57ae12eb..."+"1005"+"musicapi"+userid) — userid 可为空字符串
 * 4. 正确请求头：KG-THash: "255d751", KG-Rec: "1", KG-RC: "1", AndroidCar UA
 * 5. 修复 wwwapi.kugou.com 参数：添加 appid/platid/mid/dfid/_ 等必要参数
 * 6. 品质映射：128k→128, 320k→320, flac→flac
 * 
 * === v3.9.0 酷狗API基于LX Music官方方案重写 ===
 * 核心修复：key 公式从 md5(hash+'kgcloudv2') 改为 md5(hash+"57ae12eb..."+"1005"+"musicapi"+"0")
 * 2. 新增策略0：通过 gateway.kugou.com/v3/album_audio/audio 获取 album_id/album_audio_id
 * 3. 带正确的 KG-THash/KG-RC/KG-RF 等请求头（Android UA）
 * 4. wwwapi.kugou.com 使用 gateway 获取到的 album_id 参数
 * 5. CDN 端点使用正确的 key 公式
 * 
 * === v3.8.4 酷狗API修复 ===
 * 1. 修复酷狗音乐"尝试更换其他来源"播放失败问题
 * 2. reqKgDirect 扩展为4策略回退
 * 3. 内置MD5实现，用于计算 trackercdn 的 key 参数
 * 4. 增强响应解析：支持 play_url / play_backup_url / url / bitrate 等多种字段
 * 5. 更好的错误诊断：检查 errcode / status 等错误码
 * 
 * === v3.8.3 酷我API修复 ===
 * 1. 核心修复：convert_url3 返回的CDN URL会触发版本检测
 * 2. 优先使用 convert_url（无版本检测），convert_url3 降级为备用
 * 3. 主端点：www.kuwo.cn/url + convert_url
 * 4. anti.s 端点仅作为最后回退，且只用 convert_url
 * 5. 正确映射 br 参数：128k→128kmp3, 320k→320kmp3, flac→2000kflac
 * 
 * === v3.8 速度优化 ===
 * 1. 预编译正则：音质匹配/CDN域名全部预编译为RegExp
 * 2. Set化域名检查：OFFICIAL_CDN_DOMAINS转为Set，O(1)查找
 * 3. 单次URL分析：一次toLowerCase + 一次正则匹配
 * 4. 三阶段竞速发射：直连API(0ms) → 聚合API(80ms) → 镜像API(160ms)
 * 5. 超时大幅缩减：直连5000ms/聚合7000ms/镜像10000ms/总超时10000ms
 * 6. 缓存优化：去掉get时的LRU重排，简化set时过期清理
 * 7. httpRequest快速路径：audio/URL类型即刻返回，跳过body解析
 */

const DEV_ENABLE = false

// ============================================================
// 预编译正则 & Set（核心速度优化 + 音质保护）
// ============================================================
// 注意：以下正则在逻辑上与 v3.7 的 QUALITY_MARKERS 数组 + some()/includes() 完全等价
// 音质匹配准确性未降低，仅将 O(n) 字符串遍历优化为 O(1) 正则 test()
// 每个音质包含 positive（目标音质标记）和 negative（其他音质标记，防误判）

// 音质匹配：预编译正则，一次test替代多次includes
const QUALITY_RE = {
  "flac": {
    pos: /flac|f000|lossless/i,
    neg: /mp3|m4a|aac|m800|m500|m128|c400/i
  },
  "320k": {
    pos: /m800|320k|br=320/i,
    neg: /flac|f000|m128|c400/i
  },
  "192k": {
    pos: /m500|192k|br=192/i,
    neg: /flac|f000|m800|m128|320k|c400/i
  },
  "128k": {
    pos: /m128|c400|128k|br=128/i,
    neg: /flac|f000|m800|m500/i
  },
  "64k": {
    pos: /64k|m64|br=64/i,
    neg: /flac|f000|m800|m500|m128|128k|c400|32k/i
  },
  "32k": {
    pos: /32k|m32|br=32/i,
    neg: /flac|f000|m800|m500|m128|128k|c400|64k/i
  }
}

// 音频扩展名检测
const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|wma)/i

// CDN域名Set + 预编译正则（用于httpRequest快速路径）
const CDN_SET = new Set([
  'isure.stream.qqmusic.qq.com',
  'aqqmusic.tc.qq.com',
  'dl.stream.qqmusic.qq.com',
  'streamoc.music.tc.qq.com',
  'isure2.stream.qqmusic.qq.com',
  'wx.music.tc.qq.com',
  'music.126.net',
  'fsandroid.tx.kugou.com',
  'fsweb.tx.kugou.com',
  'trackercdnbk.kugou.com',
  'kugou.com',
  'koowo.cn',
  'kuwo.cn',
  'migu.cn',
  'ximalaya.com',
  'audios.ximalaya.com',
])

// 预编译CDN正则（用于快速检查URL中是否包含CDN域名）
const CDN_RE = /(?:isure\.stream\.qqmusic\.qq\.com|aqqmusic\.tc\.qq\.com|dl\.stream\.qqmusic\.qq\.com|streamoc\.music\.tc\.qq\.com|isure2\.stream\.qqmusic\.qq\.com|wx\.music\.tc\.qq\.com|music\.126\.net|fsandroid\.tx\.kugou\.com|fsweb\.tx\.kugou\.com|trackercdnbk\.kugou\.com|kugou\.com|koowo\.cn|kuwo\.cn|migu\.cn|ximalaya\.com|audios\.ximalaya\.com)/i

// QQ音乐无损路径
const QQ_FLAC_RE = /\/yp\/full\//i

// 网易云CDN
const NETEASE_CDN_RE = /music\.126\.net/i

// HTTP URL验证
const HTTP_URL_RE = /^https?:\/\//i

// ============================================================
// 常量
// ============================================================

const CACHE_TTL_MS = 1800000
const CACHE_MAX_SIZE = 500

// 超时大幅缩减（毫秒）
const TIMEOUT_FAST = 5000     // 直连API
const TIMEOUT_NORMAL = 7000   // 聚合API（海棠/星海）
const TIMEOUT_SLOW = 10000    // Meting镜像/网易云API
const TOTAL_TIMEOUT = 10000   // 第一音质总超时
const FALLBACK_TIMEOUT = 5000 // 降级音质总超时

// 三阶段发射间隔（毫秒）
const STAGGER_FAST = 0        // 立即发射：直连API
const STAGGER_NORMAL = 80     // 80ms后：聚合API
const STAGGER_SLOW = 160      // 160ms后：镜像API

// ============================================================
// 配置
// ============================================================

const PLATFORM_QUALITIES = {
  wy: ["flac", "320k", "192k", "128k"],
  tx: ["flac", "320k", "192k", "128k"],
  kw: ["flac", "320k", "192k", "128k"],
  kg: ["flac", "320k", "192k", "128k"],
  mg: ["320k", "192k", "128k"],
  xm: ["128k", "64k", "32k"],
}

const QUALITY_SCORE = { "flac": 1000, "320k": 800, "192k": 600, "128k": 400, "64k": 200, "32k": 100 }

const PLATFORM_TO_XINGHAI = {
  wy: "netease", kg: "kugou", kw: "kuwo", mg: "migu"
}

const METING_SERVER_MAP = {
  wy: "netease", tx: "tencent", kg: "kugou", kw: "kuwo", mg: "migu"
}

const QUALITY_TO_BR = {
  "128k": "128", "192k": "192", "320k": "320", "flac": "999"
}

// ============================================================
// API端点
// ============================================================

const XINGHAI_MAIN_API = "https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest&need_sec_link=1&sec_link_scene=im&theme=light"
const XINGHAI_BACKUP_API = "https://music-dl.sayqz.com/api/"
const SUYIN_API = "https://oiapi.net/api/QQ_Music"
const SUYIN_KEY = "oiapi-ef6133b7-ac2f-dc7d-878c-d3e207a82575"

const HAITANG_API_TEMPLATES = [
  {
    name: "海棠主站",
    tx: "https://musicapi.haitangw.net/qq/qq.php?id={id}&level={level}",
    kg: "https://musicapi.haitangw.net/kgqq/kg.php?id={id}&level={level}",
    kw: "https://musicapi.haitangw.net/music/kw.php?id={id}&level={level}",
  },
  {
    name: "海棠备用",
    tx: "https://music.haitangw.cc/qq/qq.php?id={id}&level={level}",
    kg: "https://music.haitangw.cc/kgqq/kg.php?id={id}&level={level}",
    kw: "https://music.haitangw.cc/music/kw.php?id={id}&level={level}",
  },
]

const METING_APIS = [
  { base: "https://api.injahow.cn/meting/", name: "Meting-injahow" },
  { base: "https://meting.qjqq.cn/", name: "Meting-qjqq" },
  { base: "https://meting.jmstrand.cn/", name: "Meting-jmstrand" },
  { base: "https://metingapi.long0617.cn/", name: "Meting-long" },
  { base: "https://api.moeyao.cn/meting/", name: "Meting-moeyao" },
  { base: "https://meting-api.mcloc.cn/", name: "Meting-mcloc" },
  { base: "https://music.3e0.cn/", name: "Meting-3e0" },
]

const NETEASE_API_INSTANCES = [
  { base: "https://api.2leo.top", name: "Netease-2leo" },
  { base: "https://netease-cloud-music-api-psi-silk.vercel.app", name: "Netease-vercel" },
  { base: "https://163api.qijieya.cn", name: "Netease-qijieya" },
]

const KW_DIRECT_API = "https://antiserver.kuwo.cn/anti.s"
const KW_URL_API = "https://www.kuwo.cn/url"
const KG_DIRECT_API = "https://wwwapi.kugou.com/yy/index.php"
const TX_DIRECT_API = "https://u.y.qq.com/cgi-bin/musicu.fcg"

// ============================================================
// 工具函数
// ============================================================

function getPlatformSongId(platform, songInfo) {
  if (platform === 'kg') return songInfo?.hash ?? songInfo?.songmid ?? songInfo?.id ?? songInfo?.rid ?? null
  if (platform === 'kw') return songInfo?.rid ?? songInfo?.songmid ?? songInfo?.hash ?? songInfo?.id ?? null
  if (platform === 'xm') return songInfo?.songmid ?? songInfo?.hash ?? songInfo?.id ?? null
  return songInfo?.songmid ?? songInfo?.hash ?? songInfo?.id ?? null
}

function qualityToLevel(quality) {
  if (quality === "flac") return "lossless"
  if (quality === "320k") return "exhigh"
  if (quality === "192k") return "high"
  return "standard"
}

// ============================================================
// 单次URL分析（合并validate + qualityMatch + CDN + score）
// 音质匹配逻辑与 v3.7 的 urlMatchesQuality + calcUrlScore + validateUrl 完全等价
// 优势：只做一次 toLowerCase()，一次正则匹配完成全部检查，避免重复遍历
// ============================================================
function analyzeUrl(url, quality) {
  if (!url || typeof url !== "string") return null
  const trimmed = url.trim()
  if (!HTTP_URL_RE.test(trimmed) || trimmed.length < 25) return null
  
  const urlLower = trimmed.toLowerCase()
  const qRe = QUALITY_RE[quality]
  if (!qRe) return null
  
  // CDN检查（单次正则）
  const isCDN = CDN_RE.test(urlLower)
  
  // 音质匹配
  let isMatch = false
  
  // QQ音乐无损路径特殊处理
  if (quality === 'flac' && QQ_FLAC_RE.test(urlLower)) {
    isMatch = !qRe.neg.test(urlLower)
  }
  // 网易云CDN特殊处理
  else if (NETEASE_CDN_RE.test(urlLower)) {
    if (quality === 'flac') {
      isMatch = !qRe.neg.test(urlLower)
    } else {
      isMatch = qRe.pos.test(urlLower)
    }
  }
  // 标准匹配
  else {
    const hasPos = qRe.pos.test(urlLower)
    const hasNeg = qRe.neg.test(urlLower)
    if (hasPos && !hasNeg) isMatch = true
    else if (hasNeg) isMatch = false
    else if (quality !== 'flac' && AUDIO_EXT_RE.test(urlLower)) isMatch = true
  }
  
  // 评分（单次计算）
  let score = QUALITY_SCORE[quality] || 0
  if (isMatch) score += 2000
  else score -= 500
  if (isCDN) score += 500
  if (quality === 'flac') {
    if (urlLower.includes('.flac') || urlLower.includes('f000') || QQ_FLAC_RE.test(urlLower)) score += 300
  } else {
    if (AUDIO_EXT_RE.test(urlLower)) score += 50
  }
  
  return { url: trimmed, isMatch, score, isCDN }
}

// ============================================================
// 缓存（简化版）
// ============================================================

const urlCache = new Map()

function buildCacheKey(platform, songInfo, quality) {
  return `${platform}_${getPlatformSongId(platform, songInfo) || ''}_${songInfo?.name || ''}_${songInfo?.singer || ''}_${quality}`
}

function getCachedUrl(platform, songInfo, quality) {
  const key = buildCacheKey(platform, songInfo, quality)
  const entry = urlCache.get(key)
  if (entry && (Date.now() - entry.t) < CACHE_TTL_MS) return entry.url
  if (entry) urlCache.delete(key) // 过期清理
  return null
}

function setCachedUrl(platform, songInfo, quality, url) {
  const key = buildCacheKey(platform, songInfo, quality)
  urlCache.set(key, { url, t: Date.now() })
  // LRU淘汰（简化：不遍历所有音质，直接淘汰最旧）
  if (urlCache.size > CACHE_MAX_SIZE) {
    let oldestKey = null, oldestTime = Infinity
    for (const [k, v] of urlCache) {
      if (v.t < oldestTime) { oldestTime = v.t; oldestKey = k }
    }
    if (oldestKey) urlCache.delete(oldestKey)
  }
}

// ============================================================
// HTTP请求（快速路径优化）
// ============================================================

const { EVENT_NAMES, request, on, send } = globalThis.lx

function httpRequest(url, options = { method: "GET" }, timeout = TIMEOUT_NORMAL) {
  return new Promise((resolve, reject) => {
    request(url, { timeout, follow_max: 3, ...options }, (err, res) => {
      if (err) return reject(new Error(err.message))
      
      const finalUrl = res?.url || url
      const body = res?.body
      const ct = (res?.headers?.['content-type'] || res?.headers?.['Content-Type'] || '').toLowerCase()
      
      // 快速路径：音频/二进制流直接返回
      if (ct.includes('audio') || ct.includes('octet-stream')) {
        return resolve({ type: 'audio', url: finalUrl })
      }
      
      // 快速路径：非字符串body直接返回
      if (typeof body !== "string") {
        return resolve({ type: 'json', data: body, finalUrl })
      }
      
      const trimmed = body.trim()
      
      // 快速路径：纯URL响应
      if (HTTP_URL_RE.test(trimmed) && trimmed.length > 25) {
        return resolve({ type: 'url', url: trimmed })
      }
      
      // JSON解析
      let responseBody = trimmed
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { responseBody = JSON.parse(trimmed) } catch (e) { /* keep raw */ }
      } else {
        // JSONP
        const m = trimmed.match(/^[^(]+?\((.+?)\)\s*;?\s*$/s)
        if (m) { try { responseBody = JSON.parse(m[1]) } catch (e) { /* keep raw */ } }
      }
      
      resolve({ type: 'json', data: responseBody, finalUrl })
    })
  })
}

// ============================================================
// 三阶段竞速引擎（核心速度优化）
// ============================================================

/**
 * 分阶段发射请求，避免网络拥塞
 * 阶段1（0ms）：直连API — 最快
 * 阶段2（80ms）：聚合API — 海棠/星海/速音
 * 阶段3（160ms）：镜像API — Meting/网易云
 */
function stagedRace(stageGroups, quality, totalTimeout) {
  return new Promise((resolve, reject) => {
    let resolved = false
    let bestResult = null
    let bestScore = -1
    let totalPending = 0
    const errors = []
    
    const earlyThreshold = (QUALITY_SCORE[quality] || 0) + 1500
    
    const totalTimer = setTimeout(() => {
      if (resolved) return
      resolved = true
      if (bestResult) resolve(bestResult)
      else reject(new Error(`获取${quality}超时`))
    }, totalTimeout)
    
    const handleResult = (url, apiName) => {
      if (resolved) return
      const analyzed = analyzeUrl(url, quality)
      if (!analyzed) { totalPending--; checkDone(); return }
      
      if (DEV_ENABLE) console.log(`  ✓ ${apiName}(${quality}) 匹配:${analyzed.isMatch} 得分:${analyzed.score}`)
      
      // 高质量结果立即返回
      if (analyzed.isMatch && analyzed.score >= earlyThreshold) {
        resolved = true
        clearTimeout(totalTimer)
        resolve({ url: analyzed.url, quality, apiName, isExactMatch: true })
        return
      }
      
      if (analyzed.score > bestScore) {
        bestScore = analyzed.score
        bestResult = { url: analyzed.url, quality, apiName, isExactMatch: analyzed.isMatch }
      }
      totalPending--
      checkDone()
    }
    
    const handleError = (err) => {
      errors.push(err?.message || "失败")
      totalPending--
      checkDone()
    }
    
    const checkDone = () => {
      if (resolved) return
      if (totalPending <= 0) {
        resolved = true
        clearTimeout(totalTimer)
        if (bestResult) resolve(bestResult)
        else reject(new Error(errors.slice(0, 2).join("; ")))
      }
    }
    
    const launchStage = (stage) => {
      if (resolved) return
      stage.promises.forEach(p => {
        totalPending++
        p.then(r => handleResult(r.url, r.apiName)).catch(e => handleError(e))
      })
    }
    
    // 阶段1：立即发射
    launchStage(stageGroups[0])
    
    // 阶段2：延迟发射
    if (stageGroups.length > 1) {
      setTimeout(() => {
        if (!resolved) launchStage(stageGroups[1])
      }, STAGGER_NORMAL)
    }
    
    // 阶段3：更晚发射
    if (stageGroups.length > 2) {
      setTimeout(() => {
        if (!resolved) launchStage(stageGroups[2])
      }, STAGGER_SLOW)
    }
  })
}

// ============================================================
// MD5 实现（用于酷狗 key 计算）
// ============================================================

function md5(string) {
  function R(n, c) { return (n << c) | (n >>> (32 - c)); }
  function C(q, n, a, b, x, s, t) { return safeAdd(R(safeAdd(safeAdd(q, n), safeAdd(x, t)), s), b); }
  function safeAdd(x, y) { return (x + y) & 0xFFFFFFFF; }
  
  function FF(a, b, c, d, x, s, t) { return C((b & c) | (~b & d), a, b, x, s, t); }
  function GG(a, b, c, d, x, s, t) { return C((b & d) | (c & ~d), a, b, x, s, t); }
  function HH(a, b, c, d, x, s, t) { return C(b ^ c ^ d, a, b, x, s, t); }
  function II(a, b, c, d, x, s, t) { return C(c ^ (b | ~d), a, b, x, s, t); }
  
  function strToArr(str) {
    var n = str.length, arr = [];
    for (var i = 0; i < n; i++) arr[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
    arr[n >> 2] |= 0x80 << ((n % 4) * 8);
    arr[(((n + 8) >> 6) << 4) + 14] = n * 8;
    return arr;
  }
  
  var arr = strToArr(string);
  var a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  
  for (var i = 0; i < arr.length; i += 16) {
    var aa = a, bb = b, cc = c, dd = d;
    var x = arr.slice(i, i + 16);
    a = FF(a, b, c, d, x[0], 7, 0xD76AA478); d = FF(d, a, b, c, x[1], 12, 0xE8C7B756);
    c = FF(c, d, a, b, x[2], 17, 0x242070DB); b = FF(b, c, d, a, x[3], 22, 0xC1BDCEEE);
    a = FF(a, b, c, d, x[4], 7, 0xF57C0FAF); d = FF(d, a, b, c, x[5], 12, 0x4787C62A);
    c = FF(c, d, a, b, x[6], 17, 0xA8304613); b = FF(b, c, d, a, x[7], 22, 0xFD469501);
    a = FF(a, b, c, d, x[8], 7, 0x698098D8); d = FF(d, a, b, c, x[9], 12, 0x8B44F7AF);
    c = FF(c, d, a, b, x[10], 17, 0xFFFF5BB1); b = FF(b, c, d, a, x[11], 22, 0x895CD7BE);
    a = FF(a, b, c, d, x[12], 7, 0x6B901122); d = FF(d, a, b, c, x[13], 12, 0xFD987193);
    c = FF(c, d, a, b, x[14], 17, 0xA679438E); b = FF(b, c, d, a, x[15], 22, 0x49B40821);
    a = GG(a, b, c, d, x[1], 5, 0xF61E2562); d = GG(d, a, b, c, x[6], 9, 0xC040B340);
    c = GG(c, d, a, b, x[11], 14, 0x265E5A51); b = GG(b, c, d, a, x[0], 20, 0xE9B6C7AA);
    a = GG(a, b, c, d, x[5], 5, 0xD62F105D); d = GG(d, a, b, c, x[10], 9, 0x02441453);
    c = GG(c, d, a, b, x[15], 14, 0xD8A1E681); b = GG(b, c, d, a, x[4], 20, 0xE7D3FBC8);
    a = GG(a, b, c, d, x[9], 5, 0x21E1CDE6); d = GG(d, a, b, c, x[14], 9, 0xC33707D6);
    c = GG(c, d, a, b, x[3], 14, 0xF4D50D87); b = GG(b, c, d, a, x[8], 20, 0x455A14ED);
    a = GG(a, b, c, d, x[13], 5, 0xA9E3E905); d = GG(d, a, b, c, x[2], 9, 0xFCEFA3F8);
    c = GG(c, d, a, b, x[7], 14, 0x676F02D9); b = GG(b, c, d, a, x[12], 20, 0x8D2A4C8A);
    a = HH(a, b, c, d, x[5], 4, 0xFFFA3942); d = HH(d, a, b, c, x[8], 11, 0x8771F681);
    c = HH(c, d, a, b, x[11], 16, 0x6D9D6122); b = HH(b, c, d, a, x[14], 23, 0xFDE5380C);
    a = HH(a, b, c, d, x[1], 4, 0xA4BEEA44); d = HH(d, a, b, c, x[4], 11, 0x4BDECFA9);
    c = HH(c, d, a, b, x[7], 16, 0xF6BB4B60); b = HH(b, c, d, a, x[9], 23, 0xBEBFBC70);
    a = HH(a, b, c, d, x[12], 4, 0x289B7EC6); d = HH(d, a, b, c, x[15], 11, 0xEAA127FA);
    c = HH(c, d, a, b, x[2], 16, 0xD4EF3085); b = HH(b, c, d, a, x[0], 23, 0x04881D05);
    a = HH(a, b, c, d, x[6], 4, 0xD9D4D039); d = HH(d, a, b, c, x[13], 11, 0xE6DB99E5);
    c = HH(c, d, a, b, x[10], 16, 0x1FA27CF8); b = HH(b, c, d, a, x[3], 23, 0xC4AC5665);
    a = II(a, b, c, d, x[0], 6, 0xF4292244); d = II(d, a, b, c, x[7], 10, 0x432AFF97);
    c = II(c, d, a, b, x[14], 15, 0xAB9423A7); b = II(b, c, d, a, x[5], 21, 0xFC93A039);
    a = II(a, b, c, d, x[12], 6, 0x655B59C3); d = II(d, a, b, c, x[3], 10, 0x8F0CCC92);
    c = II(c, d, a, b, x[10], 15, 0xFFEFF47D); b = II(b, c, d, a, x[1], 21, 0x85845DD1);
    a = II(a, b, c, d, x[8], 6, 0x6FA87E4F); d = II(d, a, b, c, x[15], 10, 0xFE2CE6E0);
    c = II(c, d, a, b, x[6], 15, 0xA3014314); b = II(b, c, d, a, x[13], 21, 0x4E0811A1);
    a = II(a, b, c, d, x[4], 6, 0xF7537E82); d = II(d, a, b, c, x[11], 10, 0xBD3AF235);
    c = II(c, d, a, b, x[2], 15, 0x2AD7D2BB); b = II(b, c, d, a, x[9], 21, 0xEB86D391);
    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
  }
  
  function toHex(n) { var s = ''; for (var i = 0; i < 4; i++) s += ((n >> (i * 8)) & 0xFF).toString(16).padStart(2, '0'); return s; }
  return (toHex(a) + toHex(b) + toHex(c) + toHex(d)).toLowerCase();
}

// ============================================================
// API请求函数
// ============================================================

// --- 阶段1：直连API（最快） ---

async function reqKwDirect(songId, quality) {
  const format = quality === 'flac' ? 'flac' : 'mp3'
  const rid = String(songId).startsWith("MUSIC_") ? songId : `MUSIC_${songId}`
  
  // br 参数映射
  const brMap = { 'flac': '2000kflac', '320k': '320kmp3', '192k': '192kmp3', '128k': '128kmp3' }
  const br = brMap[quality] || '128kmp3'
  
  const webHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.kuwo.cn/' }
  let lastError = null
  
  // === 关键：convert_url（不带数字后缀）返回的CDN URL无版本检测 ===
  // convert_url3 返回的CDN URL会检测客户端版本，非官方客户端返回"当前歌曲仅在最新版"提示音频
  // 参考：UnblockNeteaseMusic项目确认此问题，解决方案是绕过版本检测逻辑
  
  // 策略1（主）：www.kuwo.cn/url + convert_url — 无版本检测，免费+付费歌曲均有效
  try {
    const res = await httpRequest(`${KW_URL_API}?format=${format}&rid=${encodeURIComponent(rid)}&response=url&type=convert_url&br=${br}&from=web&httpsStatus=1`, { headers: webHeaders }, TIMEOUT_FAST)
    if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "酷我Web" }
    if (res.data?.url) return { url: res.data.url, quality, apiName: "酷我Web" }
    throw new Error("无URL")
  } catch (err) {
    lastError = err
    if (DEV_ENABLE) console.log('  [kw] kuwo.cn/url(convert_url) 失败:', err?.message)
  }
  
  // 策略2（备用）：www.kuwo.cn/url + convert_url3
  try {
    const res = await httpRequest(`${KW_URL_API}?format=${format}&rid=${encodeURIComponent(rid)}&response=url&type=convert_url3&br=${br}&from=web&httpsStatus=1`, { headers: webHeaders }, TIMEOUT_FAST)
    if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "酷我Web(v3)" }
    if (res.data?.url) return { url: res.data.url, quality, apiName: "酷我Web(v3)" }
    throw new Error("无URL")
  } catch (err) {
    lastError = err
    if (DEV_ENABLE) console.log('  [kw] kuwo.cn/url(convert_url3) 失败:', err?.message)
  }
  
  // 策略3（最后回退）：anti.s + convert_url（不用convert_url3，避免版本检测）
  try {
    const res = await httpRequest(`${KW_DIRECT_API}?type=convert_url&rid=${encodeURIComponent(rid)}&format=${format}&response=url`, {}, TIMEOUT_FAST)
    if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "酷我直连" }
    if (res.data?.url) return { url: res.data.url, quality, apiName: "酷我直连" }
    throw new Error("无URL")
  } catch (err) {
    lastError = err
    if (DEV_ENABLE) console.log('  [kw] anti.s(convert_url) 失败:', err?.message)
  }
  
  throw lastError || new Error("酷我所有端点均失败")
}

/**
 * 酷狗音乐直连API — 并行竞速版
 * 参考: https://github.com/MeoProject/lx-music-api-server
 * 
 * 优化：所有策略并行发射，谁先返回有效URL就用谁，不再串行等待
 * gateway 也并行跑，不阻塞主流程
 */
async function reqKgDirect(songId, quality, songInfo) {
  const hash = String(songId).toLowerCase()
  const KG_TIMEOUT = 3000  // 酷狗专属较短超时，加快失败检测

  // === 签名函数 ===
  function kgSign(params) {
    const keys = Object.keys(params).sort()
    const str = keys.map(k => `${k}=${params[k]}`).join('')
    return md5('OIlwieks28dk2k092lksi2UIkp' + str + 'OIlwieks28dk2k092lksi2UIkp')
  }

  // === key 公式 ===
  function kgGetKey(h, uid) {
    return md5(h + '57ae12eb6890223e355ccfcb74edf70d' + '1005' + 'musicapi' + (uid || ''))
  }

  const qualityMap = { '128k': '128', '320k': '320', 'flac': 'flac' }
  const kgQuality = qualityMap[quality] || '128'

  function extractUrl(res) {
    if (res.type === 'audio' || res.type === 'url') return res.url
    const d = res.data?.data || res.data
    if (d?.play_url && !d.play_url.includes('tips')) return d.play_url
    if (d?.play_backup_url && !d.play_backup_url.includes('tips')) return d.play_backup_url
    if (d?.url && !d.url.includes('tips')) return d.url
    if (res.data?.url && !res.data.url.includes('tips')) return res.data.url
    if (d?.bitrate && d?.extra?.url) return d.extra.url
    if (Array.isArray(res.data?.url) && res.data.url[0]) return res.data.url[0]
    if (typeof res.data?.url === 'string' && !res.data.url.includes('tips')) return res.data.url
    return null
  }
  
  // 从 songInfo 提取（可能为空）
  let albumId = songInfo?.album_id || songInfo?.albumId || songInfo?.albumid || ''
  let albumAudioId = songInfo?.album_audio_id || songInfo?.albumAudioId || ''

  // 构建各策略的请求 Promise
  const promises = []

  // === 策略A：gateway 获取 album_id（并行，不阻塞）===
  if (!albumId || !albumAudioId) {
    promises.push((async () => {
      try {
        const res = await httpRequest('https://gateway.kugou.com/v3/album_audio/audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'KG-THash': '13a3164', 'KG-RC': '1', 'KG-Fake': '0', 'KG-RF': '00869891',
            'User-Agent': 'Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi',
            'x-router': 'kmr.service.kugou.com',
          },
          body: JSON.stringify({
            area_code: '1', show_privilege: '1', show_album_info: '1', is_publish: '',
            appid: 1005, clientver: 11451, mid: '114514', dfid: '-',
            clienttime: Math.floor(Date.now() / 1000),
            key: 'OIlwieks28dk2k092lksi2UIkp', data: [{ hash }],
          }),
        }, KG_TIMEOUT)
        const d = res.data?.data?.[0]?.[0]
        if (d) {
          albumId = albumId || d.album_info?.album_id || ''
          albumAudioId = albumAudioId || d.album_audio_id || ''
        }
      } catch (e) { /* gateway 失败不影响主流程 */ }
      return null  // gateway 本身不返回 URL
    })())
  }

  // === 策略B：tracker.kugou.com/v5/url（LX Music 官方端点）===
  let resolveV5 = null
  const v5Ready = new Promise(r => { resolveV5 = r })
  promises.push((async () => {
    // 等待 gateway 可能返回的 album_id（最多 800ms，避免无限等）
    await Promise.race([v5Ready, new Promise(r => setTimeout(r, 800))])
    try {
      const ct = Math.floor(Date.now() / 1000)
      const params = {
        album_id: albumId || '', userid: '', area_code: '1', hash,
        mid: 'musicapi', appid: '1005', ssa_flag: 'is_fromtrack',
        clientver: '20349', token: '', album_audio_id: albumAudioId || '',
        behavior: 'play', clienttime: String(ct), pid: '2',
        key: kgGetKey(hash, ''), quality: kgQuality, version: '20349',
        dfid: '-', pidversion: '3001',
      }
      params.signature = kgSign(params)
      const qs = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&')
      const res = await httpRequest(`http://tracker.kugou.com/v5/url?${qs}`, {
        headers: { 'User-Agent': 'Android12-AndroidCar-20089-46-0-NetMusic-wifi', 'KG-THash': '255d751', 'KG-Rec': '1', 'KG-RC': '1' }
      }, KG_TIMEOUT)
      const url = extractUrl(res)
      if (url) return { url, quality, apiName: '酷狗v5' }
      if (res.data?.status && res.data.status !== 1) throw new Error(`status=${res.data.status}`)
      throw new Error('无URL')
    } catch (e) { throw e }
  })())

  // === 策略C：wwwapi.kugou.com ===
  promises.push((async () => {
    try {
      const mid = Array.from({length: 32}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
      let u = `${KG_DIRECT_API}?r=play/getdata&hash=${encodeURIComponent(hash)}&appid=1014&platid=4&mid=${encodeURIComponent(mid)}&dfid=-&_=${Date.now()}`
      if (albumId) u += `&album_id=${encodeURIComponent(albumId)}`
      if (albumAudioId) u += `&album_audio_id=${encodeURIComponent(albumAudioId)}`
      const res = await httpRequest(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.kugou.com/' }
      }, KG_TIMEOUT)
      const url = extractUrl(res)
      if (url) return { url, quality, apiName: '酷狗wwwapi' }
      if (res.data?.errcode || res.data?.status === -1) throw new Error(`${res.data?.err_msg || res.data?.error || 'API错误'}`)
      throw new Error('无URL')
    } catch (e) { throw e }
  })())

  // === 策略D：CDN 端点（精简为 2 个最快端点）===
  const cdnKey = kgGetKey(hash, '')
  for (const [domain, cmd] of [['trackercdn.kugou.com', 25], ['tracker.kugou.com', 25]]) {
    promises.push((async () => {
      try {
        const res = await httpRequest(`https://${domain}/i/v2/?cmd=${cmd}&hash=${encodeURIComponent(hash)}&key=${cdnKey}&pid=1&behavior=play`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }, KG_TIMEOUT)
        const url = extractUrl(res)
        if (url) return { url, quality, apiName: `酷狗CDN(${domain})` }
        throw new Error('无URL')
      } catch (e) { throw e }
    })())
  }

  // === 并行竞速：所有策略同时发射，取第一个成功的 ===
  // 使用 Promise.any 语义的 polyfill（兼容 LX Music 环境）
  return new Promise((resolve, reject) => {
    let settled = false
    const errors = []
    let pending = promises.length

    if (pending === 0) {
      return reject(new Error('酷狗无可执行策略'))
    }

    promises.forEach((p, i) => {
      p.then(result => {
        if (settled) return
        // 通知 v5 策略 gateway 已完成（如果 gateway 先返回）
        if (resolveV5) { resolveV5(); resolveV5 = null }
        // gateway 策略返回 null，不算成功
        if (result === null) { pending--; if (pending <= 0 && !settled) { settled = true; reject(new Error(errors.join('; ') || '酷狗所有端点均失败')) } return }
        settled = true
        resolve(result)
      }).catch(err => {
        if (settled) return
        errors.push(err?.message || '失败')
        pending--
        if (pending <= 0 && !settled) {
          settled = true
          reject(new Error(errors.join('; ') || '酷狗所有端点均失败'))
        }
      })
    })
  })
}

async function reqTxDirect(songId, quality) {
  const guid = String(Math.floor(Math.random() * 10000000000))
  const res = await httpRequest(`${TX_DIRECT_API}?format=json&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(JSON.stringify({
    req_0: { module: "vkey.GetVkeyServer", method: "CgiGetVkey", param: { guid, songmid: [String(songId)], songtype: [0], uin: "0", loginflag: 1, platform: "20" } }
  }))}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://y.qq.com/' }
  }, TIMEOUT_FAST)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "QQ直连" }
  const midurlinfo = res.data?.req_0?.data?.midurlinfo?.[0]
  const sip = res.data?.req_0?.data?.sip?.[0]
  if (midurlinfo?.purl && sip && midurlinfo.purl) return { url: sip + midurlinfo.purl, quality, apiName: "QQ直连" }
  throw new Error("QQ直连无URL")
}

async function reqMgDirect(songId, quality) {
  const flac = quality === 'flac' ? '1' : '0'
  const res = await httpRequest(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/song/url?cid=${encodeURIComponent(String(songId))}&flac=${flac}&isRedirect=0`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.migu.cn/' }
  }, TIMEOUT_FAST)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "咪咕直连" }
  if (res.data?.url) return { url: res.data.url, quality, apiName: "咪咕直连" }
  if (res.data?.data?.url) return { url: res.data.data.url, quality, apiName: "咪咕直连" }
  throw new Error("咪咕直连无URL")
}

// ============================================================
// 喜马拉雅音频URL解密（getSoundCryptLink 算法）
// 逆向自 ximalaya.com 前端 webpack 模块
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
 * 自定义 Base64 解码
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
 * XOR 操作
 */
const xmXorBlock = (data, offset, key) => {
  const len = Math.min(data.length - offset, key.length)
  for (let i = 0; i < len; i++) data[offset + i] ^= key[i]
}

/**
 * 字节数组解码为 UTF-8 字符串
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
 * 喜马拉雅音频 URL 解密算法
 * 逆向自 ximalaya.com 前端 D.getSoundCryptLink
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
    console.warn('[xm decrypt] failed:', e.message)
    return link
  }
}

/**
 * 喜马拉雅直连API — 通过 mobile-playpage/track/v3/baseInfo 获取音频URL（新方案）
 * 喜马拉雅已废弃 revision/play/v1/audio，改用此接口并加密返回
 *
 * 参考:
 * - https://blog.csdn.net/weixin_43582101/article/details/128222064
 * - https://blog.csdn.net/yj2094632273/article/details/140407194
 */
async function reqXmDirect(songId, quality) {
  const ts = Date.now()
  const qualityLevel = quality === '128k' ? '1' : quality === '64k' ? '2' : '3'
  const url = `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${ts}?device=www2&trackId=${encodeURIComponent(String(songId))}&trackQualityLevel=${qualityLevel}`
  const res = await httpRequest(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://www.ximalaya.com/sound/${songId}`,
    }
  }, TIMEOUT_FAST)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "喜马拉雅直连" }

  const body = res.data
  if (!body || body.ret !== 0) throw new Error('喜马拉雅API错误: ' + (body?.msg || 'ret=' + body?.ret))
  if (!body.trackInfo?.playUrlList?.length) throw new Error('喜马拉雅无可用播放地址')

  // 遍历 playUrlList 解密
  for (const item of body.trackInfo.playUrlList) {
    if (item.url) {
      const decryptedUrl = getSoundCryptLink({ link: item.url, deviceType: 'www2' })
      if (decryptedUrl && decryptedUrl.startsWith('http')) {
        return { url: decryptedUrl, quality, apiName: '喜马拉雅直连' }
      }
    }
  }

  // 降级：尝试旧版 revision/play/v1/audio API
  const fallbackUrl = `https://www.ximalaya.com/revision/play/v1/audio?id=${encodeURIComponent(String(songId))}&ptype=1`
  const fallbackRes = await httpRequest(fallbackUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.ximalaya.com/',
    }
  }, TIMEOUT_FAST)
  if (fallbackRes.type === 'audio' || fallbackRes.type === 'url') return { url: fallbackRes.url, quality, apiName: "喜马拉雅直连" }
  const fbBody = fallbackRes.data
  if (fbBody?.ret === 200 && fbBody?.data?.src) return { url: fbBody.data.src, quality, apiName: '喜马拉雅直连' }

  throw new Error('喜马拉雅无可用播放地址')
}

// --- 阶段2：聚合API ---

async function reqXinghai(platform, songId, quality) {
  const source = PLATFORM_TO_XINGHAI[platform]
  if (!source) throw new Error("星海不支持")
  const br = QUALITY_TO_BR[quality] || "320"
  const res = await httpRequest(`${XINGHAI_MAIN_API}&types=url&source=${encodeURIComponent(source)}&id=${encodeURIComponent(songId)}&br=${br}`, {}, TIMEOUT_NORMAL)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "星海主站" }
  if (res.data?.url) return { url: res.data.url, quality, apiName: "星海主站" }
  throw new Error("星海主站无URL")
}

async function reqXinghaiBackup(platform, songId, quality) {
  const source = PLATFORM_TO_XINGHAI[platform]
  if (!source) throw new Error("星海备用不支持")
  const br = QUALITY_TO_BR[quality] || "320"
  const res = await httpRequest(`${XINGHAI_BACKUP_API}?types=url&source=${encodeURIComponent(source)}&id=${encodeURIComponent(songId)}&br=${br}`, {}, TIMEOUT_NORMAL)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "星海备用" }
  if (res.data?.url) return { url: res.data.url, quality, apiName: "星海备用" }
  throw new Error("星海备用无URL")
}

async function reqSuyin(platform, songId, quality) {
  if (platform !== 'tx') throw new Error("速音仅支持QQ")
  const br = QUALITY_TO_BR[quality] || "320"
  const res = await httpRequest(`${SUYIN_API}?key=${SUYIN_KEY}&id=${encodeURIComponent(songId)}&br=${br}`, {}, TIMEOUT_NORMAL)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: "速音" }
  if (res.data?.url) return { url: res.data.url, quality, apiName: "速音" }
  if (res.data?.data?.url) return { url: res.data.data.url, quality, apiName: "速音" }
  throw new Error("速音无URL")
}

async function reqHaitang(apiTemplate, platform, songId, quality) {
  const template = apiTemplate[platform]
  if (!template) throw new Error(`${apiTemplate.name}不支持`)
  const level = qualityToLevel(quality)
  const url = template.replace("{id}", encodeURIComponent(String(songId))).replace("{level}", encodeURIComponent(level))
  const res = await httpRequest(url, {}, TIMEOUT_NORMAL)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: apiTemplate.name }
  if (res.data?.code === 200 && res.data?.data?.url) {
    const u = res.data.data.url
    if (u) return { url: u.startsWith('//') ? 'https:' + u : u, quality, apiName: apiTemplate.name }
  }
  if (res.data?.url) {
    const u = res.data.url
    if (u) return { url: u.startsWith('//') ? 'https:' + u : u, quality, apiName: apiTemplate.name }
  }
  throw new Error(`${apiTemplate.name}无URL`)
}

// --- 阶段3：镜像API ---

async function reqMeting(apiConfig, platform, songId, quality) {
  const server = METING_SERVER_MAP[platform]
  if (!server) throw new Error(`${apiConfig.name}不支持`)
  const br = QUALITY_TO_BR[quality] || "320"
  const brParam = quality === 'flac' ? '999000' : br + '000'
  const base = apiConfig.base.replace(/\/+$/, '')
  const res = await httpRequest(`${base}?type=url&server=${server}&id=${encodeURIComponent(songId)}&br=${brParam}`, {}, TIMEOUT_SLOW)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: apiConfig.name }
  if (res.data?.url) return { url: res.data.url, quality, apiName: apiConfig.name }
  if (Array.isArray(res.data) && res.data[0]?.url) return { url: res.data[0].url, quality, apiName: apiConfig.name }
  throw new Error(`${apiConfig.name}无URL`)
}

async function reqNeteaseAPI(apiConfig, songId, quality) {
  const res = await httpRequest(`${apiConfig.base}/song/url/v1?id=${encodeURIComponent(songId)}&level=${qualityToLevel(quality)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' }
  }, TIMEOUT_SLOW)
  if (res.type === 'audio' || res.type === 'url') return { url: res.url, quality, apiName: apiConfig.name }
  if (res.data?.code === 200 && res.data?.data?.[0]?.url) return { url: res.data.data[0].url, quality, apiName: apiConfig.name }
  if (res.data?.url) return { url: res.data.url, quality, apiName: apiConfig.name }
  throw new Error(`${apiConfig.name}无URL`)
}

// ============================================================
// 主获取逻辑
// ============================================================

async function getUrlWithFallback(platform, songInfo, quality) {
  if (!platform || !PLATFORM_QUALITIES[platform]) throw new Error("无效平台")
  if (!songInfo || typeof songInfo !== "object") throw new Error("无效歌曲信息")

  const songId = getPlatformSongId(platform, songInfo)
  if (!songId) throw new Error("缺少歌曲ID")

  // 根据平台选择音质降级顺序
  const allQualities = platform === 'xm'
    ? ["128k", "64k", "32k"]
    : ["flac", "320k", "192k", "128k"]
  const requestedQuality = quality || "128k"
  const startIdx = allQualities.indexOf(requestedQuality)
  const qualitiesToTry = startIdx >= 0
    ? allQualities.slice(startIdx)
    : [requestedQuality, ...allQualities.filter(q => q !== requestedQuality)]

  if (DEV_ENABLE) {
    console.log("=== v3.8 极速版 ===")
    console.log("平台:", platform, "歌曲:", songInfo.name, "-", songInfo.singer, "ID:", songId)
  }

  let lastError = null
  for (let i = 0; i < qualitiesToTry.length; i++) {
    const currentQuality = qualitiesToTry[i]
    if (!PLATFORM_QUALITIES[platform].includes(currentQuality)) continue

    // 缓存检查
    const cached = getCachedUrl(platform, songInfo, currentQuality)
    if (cached) {
      if (DEV_ENABLE) console.log(`  缓存命中(${currentQuality})`)
      return cached
    }

    const isFirstQuality = (i === 0)
    const batchTimeout = isFirstQuality ? TOTAL_TIMEOUT : FALLBACK_TIMEOUT

    // === 构建三阶段请求 ===
    const stageGroups = []

    // 阶段1：直连API（最快，0ms发射）
    const stage1 = []
    if (platform === 'kw') stage1.push(reqKwDirect(songId, currentQuality))
    if (platform === 'kg') stage1.push(reqKgDirect(songId, currentQuality, songInfo))
    if (platform === 'tx') stage1.push(reqTxDirect(songId, currentQuality))
    if (platform === 'mg') stage1.push(reqMgDirect(songId, currentQuality))
    if (platform === 'xm') stage1.push(reqXmDirect(songId, currentQuality))
    if (stage1.length) stageGroups.push({ name: "直连API", promises: stage1 })

    // 阶段2：聚合API（80ms后发射）
    const stage2 = []
    if (PLATFORM_TO_XINGHAI[platform]) {
      stage2.push(reqXinghai(platform, songId, currentQuality))
      stage2.push(reqXinghaiBackup(platform, songId, currentQuality))
    }
    if (platform === 'tx') stage2.push(reqSuyin(platform, songId, currentQuality))
    for (const ht of HAITANG_API_TEMPLATES) {
      stage2.push(reqHaitang(ht, platform, songId, currentQuality))
    }
    if (stage2.length) stageGroups.push({ name: "聚合API", promises: stage2 })

    // 阶段3：镜像API（160ms后发射）
    const stage3 = []
    for (const meting of METING_APIS) {
      stage3.push(reqMeting(meting, platform, songId, currentQuality))
    }
    if (platform === 'wy') {
      for (const api of NETEASE_API_INSTANCES) {
        stage3.push(reqNeteaseAPI(api, songId, currentQuality))
      }
    }
    if (stage3.length) stageGroups.push({ name: "镜像API", promises: stage3 })

    const totalCount = stageGroups.reduce((s, g) => s + g.promises.length, 0)
    if (DEV_ENABLE) console.log(`  尝试 ${currentQuality}，${stageGroups.length}阶段共${totalCount}个请求`)

    try {
      const result = await stagedRace(stageGroups, currentQuality, batchTimeout)
      setCachedUrl(platform, songInfo, result.quality, result.url)

      if (DEV_ENABLE) {
        console.log(`  获取到: ${result.apiName}(${result.quality}) 精确:${result.isExactMatch}`)
        if (result.quality !== requestedQuality) {
          console.log(`  注意: 请求${requestedQuality}，实际${result.quality}（自动降级）`)
        }
      }

      return result.url
    } catch (err) {
      lastError = err
      if (DEV_ENABLE) console.log(`  ${currentQuality} 失败:`, err.message)
    }
  }

  throw lastError || new Error("所有音质获取失败")
}

// ============================================================
// 注册音源
// ============================================================

const sourceConfig = {}
const PLATFORM_NAMES = {
  wy: "网易云音乐", tx: "QQ音乐", kw: "酷我音乐", kg: "酷狗音乐", mg: "咪咕音乐", xm: "喜马拉雅"
}
Object.keys(PLATFORM_QUALITIES).forEach(platform => {
  sourceConfig[platform] = {
    name: PLATFORM_NAMES[platform],
    type: "music",
    actions: ["musicUrl"],
    qualitys: PLATFORM_QUALITIES[platform]
  }
})

on(EVENT_NAMES.request, ({ action, source, info }) => {
  if (action !== "musicUrl") return Promise.reject(new Error("不支持"))
  if (!info?.musicInfo) return Promise.reject(new Error("参数不完整"))
  return getUrlWithFallback(source, info.musicInfo, info.type || "128k")
})

send(EVENT_NAMES.inited, {
  status: true,
  openDevTools: DEV_ENABLE,
  sources: sourceConfig
})