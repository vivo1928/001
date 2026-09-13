import musicSdk from '@/utils/musicSdk'

interface SingerSearchResult {
  list?: Array<{ id: string | number, name?: string }>
}

interface SingerModule {
  searchSingerId?: (name: string) => Promise<string | number | null>
}

interface SingerSearchModule {
  search?: (str: string, page?: number, limit?: number) => Promise<SingerSearchResult>
}

// 歌手 id 反查结果缓存（key: `${source}__${name}`），避免重复请求
const singerIdCache = new Map<string, string>()

// 大小写不敏感归一化，提升英文/外文歌手名的匹配准确度（如 "Taylor Swift"）
const normalizeName = (name?: string): string => (name ?? '').trim().toLowerCase()

/**
 * 反查歌手 id
 * 优先使用各源 singerSearch（歌手搜索接口，与搜索页同款，更可靠），精确匹配歌手名；
 * 失败时兜底 searchSingerId（部分源如 wy 的明文 /api/search/get 接口可能被风控返回 null）。
 */
export const findSingerId = async(singerName: string, source: LX.OnlineSource): Promise<string | null> => {
  const cacheKey = `${source}__${singerName}`
  const cached = singerIdCache.get(cacheKey)
  if (cached) return cached

  // 1. singerSearch 歌手搜索接口（与搜索页同款，更稳定）
  try {
    const sdk = musicSdk[source] as { singerSearch?: SingerSearchModule } | undefined
    const searchFn = sdk?.singerSearch?.search
    if (searchFn) {
      const res = await searchFn.call(sdk?.singerSearch, singerName, 1, 20)
      const list = res?.list ?? []
      // 优先精确匹配，其次包含匹配；均未命中时取第一个（歌手搜索首个结果最相关）
      // 匹配均做大小写不敏感处理，外文歌手名（含空格/大小写差异）更可靠
      const keyword = normalizeName(singerName)
      const exact = list.find(s => s.name && normalizeName(s.name) === keyword)
      const match = exact ?? list.find(s => s.name && normalizeName(s.name).includes(keyword)) ?? list[0]
      if (match?.id) {
        const id = String(match.id)
        singerIdCache.set(cacheKey, id)
        return id
      }
    }
  } catch { /* fall through */ }

  // 2. 兜底 searchSingerId
  try {
    const sdk = musicSdk[source] as { singer?: SingerModule } | undefined
    const id = await sdk?.singer?.searchSingerId?.(singerName)
    if (id) {
      singerIdCache.set(cacheKey, String(id))
      return String(id)
    }
  } catch { /* ignore */ }

  return null
}
