import { AccessibilityInfo } from 'react-native'

// 读屏状态在启动时查询一次并缓存：列表组件挂载时同步拿初值，
// 避免先用 FlatList 渲染、查完再换成 RecyclerListView 造成二次挂载。
let enabled: boolean | null = null

export const initScreenReaderState = async() => {
  try {
    enabled = await AccessibilityInfo.isScreenReaderEnabled()
  } catch (_) {
    enabled = false
  }
  try {
    AccessibilityInfo.addEventListener('screenReaderChanged', (value: boolean) => {
      enabled = value
    })
  } catch (_) { /* ignore */ }
}

export const getScreenReaderEnabled = () => enabled
