import { PixelRatio } from 'react-native'

/**
 * 把封面/头像 URL 按展示尺寸换成缩略图，减少列表页图片体积。
 * 只处理已知支持尺寸参数的几家源，其余原样返回。
 *
 * @param url 原图地址
 * @param px  目标像素边长（已乘过屏幕密度）
 */
export const getThumbUrl = (url?: string | null, px = 200): string | undefined | null => {
  if (!url || typeof url != 'string') return url
  const size = Math.min(600, Math.max(150, Math.round(px)))
  try {
    // 网易云：https://p1.music.126.net/xxx.jpg  -> ?param=200y200
    if (/^https?:\/\/p[0-9]\.music\.126\.net\//.test(url)) {
      return `${url.split('?')[0]}?param=${size}y${size}`
    }
    // 腾讯系：T002R300x300M000 / T001R300x300  -> 指定尺寸
    if (/(?:y\.gtimg\.cn|qpic\.y\.qq\.com)\//.test(url)) {
      return url.replace(/(T00[0-9]R)(\d+)x(\d+)(M000)?/, (_m, p1, _w, _h, p4) => `${p1}${size}x${size}${p4 ?? ''}`)
    }
    // 酷狗：imge.kugou.com/soft/collection/240/ -> 150/240 两档
    if (/imge\.kugou\.com\/soft\/collection\//.test(url)) {
      const bucket = size <= 180 ? 150 : 240
      return url.replace(/(\/soft\/collection\/)(\d+)(\/)/, `$1${bucket}$3`)
    }
    // 咪咕封面是 webp 直链、酷我头像是固定小尺寸，都不做改写
    return url
  } catch (_) {
    return url
  }
}

/** 供列表类组件估算：卡片宽度(dp) -> 请求像素 */
export const thumbPx = (dp: number) => Math.round(dp * PixelRatio.get())
