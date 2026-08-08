import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import { toast } from '@/utils/tools'
import Title from './Title'
import List from './List'
import { useI18n } from '@/lang'
import { addListMusics, moveListMusics, getListMusics, removeListMusics } from '@/core/list'
import settingState from '@/store/setting/state'

export interface SelectInfo {
  musicInfo: LX.Music.MusicInfo | null
  listId: string
  isMove: boolean
  // single: boolean
}
const initSelectInfo = {}

export interface MusicAddModalProps {
  onAdded?: () => void
  // onRename: (listInfo: LX.List.UserListInfo) => void
  // onImport: (listInfo: LX.List.MyListInfo, index: number) => void
  // onExport: (listInfo: LX.List.MyListInfo, index: number) => void
  // onSync: (listInfo: LX.List.UserListInfo) => void
  // onRemove: (listInfo: LX.List.UserListInfo) => void
}
export interface MusicAddModalType {
  show: (info: SelectInfo) => void
}

interface DupInfo {
  listId: string
  oldIds: string[]
}

const isSameMusic = (a: LX.Music.MusicInfo, b: LX.Music.MusicInfo) =>
  a.name === b.name && a.singer === b.singer && (a.meta.albumName ?? '') === (b.meta.albumName ?? '')

export default forwardRef<MusicAddModalType, MusicAddModalProps>(({ onAdded }, ref) => {
  const t = useI18n()
  const dialogRef = useRef<DialogType>(null)
  const confirmRef = useRef<ConfirmAlertType>(null)
  const [selectInfo, setSelectInfo] = useState<SelectInfo>(initSelectInfo as SelectInfo)
  const [dupInfo, setDupInfo] = useState<DupInfo | null>(null)

  useImperativeHandle(ref, () => ({
    show(selectInfo) {
      setSelectInfo(selectInfo)

      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }))

  const handleHide = () => {
    requestAnimationFrame(() => {
      setSelectInfo({ ...selectInfo, musicInfo: null })
    })
  }

  const handleAdd = async(listId: string) => {
    try {
      await addListMusics(listId,
        [selectInfo.musicInfo!],
        settingState.setting['list.addMusicLocationType'],
      )
      onAdded?.()
      toast(t('list_edit_action_tip_add_success'))
    } catch {
      toast(t('list_edit_action_tip_add_failed'))
    }
  }

  const handleReplace = () => {
    if (!dupInfo) return
    const { listId, oldIds } = dupInfo
    void removeListMusics(listId, oldIds).then(() => {
      void handleAdd(listId)
    }).catch(() => {
      toast(t('list_edit_action_tip_add_failed'))
    })
  }

  const handleSelect = (listInfo: LX.List.MyListInfo) => {
    dialogRef.current?.setVisible(false)
    if (selectInfo.isMove) {
      void moveListMusics(selectInfo.listId, listInfo.id,
        [selectInfo.musicInfo!],
        settingState.setting['list.addMusicLocationType'],
      ).then(() => {
        onAdded?.()
        toast(t('list_edit_action_tip_move_success'))
      }).catch(() => {
        toast(t('list_edit_action_tip_move_failed'))
      })
    } else {
      const musicInfo = selectInfo.musicInfo!
      void getListMusics(listInfo.id).then((targetList) => {
        const dupMusics = targetList.filter(m => isSameMusic(m, musicInfo))
        if (dupMusics.length) {
          setDupInfo({ listId: listInfo.id, oldIds: dupMusics.map(m => m.id) })
          requestAnimationFrame(() => {
            confirmRef.current?.setVisible(true)
          })
        } else {
          void handleAdd(listInfo.id)
        }
      })
    }
  }

  return (
    <Dialog ref={dialogRef} onHide={handleHide}>
      {
        selectInfo.musicInfo
          ? (<>
              <Title musicInfo={selectInfo.musicInfo} isMove={selectInfo.isMove} />
              <List musicInfo={selectInfo.musicInfo} onPress={handleSelect} />
            </>)
          : null
      }
      <ConfirmAlert
        ref={confirmRef}
        title={t('list_add_duplicate_tip_title')}
        text={t('list_add_duplicate_tip_text')}
        cancelText={t('cancel')}
        confirmText={t('list_replace')}
        onConfirm={handleReplace}
      />
    </Dialog>
  )
})
