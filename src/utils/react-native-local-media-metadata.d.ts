declare module 'react-native-local-media-metadata' {
  export interface MusicMetadata {
    type: string
    bitrate: string
    interval: number
    size: number
    ext: string
    albumName: string
    singer: string
    name: string
  }

  export interface MusicMetadataFull extends MusicMetadata {}

  export function readMetadata(filePath: string): Promise<MusicMetadataFull | null>
  export function writeMetadata(filePath: string, metadata: Partial<MusicMetadata>): Promise<boolean>
  export function readPic(filePath: string, cacheDir?: string): Promise<string>
  export function writePic(filePath: string, pic: string): Promise<boolean>
  export function readLyric(filePath: string, isLocal?: boolean): Promise<string>
  export function writeLyric(filePath: string, lyric: string): Promise<boolean>
}
