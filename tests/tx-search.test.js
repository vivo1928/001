const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')
const { indexMock, singerUtilsMock } = require('./helpers/mocks')

const searchMod = loadModule('src/utils/musicSdk/tx/musicSearch.js', {
  '../../index': indexMock,
  '../utils': singerUtilsMock,
  './utils': { signRequest: () => Promise.reject(new Error('signRequest 不应被调用（测试中 musicSearch 已替换）')) },
}).default

const makeRawResponse = (list, sum) => ({ body: { song: { list } }, meta: { sum } })
const validItem = {
  file: { media_mid: 'm1', size_128mp3: 1000, size_320mp3: 0, size_flac: 0, size_hires: 0 },
  mid: 'mid1',
  title: '歌曲A',
  singer: [{ name: '歌手A', mid: 's1' }],
  album: { name: '专辑A', mid: 'a1' },
  interval: 200,
  id: 1,
}

const withStubbedSearch = (impl, fn) => {
  const original = searchMod.musicSearch
  searchMod.musicSearch = impl
  return fn().finally(() => { searchMod.musicSearch = original })
}

test('musicSearch 连续失败时有限重试后 reject，不出现无限循环', async() => {
  let calls = 0
  await withStubbedSearch(() => {
    calls++
    return Promise.reject(new Error('network down'))
  }, async() => {
    await assert.rejects(() => searchMod.search('kw', 1, 30), /try max num/)
    assert.strictEqual(calls, 6, `应尝试 6 次（retryNum 0-5），实际 ${calls}`)
  })
})

test('重试成功后返回格式化结果（回归：重试链不再被二次解构）', async() => {
  let calls = 0
  await withStubbedSearch(() => {
    calls++
    return calls == 1 ? Promise.reject(new Error('flaky')) : Promise.resolve(makeRawResponse([validItem], 10))
  }, async() => {
    const result = await searchMod.search('kw', 1, 30)
    assert.strictEqual(calls, 2)
    assert.strictEqual(result.source, 'tx')
    assert.strictEqual(result.list.length, 1)
    assert.strictEqual(result.total, 10)
    assert.strictEqual(result.limit, 30)
  })
})

test('body 缺失时返回空结果而非抛错', async() => {
  await withStubbedSearch(() => Promise.resolve({}), async() => {
    const result = await searchMod.search('kw', 1, 30)
    assert.deepStrictEqual(result.list, [])
    assert.strictEqual(result.total, 0)
    assert.strictEqual(result.source, 'tx')
  })
})

test('常规成功响应返回正确格式', async() => {
  await withStubbedSearch(() => Promise.resolve(makeRawResponse([validItem, { ...validItem, mid: 'mid2' }], 2)), async() => {
    const result = await searchMod.search('kw', 1, 50)
    assert.strictEqual(result.list.length, 2)
    assert.strictEqual(result.limit, 50)
    assert.strictEqual(result.allPage, 1)
  })
})
