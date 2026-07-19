// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const patchs = [
  // 隐藏 ViewPager2 原生组件的无障碍焦点，避免读屏朗读"多页面视图"
  // Paper 版本
  [
    path.join(rootPath, 'node_modules/react-native-pager-view/android/src/paper/java/com/reactnativepagerview/PagerViewViewManager.kt'),
    'val vp = ViewPager2(reactContext)\n        vp.adapter = ViewPagerAdapter()',
    'val vp = ViewPager2(reactContext)\n        vp.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO\n        vp.adapter = ViewPagerAdapter()',
  ],
  // Fabric 版本
  [
    path.join(rootPath, 'node_modules/react-native-pager-view/android/src/fabric/java/com/reactnativepagerview/PagerViewViewManager.kt'),
    'val vp = ViewPager2(reactContext)\n        vp.adapter = ViewPagerAdapter()',
    'val vp = ViewPager2(reactContext)\n        vp.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO\n        vp.adapter = ViewPagerAdapter()',
  ],
]

;(async() => {
  for (const [filePath, fromStr, toStr] of patchs) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath)).toString()
      await fs.promises.writeFile(filePath, file.replace(fromStr, toStr))
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }
  console.log('\nDependencies patch finished.\n')
})()

