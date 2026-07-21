import { NativeModules } from 'react-native'

const { EqualizerModule } = NativeModules

export interface BandInfo {
  index: number
  centerFreq: number
  minLevel: number
  maxLevel: number
}

export const getBandCount = (): Promise<number> => EqualizerModule.getBandCount()
export const getBandInfo = (): Promise<BandInfo[]> => EqualizerModule.getBandInfo()
export const setBandLevel = (bandIndex: number, levelMb: number): Promise<boolean> => EqualizerModule.setBandLevel(bandIndex, levelMb)
export const setAllBandLevels = (levels: number[]): Promise<boolean> => EqualizerModule.setAllBandLevels(JSON.stringify(levels))
export const getBandLevel = (bandIndex: number): Promise<number> => EqualizerModule.getBandLevel(bandIndex)
export const getCurrentPreset = (): Promise<number> => EqualizerModule.getCurrentPreset()
export const usePreset = (preset: number): Promise<boolean> => EqualizerModule.usePreset(preset)
export const getPresetNames = (): Promise<string[]> => EqualizerModule.getPresetNames()
export const setEnabled = (enabled: boolean): Promise<boolean> => EqualizerModule.setEnabled(enabled)
export const isEnabled = (): Promise<boolean> => EqualizerModule.isEnabled()
export const release = (): Promise<boolean> => EqualizerModule.release()