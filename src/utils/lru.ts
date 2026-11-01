// C4: 通用 LRU 上限淘汰工具
// Map 迭代序即插入序，超限时删除最旧（首个）key
export const trimMapLRU = <K, V>(map: Map<K, V>, maxSize: number) => {
  while (map.size > maxSize) {
    const first = map.keys().next().value
    if (first == null) return
    map.delete(first)
  }
}
