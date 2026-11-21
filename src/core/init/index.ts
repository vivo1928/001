import { initSetting, showPactModal } from '@/core/common'
import registerPlaybackService from '@/plugins/player/service'
import initTheme from './theme'
import initI18n from './i18n'
import initUserApi from './userApi'
import initPlayer from './player'
import dataInit from './dataInit'
import initSync from './sync'
import initCommonState from './common'
import { initDeeplink } from './deeplink'
import { setApiSource } from '@/core/apiSource'
import commonActions from '@/store/common/action'
import settingState from '@/store/setting/state'
import { bootLog } from '@/utils/bootLog'
import { perfLog, perfTimer } from '@/utils/perfLog'
import { cheatTip } from '@/utils/tools'

let isFirstPush = true
const handlePushedHomeScreen = async() => {
  bootLog('Home screen pushed.')
  await cheatTip()
  bootLog('Cheat tip inited.')
  if (settingState.setting['common.isAgreePact']) {
    if (isFirstPush) {
      isFirstPush = false
      // 自动更新检查会访问 GitHub/npm 等域名，国内网络常卡 10s 以上并抢占带宽，
      // 手动检查入口仍在「设置-版本」里，这里不再自动发起
      bootLog('Skip auto update check.')
      bootLog('Init deeplink...')
      void initDeeplink()
    }
  } else {
    if (isFirstPush) isFirstPush = false
    showPactModal()
  }
}

let isInited = false
export default async() => {
  if (isInited) return handlePushedHomeScreen
  bootLog('Initing...')
  perfLog('init:start')
  commonActions.setFontSize(global.lx.fontSize)
  bootLog('Font size changed.')
  let doneStep = perfTimer('init:setting')
  const setting = await initSetting()
  doneStep()
  bootLog('Setting inited.')
  // console.log(setting)

  await initTheme(setting)
  bootLog('Theme inited.')
  await initI18n(setting)
  bootLog('I18n inited.')

  doneStep = perfTimer('init:userApi')
  await initUserApi(setting)
  doneStep()
  bootLog('User Api inited.')

  setApiSource(setting['common.apiSource'])
  bootLog('Api inited.')

  registerPlaybackService()
  bootLog('Playback Service Registered.')
  doneStep = perfTimer('init:player')
  await initPlayer(setting)
  doneStep()
  bootLog('Player inited.')
  doneStep = perfTimer('init:data')
  await dataInit(setting)
  doneStep()
  bootLog('Data inited.')
  doneStep = perfTimer('init:commonState')
  await initCommonState(setting)
  doneStep()
  bootLog('Common State inited.')

  void initSync(setting)
  bootLog('Sync inited.')

  // syncSetting()

  isInited ||= true
  perfLog('init:done')

  return handlePushedHomeScreen
}
