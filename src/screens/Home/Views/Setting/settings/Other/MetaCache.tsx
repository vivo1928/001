import { memo, useState, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'

// import { gzip, ungzip } from 'pako'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import { toast } from '@/utils/tools'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
// B6: 其他源缓存功能已禁用（utils.ts 读写均注释），从 UI 移除该项
import { clearLyric, getMetaCache } from '@/utils/data'

export default memo(() => {
  const t = useI18n()
  const [lyricCleaning, setLyricCleaning] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{
    // otherSourceKeys: null | string[]
    // musicUrlKeys: null | string[]
    lyricKeys: null | string[]
  }>({ lyricKeys: null })

  const handleGetMetaCache = () => {
    void getMetaCache().then((info) => {
      setCacheInfo(info)
    })
  }

  const handleCleanLyricKeysCache = () => {
    if (!cacheInfo.lyricKeys?.length) return
    setLyricCleaning(true)
    void clearLyric(cacheInfo.lyricKeys).then(() => {
      toast(t('setting_other_cache_clear_success_tip'))
    }).finally(() => {
      handleGetMetaCache()
      setLyricCleaning(false)
    })
  }


  useEffect(() => {
    handleGetMetaCache()
  }, [])

  return (
    <>
      <SubTitle title={t('setting__other_meta_cache')}>
        <View style={styles.cacheSize}>
          <Text>{cacheInfo.lyricKeys == null ? t('setting_other_cache_getting') : `${t('setting__other_lyric_raw_label')}${cacheInfo.lyricKeys.length}`}</Text>
        </View>
        <View style={styles.clearBtn}>
          <Button disabled={lyricCleaning} onPress={handleCleanLyricKeysCache}>{t('setting__other_lyric_raw_clear_btn')}</Button>
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
    gap: 5,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
