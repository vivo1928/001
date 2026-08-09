import { PermissionsAndroid, Platform } from 'react-native'

/**
 * 请求存储权限（Android 6.0+ 需要运行时动态申请）
 * 下载歌曲需要写入公共存储目录（音乐下载），必须先获得存储权限
 */
export const requestStoragePermission = async(): Promise<boolean> => {
  if (Platform.OS !== 'android') return true
  // Android 6.0 (API 23) 以下无需运行时权限
  if (Platform.Version < 23) return true

  const permissions = [
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  ]

  const statuses = await PermissionsAndroid.requestMultiple(permissions)
  return Object.values(statuses).every(
    status => status === PermissionsAndroid.RESULTS.GRANTED,
  )
}
