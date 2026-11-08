const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')
const { indexMock, singerUtilsMock } = require('./helpers/mocks')

const searchMod = loadModule('src/utils/musicSdk/kw/musicSearch.js', {
  '../../request': { httpFetch: () => { throw new Error('httpFetch 不应被调用（测试中 musicSearch 已替换）') } },
  '../../index': indexMock,
  './util': { formatSinger: singerUtilsMock.formatSingerName },
}).default

const validItem = {
  MUSICRID: 'MUSIC_123',
  SONGNAME: '歌曲A',
  ARTIST: '歌手A',
  ALBUM: '专辑A',
  ALBUMID: '4027807',
  DURATION: '200',
  N_MINFO: 'level:standard,bitrate:320,format:mp3,size:1.5MB;',
}
const makeRaw = (abslist, TOTAL = '10', SHOW = '5') => ({ body: { TOTAL, SHOW, abslist } })

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
    await assert.rejects(() => searchMod.search('q', 1, 30), /try max num/)
    assert.strictEqual(calls, 3, `应尝试 3 次（++retryNum > 3），实际 ${calls}`)
  })
})

test('API 结果无效触发的重试同样有限收敛，不会子树循环', async() => {
  let calls = 0
  await withStubbedSearch(() => {
    calls++
    return Promise.resolve({ body: { TOTAL: '5', SHOW: '0' } })
  }, async() => {
    await assert.rejects(() => searchMod.search('q', 1, 30), /try max num/)
    assert.strictEqual(calls, 3, `应尝试 3 次，实际 ${calls}`)
  })
})

test('响应体缺失时重试后 reject，而非抛 TypeError', async() => {
  let calls = 0
  await withStubbedSearch(() => {
    calls++
    return Promise.resolve(undefined)
  }, async() => {
    await assert.rejects(() => searchMod.search('q', 1, 30), /try max num/)
    assert.strictEqual(calls, 3)
  })
})

test('重试成功后返回格式化结果', async() => {
  let calls = 0
  await withStubbedSearch(() => {
    calls++
    return calls == 1 ? Promise.reject(new Error('flaky')) : Promise.resolve(makeRaw([validItem]))
  }, async() => {
    const result = await searchMod.search('q', 1, 30)
    assert.strictEqual(calls, 2)
    assert.strictEqual(result.source, 'kw')
    assert.strictEqual(result.list.length, 1)
    assert.strictEqual(result.list[0].songmid, '123')
    assert.strictEqual(result.limit, 30)
    assert.strictEqual(result.total, 10)
    assert.strictEqual(result.allPage, 1)
  })
})

test('空结果正常返回空列表', async() => {
  await withStubbedSearch(() => Promise.resolve(makeRaw([], '0', '0')), async() => {
    const result = await searchMod.search('q', 1, 30)
    assert.deepStrictEqual(result.list, [])
    assert.strictEqual(result.total, 0)
  })
})
