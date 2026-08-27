/**
 * 拆分歌手名列表
 * 各源 singer 字段的多歌手统一用顿号「、」分隔（kw 源原始用 &，已转成顿号），
 * 这里额外兼容斜杠/逗号等常见分隔符，以应对自定义源等非标准格式。
 * 注意：不能用空格切分，英文歌手名含空格（如 "Taylor Swift"）。
 */
export const splitSingers = (singer: string): string[] =>
  singer
    .split(/[、&/，,;；|]/)
    .map(s => s.trim())
    .filter(Boolean)
