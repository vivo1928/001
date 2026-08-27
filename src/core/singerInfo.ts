import { httpFetch } from '@/utils/request'

// ============ 百度百科结构化资料（中文名/外文名/国籍/出生地等） ============

// 中文名/外文名等基础资料字段标签映射（百度百科卡片 field.name → 展示用中文标签）
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

// 需要展示的资料字段（顺序即展示顺序）
const FIELD_ORDER = [
  '中文名', '外文名', '别名', '性别', '民族', '国籍', '出生地', '出生日期',
  '星座', '血型', '身高', '体重', '职业', '毕业院校', '出道时间', '祖籍',
  '代表作品', '经纪公司', '唱片公司', '音乐风格', '擅长乐器',
]

// 缓存有效期（毫秒）：30 分钟。超过后重新拉取，保证从艺历程等资料保持最新
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry<T> {
  time: number
  data: T
}
const baikeCache = new Map<string, CacheEntry<SingerFullInfo>>()
const wikiCache = new Map<string, CacheEntry<string>>()

export interface SingerField {
  label: string
  value: string
}

export interface SingerFullInfo {
  name: string
  img?: string | null
  desc: string
  fields: SingerField[]
}

/** 清洗百科返回的 HTML：剥标签、去引用脚注、解码实体 */
const cleanHtml = (raw: string): string => {
  let s = raw ?? ''
  // 去掉 <sup> 与引用锚点 <a name=...>
  s = s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, '')
  s = s.replace(/<a\s+name=[^>]*><\/a>/g, '')
  // 剥掉其余所有标签
  s = s.replace(/<[^>]+>/g, '')
  // 解码 HTML 实体
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
  title?: string
  key?: string
  desc?: string
  abstract?: string
  image?: string
  card?: BaikeCardItem[]
}

const pickStr = (obj: Record<string, unknown> | undefined, key: string): string => {
  const v = obj?.[key]
  return typeof v === 'string' ? v : ''
}

const parseFields = (card: BaikeCardItem[] | undefined): SingerField[] => {
  if (!Array.isArray(card)) return []
  const result: SingerField[] = []
  for (const orderLabel of FIELD_ORDER) {
    // 先按标签映射找，按 FIELD_ORDER 顺序输出
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
 * 获取歌手结构化资料（借助百度百科开放 API）
 * 返回国籍/中文名/外文名/出生地/星座等基础资料
 * 失败时返回空字段
 */
export const getSingerProfile = async(name: string, forceRefresh = false): Promise<SingerFullInfo> => {
  if (!name) return { name: '', desc: '', fields: [] }
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
    if (!body || typeof body !== 'object' || !(body as BaikeResponse).title) {
      return { name, desc: '', fields: [] }
    }
    const data = body as BaikeResponse
    const result: SingerFullInfo = {
      name: pickStr(data, 'title') || pickStr(data, 'key') || name,
      img: pickStr(data, 'image') ?? null,
      desc: cleanHtml(pickStr(data, 'abstract') || pickStr(data, 'desc') || ''),
      fields: parseFields(data.card),
    }
    baikeCache.set(cacheKey, { time: Date.now(), data: result })
    return result
  } catch {
    return { name, desc: '', fields: [] }
  }
}

// ============ 中文维基百科从艺历程（动态最新） ============

const USER_AGENT = 'LXMusic/1.0 (https://github.com/vivo1928/001)'

/** 清洗维基 extract：去除章节标记、引用说明等冗余，保留可读段落 */
const cleanWikiExtract = (raw: string): string => {
  let s = raw ?? ''
  // 去掉「页面存档备份，存于互联网档案馆」等注脚
  s = s.replace(/（页面存档备份，存于互联网档案馆）|（页面存档备份，存于互联网档案馆\)|存于互联网档案馆/g, '')
  // 去掉源码中的引用链接说明（如 [1]、[2]）
  s = s.replace(/\[\d+\]/g, '')
  // 去掉 "== 章节 ==" 与 "=== 子章节 ===" 标记行
  s = s.replace(/^=+\s*.*?\s*=+\s*$/gm, '\n')
  // 去除多余空行，保留单空行分段
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/**
 * 获取歌手从艺历程全文（中文维基百科，人工持续更新）
 * 返回覆盖到最新的生平全文；失败返回空字符串，界面降级展示
 */
export const getSingerBiography = async(name: string, forceRefresh = false): Promise<string> => {
  if (!name) return ''
  const cacheKey = name.trim()
  if (!forceRefresh) {
    const cached = wikiCache.get(cacheKey)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data
  }

  try {
    const url = `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext&format=json&exlimit=1&titles=${encodeURIComponent(name)}&redirects=`
    const { body } = await httpFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    }).promise
    if (!body || typeof body !== 'object' || !body.query?.pages) {
      return ''
    }
    const pages = body.query.pages as Record<string, { extract?: string, missing?: number }>
    let extract = ''
    for (const page of Object.values(pages)) {
      if (page.missing) continue
      if (page.extract) {
        extract = page.extract
        break
      }
    }
    const biography = cleanWikiExtract(extract)
    wikiCache.set(cacheKey, { time: Date.now(), data: biography })
    return biography
  } catch {
    return ''
  }
}

/**
 * 获取歌手完整信息（结构化资料 + 从艺历程）
 * 并行请求百度百科（资料表）与中文维基（最新生平），失败各自降级
 */
export const getSingerFullInfo = async(name: string, forceRefresh = false): Promise<SingerFullInfo & { biography: string }> => {
  const [profile, biography] = await Promise.all([
    getSingerProfile(name, forceRefresh),
    getSingerBiography(name, forceRefresh),
  ])
  return {
    name: profile.name || name,
    img: profile.img ?? null,
    desc: profile.desc,
    fields: profile.fields,
    biography,
  }
}
