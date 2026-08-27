import musicSdk from '@/utils/musicSdk'
import { httpFetch } from '@/utils/request'

// ============ 各音源音乐平台歌手信息（境内可访问、平台维护、动态最新） ============

interface PlatformSingerInfo {
  name?: string
  img?: string | null
  desc?: string
}

interface PlatformSingerModule {
  getSingerInfo?: (singerid: string) => Promise<{ source: string, singerid: string, info?: PlatformSingerInfo }>
  searchSingerId?: (name: string) => Promise<string | number | null>
}

const FETCH_TIMEOUT = 10000

const withTimeout = async <T,>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => { reject(new Error(msg)) }, ms)),
  ])
}

/**
 * 获取歌手从艺历程：优先本源接口，跨源兜底补齐，取简介最长的
 * 各音乐平台（网易云/QQ/酷狗/酷我/咪咕）持续维护歌手简介（含从艺经历），
 * 境内可访问且动态更新，是最可靠的从艺历程来源。
 */
const getPlatformBiography = async(source: LX.OnlineSource, singerId: string, singerName: string): Promise<PlatformSingerInfo | null> => {
  const sources = ['tx', 'wy', 'kg', 'kw'] as LX.OnlineSource[]
  const primary = (musicSdk[source]?.singer as PlatformSingerModule | undefined)

  const tasks: Array<Promise<PlatformSingerInfo | null>> = []

  // 本源优先加入
  if (primary?.getSingerInfo) {
    tasks.push(
      withTimeout(primary.getSingerInfo(singerId), FETCH_TIMEOUT, `SingerInfo timeout: ${source}`)
        .then(r => (r?.info ? r.info : null))
        .catch(() => null),
    )
  }

  // 跨源：用歌手名搜索其他源，取简介最长的
  for (const other of sources) {
    if (other === source) continue
    const sdk = musicSdk[other] as { singer?: PlatformSingerModule } | undefined
    const otherSinger = sdk?.singer
    if (!otherSinger?.getSingerInfo || !otherSinger?.searchSingerId) continue
    tasks.push(
      (async() => {
        try {
          const otherId = await withTimeout(
            otherSinger.searchSingerId!(singerName),
            FETCH_TIMEOUT,
            `searchSingerId timeout: ${other}`,
          )
          if (!otherId) return null
          const r = await withTimeout(
            otherSinger.getSingerInfo!(String(otherId)),
            FETCH_TIMEOUT,
            `SingerInfo timeout: ${other}`,
          )
          return r?.info ?? null
        } catch {
          return null
        }
      })(),
    )
  }

  if (tasks.length === 0) return null

  const results = await Promise.allSettled(tasks)
  let best: PlatformSingerInfo | null = null
  let bestLen = 0

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.desc) {
      const len = String(r.value.desc).trim().length
      if (len > bestLen) {
        best = r.value
        bestLen = len
      }
    }
  }

  return best
}

// ============ 百度百科结构化资料卡（中文名/外文名/国籍/出生地等，补充） ============

const FIELD_LABEL_MAP: Record<string, string> = {
  本名: '中文名',
  外文名: '外文名',
  别名: '别名',
  性别: '性别',
  民族: '民族',
  国籍: '国籍',
  出生地: '出生地',
  出生日期: '出生日期',
  星座: '星座',
  血型: '血型',
  身高: '身高',
  体重: '体重',
  职业: '职业',
  毕业院校: '毕业院校',
  代表作: '代表作品',
  首张专辑: '代表作品',
  唱片公司: '唱片公司',
  经纪公司: '经纪公司',
  音乐类型: '音乐风格',
  擅长乐器: '擅长乐器',
  出道日期: '出道时间',
  祖籍: '祖籍',
}

const FIELD_ORDER = [
  '中文名', '外文名', '别名', '性别', '民族', '国籍', '出生地', '出生日期',
  '星座', '血型', '身高', '体重', '职业', '毕业院校', '出道时间', '祖籍',
  '代表作品', '经纪公司', '唱片公司', '音乐风格', '擅长乐器',
]

const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry<T> {
  time: number
  data: T
}
const baikeCache = new Map<string, CacheEntry<SingerField[]>>()

export interface SingerField {
  label: string
  value: string
}

/** 清洗百科返回的 HTML：剥标签、去引用脚注、解码实体 */
const cleanHtml = (raw: string): string => {
  let s = raw ?? ''
  s = s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, '')
  s = s.replace(/<a\s+name=[^>]*><\/a>/g, '')
  s = s.replace(/<[^>]+>/g, '')
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  return s.trim()
}

interface BaikeCardItem {
  name?: string
  value?: string[]
}

interface BaikeResponse {
  card?: BaikeCardItem[]
}

const parseFields = (card: BaikeCardItem[] | undefined): SingerField[] => {
  if (!Array.isArray(card)) return []
  const result: SingerField[] = []
  for (const orderLabel of FIELD_ORDER) {
    const item = card.find(c => FIELD_LABEL_MAP[c.name ?? ''] === orderLabel)
    if (!item) continue
    const value = (item.value ?? [])
      .map(v => cleanHtml(v))
      .filter(Boolean)
      .join('、')
    if (!value) continue
    result.push({ label: orderLabel, value })
  }
  return result
}

/**
 * 获取歌手结构化资料卡（百度百科开放 API）
 * 返回中文名/外文名/国籍/出生地/星座等字段，失败返回空数组（不阻塞主流程）
 */
export const getSingerProfile = async(name: string, forceRefresh = false): Promise<SingerField[]> => {
  if (!name) return []
  const cacheKey = name.trim()
  if (!forceRefresh) {
    const cached = baikeCache.get(cacheKey)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data
  }

  try {
    const url = `https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key=${encodeURIComponent(name)}&bk_length=30000`
    const { body } = await httpFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko)',
        Referer: 'https://baike.baidu.com/',
      },
    }).promise
    if (!body || typeof body !== 'object') return []
    const fields = parseFields((body as BaikeResponse).card)
    baikeCache.set(cacheKey, { time: Date.now(), data: fields })
    return fields
  } catch {
    return []
  }
}

// ============ 聚合入口 ============

export interface SingerFullInfo {
  name: string
  img?: string | null
  /** 从艺历程/生平全文（来自音乐平台，境内可访问、动态最新） */
  biography: string
  /** 结构化资料卡（中文名/外文名/国籍等，来自百度百科，可能为空） */
  fields: SingerField[]
}

/**
 * 获取歌手完整信息
 * - 从艺历程：各音乐平台 getSingerInfo（本源优先，跨源兜底取最长），境内可访问、动态更新
 * - 资料卡：百度百科开放 API（补充中文名/外文名/国籍等，失败降级为空）
 */
export const getSingerFullInfo = async(source: LX.OnlineSource, singerId: string, name: string, forceRefresh = false): Promise<SingerFullInfo> => {
  const [platform, fields] = await Promise.all([
    source && singerId
      ? getPlatformBiography(source, singerId, name)
      : Promise.resolve(null),
    getSingerProfile(name, forceRefresh),
  ])

  return {
    name: platform?.name ?? name,
    img: platform?.img ?? undefined,
    biography: (platform?.desc ?? '').trim(),
    fields,
  }
}
