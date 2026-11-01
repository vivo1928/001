// DL1: 下载请求 Referer 推断工具
// 规则与 plugins/player/playList.ts 的 getPlayHeaders 保持一致（按 URL 域名推断，兜底按 source），
// 使下载模块与播放模块对同一 CDN 的 Referer 行为对称，避免 Referer 校验 CDN 下载 403。
const hostRefererRules: Array<[RegExp, string]> = [
  [/(?:^|\.)kuwo\.cn\//i, 'https://www.kuwo.cn/'],
  [/(?:^|\.)kugou\.com\//i, 'https://www.kugou.com/'],
  [/(?:^|\.)qqmusic\.qq\.com\//i, 'https://y.qq.com/'],
  [/(?:^|\.)music\.126\.net\//i, 'https://music.163.com/'],
  [/(?:^|\.)migu\.cn\//i, 'https://music.migu.cn/'],
  [/(?:^|\.)qianqian\.com\//i, 'https://music.baidu.com/'],
]

const sourceRefererMap: Partial<Record<LX.OnlineSource, string>> = {
  kw: 'https://www.kuwo.cn/',
  kg: 'https://www.kugou.com/',
  tx: 'https://y.qq.com/',
  wy: 'https://music.163.com/',
  mg: 'https://music.migu.cn/',
}

export const getDownloadHeaders = (url: string, source?: string): { [key: string]: string } | undefined => {
  let referer: string | null = null
  for (const [rx, r] of hostRefererRules) {
    if (rx.test(url)) {
      referer = r
      break
    }
  }
  if (!referer && source && !source.startsWith('user_api_')) {
    referer = sourceRefererMap[source as LX.OnlineSource] ?? null
  }
  return referer ? { Referer: referer } : undefined
}
