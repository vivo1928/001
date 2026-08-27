import musicSdk from '@/utils/musicSdk'

// ============ 各音源音乐平台歌手信息（境内可访问、平台维护） ============

interface PlatformSingerInfo {
  name?: string
  img?: string | null
  desc?: string
  /** 网易云 artistDesc 分章结构（其余源无此字段） */
  intro?: Array<{ title: string, content: string }>
}

interface PlatformSingerModule {
  getSingerInfo?: (singerid: string) => Promise<{ source: string, singerid: string, info?: PlatformSingerInfo }>
  getSingerAlbumList?: (singerid: string, page: number, limit: number) => Promise<{ albums?: Array<{ id: string, name: string, img?: string, publish_date?: string | number }> }>
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
 * 获取歌手简介/从艺历程：优先本源接口，跨源兜底补齐，取 desc 最长的
 * 各音乐平台（网易云/QQ/酷狗/酷我/咪咕）持续维护歌手简介（含从艺经历、获奖等）
 */
const getPlatformBiography = async(source: LX.OnlineSource, singerId: string, singerName: string): Promise<PlatformSingerInfo | null> => {
  const sources = ['tx', 'wy', 'kg', 'kw'] as LX.OnlineSource[]
  const primary = (musicSdk[source]?.singer as PlatformSingerModule | undefined)

  const tasks: Array<Promise<PlatformSingerInfo | null>> = []

  if (primary?.getSingerInfo) {
    tasks.push(
      withTimeout(primary.getSingerInfo(singerId), FETCH_TIMEOUT, `SingerInfo timeout: ${source}`)
        .then(r => (r?.info ? r.info : null))
        .catch(() => null),
    )
  }

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

// ============ 获奖历程提取（网易云分章简介） ============

const AWARD_KEYWORDS = /奖|荣誉|成就|殊荣|获奖|获奖记录|所获/

/** 从分章简介中提取"获奖记录/荣誉/成就"等章节作为获奖历程 */
const extractAwards = (info: PlatformSingerInfo | null | undefined): string[] => {
  if (!info?.intro?.length) return []
  return info.intro
    .filter(sec => sec.content && AWARD_KEYWORDS.test(sec.title || ''))
    .map(sec => sec.content.trim())
    .filter(Boolean)
}

/** 从分章简介中排除获奖章节后得到从艺历程；无分章时退回整段 desc */
const extractCareer = (info: PlatformSingerInfo | null | undefined): string => {
  if (!info) return ''
  if (info.intro?.length) {
    const career = info.intro
      .filter(sec => !(sec.content && AWARD_KEYWORDS.test(sec.title || '')))
      .map(sec => (sec.title ? `${sec.title}\n${sec.content}` : sec.content))
      .filter(Boolean)
      .join('\n\n')
    if (career.trim()) return career.trim()
  }
  return (info.desc ?? '').trim()
}

// ============ 最近发行专辑时间线（最新动态，平台实时维护） ============

export interface SingerLatestAlbum {
  name: string
  publishDate: string
  img?: string | null
  albumId: string
}

/** 归一化各源发行日期（ISO 日期 / 时间戳 / YYYY-MM-DD）为毫秒时间戳 */
const toTime = (d: string | number | undefined | null): number => {
  if (d === undefined || d === null || d === '') return 0
  if (typeof d === 'number') {
    return d < 1e12 ? d * 1000 : d
  }
  const s = String(d).trim()
  if (/^\d{10}$/.test(s)) return Number(s) * 1000
  if (/^\d{13}$/.test(s)) return Number(s)
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

const formatDate = (d: string | number | undefined | null): string => {
  const t = toTime(d)
  if (!t) return ''
  const date = new Date(t)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MAX_LATEST_ALBUMS = 5

/** 获取歌手最近发行的专辑（按发行时间倒序），来自当前平台实时数据、自动更新到当下 */
const getLatestAlbums = async(source: LX.OnlineSource, singerId: string): Promise<SingerLatestAlbum[]> => {
  const sdk = (musicSdk[source]?.singer as PlatformSingerModule | undefined)
  if (!sdk?.getSingerAlbumList) return []
  try {
    const r = await withTimeout(
      sdk.getSingerAlbumList(singerId, 1, 30),
      FETCH_TIMEOUT,
      `SingerAlbumList timeout: ${source}`,
    )
    const albums = (r?.albums ?? [])
      .map(a => ({ name: String(a.name ?? '').trim(), img: a.img ?? null, albumId: String(a.id ?? ''), t: toTime(a.publish_date), publishDate: formatDate(a.publish_date) }))
      .filter(a => a.name && a.publishDate)
    albums.sort((a, b) => b.t - a.t)
    return albums.slice(0, MAX_LATEST_ALBUMS).map(({ publishDate, img, albumId, name }) => ({ name, publishDate, img, albumId }))
  } catch {
    return []
  }
}

// ============ 聚合入口 ============

export interface SingerFullInfo {
  name: string
  img?: string | null
  /** 从艺历程全文（来自音乐平台简介，境内可访问） */
  biography: string
  /** 获奖历程段落（来自网易云分章简介，其余源可能为空） */
  awards: string[]
  /** 最近发行专辑时间线（平台实时维护，覆盖到当下） */
  latestAlbums: SingerLatestAlbum[]
}

/**
 * 获取歌手完整信息（全部来自各音乐平台，境内可访问）
 * - 从艺历程：平台简介（本源优先，跨源兜底取最长）
 * - 获奖历程：网易云分章简介中的获奖/荣誉章节
 * - 最新动态：当前平台最近发行的专辑时间线（自动更新到当下）
 */
export const getSingerFullInfo = async(source: LX.OnlineSource, singerId: string, name: string): Promise<SingerFullInfo> => {
  const platform = source && singerId
    ? await getPlatformBiography(source, singerId, name)
    : null

  const latestAlbums = source && singerId
    ? await getLatestAlbums(source, singerId)
    : []

  return {
    name: platform?.name ?? name,
    img: platform?.img ?? undefined,
    biography: extractCareer(platform),
    awards: extractAwards(platform),
    latestAlbums,
  }
}
