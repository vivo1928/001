import AsyncStorage from '@react-native-async-storage/async-storage'
import { log } from '@/utils/log'

const partKeyPrefix = '@___PART___'
const partKeyArrPrefix = '@___PART_A___'
const partKeyPrefixRxp = /^@___PART___/
const partKeyArrPrefixRxp = /^@___PART_A___/
const keySplit = ','
const limit = 500000

const buildData = (key: string, value: any, datas: Array<[string, string]>) => {
  let valueStr = JSON.stringify(value)
  if (valueStr.length <= limit) {
    datas.push([key, valueStr])
    return
  }

  const partKeys = []
  // A3-1: 原 Math.floor+<= 在长度恰为 limit 整数倍时生成空分片，改为 Math.ceil 且 i<len
  // A3-2: 分片 key 加 ':' 分隔符，防 `${key}${i}` 与 `${key2}${j}` 碰撞（如 list_123 序号10 与 list_1231 序号0）
  for (let i = 0, len = Math.ceil(valueStr.length / limit); i < len; i++) {
    let partKey = `${partKeyArrPrefix}${key}:${i}`
    partKeys.push(partKey)
    datas.push([partKey, valueStr.substring(i * limit, (i + 1) * limit)])
  }
  datas.push([key, partKeyArrPrefix + JSON.stringify(partKeys)])
}

// 1.4.0 之前的数据分片存储方式，存在key的内容与分隔符冲突的问题
// 1.4.0 开始改用数组存储，不再使用分隔符的方式
const handleGetDataOld = async<T>(key: string, partKeys: string): Promise<T> => {
  const keys = partKeys.replace(partKeyPrefixRxp, '').split(keySplit)
  try {
    const datas = await AsyncStorage.multiGet(keys)
    return JSON.parse(datas.map(data => data[1]).join(''))
  } catch (e) {
    // A5: 损坏数据自愈——清理后抛错，避免反复崩溃
    log.error('storage error[getData] invalid old part data, self-heal:', key)
    await removeData(key)
    throw e
  }
}

const handleGetData = async<T>(key: string, partKeysStr: string): Promise<T> => {
  if (partKeysStr.startsWith(partKeyPrefix)) return handleGetDataOld<T>(key, partKeysStr)

  let keys: string[]
  try {
    keys = JSON.parse(partKeysStr.replace(partKeyArrPrefixRxp, '')) as string[]
  } catch (e) {
    // A5: 分片索引 JSON 损坏，自愈清理
    log.error('storage error[getData] invalid partKeys JSON, self-heal:', key)
    await removeData(key)
    throw e
  }
  try {
    const datas = await AsyncStorage.multiGet(keys)
    return JSON.parse(datas.map(data => data[1]).join(''))
  } catch (e) {
    // A5: 分片内容损坏，自愈清理
    log.error('storage error[getData] invalid part data, self-heal:', key)
    await removeData(key)
    throw e
  }
}

// A2: key 级互斥锁，串行化同一 key 的写操作，防并发+崩溃丢数据
const saveLocks = new Map<string, Promise<void>>()
const withSaveLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const prev = saveLocks.get(key) ?? Promise.resolve()
  let release: () => void
  const cur = new Promise<void>(resolve => { release = resolve })
  const chain = prev.then(() => cur)
  saveLocks.set(key, chain)
  await prev
  try {
    return await fn()
  } finally {
    release!()
    if (saveLocks.get(key) === chain) saveLocks.delete(key)
  }
}

// A4: 解析旧分片 key 列表（主 key 值格式），供孤儿分片清理
const parsePartKeys = (value: string): string[] => {
  if (partKeyArrPrefixRxp.test(value)) return JSON.parse(value.replace(partKeyArrPrefixRxp, '')) as string[]
  if (partKeyPrefixRxp.test(value)) return value.replace(partKeyPrefixRxp, '').split(keySplit)
  return []
}

export const saveData = async(key: string, value: any) => {
  return withSaveLock(key, async() => {
    const datas: Array<[string, string]> = []
    buildData(key, value, datas)

    // A1/A4: 读取旧分片列表（仅读，不先删旧），写失败时旧数据保持完整不丢
    let oldPartKeys: string[] = []
    try {
      const oldValue = await AsyncStorage.getItem(key)
      if (oldValue) oldPartKeys = parsePartKeys(oldValue)
    } catch { /* 旧值读取失败忽略，不影响写入 */ }

    try {
      // A1: 先写全部（主 key + 新分片）覆盖旧值，成功后再删孤儿分片
      await AsyncStorage.multiSet(datas)
      // A4: 清理不再被引用的旧分片（孤儿）
      const newKeys = new Set(datas.map(([k]) => k))
      const orphans = oldPartKeys.filter(k => !newKeys.has(k))
      if (orphans.length) await AsyncStorage.multiRemove(orphans)
    } catch (e: any) {
      log.error('storage error[saveData]:', key, e.message)
      throw e
    }
  })
}

export const getData = async<T = unknown>(key: string): Promise<T | null> => {
  let value: string | null
  try {
    value = await AsyncStorage.getItem(key)
  } catch (e: any) {
    // error reading value
    log.error('storage error[getData]:', key, e.message)
    throw e
  }
  if (value && (partKeyPrefixRxp.test(value) || partKeyArrPrefixRxp.test(value))) {
    return handleGetData<T>(key, value)
  } else if (value == null) return value
  try {
    return JSON.parse(value)
  } catch (e) {
    // A5: 损坏数据自愈——清理并返回 null
    log.error('storage error[getData] invalid JSON, self-heal:', key)
    await removeData(key)
    return null
  }
}

export const removeData = async(key: string) => {
  let value: string | null
  try {
    value = await AsyncStorage.getItem(key)
  } catch (e: any) {
    // error reading value
    log.error('storage error[removeData]:', key, e.message)
    throw e
  }
  if (value) {
    if (partKeyPrefixRxp.test(value)) {
      let partKeys = value.replace(partKeyPrefixRxp, '').split(keySplit)
      partKeys.push(key)
      try {
        await AsyncStorage.multiRemove(partKeys)
      } catch (e: any) {
        // remove error
        log.error('storage error[removeData]:', key, e.message)
        throw e
      }
      return
    } else if (partKeyArrPrefixRxp.test(value)) {
      let partKeys: string[]
      try {
        partKeys = JSON.parse(value.replace(partKeyArrPrefixRxp, '')) as string[]
      } catch (e) {
        // 分片索引损坏，仍删主 key
        log.error('storage error[removeData] invalid partKeys, remove main key:', key)
        partKeys = []
      }
      partKeys.push(key)
      try {
        await AsyncStorage.multiRemove(partKeys)
      } catch (e: any) {
        // remove error
        log.error('storage error[removeData]:', key, e.message)
        throw e
      }
      return
    }
  }

  try {
    await AsyncStorage.removeItem(key)
  } catch (e: any) {
    // remove error
    log.error('storage error[removeData]:', key, e.message)
    throw e
  }
}

export const getAllKeys = async() => {
  let keys
  try {
    keys = await AsyncStorage.getAllKeys()
  } catch (e: any) {
    // read key error
    log.error('storage error[getAllKeys]:', e.message)
    throw e
  }

  return keys
}


export const getDataMultiple = async<T extends readonly string[]>(keys: T) => {
  type RawData = { [K in keyof T]: [T[K], string | null] }
  let datas: RawData
  try {
    datas = await AsyncStorage.multiGet(keys) as RawData
  } catch (e: any) {
    // read error
    log.error('storage error[getDataMultiple]:', e.message)
    throw e
  }
  const promises: Array<Promise<ReadonlyArray<[unknown | null]>>> = []
  for (const [key, value] of datas) {
    if (value && (partKeyPrefixRxp.test(value) || partKeyArrPrefixRxp.test(value))) {
      promises.push(handleGetData(key, value))
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      promises.push(Promise.resolve(value ? JSON.parse(value) : value).catch(async(e) => {
        // A5: 单项损坏自愈，避免批量读整体失败
        log.error('storage error[getDataMultiple] invalid JSON, self-heal:', key)
        await removeData(key)
        return null
      }))
    }
  }
  return Promise.all(promises).then(values => {
    return datas.map(([key], index) => ([key, values[index]])) as { [K in keyof T]: [T[K], unknown] }
  })
}

export const saveDataMultiple = async(datas: Array<[string, any]>) => {
  const allData: Array<[string, string]> = []
  // A1: 读取旧分片列表（不先删旧），写失败不丢数据
  const oldPartKeysMap = new Map<string, string[]>()
  for (const [key, value] of datas) {
    buildData(key, value, allData)
    try {
      const oldValue = await AsyncStorage.getItem(key)
      if (oldValue) oldPartKeysMap.set(key, parsePartKeys(oldValue))
    } catch { /* 忽略 */ }
  }
  try {
    // A1: 先写全部覆盖，成功后再清孤儿分片
    await AsyncStorage.multiSet(allData)
    const newKeys = new Set(allData.map(([k]) => k))
    const orphans: string[] = []
    for (const [key, oldPartKeys] of oldPartKeysMap) {
      for (const k of oldPartKeys) if (!newKeys.has(k)) orphans.push(k)
    }
    if (orphans.length) await AsyncStorage.multiRemove(orphans)
  } catch (e: any) {
    // save error
    log.error('storage error[saveDataMultiple]:', e.message)
    throw e
  }
}


export const removeDataMultiple = async(keys: string[]) => {
  if (!keys.length) return
  const datas = await AsyncStorage.multiGet(keys)
  let allKeys = []
  for (const [key, value] of datas) {
    allKeys.push(key)
    if (value) {
      if (partKeyPrefixRxp.test(value)) {
        allKeys.push(...value.replace(partKeyPrefixRxp, '').split(keySplit))
      } else if (partKeyArrPrefixRxp.test(value)) {
        allKeys.push(...JSON.parse(value.replace(partKeyArrPrefixRxp, '')) as string[])
      }
    }
  }
  try {
    await AsyncStorage.multiRemove(allKeys)
  } catch (e: any) {
    // remove error
    log.error('storage error[removeDataMultiple]:', e.message)
    throw e
  }
}

export const clearAll = async() => {
  try {
    await AsyncStorage.clear()
  } catch (e: any) {
    // clear error
    log.error('storage error[clearAll]:', e.message)
    throw e
  }
}

export { useAsyncStorage } from '@react-native-async-storage/async-storage'
