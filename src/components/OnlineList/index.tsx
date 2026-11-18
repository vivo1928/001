import { useRef, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react'
import { View, Linking, AccessibilityInfo } from 'react-native'
// import LoadingMask, { LoadingMaskType } from '@/components/common/LoadingMask'
import List, { type ListProps, type ListType, type Status, type RowInfoType } from './List'
import ListMenu, { type ListMenuType, type Position, type SelectInfo } from './ListMenu'
import ListMusicMultiAdd, { type MusicMultiAddModalType as ListAddMultiType } from '@/components/MusicMultiAddModal'
import ListMusicAdd, { type MusicAddModalType as ListMusicAddType } from '@/components/MusicAddModal'
import MultipleModeBar, { type MultipleModeBarType, type SelectMode } from './MultipleModeBar'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import DownloadProgressModal, { type DownloadProgressModalType } from '@/components/DownloadProgressModal'
import DownloadFailedModal, { type DownloadFailedModalType } from '@/components/DownloadFailedModal'
import RangeSelectModal, { type RangeSelectModalType } from '@/components/RangeSelectModal'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import { clearMusicUrl, handleDislikeMusic, handlePlay, handlePlayLater, handleShare, handleShowMusicSourceDetail } from './listAction'
import { createStyle } from '@/utils/tools'
import { useBackHandler } from '@/utils/hooks/useBackHandler'
import useDownloadFlow from '@/core/download/useDownloadFlow'

export interface OnlineListProps {
  onRefresh: ListProps['onRefresh']
  onLoadMore: ListProps['onLoadMore']
  onPlayList?: ListProps['onPlayList']
  progressViewOffset?: ListProps['progressViewOffset']
  ListHeaderComponent?: ListProps['ListHeaderComponent']
  checkHomePagerIdle?: boolean
  rowType?: RowInfoType
  // 批量下载回调（可选，由外部决定是否展示批量下载按钮）
  onBatchDownload?: (selectedList: LX.Music.MusicInfoOnline[]) => void
}
export interface OnlineListType {
  setList: (list: LX.Music.MusicInfoOnline[], isAppend?: boolean, showSource?: boolean) => void
  setStatus: (val: Status) => void
  getList: () => LX.Music.MusicInfoOnline[]
  getSelectedList: () => LX.Music.MusicInfoOnline[]
  selectRange: (list: LX.Music.MusicInfoOnline[]) => void
}


export default forwardRef<OnlineListType, OnlineListProps>(({
  onRefresh,
  onLoadMore,
  onPlayList,
  progressViewOffset,
  ListHeaderComponent,
  checkHomePagerIdle = false,
  rowType,
  onBatchDownload,
}, ref) => {
  const listRef = useRef<ListType>(null)
  const multipleModeBarRef = useRef<MultipleModeBarType>(null)
  const listMusicAddRef = useRef<ListMusicAddType>(null)
  const listMusicMultiAddRef = useRef<ListAddMultiType>(null)
  const listMenuRef = useRef<ListMenuType>(null)
  const downloadQualityRef = useRef<DownloadQualityModalType>(null)
  const downloadProgressRef = useRef<DownloadProgressModalType>(null)
  const downloadFailedRef = useRef<DownloadFailedModalType>(null)
  const rangeSelectRef = useRef<RangeSelectModalType>(null)
  const confirmAlertRef = useRef<ConfirmAlertType>(null)
  // const loadingMaskRef = useRef<LoadingMaskType>(null)

  // 统一下载流程：权限、音质选择、进度弹窗、取消、完成提示、批量重试
  const downloadFlow = useDownloadFlow({
    progress: downloadProgressRef,
    quality: downloadQualityRef,
    failed: downloadFailedRef,
    confirmAlert: confirmAlertRef,
  })

  useImperativeHandle(ref, () => ({
    setList(list, isAppend = false, showSource = false) {
      listRef.current?.setList(list, isAppend, showSource)
      multipleModeBarRef.current?.setIsSelectAll(false)
    },
    setStatus(val) {
      listRef.current?.setStatus(val)
    },
    getList() {
      return listRef.current?.getList() ?? []
    },
    getSelectedList() {
      return listRef.current?.getSelectedList() ?? []
    },
    selectRange(list) {
      listRef.current?.selectRange(list)
    },
  }))

  // ============ 多选模式 ============
  const hancelMultiSelect = useCallback(() => {
    multipleModeBarRef.current?.show()
    listRef.current?.setIsMultiSelectMode(true)
  }, [])
  const hancelSwitchSelectMode = useCallback((mode: SelectMode) => {
    multipleModeBarRef.current?.setSwitchMode(mode)
    listRef.current?.setSelectMode(mode)
  }, [])
  const handleRangeSelect = useCallback(() => {
    const list = listRef.current?.getList() ?? []
    if (list.length === 0) return
    rangeSelectRef.current?.show(list.length, {
      onConfirm: (start, end) => {
        // 选中区间 [start-1, end-1] 的歌曲
        const selected = list.slice(start - 1, end)
        listRef.current?.selectRange(selected)
      },
    })
  }, [])
  const hancelExitSelect = useCallback(() => {
    multipleModeBarRef.current?.exitSelectMode()
    listRef.current?.setIsMultiSelectMode(false)
    // 无障碍播报：已退出多选模式
    AccessibilityInfo.announceForAccessibility(
      global.i18n.t('download_multi_select_exit') || '已退出多选模式',
    )
  }, [])

  // 多选模式下按返回键退出多选模式，而不是返回上一级
  useBackHandler(useCallback(() => {
    if (!listRef.current?.isMultiSelectMode()) return false
    hancelExitSelect()
    return true
  }, [hancelExitSelect]))

  // 切换首页模块（排行榜/歌单等）时自动退出多选模式
  useEffect(() => {
    const handleHomePageChange = () => {
      if (!listRef.current?.isMultiSelectMode()) return
      hancelExitSelect()
    }
    global.state_event.on('homePageChange', handleHomePageChange)
    return () => {
      global.state_event.off('homePageChange', handleHomePageChange)
    }
  }, [hancelExitSelect])

  const showMenu = (musicInfo: LX.Music.MusicInfoOnline, index: number, position: Position) => {
    listMenuRef.current?.show({
      musicInfo,
      index,
      single: false,
      selectedList: listRef.current!.getSelectedList(),
    }, position)
  }

  // ============ 单个歌曲下载 ============
  const handleSingleDownload = (info: SelectInfo) => {
    downloadFlow.downloadSingle(info.musicInfo, { showFileSize: true })
  }

  // ============ 批量下载 ============
  const handleBatchDownload = useCallback(() => {
    const selectedList = listRef.current?.getSelectedList() ?? []
    if (!selectedList.length) return
    downloadFlow.downloadBatch(selectedList)
  }, [])

  const handleAddMusic = (info: SelectInfo) => {
    if (info.selectedList.length) {
      listMusicMultiAddRef.current?.show({ selectedList: info.selectedList, listId: '', isMove: false })
    } else {
      listMusicAddRef.current?.show({ musicInfo: info.musicInfo, listId: '', isMove: false })
    }
  }

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <List
          ref={listRef}
          onShowMenu={showMenu}
          onMuiltSelectMode={hancelMultiSelect}
          onSelectAll={isAll => multipleModeBarRef.current?.setIsSelectAll(isAll)}
          onRefresh={onRefresh}
          onLoadMore={onLoadMore}
          onPlayList={onPlayList}
          progressViewOffset={progressViewOffset}
          ListHeaderComponent={ListHeaderComponent}
          checkHomePagerIdle={checkHomePagerIdle}
          rowType={rowType}
        />
        <MultipleModeBar
          ref={multipleModeBarRef}
          onSwitchMode={hancelSwitchSelectMode}
          onSelectAll={isAll => listRef.current?.selectAll(isAll)}
          onExitSelectMode={hancelExitSelect}
          onBatchDownload={handleBatchDownload}
          onRangeSelect={handleRangeSelect}
        />
      </View>
      <ListMusicAdd ref={listMusicAddRef} onAdded={() => { hancelExitSelect() }} />
      <ListMusicMultiAdd ref={listMusicMultiAddRef} onAdded={() => { hancelExitSelect() }} />
      <ListMenu
        ref={listMenuRef}
        onPlay={info => { handlePlay(info.musicInfo, listRef.current?.getList()) }}
        onPlayLater={info => { hancelExitSelect(); handlePlayLater(info.musicInfo, info.selectedList, hancelExitSelect) }}
        onDownload={handleSingleDownload}
        onCopyName={info => { handleShare(info.musicInfo) }}
        onAdd={handleAddMusic}
        onMusicSourceDetail={info => { void handleShowMusicSourceDetail(info.musicInfo) }}
        onRemoveCache={info => { void clearMusicUrl(info.musicInfo) }}
        onDislikeMusic={info => { void handleDislikeMusic(info.musicInfo) }}
      />
      <DownloadQualityModal ref={downloadQualityRef} />
      <DownloadProgressModal ref={downloadProgressRef} />
      <DownloadFailedModal ref={downloadFailedRef} />
      <RangeSelectModal ref={rangeSelectRef} />
      <ConfirmAlert
        ref={confirmAlertRef}
        title={global.i18n.t('download_storage_permission_title')}
        text={global.i18n.t('download_storage_permission_denied')}
        confirmText={global.i18n.t('open_settings')}
        onConfirm={() => { void Linking.openSettings() }}
      />
      {/* <LoadingMask ref={loadingMaskRef} /> */}
    </View>
  )
})


const styles = createStyle({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  exitMultipleModeBtn: {
    height: 40,
  },
})
