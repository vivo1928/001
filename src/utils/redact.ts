// 日志脱敏：日志会给用户取回并分享，必须去掉凭据与签名参数
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/(ghp_|gho_|ghs_|ghu_|github_pat_)[A-Za-z0-9_]+/g, '$1[REDACTED]'],
  [/glpat-[A-Za-z0-9_-]+/g, 'glpat-[REDACTED]'],
  [/((?:bearer|token|access_token|password|api[_-]?key)\s*[=:]?\s*)[^\s'",;)]+/gi, '$1[REDACTED]'],
]

// URL 上的签名/令牌参数（如自定义源链接里的 s=、token=）
const URL_SECRET_PARAM = /([?&](?:token|access_token|sign|sig|auth|key|s|pwd|password)=)[^&\s'"]*/gi

const SENSITIVE_KEY = /^(cookie|set-cookie|authorization|x-token|token|access_token|password|api[_-]?key)$/i

export const redactUrl = (text: string): string => text.replace(URL_SECRET_PARAM, '$1***')

export const redactText = (text: string): string => {
  let out = redactUrl(text)
  for (const [pattern, replacement] of TOKEN_PATTERNS) out = out.replace(pattern, replacement)
  return out
}

export const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY.test(key)
