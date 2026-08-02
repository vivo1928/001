import { importUserApi } from '@/core/userApi'
import { readFile, stat } from '@/utils/fs'
import { log } from '@/utils/log'
import { toast } from '@/utils/tools'

const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024 // 50MB（配合 largeHeap，堆空间更充足）

export const handleImportScript = async(script: string) => {
  await importUserApi(script).then(() => {
    toast(global.i18n.t('user_api_import_success_tip'))
  }).catch((error: any) => {
    log.error(error.stack)
    toast(global.i18n.t('user_api_import_failed_tip', { message: error.message }), 'long')
  })
}

export const handleImportLocalFile = async(path: string) => {
  // 先检查文件大小，避免大文件读取导致 OOM 崩溃
  try {
    const fileStat = await stat(path)
    if (fileStat.size > MAX_IMPORT_FILE_SIZE) {
      throw new Error(`File too large (${(fileStat.size / 1024 / 1024).toFixed(1)}MB), max ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB`)
    }
  } catch (error: any) {
    toast(global.i18n.t('user_api_import_failed_tip', { message: error.message }), 'long')
    return
  }
  void readFile(path).then(async script => {
    if (script == null) throw new Error('Read file failed')
    void handleImportScript(script)
  }).catch((error: any) => {
    toast(global.i18n.t('user_api_import_failed_tip', { message: error.message }), 'long')
  })
}

