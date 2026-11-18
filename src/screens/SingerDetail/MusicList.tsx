import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Alert, View } from 'react-native'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import Header, { type HeaderType } from './Header'
import { useSingerInfo, type SingerTabType } from './state'
import { clearListDetail, getListDetail, getListDetailAll, setListDetail, setListDetailInfo } from '@/core/singerDetail'
import singerDetailState from '@/store/singerDetail/state'
import singerDetailActions from '@/store/singerDetail/action'
import { handlePlay, handlePlayAll } from './listAction'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import useDownloadFlow from '@/core/download/useDownloadFlow'

export interface MusicListProps {
  componentId: string
  activeTab: SingerTabType
  onTabChange: (tab: SingerTabType) => void
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, id: string) => void
}

// 构建歌手简介文本
const buildDesc = (info: { name?: string, song_count?: number, album_count?: number, desc?: string, img?: string }): string => {
  if (info.desc) return info.desc
  const parts: string[] = []
  if (info.song_count) parts.push(`${info.song_count} 首歌曲`)
  if (info.album_count) parts.push(`${info.album_count} 张专辑`)
  return parts.join(' · ')
}



export default forwardRef<MusicListType, MusicListProps>(({ componentId, activeTab, onTabChange }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const headerRef = useRef<HeaderType>(null)
  const isUnmountedRef = useRef(false)
  const retriedRef = useRef(false)
  const info = useSingerInfo()
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)
  // 统一下载流程：权限、音质选择、进度弹窗、取消、完成提示、批量重试
  const downloadFlow = useDownloadFlow({
    progress: downloadProgressRef,
    quality: downloadQualityRef,
    failed: downloadFailedRef,
  })

  useImperativeHandle(ref, () => ({
    async loadList(source, id) {
      const compositeId = `${source}__${id}`
      const listDetailInfo = singerDetailState.listDetailInfo
      listRef.current?.setList([])
      if (listDetailInfo.id == compositeId && listDetailInfo.source == source && listDetailInfo.list.length) {
        requestAnimationFrame(() => {
          listRef.current?.setList(listDetailInfo.list)
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        setListDetailInfo(compositeId)
        singerDetailActions.setSingerName(info.name || '')
        singerDetailActions.setSingerInfo(null)
        headerRef.current?.setInfo({
          name: info.name || '',
          desc: buildDesc(info),
          imgUrl: info.img,
        })
        return getListDetail(compositeId, page).then((listDetail) => {
          const result = setListDetail(listDetail, compositeId, page)
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            // 用 API 返回的歌手简介更新 Header
            const singerInfo = singerDetailState.singerInfo
            headerRef.current?.setInfo({
              name: singerInfo?.name || info.name || '',
              desc: buildDesc({ ...info, ...singerInfo }),
              imgUrl: singerInfo?.img || info.img,
            })
            listRef.current?.setList(result.list)
            listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
          })
        }).catch(() => {
          // 首次加载失败自动重试一次（偶发 SDK 超时），避免用户手动点"重新加载"
          if (!retriedRef.current && page == 1) {
            retriedRef.current = true
            return getListDetail(compositeId, page, true).then((listDetail) => {
              const result = setListDetail(listDetail, compositeId, page)
              if (isUnmountedRef.current) return
              requestAnimationFrame(() => {
                const singerInfo = singerDetailState.singerInfo
                headerRef.current?.setInfo({
                  name: singerInfo?.name || info.name || '',
                  desc: buildDesc({ ...info, ...singerInfo }),
                  imgUrl: singerInfo?.img || info.img,
                })
                listRef.current?.setList(result.list)
                listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
              })
            }).catch(() => {
              if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
              listRef.current?.setStatus('error')
            })
          }
          if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
          listRef.current?.setStatus('error')
        })
      }
    },
  }), [])

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    const listDetailInfo = singerDetailState.listDetailInfo
    const list = listDetailInfo.list
    if (!list?.[index]) {
      console.warn(`[SingerDetail] handlePlayList: invalid index=${index} list.length=${list?.length ?? 'N/A'}`)
      return
    }
    // 匹配排行榜模式：传入 id、当前列表、索引
    void handlePlay(listDetailInfo.id, list, index)
  }
  const handlePlayAllSongs = () => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    void handlePlayAll(info.id, info.source, list)
  }
  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    getListDetail(singerDetailState.listDetailInfo.id, page, true).then((listDetail) => {
      const result = setListDetail(listDetail, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      requestAnimationFrame(() => {
        listRef.current?.setList(result.list)
        listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
      })
    }).catch(() => {
      // 已有歌曲时刷新失败：保留已加载内容，仅回到 idle，不整页标 error
      if (singerDetailState.listDetailInfo.list.length) {
        listRef.current?.setStatus('idle')
        return
      }
      if (page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = singerDetailState.listDetailInfo.list.length ? singerDetailState.listDetailInfo.page + 1 : 1
    getListDetail(singerDetailState.listDetailInfo.id, page).then((listDetail) => {
      const result = setListDetail(listDetail, singerDetailState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(result.list, true)
      listRef.current?.setStatus(singerDetailState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      // 已有歌曲时加载更多失败：保留已加载内容，不整页标 error（避免"有歌却显示加载失败"）
      if (singerDetailState.listDetailInfo.list.length) {
        listRef.current?.setStatus('idle')
        return
      }
      if (singerDetailState.listDetailInfo.list.length && page == 1) clearListDetail()
      listRef.current?.setStatus('error')
    })
  }

  const handleBatchDownload = async() => {
    const list = singerDetailState.listDetailInfo.list
    if (!list?.length) return
    const { id } = singerDetailState.listDetailInfo
    const subDir = info.name || undefined
    const run = (fullList: LX.Music.MusicInfoOnline[]) => {
      downloadFlow.downloadBatch(fullList, { subDir })
    }
    // 先显示获取歌曲数量中
    downloadProgressRef.current?.show(global.i18n.t('download_getting_song_count'), {
      onCancel: () => {
        downloadProgressRef.current?.close()
      },
    })
    try {
      const result = await getListDetailAll(id)
      downloadProgressRef.current?.close()
      if (!result.isComplete) {
        // 获取不完整，提示后由用户决定是否继续
        Alert.alert(
          global.i18n.t('download_get_incomplete_title'),
          global.i18n.t('download_get_incomplete_desc', { total: result.total, fetched: result.list.length }),
          [
            { text: global.i18n.t('cancel'), style: 'cancel' },
            { text: global.i18n.t('agree'), onPress: () => { run(result.list) } },
          ],
        )
        return
      }
      run(result.list)
    } catch {
      downloadProgressRef.current?.close()
      // 降级：使用当前已加载列表
      run(list)
    }
  }

  // 原有的批量下载逻辑（用于单页情况）
  return (
    <>
      <View style={{ flex: 1 }}>
        <Header ref={headerRef} componentId={componentId} onPlayAll={handlePlayAllSongs} onBatchDownload={handleBatchDownload} activeTab={activeTab} onTabChange={onTabChange} />
        <OnlineList
          ref={listRef}
          onPlayList={handlePlayList}
          onRefresh={handleRefresh}
          onLoadMore={handleLoadMore}
          checkHomePagerIdle
          rowType='medium'
        />
      </View>
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
    </>
  )
})
