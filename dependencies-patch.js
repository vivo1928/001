// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const patchs = [
  // 隐藏 ViewPager2 原生组件的无障碍焦点，避免读屏朗读"多页面视图"
  // Paper 版本 - 使用正则匹配任意缩进，确保 patch 能正确应用
  [
    path.join(rootPath, 'node_modules/react-native-pager-view/android/src/paper/java/com/reactnativepagerview/PagerViewViewManager.kt'),
    /(val vp = ViewPager2\(reactContext\))\n(\s+)(vp\.adapter = ViewPagerAdapter\(\))/,
    '$1\n$2vp.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO\n$2$3',
  ],
  // Fabric 版本
  [
    path.join(rootPath, 'node_modules/react-native-pager-view/android/src/fabric/java/com/reactnativepagerview/PagerViewViewManager.kt'),
    /(val vp = ViewPager2\(reactContext\))\n(\s+)(vp\.adapter = ViewPagerAdapter\(\))/,
    '$1\n$2vp.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO\n$2$3',
  ],
]

;(async() => {
  for (const [filePath, fromStr, toStr] of patchs) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath)).toString()
      const newFile = file.replace(fromStr, toStr)
      if (newFile === file) {
        console.warn(`  WARNING: Patch pattern not matched in ${filePath.replace(rootPath, '')}`)
      } else {
        console.log(`  Successfully patched`)
      }
      await fs.promises.writeFile(filePath, newFile)
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }
  console.log('\nDependencies patch finished.\n')
})()