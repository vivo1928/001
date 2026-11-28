/**
 * 腾讯源专用轻量请求器（不依赖 RN 模块，便于单测直接加载）。
 * 支持超时中止与 JSON 解析；返回 { body, statusCode }。
 */
const DEFAULT_TIMEOUT = 8000

export const fetchJson = (url, options = {}) => {
  const { method = 'get', headers = {}, body, timeout = DEFAULT_TIMEOUT } = options
  const controller = new global.AbortController()
  const timer = setTimeout(() => {
    try { controller.abort() } catch (_) { /* ignore */ }
  }, timeout)
  const init = { method, headers, signal: controller.signal }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
  return global.fetch(url, init).then(async(resp) => {
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let data = text
    try { data = JSON.parse(text) } catch (_) { /* 保留原始文本 */ }
    return { body: data, statusCode: resp.status }
  }).finally(() => { clearTimeout(timer) })
}

export default fetchJson
