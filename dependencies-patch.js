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

  // 将 track-player 模块的 media3 版本升到与 app 模块一致（1.10.1）。
  // track-player 硬编码 1.8.0，而 EqualizerAudioProcessor 用到的
  // androidx.media3.common.AudioFormat 在 media3 1.9 才引入，不升级会编译失败。
  const trackPlayerBuildGradlePath = path.join(rootPath, 'node_modules/react-native-track-player/android/build.gradle')
  try {
    let file = (await fs.promises.readFile(trackPlayerBuildGradlePath)).toString()
    const media3Patches = [
      ["def media3Version = '1.8.0'", "def media3Version = '1.10.1'"],
      ['implementation "androidx.media3:media3-exoplayer:1.8.0"', 'implementation "androidx.media3:media3-exoplayer:1.10.1"'],
    ]
    for (const [fromStr, toStr] of media3Patches) {
      if (file.includes(fromStr)) {
        file = file.replace(fromStr, toStr)
        console.log('Patch track-player build.gradle media3: OK')
      } else if (file.includes('1.10.1')) {
        console.log('track-player build.gradle media3 already patched')
        break
      } else {
        console.warn('  WARNING: track-player media3 pattern not found: ' + fromStr)
      }
    }
    await fs.promises.writeFile(trackPlayerBuildGradlePath, file)
  } catch (err) {
    console.error('Patch track-player build.gradle failed:', err.message)
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
      if (file.includes(toStr)) {
        console.log('Patching MetadataManager: ' + fromStr + '... already applied')
        continue
      }
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
                    // 本 App 支持倍速播放：声明需要支持变速，设备 offload 不支持变速时
                    // media3 会自动回退 PCM，避免开倍速后 offload 异常。与上游 v1.9.2 保持一致。
                    .setIsSpeedChangeSupportRequired(true)
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
      // 逐条幂等：以补丁目标文本判断是否已应用。
      // 不能用整文件标记（static ExoPlayer currentPlayer）——该标记由第 4 条补丁插入，
      // 会让其后的补丁被整体跳过，导致 currentPlayer 赋值永远缺失、
      // 运行时 offload 开关与变速钩子静默失效
      if (file.includes(toStr)) {
        console.log('  MusicManager patch already applied, skipping: ' + fromStr.substring(0, 40) + '...')
        continue
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

  // ===== 稳定缓存 key（边存边播）=====
  // ExoPlayer 默认的磁盘缓存 key 由完整 URL 派生，每次刷新拿到新签名 URL 就等于新的
  // 缓存 key，之前边播边缓存的数据再也命中不了，导致重复下载、无法离线播。
  // 这里给 track 增加可选 cacheKey 字段：JS 侧对"歌曲+音质"算出固定哈希，
  // 原生 CacheDataSource 用该固定 key 读写磁盘缓存，实现边存边播 + 下次直接命中。
  const trackPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/models/Track.java')

  const trackPatches = [
    [
      '    public String contentType;\n    public String userAgent;',
      '    public String contentType;\n    public String userAgent;\n\n    public String cacheKey;',
    ],
    [
      '        contentType = bundle.getString("contentType");\n        userAgent = bundle.getString("userAgent");',
      '        contentType = bundle.getString("contentType");\n        userAgent = bundle.getString("userAgent");\n        cacheKey = bundle.getString("cacheKey");',
    ],
    [
      '            ds = playback.enableCaching(factory);',
      '            ds = playback.enableCaching(factory, cacheKey);',
    ],
  ]

  try {
    let file = (await fs.promises.readFile(trackPath)).toString()
    if (file.includes('public String cacheKey;')) {
      console.log('  Track.java cacheKey already patched')
    } else {
      for (const [fromStr, toStr] of trackPatches) {
        if (!file.includes(fromStr)) {
          console.warn('  WARNING: Track.java pattern not found: ' + fromStr.substring(0, 50))
          continue
        }
        file = file.replace(fromStr, toStr)
        console.log('  Patch Track.java: OK')
      }
      await fs.promises.writeFile(trackPath, file)
      console.log('Track.java cacheKey patch: OK')
    }
  } catch (err) {
    console.error('Patch Track.java failed:', err.message)
  }

  const localPlaybackPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/player/LocalPlayback.java')
  const exoPlaybackPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/player/ExoPlayback.java')
  const musicModulePath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/module/MusicModule.java')

  const enableCachingOld = `    public DataSource.Factory enableCaching(DataSource.Factory ds) {
        if(cache == null || cacheMaxSize <= 0) return ds;

        return new CacheDataSource.Factory()
                                .setCache(cache)
                                .setUpstreamDataSourceFactory(ds)
                                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
    }`
  const enableCachingNew = `    public DataSource.Factory enableCaching(DataSource.Factory ds) {
        return enableCaching(ds, null);
    }

    public DataSource.Factory enableCaching(DataSource.Factory ds, String cacheKey) {
        if(cache == null || cacheMaxSize <= 0) return ds;

        CacheDataSource.Factory factory = new CacheDataSource.Factory()
                                .setCache(cache)
                                .setUpstreamDataSourceFactory(ds)
                                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);

        if(cacheKey != null && !cacheKey.isEmpty()) {
            // 固定缓存 key：同一首歌同一音质永远命中同一块磁盘缓存，
            // 即便签名 URL 已被刷新也不影响命中（标准实现）。
            factory.setCacheKeyFactory(dataSpec -> cacheKey);
        }

        return factory;
    }`

  try {
    let file = (await fs.promises.readFile(localPlaybackPath)).toString()
    if (file.includes('enableCaching(DataSource.Factory ds, String cacheKey)')) {
      console.log('  LocalPlayback.java cacheKey already patched')
    } else if (file.includes(enableCachingOld)) {
      file = file.replace(enableCachingOld, enableCachingNew)
      await fs.promises.writeFile(localPlaybackPath, file)
      console.log('LocalPlayback.java cacheKey patch: OK')
    } else {
      console.warn('  WARNING: LocalPlayback.java enableCaching pattern not found')
    }
  } catch (err) {
    console.error('Patch LocalPlayback.java failed:', err.message)
  }

  // ===== 缓存判定（isCached）=====
  // 原生 isCached 用 cache.getCachedSpans(key) 判空，只要有任意一段缓存就返回 true。
  // 边存边播时刚播了几秒就有缓存，于是被误判为"整首已缓存"，断网/过期链接兜底时
  // 播到中途才发现数据缺失。这里改为：
  // - exo_len（内容总长度）已知时要求 [0, contentLength) 区间连续无空洞才算命中；
  // - exo_len 未知（响应无 Content-Length 的分块传输）时只要有缓存数据即可试播——
  //   否则这类歌永远无法离线播放；播到缺口/结尾由播放器错误处理收尾。
  const isCachedOld = `    public void isCached(String url, Promise promise) {
        if (cache == null) {
          promise.resolve(false);
          return;
        }
        NavigableSet<CacheSpan> cachedSpans = cache.getCachedSpans(url);
        promise.resolve(!cachedSpans.isEmpty());
    }`
  const isCachedPatchedOld = `    public void isCached(String url, Promise promise) {
        if (cache == null) {
          promise.resolve(false);
          return;
        }
        // 完整缓存判定：内容总长度已知（exo_len）且 [0, contentLength) 区间连续无空洞才算命中。
        // Cache.isCached 语义正是"区间完整覆盖"，避免"只缓存了开头几秒"被误判为整首可离线播放。
        long contentLength = ContentMetadata.getContentLength(cache.getContentMetadata(url));
        if (contentLength == C.LENGTH_UNSET) {
          promise.resolve(false);
          return;
        }
        promise.resolve(cache.isCached(url, 0, contentLength));
    }`
  const isCachedNew = `    public void isCached(String url, Promise promise) {
        if (cache == null) {
          promise.resolve(false);
          return;
        }
        // 缓存命中判定：总长度已知（exo_len）时要求 [0, contentLength) 区间完整覆盖，
        // 避免"只缓存了开头几秒"被误判为整首可离线播放；
        // 总长未知（分块传输无 Content-Length）时只要有缓存数据即可试播，
        // 播到缺口/结尾由播放器错误处理收尾，不再把已有数据的歌判为完全不可离线。
        long contentLength = ContentMetadata.getContentLength(cache.getContentMetadata(url));
        if (contentLength == C.LENGTH_UNSET) {
          promise.resolve(cache.getCachedBytes(url, 0, Long.MAX_VALUE) > 0);
          return;
        }
        promise.resolve(cache.isCached(url, 0, contentLength));
    }`
  const contentMetadataImportOld = 'import androidx.media3.datasource.cache.CacheSpan;'
  const contentMetadataImportNew = 'import androidx.media3.datasource.cache.CacheSpan;\nimport androidx.media3.datasource.cache.ContentMetadata;'

  try {
    let file = (await fs.promises.readFile(localPlaybackPath)).toString()
    const ensureContentMetadataImport = (text) => {
      if (text.includes('import androidx.media3.datasource.cache.ContentMetadata;')) return text
      if (text.includes(contentMetadataImportOld)) return text.replace(contentMetadataImportOld, contentMetadataImportNew)
      console.warn('  WARNING: LocalPlayback.java ContentMetadata import anchor not found')
      return text
    }
    if (file.includes('cache.getCachedBytes(url, 0, Long.MAX_VALUE) > 0')) {
      console.log('  LocalPlayback.java isCached already patched (relaxed)')
    } else if (file.includes(isCachedPatchedOld)) {
      file = file.replace(isCachedPatchedOld, isCachedNew)
      await fs.promises.writeFile(localPlaybackPath, file)
      console.log('LocalPlayback.java isCached relaxed upgrade: OK')
    } else if (file.includes(isCachedOld)) {
      file = ensureContentMetadataImport(file)
      file = file.replace(isCachedOld, isCachedNew)
      await fs.promises.writeFile(localPlaybackPath, file)
      console.log('LocalPlayback.java isCached patch: OK')
    } else {
      console.warn('  WARNING: LocalPlayback.java isCached pattern not found')
    }
  } catch (err) {
    console.error('Patch LocalPlayback.java isCached failed:', err.message)
  }

  // ===== 智能预缓存（prefetchToCache / cancelPrefetch）=====
  // 后台补全歌曲缺失片段写入 SimpleCache：CacheDataSource 读到 EOF 期间，
  // 已缓存段直接读盘不联网，仅缺口走上游下载，天然"跳过已下载部分"。
  // 任务串行单线程、最低优先级；cancelPrefetch 关闭数据源中断阻塞读并使队列中任务失效。
  const prefetchLocalOld = '    public void isCached(String url, Promise promise) {'
  const prefetchLocalNew = `    // ===== 智能预缓存：后台补全歌曲缺失片段（已缓存段不重复下载） =====
    private final java.util.concurrent.ExecutorService lxPrefetchExecutor = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "LxPrefetch");
        t.setPriority(Thread.MIN_PRIORITY);
        return t;
    });
    private final java.util.concurrent.atomic.AtomicInteger lxPrefetchSeq = new java.util.concurrent.atomic.AtomicInteger();
    private volatile int lxPrefetchCancelledSeq = -1;
    private volatile androidx.media3.datasource.DataSource lxPrefetchDataSource;

    public void prefetchToCache(String url, String cacheKey, Promise promise) {
        if (cache == null || cacheMaxSize <= 0) {
            promise.resolve(false);
            return;
        }
        final String key = (cacheKey != null && !cacheKey.isEmpty()) ? cacheKey : url;
        final int token = lxPrefetchSeq.incrementAndGet();
        lxPrefetchExecutor.execute(() -> {
            if (token <= lxPrefetchCancelledSeq) {
                promise.resolve(false);
                return;
            }
            try {
                androidx.media3.datasource.DataSource.Factory upstreamFactory = new androidx.media3.datasource.DefaultHttpDataSource.Factory()
                        .setUserAgent("Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                        .setConnectTimeoutMs(15000)
                        .setReadTimeoutMs(20000);
                CacheDataSource ds = new CacheDataSource.Factory()
                        .setCache(cache)
                        .setUpstreamDataSourceFactory(upstreamFactory)
                        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
                        .setCacheKeyFactory(dataSpec -> key)
                        .createDataSource();
                lxPrefetchDataSource = ds;
                try {
                    ds.open(new androidx.media3.datasource.DataSpec(android.net.Uri.parse(url)));
                    byte[] buffer = new byte[64 * 1024];
                    while (token > lxPrefetchCancelledSeq) {
                        if (ds.read(buffer, 0, buffer.length) == androidx.media3.common.C.RESULT_END_OF_INPUT) break;
                    }
                    promise.resolve(token > lxPrefetchCancelledSeq);
                } catch (Exception e) {
                    promise.resolve(false);
                } finally {
                    try { ds.close(); } catch (Exception ignored) {}
                    lxPrefetchDataSource = null;
                }
            } catch (Exception e) {
                promise.resolve(false);
            }
        });
    }

    public void cancelPrefetch(Promise promise) {
        lxPrefetchCancelledSeq = lxPrefetchSeq.get();
        androidx.media3.datasource.DataSource ds = lxPrefetchDataSource;
        if (ds != null) {
            try { ds.close(); } catch (Exception ignored) {}
        }
        promise.resolve(true);
    }

    public void isCached(String url, Promise promise) {`
  const prefetchExoOld = '    public abstract void isCached(String url, Promise promise);'
  const prefetchExoNew = `    public abstract void isCached(String url, Promise promise);

    public abstract void prefetchToCache(String url, String cacheKey, Promise promise);

    public abstract void cancelPrefetch(Promise promise);`
  const prefetchModuleOld = `    @ReactMethod
    public void isCached(String url, final Promise callback) {`
  const prefetchModuleNew = `    @ReactMethod
    public void prefetchToCache(String url, String cacheKey, final Promise callback) {
        waitForConnection(() -> binder.getPlayback().prefetchToCache(url, cacheKey, callback));
    }

    @ReactMethod
    public void cancelPrefetch(final Promise callback) {
        waitForConnection(() -> binder.getPlayback().cancelPrefetch(callback));
    }

    @ReactMethod
    public void isCached(String url, final Promise callback) {`

  const applyNamedPatch = async(filePath, name, anchor, replacement, idempotent) => {
    try {
      let file = (await fs.promises.readFile(filePath)).toString()
      if (file.includes(idempotent)) {
        console.log('  ' + name + ' already patched')
        return
      }
      if (!file.includes(anchor)) {
        console.warn('  WARNING: ' + name + ' pattern not found')
        return
      }
      file = file.replace(anchor, replacement)
      await fs.promises.writeFile(filePath, file)
      console.log(name + ' patch: OK')
    } catch (err) {
      console.error('Patch ' + name + ' failed:', err.message)
    }
  }

  await applyNamedPatch(localPlaybackPath, 'LocalPlayback.java prefetch',
    prefetchLocalOld, prefetchLocalNew, 'lxPrefetchExecutor')
  await applyNamedPatch(exoPlaybackPath, 'ExoPlayback.java prefetch',
    prefetchExoOld, prefetchExoNew, 'abstract void prefetchToCache')
  await applyNamedPatch(musicModulePath, 'MusicModule.java prefetch',
    prefetchModuleOld, prefetchModuleNew, 'public void prefetchToCache(String url, String cacheKey, final Promise callback)')

  console.log('\nDependencies patch finished.\n')
})()