import { memo, useMemo } from 'react'

import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'

type CacheAheadCount = LX.AppSetting['player.cacheAheadCount']

const setCacheAheadCount = (count: CacheAheadCount) => {
  updateSetting({ 'player.cacheAheadCount': count })
}

const useActive = (count: CacheAheadCount) => {
  const cacheAheadCount = useSettingValue('player.cacheAheadCount')
  return cacheAheadCount == count
}

const Item = ({ id, name }: {
  id: CacheAheadCount
  name: string
}) => {
  const isActive = useActive(id)
  return <CheckBox marginBottom={3} check={isActive} label={name} onChange={() => { setCacheAheadCount(id) }} need />
}

export default memo(() => {
  const t = useI18n()
  const list = useMemo(() => {
    return [
      { id: 0, name: t('setting_basic_cache_ahead_count_off') },
      { id: 2, name: '2' },
      { id: 5, name: '5' },
      { id: 10, name: '10' },
      { id: 20, name: '20' },
    ] as const
  }, [t])

  return (
    <SubTitle title={t('setting_basic_cache_ahead_count')}>
      <View style={styles.list}>
        {
          list.map(({ id, name }) => <Item name={name} id={id} key={id} />)
        }
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
