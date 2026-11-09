const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')

const stub = {
  setting: {
    'player.togglePlayMethod': 'listLoop',
    'player.isSmartCache': true,
    'player.cacheAheadCount': 10,
    'player.playQuality': '320k',
  },
  playerState: {
    playMusicInfo: { musicInfo: { id: 'cur', source: 'kg' }, listId: 'list1', isTempPlay: false },
    playInfo: { playerListId: 'list1', playIndex: 0, playerPlayIndex: 0 },
    tempPlayList: [],
  },
  list: [],
  nextInfo: null,
  cachedKeys: new Set(),
  resolveImpl: async(musicInfo) => ({ url: `https://cdn.example/${musicInfo.id}.mp3`, cacheKey: `lx:kg:320k:${musicInfo.id}` }),
  prefetched: [],
}

const buildModule = () => loadModule('src/core/cache/smartCache.ts', {
  react: {},
  'react-native': {
    NativeModules: {
      TrackPlayerModule: {
        prefetchToCache: async(url, cacheKey) => { stub.prefetched.push({ url, cacheKey }); return true },
        cancelPrefetch: async() => { stub.prefetched.push({ cancelled: true }) },
      },
    },
  },
  'react-native-background-timer': {
    setTimeout: (fn) => { stub.timerFn = fn; return 1 },
    clearTimeout: () => { stub.timerFn = null },
  },
  '@/core/music': { getMusicUrl: async({ musicInfo }) => stub.resolveImpl(musicInfo) },
  '@/utils/data': { getPlayCacheKey: (m, q) => `lx:${m.source}:${q}:${m.id}` },
  '@/core/music/utils': { getPlayQuality: () => '320k' },
  '@/plugins/player/utils': { isCached: async(key) => stub.cachedKeys.has(key) },
  '@/core/player/player': { getNextPlayMusicInfo: async() => stub.nextInfo },
  '@/core/list': { getList: () => stub.list },
  '@/store/setting/state': { setting: stub.setting },
  '@/store/player/state': stub.playerState,
})

const makeList = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, source: 'kg', name: `n${i}`, singer: 'x' }))

test('listLoop：按播放顺序向后取 N 首并循环回绕', async() => {
  stub.list = makeList(5)
  stub.playerState.playInfo.playerPlayIndex = 3
  stub.setting['player.togglePlayMethod'] = 'listLoop'
  const mod = buildModule()
  const result = await mod.getUpcomingPlayMusicInfos(3)
  assert.deepStrictEqual(result.map(item => item.musicInfo.id), ['s4', 's0', 's1'])
})

test('list：到列表末尾即止，不回绕', async() => {
  stub.list = makeList(5)
  stub.playerState.playInfo.playerPlayIndex = 3
  stub.setting['player.togglePlayMethod'] = 'list'
  const mod = buildModule()
  const result = await mod.getUpcomingPlayMusicInfos(3)
  assert.deepStrictEqual(result.map(item => item.musicInfo.id), ['s4'])
})

test('random：只预取确定性的下一首预测', async() => {
  stub.list = makeList(5)
  stub.nextInfo = { musicInfo: { id: 'r1', source: 'kg' }, listId: 'list1', isTempPlay: false }
  stub.setting['player.togglePlayMethod'] = 'random'
  const mod = buildModule()
  const result = await mod.getUpcomingPlayMusicInfos(10)
  assert.deepStrictEqual(result.map(item => item.musicInfo.id), ['r1'])
})

test('稍后播放优先且与当前曲去重', async() => {
  stub.list = makeList(3)
  stub.playerState.tempPlayList = [
    { musicInfo: { id: 't1', source: 'kg' }, listId: 'temp', isTempPlay: true },
    { musicInfo: { id: 'cur', source: 'kg' }, listId: 'temp', isTempPlay: true },
    { musicInfo: { id: 't2', source: 'kg' }, listId: 'temp', isTempPlay: true },
  ]
  stub.setting['player.togglePlayMethod'] = 'listLoop'
  const mod = buildModule()
  const result = await mod.getUpcomingPlayMusicInfos(2)
  assert.deepStrictEqual(result.map(item => item.musicInfo.id), ['t1', 't2'])
  stub.playerState.tempPlayList = []
})

test('singleLoop 与 count=0 不预取列表歌曲', async() => {
  stub.list = makeList(5)
  stub.setting['player.togglePlayMethod'] = 'singleLoop'
  const mod = buildModule()
  assert.deepStrictEqual(await mod.getUpcomingPlayMusicInfos(10), [])
  stub.setting['player.togglePlayMethod'] = 'listLoop'
  assert.deepStrictEqual(await mod.getUpcomingPlayMusicInfos(0), [])
})

test('runSmartCache：已缓存跳过、占位链接不预取、正常歌依次预取', async() => {
  stub.list = makeList(3)
  stub.playerState.playInfo.playerPlayIndex = 0
  stub.setting['player.cacheAheadCount'] = 2
  stub.prefetched = []
  // 当前曲已完整缓存 → 跳过；s1 正常预取；s2 解析返回占位链接 → 不预取
  stub.cachedKeys = new Set(['lx:kg:320k:cur'])
  stub.resolveImpl = async(musicInfo) => musicInfo.id == 's2'
    ? { url: 'https://lx-cache-hit.invalid/s2', cacheKey: 'lx:kg:320k:s2' }
    : { url: `https://cdn.example/${musicInfo.id}.mp3`, cacheKey: `lx:kg:320k:${musicInfo.id}` }
  const mod = buildModule()
  await mod.runSmartCache()
  assert.deepStrictEqual(stub.prefetched, [{ url: 'https://cdn.example/s1.mp3', cacheKey: 'lx:kg:320k:s1' }])
})
