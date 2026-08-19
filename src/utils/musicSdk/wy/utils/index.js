import { httpFetch } from '../../../request'
import { eapi } from './crypto'

export const eapiRequest = (url, data) => {
  return httpFetch('https://interface.music.163.com/eapi/batch', {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://music.163.com',
      Referer: 'https://music.163.com/',
      Cookie: 'os=pc; deviceId=A9C064BB4584D038B1565B58CB05F95290998EE8B025AA2D07AE; appver=8.9.33',
    },
    form: eapi(url, data),
  })
}

// 兜底：非 eapi 直连 API（eapi 被拦截时使用）
export const directRequest = (url, data) => {
  const params = new URLSearchParams(data).toString()
  return httpFetch(`https://music.163.com${url}?${params}`, {
    method: 'get',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://music.163.com/',
      Cookie: 'os=pc; deviceId=A9C064BB4584D038B1565B58CB05F95290998EE8B025AA2D07AE; appver=8.9.33',
    },
  })
}
