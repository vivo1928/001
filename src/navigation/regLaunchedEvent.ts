import { Navigation } from 'react-native-navigation'
import { appLog } from '@/utils/appLog'

let launched = false
const handlers: Array<() => void> = []


export const listenLaunchEvent = () => {
  // 记录每次进入的页面，配合事件日志还原用户操作路径
  Navigation.events().registerComponentDidAppearListener((event) => {
    appLog('screen', { name: event.componentName, id: event.componentId })
  })
  Navigation.events().registerAppLaunchedListener(() => {
    // console.log('Register app launched listener', launched)
    launched = true
    setImmediate(() => {
      for (const handler of handlers) handler()
    })
  })
}

export const onAppLaunched = (handler: () => void) => {
  handlers.push(handler)
  if (launched) {
    setImmediate(() => {
      handler()
    })
  }
}
