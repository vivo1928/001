const { formatSingerName } = require('../utils')
const { signRequest } = require('./utils')

const filterData = (rawList) => {
  return rawList.map(item => ({
    id: item.album_mid || item.albumMID || item.mid,
    name: item.album_name || item.albumName || item.name,
    singer: formatSingerName(item.singers || item.singer || [], 'name'),
    img: (item.album_mid || item.albumMID) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.album_mid || item.albumMID}.jpg` : (item.albumPic || ''),
    source: 'tx',
    song_count: item.song_count || item.total || 0,
    publish_date: item.publish_date || item.publicTime || ''
  }))
}

const handleResult = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return []
  const seen = new Set()
  return rawList.filter(item => {
    const key = item.album_mid || item.albumMID || item.mid
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const search = async (str, page = 1, limit = 20, retryNum = 0) => {
  if (retryNum > 2) return { list: [], allPage: 0, limit, total: 0, source: 'tx' }

  try {
    const searchid = Math.random().toString().slice(2)
    const res = await signRequest({
      comm: {
        ct: '11',
        cv: '14090508',
        v: '14090508',
        tmeAppID: 'qqmusic',
        phonetype: 'EBG-AN10',
        deviceScore: '553.47',
        devicelevel: '50',
        newdevicelevel: '20',
        rom: 'HuaWei/EMOTION/EmotionUI_14.2.0',
        os_ver: '12',
        OpenUDID: '0',
        OpenUDID2: '0',
        QIMEI36: '0',
        udid: '0',
        chid: '0',
        aid: '0',
        oaid: '0',
        taid: '0',
        tid: '0',
        wid: '0',
        uid: '0',
        sid: '0',
        modeSwitch: '6',
        teenMode: '0',
        ui_mode: '2',
        nettype: '1020',
        v4ip: '',
      },
      req: {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicMobile',
        param: {
          search_type: 2,  // 2 = album (was 8)
          searchid,
          query: str,
          page_num: page,
          num_per_page: limit,
          highlight: 0,
          nqc_flag: 0,
          multi_zhida: 0,
          cat: 2,
          grp: 1,
          sin: 0,
          sem: 0
        }
      }
    })

    const body = res.body || res
    if (!body || !body.req || body.code !== 0 || body.req.code !== 0) {
      return search(str, page, limit, retryNum + 1)
    }

    const data = body.req.data
    const resultBody = data.body || data
    // Response has album_list in the body
    const rawList = resultBody.album_list || resultBody.album?.list || []
    const filteredList = handleResult(rawList)
    const list = filterData(filteredList)
    const total = (data.meta && data.meta.estimate_sum) || 0
    const allPage = Math.ceil(total / limit)

    return { list, allPage, limit, total, source: 'tx' }
  } catch (err) {
    return search(str, page, limit, retryNum + 1)
  }
}

module.exports = { search }