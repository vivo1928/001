// 测试用模块加载器：用全局 typescript 转译真实源码为 CommonJS 后执行，
// RN 依赖通过 mocks 注入，被测逻辑始终是 src 下的真实代码。
const fs = require('fs')
const path = require('path')

let ts
try {
  ts = require('typescript')
} catch {
  ts = require('/usr/local/lib/node_modules/typescript')
}

const resolveFile = (request, fromDir) => {
  const base = path.resolve(fromDir, request)
  for (const p of [base, base + '.js', base + '.ts', base + '.tsx', path.join(base, 'index.js'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  throw new Error(`无法解析模块: ${request} (from ${fromDir})`)
}

const load = (filePath, mocks, cache) => {
  const abs = path.resolve(filePath)
  if (cache.has(abs)) return cache.get(abs)
  const source = fs.readFileSync(abs, 'utf8')
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: abs,
  })
  const module = { exports: {} }
  cache.set(abs, module.exports)
  const localRequire = (request) => {
    if (request in mocks) return mocks[request]
    if (request.startsWith('.') || request.startsWith('/')) {
      return load(resolveFile(request, path.dirname(abs)), mocks, cache)
    }
    throw new Error(`未提供 mock 的外部依赖: ${request} (from ${abs})`)
  }
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', out.outputText)
  fn(module.exports, localRequire, module, abs, path.dirname(abs))
  cache.set(abs, module.exports)
  return module.exports
}

const loadModule = (filePath, mocks = {}) => load(filePath, mocks, new Map())

module.exports = { loadModule }
