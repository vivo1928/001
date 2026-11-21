const { test } = require('node:test')
const assert = require('node:assert')
const { loadModule } = require('./helpers/loadModule')

const realSetTimeout = global.setTimeout
const flush = (ms = 20) => new Promise(resolve => realSetTimeout(resolve, ms))

const withFastTimers = async(fn) => {
  global.setTimeout = (cb) => { cb(); return 0 }
  try {
    await fn()
  } finally {
    global.setTimeout = realSetTimeout
  }
}

const buildState = () => ({
  files: new Set(),
  sizeOverride: null,
  downloads: [],
  stopped: [],
  unlinked: [],
  moved: [],
  toasts: [],
  downloadImpl: async() => ({ statusCode: 200 }),
})

const buildMocks = (state, overrides = {}) => Object.assign({
  react: { useRef: init => ({ current: init }) },
  '@/lang': { useI18n: () => (key) => key },
  '@/utils/fs': {
    downloadFile: (url, path, opts) => {
      state.downloads.push({ url, path })
      state.files.add(path)
      queueMicrotask(() => opts.progress?.({ bytesWritten: 50, contentLength: 100 }))
      return { jobId: state.downloads.length, promise: state.downloadImpl(url, path) }
    },
    stopDownload: (id) => { state.stopped.push(id) },
    mkdir: async() => {},
    existsFile: async(p) => state.files.has(p),
    unlink: async(p) => { state.unlinked.push(p); state.files.delete(p) },
    moveFile: async(from, to) => { state.moved.push([from, to]); state.files.delete(from); state.files.add(to) },
    stat: async() => ({ size: state.sizeOverride ?? 10 * 1024 * 1024 }),
    externalStorageDirectoryPath: '/sdcard',
  },
  '@/core/music/utils': {
    handleGetOnlineMusicUrl: async({ musicInfo }) => ({ url: `https://cdn.example/${musicInfo.id}.mp3`, quality: '128k' }),
  },
  '@/core/music/online': { buildQualityFallbackOrder: () => ['128k'] },
  '@/utils/appLog': { appLog: () => {} },
  '@/utils/permissions': { requestStoragePermission: async() => true },
  '@/utils/tools': {
    formatMusicName: (fmt, name, singer) => `${name} - ${singer}`,
    toast: (msg) => { state.toasts.push(msg) },
  },
  '@/store/setting/state': { setting: { 'download.fileName': ':name - :singer' } },
}, overrides)

const music = (id, name) => ({ id, name, singer: `singer${id}`, source: 'kg', meta: {} })

const buildManager = (state, overrides) => loadModule('src/core/download/manager.ts', buildMocks(state, overrides)).default

test('manager: 订阅式事件接收进度与完成，下载写 .part 成功后移动到目标路径', async() => {
  const state = buildState()
  const DownloadManager = buildManager(state)
  const dm = new DownloadManager()
  const events = []
  const off = dm.on({
    onProgress: (_id, p) => events.push(['p', p]),
    onComplete: (_id, ok) => events.push(['c', ok]),
  })

  dm.addToQueue(music('m1', 'A'), '128k')
  await flush()

  assert(events.some(e => e[0] === 'p'), '应收到进度事件')
  assert.deepStrictEqual(events.at(-1), ['c', true])
  assert.strictEqual(state.downloads[0].path.endsWith('.part'), true, '下载应先写 .part')
  assert.strictEqual(state.moved.length, 1, '成功后应移动到目标路径')
  assert.strictEqual(state.moved[0][0], state.downloads[0].path)
  assert.strictEqual(state.moved[0][1], state.downloads[0].path.slice(0, -'.part'.length))

  // 取消订阅后不再接收事件
  off()
  state.downloadImpl = async() => ({ statusCode: 200 })
  dm.addToQueue(music('m2', 'B'), '128k')
  await flush()
  assert.strictEqual(events.filter(e => e[0] === 'c').length, 1, '退订后不应再收到完成事件')
})

test('manager: cancelTask 取消下载停止传输并只清理该任务的 .part', async() => {
  const state = buildState()
  state.files.add('/sdcard/音乐下载/done.mp3')
  state.downloadImpl = () => new Promise(() => {})
  const DownloadManager = buildManager(state)
  const dm = new DownloadManager()

  const id = dm.addToQueue(music('m1', 'A'), '128k')
  await flush()
  dm.cancelTask(id)
  await flush()

  assert.strictEqual(state.stopped.length, 1, '应停止当前下载')
  assert.deepStrictEqual(state.unlinked, [state.downloads[0].path], '只删该任务的 .part')
  assert.strictEqual(state.files.has('/sdcard/音乐下载/done.mp3'), true, '已完成文件不受影响')
})

test('manager: cancelAll 只清理正在下载任务的半成品', async() => {
  const state = buildState()
  state.downloadImpl = () => new Promise(() => {})
  const DownloadManager = buildManager(state)
  const dm = new DownloadManager()

  dm.addToQueue(music('mA', 'A'), '128k')
  dm.addToQueue(music('mB', 'B'), '128k')
  await flush()
  dm.cancelAll()
  await flush()

  assert.strictEqual(state.downloads.length, 1, '同一时间只下载一个任务')
  assert.deepStrictEqual(state.unlinked, [state.downloads[0].path], '只删正在下载的 .part')
})

test('useDownloadFlow: getBatchSettleAction 收尾判定', () => {
  const { getBatchSettleAction } = loadModule('src/core/download/useDownloadFlow.ts', buildMocks(buildState()))
  assert.strictEqual(getBatchSettleAction('first', 1, 2, 0), 'wait')
  assert.strictEqual(getBatchSettleAction('first', 2, 2, 1), 'retry')
  assert.strictEqual(getBatchSettleAction('first', 2, 2, 0), 'settle')
  assert.strictEqual(getBatchSettleAction('retry', 3, 3, 1), 'settle')
  assert.strictEqual(getBatchSettleAction('retry', 2, 3, 1), 'wait')
})

test('useDownloadFlow: 单曲下载成功提示下载完成', async() => {
  const state = buildState()
  const { default: useDownloadFlow } = loadModule('src/core/download/useDownloadFlow.ts', buildMocks(state))
  const progress = { shown: [], closed: 0, show(t, o) { this.shown.push([t, o]) }, updateProgress() {}, close() { this.closed++ } }
  const flow = useDownloadFlow({ progress: { current: progress }, confirmAlert: { current: null } })

  flow.downloadSingle(music('m1', 'A'), { quality: '128k' })
  await flush()

  assert.strictEqual(progress.shown.length, 1, '应显示进度弹窗')
  assert(progress.closed >= 1, '完成后应关闭弹窗')
  assert.strictEqual(state.toasts.at(-1), 'download_completed')
})

test('useDownloadFlow: 单曲下载取消提示已取消且清理半成品', async() => {
  const state = buildState()
  state.downloadImpl = () => new Promise(() => {})
  const { default: useDownloadFlow } = loadModule('src/core/download/useDownloadFlow.ts', buildMocks(state))
  const progress = {
    shown: [], show(t, o) { this.shown.push([t, o]) }, updateProgress() {}, close() {},
  }
  const flow = useDownloadFlow({ progress: { current: progress }, confirmAlert: { current: null } })

  flow.downloadSingle(music('m1', 'A'), { quality: '128k' })
  await flush()
  progress.shown[0][1].onCancel()
  await flush()

  assert.strictEqual(state.toasts.at(-1), 'download_cancelled')
  assert.deepStrictEqual(state.unlinked, [state.downloads[0].path], '取消应清理 .part')
})

test('useDownloadFlow: 批量首败重试仍失败后给出失败清单', async() => {
  const state = buildState()
  state.downloadImpl = async(url) => url.includes('/b.mp3')
    ? { statusCode: 500 }
    : { statusCode: 200 }
  const { default: useDownloadFlow } = loadModule('src/core/download/useDownloadFlow.ts', buildMocks(state))
  const progress = { shown: [], show(t, o) { this.shown.push([t, o]) }, updateProgress() {}, close() {} }
  const failed = {
    shows: [],
    show(options) { this.shows.push(options) },
    showFailedSongs(songs, options) { this.shows.push({ songs, options }) },
  }
  const quality = { current: { show(_info, o) { this.onSelect = o.onSelect } }, onSelect: null }
  const flow = useDownloadFlow({
    progress: { current: progress },
    quality: { current: quality.current },
    failed: { current: failed },
    confirmAlert: { current: null },
  })

  const good = music('g', 'good')
  const bad = { ...music('b', 'bad'), meta: {} }
  await withFastTimers(async() => {
    flow.downloadBatch([good, bad])
    quality.current.onSelect('128k')
    await flush()
    await flush()
    await flush()
    await flush()
    await flush()
    await flush()
    await flush()
  })

  const failedCall = failed.shows.find(s => s.songs)
  assert(failedCall, '重试后仍失败应弹失败清单')
  assert.deepStrictEqual(failedCall.songs.map(s => s.name), ['bad'])
  assert.strictEqual(state.toasts.includes('download_completed'), false, '存在失败不应提示下载完成')
})

test('manager: 音源降级时按插件返回的真实音质改名并提示', async() => {
  const state = buildState()
  const DownloadManager = buildManager(state, {
    '@/core/music/utils': { handleGetOnlineMusicUrl: async() => ({ url: 'https://cdn.example/low.mp3', quality: '128k' }) },
    '@/core/music/online': { buildQualityFallbackOrder: () => ['flac', '320k', '128k'] },
  })
  const dm = new DownloadManager()
  const info = { id: 'm1', name: 'A', singer: 'S', source: 'kg', meta: { _qualitys: { '128k': {}, flac: {} } } }

  dm.addToQueue(info, 'flac')
  await flush()

  assert(state.downloads[0].path.endsWith('.mp3.part'), '应按真实音质 128k 使用 mp3 后缀')
  assert(state.toasts.some(x => x.includes('已降级为 128k')), '应提示实际降级音质')
})

test('manager: 下载文件明显小于标称大小时警告', async() => {
  const state = buildState()
  state.sizeOverride = 3 * 1024 * 1024
  const DownloadManager = buildManager(state, {
    '@/core/music/utils': { handleGetOnlineMusicUrl: async() => ({ url: 'https://cdn.example/x.flac', quality: 'flac' }) },
  })
  const dm = new DownloadManager()
  const info = { id: 'm1', name: 'A', singer: 'S', source: 'kg', meta: { _qualitys: { flac: { size: '30MB' } } } }

  dm.addToQueue(info, 'flac')
  await flush()

  assert(state.toasts.some(x => x.includes('明显小于')), '应提示大小与标称不符')
})

test('useDownloadFlow: 多个单曲任务全部完成才关闭弹窗', async() => {
  const state = buildState()
  const pending = []
  state.downloadImpl = () => new Promise(resolve => { pending.push(resolve) })
  const { default: useDownloadFlow } = loadModule('src/core/download/useDownloadFlow.ts', buildMocks(state))
  const progress = { shown: [], closed: 0, show(t, o) { this.shown.push([t, o]) }, updateProgress() {}, close() { this.closed++ } }
  const flow = useDownloadFlow({ progress: { current: progress }, confirmAlert: { current: null } })

  flow.downloadSingle(music('a', 'A'), { quality: '128k' })
  flow.downloadSingle(music('b', 'B'), { quality: '128k' })
  await flush()
  assert.strictEqual(pending.length, 1, '同一时间只下载一个任务')
  pending[0]({ statusCode: 200 })
  await flush()
  assert.strictEqual(progress.closed, 0, '首个任务完成不应关闭弹窗')
  assert.strictEqual(pending.length, 2, '第二个任务应继续下载')
  pending[1]({ statusCode: 200 })
  await flush()
  assert.strictEqual(progress.closed, 1, '全部任务完成才关闭弹窗')
})
