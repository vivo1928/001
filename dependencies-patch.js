// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

;(async() => {
  // 均衡器目标目录（react-native-track-player 模块内）
  const eqTargetDir = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/cn/toside/music/mobile/equalizer')
  const eqSourceDir = path.join(rootPath, 'android/app/src/main/java/cn/toside/music/mobile/equalizer')

  // Step 1: 复制均衡器核心类到 react-native-track-player 模块（解决跨模块编译问题）
  const eqFiles = [
    'BiquadFilter.java',
    'SoftwareEqualizer.java',
    'EqualizerAudioProcessor.java',
    'EqRenderersFactory.java',
  ]

  console.log('Copying equalizer sources to react-native-track-player module...')
  for (const f of eqFiles) {
    const src = path.join(eqSourceDir, f)
    const dst = path.join(eqTargetDir, f)
    try {
      const content = await fs.promises.readFile(src)
      await fs.promises.mkdir(path.dirname(dst), { recursive: true })
      await fs.promises.writeFile(dst, content)
      console.log('  Copied', f)
    } catch (err) {
      console.error('  Failed to copy', f, ':', err.message)
    }
  }

  // Step 2: 文本替换补丁 - 注入自定义 EqRenderersFactory 到 MusicManager
  const musicManagerPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java')

  const patchs = [
    [
      'import androidx.media3.exoplayer.DefaultRenderersFactory;',
      'import androidx.media3.exoplayer.DefaultRenderersFactory;\nimport cn.toside.music.mobile.equalizer.EqRenderersFactory;',
    ],
    [
      'DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service);',
      'DefaultRenderersFactory renderersFactory = new EqRenderersFactory(service);',
    ],
    [
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
    [
      '        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()',
      '        currentPlayer = player;\n        originalOffloadEnabled = shouldEnableAudioOffload;\n        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()',
    ],
  ]

  try {
    let file = (await fs.promises.readFile(musicManagerPath)).toString()
    for (const [fromStr, toStr] of patchs) {
      console.log('Patching MusicManager: ' + fromStr.substring(0, 60) + '...')
      if (!file.includes(fromStr)) {
        console.warn('  WARNING: Pattern not found, skipping')
        continue
      }
      file = file.replace(fromStr, toStr)
      console.log('  OK')
    }
    await fs.promises.writeFile(musicManagerPath, file)
  } catch (err) {
    console.error('Patch MusicManager failed:', err.message)
  }

  console.log('\nDependencies patch finished.\n')
})()