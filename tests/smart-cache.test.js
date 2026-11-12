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
  randomQueue: [],
  cachedKeys: new Set(),
  resolveImpl: async(musicInfo) => ({ url: `https://cdn.example/${musicInfo.id}.mp3`, cacheKey: `lx:kg:320k:${musicInfo.id}` }),
  prefetched: [],
  cancelled: 0,
}

const buildModule = () => loadModule('src/core/cache/smartCache.ts', {
  react: {},
  'react-native': {
    NativeModules: {
      TrackPlayerModule: {
        prefetchToCache: async(url, cacheKey) => { stub.prefetched.push({ url, cacheKey }); return true },
        cancelPrefetch: async() => { stub.cancelled++ },
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
  '@/core/player/randomQueue': { getRandomQueue: async(count) => stub.randomQueue.slice(0, count) },
  '@/utils/listManage': { getListMusicSync: () => stub.list },
  '@/store/setting/state': { setting: stub.setting },
  '@/store/player/state': stub.playerState,
})

const makeList = (n, prefix = 's') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, source: 'kg', name: `n${i}`, singer: 'x' }))

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

test('random：沿预抽队列预取，与实播同序且不做列表顺序盲补', async() => {
  stub.list = makeList(5)
  stub.playerState.playInfo.playerPlayIndex = 0
  stub.randomQueue = [
    { musicInfo: { id: 'r1', source: 'kg' }, listId: 'list1', isTempPlay: false },
    { musicInfo: { id: 'r2', source: 'kg' }, listId: 'list1', isTempPlay: false },
    { musicInfo: { id: 'r3', source: 'kg' }, listId: 'list1', isTempPlay: false },
  ]
  stub.setting['player.togglePlayMethod'] = 'random'
  const mod = buildModule()
  const result = await mod.getUpcomingPlayMusicInfos(10)
  assert.deepStrictEqual(result.map(item => item.musicInfo.id), ['r1', 'r2', 'r3'])
  stub.setting['player.togglePlayMethod'] = 'listLoop'
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

test('窗口维护：已缓存跳过、占位链接不预取、正常歌预取', async() => {
  stub.list = makeList(3)
  stub.playerState.playInfo.playerPlayIndex = 0
  stub.setting['player.cacheAheadCount'] = 2
  stub.prefetched = []
  // s1 正常预取；s2 解析返回占位链接 → 不预取
  stub.cachedKeys = new Set()
  stub.resolveImpl = async(musicInfo) => musicInfo.id == 's2'
    ? { url: 'https://lx-cache-hit.invalid/s2', cacheKey: 'lx:kg:320k:s2' }
    : { url: `https://cdn.example/${musicInfo.id}.mp3`, cacheKey: `lx:kg:320k:${musicInfo.id}` }
  const mod = buildModule()
  await mod.runWindow()
  assert.deepStrictEqual(stub.prefetched, [{ url: 'https://cdn.example/s1.mp3', cacheKey: 'lx:kg:320k:s1' }])
})

test('滑动窗口：切一首只补新进窗口的一首', async() => {
  stub.list = makeList(6)
  stub.setting['player.cacheAheadCount'] = 3
  stub.setting['player.togglePlayMethod'] = 'listLoop'
  stub.prefetched = []
  stub.cachedKeys = new Set()
  stub.resolveImpl = async(musicInfo) => ({ url: `https://cdn.example/${musicInfo.id}.mp3`, cacheKey: `lx:kg:320k:${musicInfo.id}` })
  const mod = buildModule()

  // 第一轮：窗口 [s1, s2, s3] 全部未缓存 → 都预取
  stub.playerState.playInfo.playerPlayIndex = 0
  await mod.runWindow()
  assert.deepStrictEqual(stub.prefetched.map(p => p.cacheKey), ['lx:kg:320k:s1', 'lx:kg:320k:s2', 'lx:kg:320k:s3'])

  // 模拟切歌到 s1：窗口变为 [s2, s3, s4]，前三首已在缓存 → 只补 s4
  stub.prefetched = []
  stub.cachedKeys = new Set(['lx:kg:320k:s1', 'lx:kg:320k:s2', 'lx:kg:320k:s3'])
  stub.playerState.playMusicInfo.musicInfo = { id: 's1', source: 'kg' }
  stub.playerState.playInfo.playerPlayIndex = 1
  await mod.runWindow()
  assert.deepStrictEqual(stub.prefetched.map(p => p.cacheKey), ['lx:kg:320k:s4'])
})

test('当前曲补全：已缓存跳过，未缓存补全', async() => {
  stub.list = makeList(3)
  stub.prefetched = []
  stub.playerState.playMusicInfo.musicInfo = { id: 'cur', source: 'kg' }
  stub.cachedKeys = new Set(['lx:kg:320k:cur'])
  const mod = buildModule()
  await mod.runCurrentFill()
  assert.deepStrictEqual(stub.prefetched, [])

  stub.cachedKeys = new Set()
  stub.playerState.playMusicInfo.musicInfo = { id: 's0', source: 'kg' }
  await mod.runCurrentFill()
  assert.deepStrictEqual(stub.prefetched.map(p => p.cacheKey), ['lx:kg:320k:s0'])
})

test('invalidatePrefetch：作废流水线并取消原生在途任务', async() => {
  stub.cancelled = 0
  const mod = buildModule()
  mod.invalidatePrefetch()
  assert.strictEqual(stub.cancelled, 1)
})

test('下载条目与本地源不进入预缓存', async() => {
  stub.list = [
    { id: 'd0', source: 'kg', name: 'd0', singer: 'x', progress: 1, metadata: {} },
    { id: 'l0', source: 'local', name: 'l0', singer: 'x' },
    { id: 's0', source: 'kg', name: 's0', singer: 'x' },
  ]
  stub.playerState.playMusicInfo.musicInfo = { id: 'cur', source: 'kg' }
  stub.playerState.playInfo.playerPlayIndex = 0
  stub.setting['player.cacheAheadCount'] = 10
  stub.setting['player.togglePlayMethod'] = 'listLoop'
  stub.prefetched = []
  stub.cachedKeys = new Set()
  stub.resolveImpl = async(musicInfo) => ({ url: `https://cdn.example/${musicInfo.id}.mp3`, cacheKey: `lx:${musicInfo.source}:320k:${musicInfo.id}` })
  const mod = buildModule()
  await mod.runWindow()
  assert.deepStrictEqual(stub.prefetched.map(p => p.cacheKey), ['lx:kg:320k:s0'])
})

test('导入面回归：smartCache 具名导入与真实模块导出一致（防测试桩掩盖导出漂移）', () => {
  const fs = require('fs')
  const path = require('path')
  const root = path.join(__dirname, '..')
  const src = fs.readFileSync(path.join(root, 'src/core/cache/smartCache.ts'), 'utf8')
  const importRe = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'([^']+)'/g
  const resolveSrc = (spec) => {
    const rel = spec.replace('@/', 'src/')
    for (const suffix of ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js']) {
      const p = path.join(root, rel + suffix)
      if (fs.existsSync(p)) return p
    }
    return null
  }
  let checked = 0
  for (const m of src.matchAll(importRe)) {
    const [, names, spec] = m
    if (!spec.startsWith('@/')) continue
    const file = resolveSrc(spec)
    assert.ok(file, `无法解析导入源: ${spec}`)
    const text = fs.readFileSync(file, 'utf8')
    for (const raw of names.split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
      if (!name) continue
      checked++
      const exported = new RegExp(`export\\s+(?:const|let|var|function|async function|class|interface|type|enum)\\s+${name}\\b`).test(text) ||
        new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(text)
      assert.ok(exported, `真实模块未导出 ${name}（来自 ${spec}，smartCache.ts 导入了它）`)
    }
  }
  assert.ok(checked > 0, '未解析到任何具名导入')
})
