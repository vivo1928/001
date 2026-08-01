// import './app_setting'

declare namespace LX {
  type OnlineSource = 'kw' | 'kg' | 'tx' | 'wy' | 'mg' | 'xm'
  type Source = OnlineSource | 'local'
  type Quality = '128k' | '320k' | 'flac' | 'flac24bit' | '192k' | 'ape' | 'wav' | '64k' | '32k'
  type QualityList = Partial<Record<LX.Source, LX.Quality[]>>

  type ShareType = 'system' | 'clipboard'

  type UpdateStatus = 'downloaded' | 'downloading' | 'error' | 'checking' | 'idle'
  interface VersionInfo {
    version: string
    desc: string
  }
}
