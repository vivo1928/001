import type RNFS from 'react-native-fs'
import { handleGetOnlineMusicUrl } from '@/core/music/utils'
import { buildQualityFallbackOrder } from '@/core/music/online'
import {
  downloadFile,
  stopDownload,
  mkdir,
  existsFile,
  externalStorageDirectoryPath,
} from '@/utils/fs'
import { requestStoragePermission } from '@/utils/permissions'
import { formatMusicName, toast } from '@/utils/tools'
import settingState from '@/store/setting/state'

/**
 * 音质到文件扩展名的映射表
 */
const QUALITY_EXT_MAP: Record<string, LX.Download.FileExt> = {
  '128k': 'mp3',
  '320k': 'mp3',
  '192k': 'mp3',
  '64k': 'mp3',
  '32k': 'mp3',
  flac: 'flac',
  flac24bit: 'flac',
  hires: 'flac',
  master: 'flac',
  atmos: 'flac',
  atmos_plus: 'flac',
  ape: 'ape',
  wav: 'wav',
}

/**
 * 根据音质获取文件扩展名
 */
const getFileExt = (quality: LX.Quality): LX.Download.FileExt => {
  return QUALITY_EXT_MAP[quality] ?? 'mp3'
}

/**
 * 生成唯一任务ID
 */
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11)
}

/**
 * 清理文件名中的非法字符
 */
const sanitizeFileName = (name: string): string => {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim()
}

// 基础下载目录：公共目录/音乐下载
const BASE_DOWNLOAD_DIR = `${externalStorageDirectoryPath}/音乐下载`

// 最大重试次数
const MAX_RETRIES = 3
// 下载超时（毫秒）
const DOWNLOAD_TIMEOUT = 60000
// 连接超时（毫秒）
const CONNECTION_TIMEOUT = 15000
// 重试延迟基数（毫秒）
const RETRY_BASE_DELAY = 1000

// ---------------------------------------------------------------------------
// 公开类型
// ---------------------------------------------------------------------------

/** 下载任务状态 */
export interface DownloadTask {
  id: string
  musicInfo: LX.Music.MusicInfoOnline
  quality: LX.Quality
  status: 'waiting' | 'downloading' | 'completed' | 'failed'
  progress: number // 0-100
  filePath: string
  fileName: string
  error?: string
  subDir?: string // 子目录名（歌单/专辑名）
  retryCount?: number // 当前重试次数
}

/** 下载进度回调 */
export type DownloadProgressCallback = (taskId: string, progress: number) => void

/** 下载完成回调 */
export type DownloadCompleteCallback = (taskId: string, success: boolean, error?: string) => void

// ---------------------------------------------------------------------------
// 下载管理器
// ---------------------------------------------------------------------------

class DownloadManager {
  private readonly queue: DownloadTask[] = []
  private isProcessing = false
  private readonly onProgress: DownloadProgressCallback
  private readonly onComplete: DownloadCompleteCallback
  private currentJobId: number | null = null
  private currentTaskId: string | null = null
  private readonly downloadDir: string
  private readonly abortController: AbortController | null = null

  constructor(
    onProgress: DownloadProgressCallback = () => {},
    onComplete: DownloadCompleteCallback = () => {},
    downloadDir?: string,
  ) {
    this.onProgress = onProgress
    this.onComplete = onComplete
    this.downloadDir = downloadDir ?? BASE_DOWNLOAD_DIR
  }

  // -----------------------------------------------------------------------
  // 公共方法
  // -----------------------------------------------------------------------

  /**
   * 获取下载文件的保存路径和文件名
   * 文件名格式：按设置 download.fileName 决定（默认"歌名 - 歌手"）
   * 如有子目录则在基础下载目录下创建子目录
   */
  getDownloadPath(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality, subDir?: string): { filePath: string, fileName: string } {
    const ext = getFileExt(quality)
    const fileNameFormat = settingState.setting['download.fileName']
    const fileName = `${sanitizeFileName(formatMusicName(fileNameFormat, musicInfo.name, musicInfo.singer))}.${ext}`
    const dir = subDir ? `${this.downloadDir}/${sanitizeFileName(subDir)}` : this.downloadDir
    const filePath = `${dir}/${fileName}`
    return { filePath, fileName }
  }

  /**
   * 添加单个下载任务到队列
   * @param musicInfo 歌曲信息
   * @param quality 音质
   * @param subDir 可选子目录（歌单名/专辑名）
   * @returns 任务ID
   */
  addToQueue(musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality, subDir?: string): string {
    const id = generateId()
    const { filePath, fileName } = this.getDownloadPath(musicInfo, quality, subDir)

    const task: DownloadTask = {
      id,
      musicInfo,
      quality,
      status: 'waiting',
      progress: 0,
      filePath,
      fileName,
      subDir,
      retryCount: 0,
    }

    this.queue.push(task)
    void this.processQueue()

    return id
  }

  /**
   * 批量添加下载任务到队列
   * @param musicInfos 歌曲列表
   * @param quality 音质
   * @param subDir 可选子目录（歌单名/专辑名）
   * @returns 任务ID数组
   */
  addBatchToQueue(musicInfos: LX.Music.MusicInfoOnline[], quality: LX.Quality, subDir?: string): string[] {
    return musicInfos.map((musicInfo) => this.addToQueue(musicInfo, quality, subDir))
  }

  /**
   * 取消单个下载任务
   */
  cancelTask(taskId: string): void {
    const index = this.queue.findIndex((t) => t.id === taskId)
    if (index === -1) return

    const task = this.queue[index]

    // 如果该任务正在下载，立即停止当前下载
    if (task.status === 'downloading' && this.currentTaskId === taskId) {
      if (this.currentJobId !== null) {
        stopDownload(this.currentJobId)
        this.currentJobId = null
      }
      task.status = 'failed'
      task.error = 'cancelled'
    }

    // 从队列中移除
    this.queue.splice(index, 1)
    this.onComplete(taskId, false, 'cancelled')

    // 不在此处手动修改 isProcessing/currentTaskId 或调用 processQueue：
    // 正在运行的 processQueue 会在 downloadSingleTask 被中断后于 finally 中
    // 自动清理状态并续推队列，手动干预会导致状态错乱、并发下载
  }

  /**
   * 取消所有下载任务
   */
  cancelAll(): void {
    // 停止当前正在进行的下载
    if (this.currentJobId !== null && this.currentTaskId) {
      const currentTask = this.queue.find((t) => t.id === this.currentTaskId)
      if (currentTask) {
        currentTask.status = 'failed'
        currentTask.error = 'cancelled'
        this.onComplete(currentTask.id, false, 'cancelled')
      }
      stopDownload(this.currentJobId)
      this.currentJobId = null
    }

    // 标记队列中所有等待中的任务为已取消
    const remainingTasks = this.queue.filter(
      (t) => t.status === 'waiting' || t.status === 'downloading',
    )
    for (const task of remainingTasks) {
      task.status = 'failed'
      task.error = 'cancelled'
      this.onComplete(task.id, false, 'cancelled')
    }

    this.queue.length = 0

    // 不手动修改 isProcessing/currentTaskId：正在运行的 processQueue 会在
    // downloadSingleTask 被中断后于 finally 中自动收尾，并发现队列为空而退出
  }

  /**
   * 重试失败的下载任务
   */
  retryTask(taskId: string): void {
    const task = this.queue.find((t) => t.id === taskId)
    if (!task) return

    // 只允许重试失败状态的任务
    if (task.status !== 'failed') return

    task.status = 'waiting'
    task.progress = 0
    task.error = undefined
    task.retryCount = 0

    void this.processQueue()
  }

  /**
   * 获取当前队列的深拷贝
   */
  getQueue(): DownloadTask[] {
    return this.queue.map((t) => ({ ...t }))
  }

  /**
   * 获取指定任务 id 在队列中的实时任务对象（非拷贝），
   * 调用方可据此读取任务的最新状态（status/progress 会随下载过程实时更新）
   */
  getTasksByIds(taskIds: string[]): DownloadTask[] {
    const ids = new Set(taskIds)
    return this.queue.filter((t) => ids.has(t.id))
  }

  /**
   * 获取队列中各状态的任务数量统计
   */
  getStats(): { total: number, completed: number, failed: number, downloading: number } {
    return {
      total: this.queue.length,
      completed: this.queue.filter((t) => t.status === 'completed').length,
      failed: this.queue.filter((t) => t.status === 'failed').length,
      downloading: this.queue.filter((t) => t.status === 'downloading').length,
    }
  }

  /**
   * 按指定的任务 id 子集统计完成情况（实时状态），
   * 用于批量下载的进度与完成判定，避免被全局队列中其他批次的任务干扰
   */
  getBatchStats(taskIds: string[]): { total: number, completed: number, failed: number, downloading: number } {
    const tasks = this.getTasksByIds(taskIds)
    return {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      downloading: tasks.filter((t) => t.status === 'downloading').length,
    }
  }

  // -----------------------------------------------------------------------
  // 私有方法
  // -----------------------------------------------------------------------

  /**
   * 处理下载队列 —— 顺序执行，同一时间只下载一个任务
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return

    const nextTask = this.queue.find((t) => t.status === 'waiting')
    if (!nextTask) return

    this.isProcessing = true
    this.currentTaskId = nextTask.id
    nextTask.status = 'downloading'

    try {
      await this.downloadSingleTask(nextTask)
    } catch (error: any) {
      // 任务已被取消
      if (nextTask.status !== 'downloading') return

      const errorMessage = error?.message ?? String(error)
      console.error('[DownloadManager] download failed:', nextTask.id, errorMessage)
      nextTask.error = errorMessage

      // 自动重试（最多 MAX_RETRIES 次）
      if (errorMessage !== 'cancelled' && (nextTask.retryCount ?? 0) < MAX_RETRIES) {
        nextTask.retryCount = (nextTask.retryCount ?? 0) + 1
        const delay = RETRY_BASE_DELAY * Math.pow(2, nextTask.retryCount - 1)
        console.log(`[DownloadManager] retry ${nextTask.retryCount}/${MAX_RETRIES} for task ${nextTask.id} after ${delay}ms`)
        nextTask.status = 'waiting'
        nextTask.progress = 0
        // 等待重试间隔（期间保持 isProcessing，防止其他调用并发启动任务），
        // 状态清理统一交由 finally 完成
        await new Promise(resolve => setTimeout(resolve, delay))
        return
      }

      nextTask.status = 'failed'
      this.onComplete(nextTask.id, false, nextTask.error)
    } finally {
      // 仅当本次调用仍在处理该任务时才清理状态并续推队列，
      // 避免与取消操作或其他 processQueue 调用产生竞态（并发下载）
      if (this.currentTaskId === nextTask.id) {
        this.currentTaskId = null
        this.currentJobId = null
        this.isProcessing = false
        // 递归处理下一个等待中的任务
        void this.processQueue()
      }
    }
  }

  /**
   * 等待指定时间
   */
  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取下载 URL（首次失败时刷新重试）
   * 音源降级时按实际生效音质更新任务的扩展名，
   * 避免出现"标签显示无损、实际是降级音质"的格式不匹配
   */
  private async fetchDownloadUrl(task: DownloadTask): Promise<string> {
    const fetchUrlAt = async(quality: LX.Quality, isRefresh: boolean): Promise<string> => {
      const urlResult = await handleGetOnlineMusicUrl({
        musicInfo: task.musicInfo,
        quality,
        onToggleSource: () => {},
        isRefresh,
        allowToggleSource: true,
      })
      const actualQuality = urlResult.quality || quality
      if (actualQuality !== task.quality) {
        toast(`该品质不可用，已降级为 ${actualQuality}`)
        task.quality = actualQuality
        const path = this.getDownloadPath(task.musicInfo, actualQuality, task.subDir)
        task.filePath = path.filePath
        task.fileName = path.fileName
      }
      return urlResult.url
    }

    // 降级切换前等待 5 秒：给后端/网络缓冲时间，避免短暂失败立即降质
    const qualityOrder = buildQualityFallbackOrder(task.quality, task.musicInfo)
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      const isRefresh = attempt > 0
      for (let qi = 0; qi < qualityOrder.length; qi++) {
        const q = qualityOrder[qi]
        try {
          return await fetchUrlAt(q as LX.Quality, isRefresh)
        } catch (err: any) {
          lastErr = err
          console.log(`[DownloadManager] URL fetch ${q} (attempt ${attempt + 1}) failed: ${err?.message || err}`)
          // 降级到下一音质前等待 5 秒
          if (qi < qualityOrder.length - 1) await this.delay(5000)
        }
      }
      if (attempt < 2) await this.delay(500 * (attempt + 1))
    }
    throw new Error(`获取下载链接失败: ${lastErr instanceof Error ? lastErr.message : '未知错误'}`)
  }

  /**
   * 执行单个文件的下载流程
   */
  private async downloadSingleTask(task: DownloadTask): Promise<void> {
    // 0. 申请存储权限（写入公共目录需要）
    const granted = await requestStoragePermission()
    if (!granted) {
      throw new Error('未获得存储权限，无法下载歌曲，请在系统设置中允许存储访问')
    }

    // 1. 确保下载目录存在（含子目录）
    const targetDir = task.subDir ? `${this.downloadDir}/${sanitizeFileName(task.subDir)}` : this.downloadDir
    const dirExists = await existsFile(targetDir).catch(() => false)
    if (!dirExists) {
      await mkdir(targetDir)
    }
    // 也确保基础下载目录存在
    const baseDirExists = await existsFile(this.downloadDir).catch(() => false)
    if (!baseDirExists) {
      await mkdir(this.downloadDir)
    }

    // 2. 获取下载 URL（失败时自动刷新重试），并同步实际生效音质
    const url = await this.fetchDownloadUrl(task)
    if (!url) {
      throw new Error('获取下载链接失败：链接为空')
    }

    // 3. 检查文件是否已存在，如果存在则跳过
    const fileExists = await existsFile(task.filePath).catch(() => false)
    if (fileExists) {
      console.log(`[DownloadManager] file already exists, skipping: ${task.filePath}`)
      task.status = 'completed'
      task.progress = 100
      this.onProgress(task.id, 100)
      this.onComplete(task.id, true)
      return
    }

    // 4. 发起下载（带超时控制）
    const result = downloadFile(url, task.filePath, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36',
      },
      connectionTimeout: CONNECTION_TIMEOUT,
      readTimeout: DOWNLOAD_TIMEOUT,
      progress: (res: RNFS.DownloadProgressCallbackResult) => {
        // 下载过程中再次检查任务是否已被取消
        if (task.status !== 'downloading') return

        const progress =
          res.contentLength > 0
            ? Math.round((res.bytesWritten / res.contentLength) * 100)
            : 0
        task.progress = Math.min(progress, 100)
        this.onProgress(task.id, task.progress)
      },
      progressDivider: 1,
    })

    this.currentJobId = result.jobId

    let downloadResult: RNFS.DownloadResult
    try {
      downloadResult = await result.promise
    } catch (error: any) {
      // 如果任务已被取消，静默忽略
      if (task.status !== 'downloading') return
      throw error
    }

    // 再次检查任务是否已被取消
    if (task.status !== 'downloading') return

    // 5. 检查下载结果
    if (downloadResult.statusCode === 200) {
      // 验证文件是否真的存在且大于0字节
      const fileStat = await existsFile(task.filePath).catch(() => false)
      if (!fileStat) {
        throw new Error('下载完成但文件不存在')
      }
      task.status = 'completed'
      task.progress = 100
      this.onProgress(task.id, 100)
      this.onComplete(task.id, true)
    } else if (downloadResult.statusCode === 304) {
      // 文件未修改，视为已存在（缓存命中）
      task.status = 'completed'
      task.progress = 100
      this.onProgress(task.id, 100)
      this.onComplete(task.id, true)
    } else {
      throw new Error(`下载失败，服务器返回状态码: ${downloadResult.statusCode}`)
    }
  }
}

export default DownloadManager
