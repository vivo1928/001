const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')

const stub = {
  setting: { 'player.togglePlayMethod': 'random' },
  playerState: {
    playInfo: { playerListId: 'list1', playerPlayIndex: 0 },
    playedList: [],
    playMusicInfo: { musicInfo: null, listId: null, isTempPlay: false },
    tempPlayList: [],
  },
  list: [],
  drawCount: 0,
}

const buildModule = () => loadModule('src/core/player/randomQueue.ts', {
  '@/store/setting/state': { setting: stub.setting },
  '@/store/player/state': stub.playerState,
  '@/utils/common': { getRandom: (min, max) => min + (stub.drawCount++ % (max - min)) },
  '@/utils/listManage': { getListMusicSync: () => stub.list },
  './utils': {
    filterList: async({ list, playedList }) => ({
      filteredList: list.filter(m => !playedList.some(p => p.musicInfo.id == m.id)),
      playerIndex: 0,
    }),
  },
})

const makeList = (n, prefix = 's') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, source: 'kg', name: `n${i}`, singer: 'x' }))
const ids = (q) => q.map(item => item.musicInfo.id)

const reset = () => {
  stub.list = makeList(5)
  stub.playerState.playInfo = { playerListId: 'list1', playerPlayIndex: 0 }
  stub.playerState.playedList = []
  stub.setting['player.togglePlayMethod'] = 'random'
  stub.drawCount = 0
}

test('预抽队列：无放回抽取且多次取序列稳定（peek 不消费）', async() => {
  reset()
  const mod = buildModule()
  const first = await mod.getRandomQueue(3)
  const second = await mod.getRandomQueue(3)
  assert.strictEqual(first.length, 3)
  assert.strictEqual(new Set(ids(first)).size, 3)
  assert.deepStrictEqual(ids(first), ids(second))
})

test('shift 消费队头后自动补抽尾部，前后不重复', async() => {
  reset()
  const mod = buildModule()
  const head = await mod.shiftRandomQueue()
  assert.ok(head)
  // 真实流程消费即入播放历史（handlePlay → addPlayedList），队列不得再抽到它
  stub.playerState.playedList.push(head)
  const rest = await mod.getRandomQueue(3)
  assert.strictEqual(rest.length, 3)
  assert.ok(!ids(rest).includes(head.musicInfo.id))
  const again = await mod.shiftRandomQueue()
  assert.strictEqual(again?.musicInfo.id, rest[0].musicInfo.id)
})

test('失效条目剔除：被点播或移出列表的不再作为未来随机结果', async() => {
  reset()
  const mod = buildModule()
  const seq = await mod.getRandomQueue(3)
  const played = seq[1]
  stub.playerState.playedList.push(played)
  const next = await mod.getRandomQueue(3)
  assert.ok(!ids(next).includes(played.musicInfo.id))
  assert.strictEqual(next.length, 3)

  const removed = next[0]
  stub.list = stub.list.filter(m => m.id != removed.musicInfo.id)
  const next2 = await mod.getRandomQueue(3)
  assert.ok(!ids(next2).includes(removed.musicInfo.id))
})

test('换列表或切出随机模式即作废队列', async() => {
  reset()
  const mod = buildModule()
  await mod.getRandomQueue(3)
  stub.setting['player.togglePlayMethod'] = 'listLoop'
  assert.deepStrictEqual(await mod.getRandomQueue(3), [])
  stub.setting['player.togglePlayMethod'] = 'random'
  stub.playerState.playInfo.playerListId = 'list2'
  stub.list = makeList(3, 'x')
  stub.drawCount = 0
  const fresh = ids(await mod.getRandomQueue(3))
  assert.strictEqual(fresh.length, 3)
  assert.deepStrictEqual([...fresh].sort(), ['x0', 'x1', 'x2'])
})

test('池内歌曲全部进入队列后停止补抽', async() => {
  reset()
  stub.list = makeList(3)
  const mod = buildModule()
  const q = await mod.getRandomQueue(10)
  assert.strictEqual(q.length, 3)
  assert.strictEqual(new Set(ids(q)).size, 3)
})

test('resetRandomQueue 清空预测序列', async() => {
  reset()
  const mod = buildModule()
  await mod.getRandomQueue(3)
  mod.resetRandomQueue()
  stub.drawCount = 0
  const head = await mod.shiftRandomQueue()
  assert.strictEqual(head?.musicInfo.id, 's0')
})
