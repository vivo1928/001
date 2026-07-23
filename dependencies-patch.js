// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const patchs = [
  // 均衡器: 注入自定义 EqRenderersFactory 到 MusicManager
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java'),
    'import androidx.media3.exoplayer.DefaultRenderersFactory;',
    'import androidx.media3.exoplayer.DefaultRenderersFactory;\nimport cn.toside.music.mobile.equalizer.EqRenderersFactory;',
  ],
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java'),
    'DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service);',
    'DefaultRenderersFactory renderersFactory = new EqRenderersFactory(service);',
  ],
  // 均衡器: 静态字段 + offload 控制方法
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java'),
    '    private ExoPlayback playback;',
    `    private ExoPlayback playback;
    static ExoPlayer currentPlayer = null;
    private static boolean originalOffloadEnabled = true;

    public static void setAudioOffloadEnabled(boolean enabled) {
        if (currentPlayer == null) return;
        TrackSelectionParameters params = currentPlayer.getTrackSelectionParameters().buildUpon()
            .setAudioOffloadPreferences(new TrackSelectionParameters.AudioOffloadPreferences.Builder()
                .setAudioOffloadMode(
                    enabled
                        ? TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED
                        : TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED)
                .setIsGaplessSupportRequired(true)
                .build())
            .build();
        currentPlayer.setTrackSelectionParameters(params);
    }

    public static void restoreOriginalAudioOffload() {
        setAudioOffloadEnabled(originalOffloadEnabled);
    }`,
  ],
  // 均衡器: 保存 ExoPlayer 引用和原始 offload 状态
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java'),
    '        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()',
    '        currentPlayer = player;\n        originalOffloadEnabled = shouldEnableAudioOffload;\n        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()',
  ],
]

;(async() => {
  for (const [filePath, fromStr, toStr] of patchs) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath)).toString()
      if (!file.includes(fromStr)) {
        console.warn(`  WARNING: Pattern not found, skipping`)
        continue
      }
      await fs.promises.writeFile(filePath, file.replace(fromStr, toStr))
      console.log(`  OK`)
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }
  console.log('\nDependencies patch finished.\n')
})()