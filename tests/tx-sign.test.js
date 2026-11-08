const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')
const { commonMocks, sha1Hex } = require('./helpers/mocks')

const zzcSign = loadModule('src/utils/musicSdk/tx/utils/crypto.js', {
  ...commonMocks,
}).zzcSign

const PART_1 = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2 = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

const referenceSign = (text) => {
  const hash = sha1Hex(text)
  const pick = (idxs) => idxs.map((i) => hash[i - 1]).join('')
  const part3 = SCRAMBLE.map((v, i) => v ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
  const b64 = Buffer.from(part3).toString('base64').replace(/[\\/+=]/g, '')
  return ('zzc' + pick(PART_1) + b64 + pick(PART_2)).toLowerCase()
}

test('签名形状：zzc 前缀、纯小写字母数字、无 "undefined"、长度稳定', async() => {
  for (const input of ['', 'hello', '{"query":"起风了"}', 'x'.repeat(200)]) {
    const sign = await zzcSign(input)
    assert.ok(sign.startsWith('zzc'), `前缀错误: ${sign}`)
    assert.ok(!sign.includes('undefined'), `混入 undefined: ${sign}`)
    assert.match(sign, /^[0-9a-z]+$/, `非法字符: ${sign}`)
    // part1(8) + base64(剥离 /+= 后 21-27) + part2(8) + 'zzc'(3) = 39-46
    assert.ok(sign.length >= 39 && sign.length <= 46, `长度异常: ${sign}`)
  }
})

test('签名与服务端已验证的 1-based 参考算法一致', async() => {
  for (const input of ['{"a":1}', '起风了', JSON.stringify({ query: 'test', limit: 30 })]) {
    assert.strictEqual(await zzcSign(input), referenceSign(input))
  }
})

test('取字符下标全部命中 SHA1 hex 有效位（0-39）', async() => {
  const sign = await zzcSign('fixed-input')
  const hash = sha1Hex('fixed-input')
  const part1 = PART_1.map((i) => hash[i - 1]).join('')
  const part2 = PART_2.map((i) => hash[i - 1]).join('')
  assert.ok(sign.includes(part1.toLowerCase()), 'part1 未按 1-based 下标取值')
  assert.ok(sign.includes(part2.toLowerCase()), 'part2 未按 1-based 下标取值')
  for (const idx of [...PART_1, ...PART_2]) {
    assert.ok(idx >= 1 && idx <= 40, `下标越界: ${idx}`)
  }
})

test('不同输入产生不同签名', async() => {
  assert.notStrictEqual(await zzcSign('input-a'), await zzcSign('input-b'))
})
