import { setAudioOffloadEnabled } from '@/utils/nativeModules/equalizer'

// 需要走"码流直通（offload）"的音质：这些音质通常是 E-AC3/AC-4 等多声道压缩流，
// 只有在设备硬解 + 直通时才能渲染真·全景声，且不会因为多声道 PCM 塞 AudioTrack 而崩溃。
const OFFLOAD_QUALITYS = new Set<string>(['atmos', 'atmos_plus'])

let currentOffloadMode = false

/**
 * 根据即将播放的音质切换音频输出模式：
 * - Atmos / 全景声：打开硬件 offload 直通。media3 offload 模式下会自动绕过
 *   AudioProcessor 链，均衡器天然不参与，效果等同关闭均衡器，但不修改用户持久化的均衡器偏好。
 *   码流直接交给设备硬解渲染（需设备支持 E-AC3 offload）。
 * - 其他音质：关闭 offload，均衡器处理器恢复进入音频链，用户原设置保持不变。
 *   多声道 PCM（>2 声道）在处理器内自动下混为立体声，避免 AudioTrack 无法打开多声道而崩溃。
 */
export const applyAudioModeForQuality = async(quality: LX.Quality | null | undefined): Promise<void> => {
  const shouldOffload = quality != null && OFFLOAD_QUALITYS.has(quality)
  if (shouldOffload == currentOffloadMode) {
    // 状态未变，但确保原生侧已对齐（例如首次调用时播放器尚未创建）
    await setAudioOffloadEnabled(shouldOffload)
    return
  }
  currentOffloadMode = shouldOffload
  await setAudioOffloadEnabled(shouldOffload)
}

/**
 * 是否处于 offload（Atmos 直通）模式
 */
export const isOffloadMode = (): boolean => currentOffloadMode

/**
 * 判断音质是否属于"需要直通"的高解析多声道音质
 */
export const isOffloadQuality = (quality: LX.Quality | null | undefined): boolean =>
  quality != null && OFFLOAD_QUALITYS.has(quality)
