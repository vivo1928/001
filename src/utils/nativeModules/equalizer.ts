import { NativeModules } from 'react-native'

const { EqualizerModule } = NativeModules

export interface BandInfo {
  index: number
  centerFreq: number
  minLevel: number
  maxLevel: number
  currentLevel: number
}

/**
 * 均衡器预设
 * 每个预设包含名称和10个频段的增益值（单位：毫分贝 mB，1dB = 1000mB）
 * 频率点: 31Hz, 62Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
 */
export interface EqualizerPreset {
  id: string
  name: string
  levels: number[] // mB 单位
}

export const EQ_PRESETS: EqualizerPreset[] = [
  {
    id: 'flat',
    name: 'eq_preset_flat',
    levels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 'bass_boost',
    name: 'eq_preset_bass_boost',
    levels: [6000, 5000, 4000, 2000, 0, -1000, -1000, 0, 1000, 2000],
  },
  {
    id: 'treble_boost',
    name: 'eq_preset_treble_boost',
    levels: [-2000, -1000, 0, 0, 0, 0, 1000, 3000, 5000, 6000],
  },
  {
    id: 'vocal',
    name: 'eq_preset_vocal',
    levels: [-2000, -1000, 0, 2000, 4000, 4000, 3000, 1000, 0, -1000],
  },
  {
    id: 'rock',
    name: 'eq_preset_rock',
    levels: [5000, 4000, 2000, -1000, -2000, 1000, 3000, 4000, 5000, 5000],
  },
  {
    id: 'pop',
    name: 'eq_preset_pop',
    levels: [-1000, -1000, 0, 2000, 4000, 4000, 2000, 0, -1000, -1000],
  },
  {
    id: 'jazz',
    name: 'eq_preset_jazz',
    levels: [3000, 2000, 1000, 2000, -1000, -1000, 0, 1000, 2000, 3000],
  },
  {
    id: 'classical',
    name: 'eq_preset_classical',
    levels: [4000, 3000, 2000, 1000, -1000, -1000, 0, 2000, 3000, 4000],
  },
  {
    id: 'dance',
    name: 'eq_preset_dance',
    levels: [6000, 5000, 0, -2000, -3000, -2000, 2000, 4000, 5000, 6000],
  },
  {
    id: 'hiphop',
    name: 'eq_preset_hiphop',
    levels: [5000, 5000, 3000, 1000, 0, -1000, 1000, 0, 2000, 3000],
  },
  {
    id: 'custom',
    name: 'eq_preset_custom',
    levels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
]

export const isAvailable = async(): Promise<boolean> => {
  try {
    return await EqualizerModule.isAvailable()
  } catch {
    return false
  }
}

export const setEnabled = async(enabled: boolean): Promise<void> => {
  await EqualizerModule.setEnabled(enabled)
}

export const getEnabled = async(): Promise<boolean> => {
  return await EqualizerModule.getEnabled()
}

export const getBandInfo = async(): Promise<BandInfo[]> => {
  return await EqualizerModule.getBandInfo()
}

export const setBandLevel = async(band: number, levelMb: number): Promise<void> => {
  await EqualizerModule.setBandLevel(band, levelMb)
}

export const setBandLevels = async(levelsMb: number[]): Promise<void> => {
  await EqualizerModule.setBandLevels(levelsMb)
}

export const getBandLevels = async(): Promise<number[]> => {
  return await EqualizerModule.getBandLevels()
}

export const resetEq = async(): Promise<void> => {
  await EqualizerModule.reset()
}

/**
 * 将毫分贝值格式化为可读的 dB 字符串
 * 例如: 0 -> "0dB", 3000 -> "+3dB", -6000 -> "-6dB", 1500 -> "+1.5dB"
 */
export const formatDb = (mb: number): string => {
  const db = mb / 1000
  if (db === 0) return '0dB'
  const sign = db > 0 ? '+' : ''
  // 对于整数值，不显示小数
  if (Number.isInteger(db)) {
    return `${sign}${db}dB`
  }
  return `${sign}${db.toFixed(1)}dB`
}

/**
 * 格式化频率显示
 */
export const formatFreq = (hz: number): string => {
  if (hz >= 1000) {
    const khz = hz / 1000
    return Number.isInteger(khz) ? `${khz}kHz` : `${khz.toFixed(1)}kHz`
  }
  return `${hz}Hz`
}
