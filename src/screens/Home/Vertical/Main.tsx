import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import Search from '../Views/Search'
import SongList from '../Views/SongList'
import Mylist from '../Views/Mylist'
import Leaderboard from '../Views/Leaderboard'
import Setting from '../Views/Setting'
import commonState, { type InitState as CommonState } from '@/store/common/state'
import { createStyle } from '@/utils/tools'

const hideKeys = [
  'list.isShowAlbumName',
  'list.isShowInterval',
  'theme.fontShadow',
] as Readonly<Array<keyof LX.AppSetting>>

const SearchPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_search')
  const component = useMemo(() => <Search />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_search') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const SongListPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_songlist')
  const component = useMemo(() => <SongList />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_songlist') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const LeaderboardPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_top')
  const component = useMemo(() => <Leaderboard />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_top') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const MylistPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_love')
  const component = useMemo(() => <Mylist />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_love') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some(k => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const SettingPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_setting')
  const component = useMemo(() => <Setting />, [])
  useEffect(() => {
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      if (id == 'nav_setting') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
    }
  }, [])
  return visible ? component : null
}

const Main = () => {
  const [activeId, setActiveId] = useState<CommonState['navActiveId']>(commonState.navActiveId)

  useEffect(() => {
    const handleUpdate = (id: CommonState['navActiveId']) => {
      setActiveId(id)
    }
    global.state_event.on('navActiveIdUpdated', handleUpdate)
    return () => {
      global.state_event.off('navActiveIdUpdated', handleUpdate)
    }
  }, [])

  // homePagerIdle is always true without PagerView
  useEffect(() => {
    global.lx.homePagerIdle = true
  }, [])

  return (
    <View style={styles.container}>
      { activeId == 'nav_search' ? <SearchPage /> : null }
      { activeId == 'nav_songlist' ? <SongListPage /> : null }
      { activeId == 'nav_top' ? <LeaderboardPage /> : null }
      { activeId == 'nav_love' ? <MylistPage /> : null }
      { activeId == 'nav_setting' ? <SettingPage /> : null }
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
})


export default Main