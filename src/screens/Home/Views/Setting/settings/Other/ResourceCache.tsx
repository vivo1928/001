import { memo, useState, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'

// import { gzip, ungzip } from 'pako'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import { toast, resetNotificationPermissionCheck, confirmDialog, resetIgnoringBatteryOptimizationCheck } from '@/utils/tools'
import { getAppCacheSize, clearAppCache } from '@/utils/nativeModules/cache'
import { getCacheSize, clearCache } from '@/plugins/player/utils'
import { sizeFormate } from '@/utils'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import { clearMusicUrl, getAllKeys, getDataMultiple } from '@/utils/data'
import { storageDataPrefix } from '@/config/constant'

export default memo(() => {
  const t = useI18n()
  const [cleaning, setCleaning] = useState(false)
  const [cacheSize, setCacheSize] = useState<string | null>(null)
  // const setting = useGetter('common', 'setting')
  // TODO clear list cache
  // const clearCache = useDispatch('list', 'clearCache')

  // E1: 统计 musicUrl 前缀缓存体积（清理时 clearMusicUrl 会清掉这部分）
  const getMusicUrlCacheSize = async() => {
    try {
      const keys = (await getAllKeys()).filter(key => key.startsWith(storageDataPrefix.musicUrl))
      if (!keys.length) return 0
      const datas = await getDataMultiple(keys)
      let total = 0
      for (const [, v] of datas) if (v) total += JSON.stringify(v).length
      return total
    } catch {
      return 0
    }
  }

  const handleGetAppCacheSize = () => {
    void Promise.all([getAppCacheSize(), getCacheSize(), getMusicUrlCacheSize()]).then(([size, size2, size3]) => {
      const count = size + size2 + size3
      setCacheSize(sizeFormate(count))
    }).catch((e) => {
      // E2: 获取失败不卡"获取中"，回退显示 0
      console.warn('getAppCacheSize failed:', e)
      setCacheSize('0')
    })
  }

  const handleCleanCache = () => {
    if (cacheSize == null) return
    void confirmDialog({
      message: t('confirm_tip'),
      confirmButtonText: t('list_remove_tip_button'),
    }).then(confirm => {
      if (!confirm) return
      setCleaning(true)
      void Promise.all([
        clearAppCache(),
        clearCache(),
        clearMusicUrl(),
        resetNotificationPermissionCheck(),
        resetIgnoringBatteryOptimizationCheck(),
      ]).then(() => {
        toast(t('setting_other_cache_clear_success_tip'))
      }).finally(() => {
        handleGetAppCacheSize()
        setCleaning(false)
      })
    })
  }


  useEffect(() => {
    handleGetAppCacheSize()
  }, [])

  return (
    <>
      <SubTitle title={t('setting__other_resource_cache')}>
        <View style={styles.cacheSize}>
          <Text>{cacheSize == null ? t('setting_other_cache_getting') : t('setting_other_cache_size') + cacheSize}</Text>
        </View>
        <View style={styles.clearBtn}>
          <Button disabled={cleaning} onPress={handleCleanCache}>{t('setting_other_cache_clear_btn')}</Button>
        </View>
      </SubTitle>
    </>
  )
})

const styles = StyleSheet.create({
  cacheSize: {
    marginBottom: 5,
  },
  clearBtn: {
    flexDirection: 'row',
  },
})
