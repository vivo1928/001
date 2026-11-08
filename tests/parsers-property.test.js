const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')
const { indexMock, singerUtilsMock } = require('./helpers/mocks')

const kg = loadModule('src/utils/musicSdk/kg/musicSearch.js', {
  '../../request': { httpFetch: () => { throw new Error('不应联网') } },
  '../../index': indexMock,
  '../utils': singerUtilsMock,
}).default
const wy = loadModule('src/utils/musicSdk/wy/musicSearch.js', {
  '../../index': indexMock,
  './utils/index': { eapiRequest: () => { throw new Error('不应联网') } },
}).default
const kw = loadModule('src/utils/musicSdk/kw/musicSearch.js', {
  '../../request': { httpFetch: () => { throw new Error('不应联网') } },
  '../../index': indexMock,
  './util': { formatSinger: singerUtilsMock.formatSingerName },
}).default
const tx = loadModule('src/utils/musicSdk/tx/musicSearch.js', {
  '../../index': indexMock,
  '../utils': singerUtilsMock,
  './utils': { signRequest: () => { throw new Error('不应联网') } },
}).default

// 对 baseItem 生成"字段缺失"变体：按位掩码遍历字段子集
const missingFieldCases = (baseItem, fields) => {
  const cases = []
  for (let mask = 0; mask < (1 << fields.length); mask++) {
    const item = JSON.parse(JSON.stringify(baseItem))
    fields.forEach((path, i) => {
      if (mask & (1 << i)) {
        const parts = path.split('.')
        let obj = item
        for (const p of parts.slice(0, -1)) obj = obj?.[p]
        if (obj) delete obj[parts[parts.length - 1]]
      }
    })
    cases.push(item)
  }
  return cases
}

const assertNoThrowArray = (mod, cases, label) => {
  for (const item of cases) {
    let result
    assert.doesNotThrow(() => {
      result = mod.handleResult([item])
    }, `${label} 缺字段抛异常: ${JSON.stringify(item).slice(0, 120)}`)
    assert.ok(Array.isArray(result), `${label} 未返回数组`)
  }
}

test('属性：kg.handleResult 对任意缺字段条目返回数组且不抛异常', () => {
  const base = {
    Audioid: '1', FileHash: 'h1', Singers: [{ name: 'S' }], OriSongName: 'N', Suffix: '',
    AlbumName: 'A', AlbumID: '2', Duration: 200,
    FileSize: 1000, HQFileSize: 2000, HQFileHash: 'h2', SQFileSize: 3000, SQFileHash: 'h3',
    ResFileSize: 4000, ResFileHash: 'h4', Grp: [],
  }
  const fields = ['Audioid', 'FileHash', 'Singers', 'OriSongName', 'Suffix', 'AlbumName', 'AlbumID', 'Duration', 'FileSize', 'HQFileSize', 'HQFileHash', 'SQFileSize', 'SQFileHash', 'ResFileSize', 'ResFileHash', 'Grp']
  assertNoThrowArray(kg, missingFieldCases(base, fields), 'kg')
})

test('属性：wy.handleResult 对任意缺字段条目返回数组且不抛异常', () => {
  const base = {
    baseInfo: {
      simpleSongData: {
        id: 1, name: 'N', ar: [{ name: 'S' }], al: { name: 'A', id: 2, picUrl: 'http://p' },
        dt: 200000, privilege: { maxBrLevel: 'hires', maxbr: 999000 },
        hr: { size: 1 }, sq: { size: 2 }, h: { size: 3 }, l: { size: 4 },
      },
    },
  }
  const fields = ['baseInfo', 'baseInfo.simpleSongData', 'baseInfo.simpleSongData.id', 'baseInfo.simpleSongData.name',
    'baseInfo.simpleSongData.ar', 'baseInfo.simpleSongData.al', 'baseInfo.simpleSongData.al.name',
    'baseInfo.simpleSongData.al.id', 'baseInfo.simpleSongData.al.picUrl', 'baseInfo.simpleSongData.dt',
    'baseInfo.simpleSongData.privilege', 'baseInfo.simpleSongData.hr', 'baseInfo.simpleSongData.sq',
    'baseInfo.simpleSongData.h', 'baseInfo.simpleSongData.l']
  assertNoThrowArray(wy, missingFieldCases(base, fields), 'wy')
})

test('属性：kw.handleResult 对任意缺字段条目返回数组且不抛异常', () => {
  const base = {
    MUSICRID: 'MUSIC_1', SONGNAME: 'N', ARTIST: 'S', ALBUM: 'A', ALBUMID: '2', DURATION: '200',
    N_MINFO: 'level:standard,bitrate:320,format:mp3,size:1.5MB;',
  }
  const fields = ['MUSICRID', 'SONGNAME', 'ARTIST', 'ALBUM', 'ALBUMID', 'DURATION', 'N_MINFO']
  assertNoThrowArray(kw, missingFieldCases(base, fields), 'kw')
})

test('属性：tx.handleResult 对任意缺字段条目返回数组且不抛异常', () => {
  const base = {
    file: { media_mid: 'm', size_128mp3: 1, size_320mp3: 2, size_flac: 3, size_hires: 4 },
    mid: 'mid', title: 'T', singer: [{ name: 'S', mid: 's' }], album: { name: 'A', mid: 'a' },
    interval: 200, id: 1,
  }
  const fields = ['file', 'file.media_mid', 'file.size_128mp3', 'file.size_320mp3', 'file.size_flac',
    'file.size_hires', 'mid', 'title', 'singer', 'album', 'interval', 'id']
  assertNoThrowArray(tx, missingFieldCases(base, fields), 'tx')
})

test('kg Grp 子条目按自身键去重后保留（回归：子项曾因沿用父键全部丢失）', () => {
  const parent = {
    Audioid: '1', FileHash: 'h1', Singers: [{ name: 'S' }], OriSongName: 'N', Suffix: '',
    AlbumName: 'A', AlbumID: '2', Duration: 200,
    FileSize: 1000, HQFileSize: 0, SQFileSize: 0, ResFileSize: 0,
    Grp: [{
      Audioid: '1', FileHash: 'h9', Singers: [{ name: 'S' }], OriSongName: 'N', Suffix: '2',
      AlbumName: 'A', AlbumID: '2', Duration: 210,
      FileSize: 1100, HQFileSize: 0, SQFileSize: 0, ResFileSize: 0, Grp: [],
    }],
  }
  const result = kg.handleResult([parent])
  assert.strictEqual(result.length, 2, 'Grp 子条目应被保留')
  assert.strictEqual(result[1].hash, 'h9')
})

test('wy limit 与 allPage 按调用方传入值计算（Task 4 回归）', async() => {
  const original = wy.musicSearch
  wy.musicSearch = () => Promise.resolve({
    code: 200,
    data: {
      totalCount: 90,
      resources: [{ baseInfo: { simpleSongData: { id: 1, name: 'N', ar: [{ name: 'S' }], al: { name: 'A', id: 2, picUrl: '' }, dt: 200000, privilege: { maxBrLevel: 'flac', maxbr: 999000 }, sq: { size: 2 }, h: { size: 3 }, l: { size: 4 } } } }],
    },
  })
  try {
    const result = await wy.search('q', 1, 25)
    assert.strictEqual(result.limit, 25, '返回 limit 应为调用方传入值')
    assert.strictEqual(result.allPage, 4, 'allPage 应按传入 limit 计算（90/25=4，旧逻辑按 30 计算得 3）')
  } finally {
    wy.musicSearch = original
  }
})
