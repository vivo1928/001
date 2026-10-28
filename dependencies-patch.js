// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

;(async() => {
  const eqTargetDir = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/cn/toside/music/mobile/equalizer')
  const eqSourceDir = path.join(rootPath, 'android/equalizer-lib')

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

  const metadataManagerPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java')

  const metadataPatchs = [
    ['"Previous"', '"上一首"'],
    ['"Rewind"', '"快退"'],
    ['"Play"', '"播放"'],
    ['"Pause"', '"暂停"'],
    ['"Stop"', '"停止"'],
    ['"Forward"', '"快进"'],
    ['"Next"', '"下一首"'],
  ]

  const metadataActionsPatch = [
    [
      'actions = 0;\n        compactActions = 0;',
      'actions = 0;\n        compactActions = 0;\n        actions |= PlaybackStateCompat.ACTION_SET_PLAYBACK_SPEED;',
    ],
  ]

  try {
    let file = (await fs.promises.readFile(metadataManagerPath)).toString()
    for (const [fromStr, toStr] of metadataPatchs) {
      console.log('Patching MetadataManager: ' + fromStr + '...')
      if (!file.includes(fromStr)) {
        console.warn('  WARNING: Pattern not found, skipping')
        continue
      }
      file = file.replace(fromStr, toStr)
      console.log('  OK')
    }
    await fs.promises.writeFile(metadataManagerPath, file)
  } catch (err) {
    console.error('Patch MetadataManager failed:', err.message)
  }

  // 第二次 patch：添加 ACTION_SET_PLAYBACK_SPEED 到 MediaSession actions
  try {
    let file = (await fs.promises.readFile(metadataManagerPath)).toString()
    for (const [fromStr, toStr] of metadataActionsPatch) {
      if (file.includes(toStr) || !file.includes(fromStr)) {
        console.log('  MetadataManager actions already patched or pattern not found')
        continue
      }
      console.log('  Patching MetadataManager actions...')
      file = file.replace(fromStr, toStr)
      console.log('  OK')
    }
    await fs.promises.writeFile(metadataManagerPath, file)
  } catch (err) {
    console.error('Patch MetadataManager actions failed:', err.message)
  }

  const musicManagerPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java')

  const patchs = [
    [
      'boolean shouldEnableAudioOffload = options.getBoolean("audioOffload", true);',
      '// offload 默认沿用 JS 传入值。运行时由 MusicManager.setAudioOffloadEnabled 按音质\n        // 通过 AudioOffloadPreferences 开关；offload 模式下 media3 会绕过 AudioProcessor 链，\n        // 均衡器天然不参与，等效"关闭均衡器"。\n        boolean shouldEnableAudioOffload = options.getBoolean("audioOffload", true);',
    ],
    [
      'import androidx.media3.exoplayer.DefaultRenderersFactory;',
      'import androidx.media3.exoplayer.DefaultRenderersFactory;\nimport androidx.media3.exoplayer.TrackSelectionParameters;\nimport cn.toside.music.mobile.equalizer.EqRenderersFactory;',
    ],
    [
      'DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service);',
      'DefaultRenderersFactory renderersFactory = new EqRenderersFactory(service);',
    ],
    [
      '    private ExoPlayback playback;',
      `    private ExoPlayback playback;
    static ExoPlayer currentPlayer = null;
    // 期望的 offload 状态，跨曲目持久化：首次播放时 currentPlayer 可能尚未创建，
    // 先记下期望值，等播放器创建后再套用，避免 Atmos 首次播放开不起来。
    private static boolean offloadEnabled = false;

    public static void setAudioOffloadEnabled(boolean enabled) {
        offloadEnabled = enabled;
        applyOffloadToPlayer(enabled);
    }

    private static void applyOffloadToPlayer(boolean enabled) {
        if (currentPlayer == null) return;
        try {
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
        } catch (Throwable ignore) {
            // 旧版 media3 不支持 AudioOffloadPreferences 时忽略
        }
    }

    public static void restoreOriginalAudioOffload() {
        setAudioOffloadEnabled(offloadEnabled);
    }

    public static void setCurrentPlaybackSpeed(float speed) {
        if (currentPlayer != null) {
            currentPlayer.setPlaybackSpeed(speed);
        }
    }`,
    ],
    [
      '        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()',
      '        currentPlayer = player;\n        applyOffloadToPlayer(offloadEnabled);\n        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder()',
    ],
  ]

  try {
    let file = (await fs.promises.readFile(musicManagerPath)).toString()
    for (const [fromStr, toStr] of patchs) {
      // 检查是否已经修补过（避免 node_modules 缓存导致重复修补）
      const alreadyPatched = file.includes('static ExoPlayer currentPlayer = null')
      if (alreadyPatched) {
        console.log('  MusicManager already patched, skipping all patches')
        break
      }
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

  const buttonEventsPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/ButtonEvents.java')

  try {
    let file = (await fs.promises.readFile(buttonEventsPath)).toString()
    // 添加 onSetPlaybackSpeed 方法（在 onSetRating 方法之后）
    const searchStr = 'service.emit(MusicEvents.BUTTON_SET_RATING, bundle);\n    }'
    const insertStr = 'service.emit(MusicEvents.BUTTON_SET_RATING, bundle);\n    }\n\n    @Override\n    public void onSetPlaybackSpeed(float speed) {\n        Bundle bundle = new Bundle();\n        bundle.putFloat("speed", speed);\n        service.emit(MusicEvents.BUTTON_SET_PLAYBACK_SPEED, bundle);\n        com.guichaguri.trackplayer.service.MusicManager.setCurrentPlaybackSpeed(speed);\n    }'
    if (file.includes(searchStr) && !file.includes('onSetPlaybackSpeed')) {
      file = file.replace(searchStr, insertStr)
      console.log('  Patched ButtonEvents: added onSetPlaybackSpeed')
    } else if (file.includes('onSetPlaybackSpeed') && !file.includes('MusicManager.setCurrentPlaybackSpeed')) {
      const oldMethod = 'service.emit(MusicEvents.BUTTON_SET_PLAYBACK_SPEED, bundle);\n    }'
      const newMethod = 'service.emit(MusicEvents.BUTTON_SET_PLAYBACK_SPEED, bundle);\n        com.guichaguri.trackplayer.service.MusicManager.setCurrentPlaybackSpeed(speed);\n    }'
      file = file.replace(oldMethod, newMethod)
      console.log('  Patched ButtonEvents: added direct ExoPlayer speed set')
    } else {
      console.log('  ButtonEvents: already patched or pattern not found')
    }
    await fs.promises.writeFile(buttonEventsPath, file)
  } catch (err) {
    console.error('Patch ButtonEvents failed:', err.message)
  }

  const musicEventsPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/module/MusicEvents.java')

  try {
    let file = (await fs.promises.readFile(musicEventsPath)).toString()
    // 添加 BUTTON_SET_PLAYBACK_SPEED 常量
    const searchStr2 = 'public static final String BUTTON_DUCK = "remote-duck";'
    const insertStr2 = 'public static final String BUTTON_DUCK = "remote-duck";\n    public static final String BUTTON_SET_PLAYBACK_SPEED = "remote-set-speed";'
    if (file.includes(searchStr2) && !file.includes('BUTTON_SET_PLAYBACK_SPEED')) {
      file = file.replace(searchStr2, insertStr2)
      console.log('  Patched MusicEvents: added BUTTON_SET_PLAYBACK_SPEED')
    } else {
      console.log('  MusicEvents: already patched or pattern not found')
    }
    await fs.promises.writeFile(musicEventsPath, file)
  } catch (err) {
    console.error('Patch MusicEvents failed:', err.message)
  }

  console.log('\nDependencies patch finished.\n')
})()