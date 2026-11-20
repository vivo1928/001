import { Buffer } from '@craftzdog/react-native-buffer'

// react-native-quick-base64 3.x 不再导出 btoa/atob，这里用 Buffer 提供等价实现
export const btoa = (str: string): string => Buffer.from(str, 'binary').toString('base64')

export const atob = (b64: string): string => Buffer.from(b64, 'base64').toString('binary')
