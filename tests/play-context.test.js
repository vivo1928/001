const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')

const stub = {
  tempList: null,
  tempListId: null,
  played: null,
  added: null,
  defaultList: [],
}

const buildModule = () => loadModule('src/components/OnlineList/listAction.ts', {
  '@/config/constant': { LIST_IDS: { DEFAULT: 'default', LOVE: 'love', TEMP: 'temp', DOWNLOAD: 'download' } },
  '@/core/list': {
    addListMusics: async(listId, list) => { stub.added = { listId, list } },
    setTempList: async(id, list) => { stub.tempListId = id; stub.tempList = list },
  },
  '@/core/player/player': {
    playList: async(listId, index) => { stub.played = { listId, index } },
    playNext: async() => {},
  },
  '@/core/player/tempPlayList': { addTempPlayList: () => {} },
  '@/store/setting/state': { setting: { 'list.addMusicLocationType': 'top', 'list.isAddMusicToTemp': false } },
  '@/utils/listManage': { getListMusicSync: () => stub.defaultList },
  '@/utils/tools': { confirmDialog: () => Promise.resolve(true), openUrl: () => {}, shareMusic: () => {}, toast: () => {} },
  '@/core/dislikeList': { addDislikeInfo: () => {}, hasDislike: () => false },
  '@/store/player/state': { playMusicInfo: { musicInfo: null } },
  '@/utils/musicSdk': { default: {} },
  '@/utils': { toOldMusicInfo: (m) => m },
  '@/utils/data': { clearMusicUrlByMusic: () => {} },
})

const makeList = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, source: 'kg', name: `n${i}`, singer: 'x' }))

const reset = () => {
  stub.tempList = null
  stub.tempListId = null
  stub.played = null
  stub.added = null
  stub.defaultList = []
}

test('带列表上下文点播：整段装载临时列表并按索引播放', async() => {
  reset()
  const list = makeList(3)
  const mod = buildModule()
  mod.handlePlay(list[1], list, 1)
  await new Promise(resolve => setImmediate(resolve))
  assert.strictEqual(stub.tempListId, 'online__kg_m0')
  assert.deepStrictEqual(stub.tempList, list)
  assert.deepStrictEqual(stub.played, { listId: 'temp', index: 1 })
  assert.strictEqual(stub.added, null)
})

test('带列表上下文未传索引：按 id 定位起点', async() => {
  reset()
  const list = makeList(3)
  const mod = buildModule()
  mod.handlePlay(list[2], list)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepStrictEqual(stub.played, { listId: 'temp', index: 2 })
})

test('无上下文单曲点播：保持插队默认列表行为', async() => {
  reset()
  const list = makeList(3)
  stub.defaultList = [list[0]]
  const mod = buildModule()
  mod.handlePlay(list[0])
  await new Promise(resolve => setImmediate(resolve))
  assert.deepStrictEqual(stub.added, { listId: 'default', list: [list[0]] })
  assert.deepStrictEqual(stub.played, { listId: 'default', index: 0 })
  assert.strictEqual(stub.tempList, null)
})
