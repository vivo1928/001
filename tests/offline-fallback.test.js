const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')

// 可控桩：模拟解析失败/成功
const stub = {
  resolveImpl: null, // () => Promise<{url, quality}> 或抛错
  isCachedImpl: async() => false,
  savedUrls: [],
  savedMetas: [], // getMusicUrlMetas 返回
  meta: { url: '', ts: 0, expired: true },
}

const buildModule = () => loadModule('src/core/music/online.ts', {
  '@/utils/data': {
    saveLyric: async() => {},
    saveMusicUrl: async(m, q, u) => { stub.savedUrls.push({ q, u }) },
    getMusicUrl: async() => '',
    getMusicUrlMeta: async() => stub.meta,
    getMusicUrlMetas: async() => stub.savedMetas,
    getPlayCacheKey: (m, q) => `lx:${m.source}:${q}:${m.id}`,
    allQualityNames: ['128k', '320k', 'flac'],
  },
  '@/core/list': { updateListMusics: async() => {} },
  '@/store/setting/state': { setting: { 'player.playQuality': '320k' } },
  '@/utils/message': {
    isOfflineError: (err) => {
      const msg = err instanceof Error ? err.message : String(err ?? '')
      return msg === '请求超时' || msg === '无法连接到服务器' || /network request failed|offline/i.test(msg)
    },
  },
  'react-native-track-player': { isCached: async(key) => stub.isCachedImpl(key) },
  './utils': {
    buildLyricInfo: () => ({}),
    getPlayQuality: () => '320k',
    handleGetOnlineLyricInfo: async() => ({}),
    handleGetOnlineMusicUrl: async() => stub.resolveImpl(),
    handleGetOnlinePicUrl: async() => ({ url: '', musicInfo: {}, isFromCache: false }),
    getCachedLyricInfo: () => null,
  },
  './audioMode': { applyAudioModeForQuality: async() => {} },
})

const musicInfo = { id: 'song1', source: 'kg', name: 'N', singer: 'S' }
global.lx = { qualityList: { kg: ['128k', '320k', 'flac'] } }
global.i18n = { t: (k) => k }

test('A1: 非离线中文错误（获取链接失败）在播放场景也走缓存兜底', async() => {
  stub.resolveImpl = () => Promise.reject(new Error('获取链接失败'))
  stub.savedMetas = [{ quality: '320k', url: 'https://old.example/a.mp3', ts: 0, expired: true }]
  stub.isCachedImpl = async(key) => key == 'lx:kg:320k:song1'
  global.i18n = { t: (k) => k }
  const mod = buildModule().getMusicUrl
  const result = await mod({ musicInfo, isRefresh: false, forPlayback: true })
  assert.strictEqual(result.url, 'https://old.example/a.mp3')
  assert.strictEqual(result.cacheKey, 'lx:kg:320k:song1')
})

test('A2: isRefresh 失败后同样允许兜底（断网刷新重试不再是死结）', async() => {
  stub.resolveImpl = () => Promise.reject(new Error('network request failed'))
  stub.savedMetas = [{ quality: 'flac', url: 'https://old.example/b.flac', ts: 0, expired: true }]
  stub.isCachedImpl = async(key) => key == 'lx:kg:flac:song1'
  const mod = buildModule().getMusicUrl
  const result = await mod({ musicInfo, isRefresh: true, forPlayback: true })
  assert.strictEqual(result.url, 'https://old.example/b.flac')
  assert.strictEqual(result.cacheKey, 'lx:kg:flac:song1')
})

test('A4: URL 记录全部丢失时用占位 URL + 推导 cacheKey 兜底', async() => {
  stub.resolveImpl = () => Promise.reject(new Error('获取链接失败'))
  stub.savedMetas = []
  stub.isCachedImpl = async(key) => key == 'lx:kg:128k:song1'
  const mod = buildModule().getMusicUrl
  const result = await mod({ musicInfo, isRefresh: false, forPlayback: true })
  assert.ok(result.url.includes('lx-cache-hit.invalid'), `占位 URL 异常: ${result.url}`)
  assert.strictEqual(result.cacheKey, 'lx:kg:128k:song1')
})

test('A1 边界: 非播放场景且非离线错误保持原有失败语义', async() => {
  stub.resolveImpl = () => Promise.reject(new Error('获取链接失败'))
  stub.savedMetas = [{ quality: '320k', url: 'https://old.example/a.mp3', ts: 0, expired: true }]
  stub.isCachedImpl = async() => true
  const mod = buildModule().getMusicUrl
  await assert.rejects(() => mod({ musicInfo, isRefresh: false, forPlayback: false }), /获取链接失败/)
})

test('A5: 离线且无任何缓存时抛友好提示', async() => {
  stub.resolveImpl = () => Promise.reject(new Error('network request failed'))
  stub.savedMetas = []
  stub.isCachedImpl = async() => false
  const mod = buildModule().getMusicUrl
  await assert.rejects(() => mod({ musicInfo, isRefresh: false, forPlayback: true }), /player__offline_no_cache/)
})

test('新鲜链接直接返回，不触发兜底与网络解析', async() => {
  stub.resolveImpl = () => { throw new Error('不应被调用') }
  stub.meta = { url: 'https://fresh.example/f.mp3', ts: Date.now(), expired: false }
  const mod = buildModule().getMusicUrl
  const result = await mod({ musicInfo, isRefresh: false, forPlayback: true })
  assert.strictEqual(result.url, 'https://fresh.example/f.mp3')
  assert.strictEqual(result.cacheKey, 'lx:kg:320k:song1')
  stub.meta = { url: '', ts: 0, expired: true }
})
