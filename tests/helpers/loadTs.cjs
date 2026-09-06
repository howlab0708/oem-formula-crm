/* eslint-disable @typescript-eslint/no-require-imports -- Transpiles TypeScript for the CommonJS test runner. */
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

module.exports = function createLoader(overrides = {}) {
  const cache = new Map()
  function load(relativePath) {
    const filename = path.resolve(__dirname, '../..', relativePath)
    if (Object.hasOwn(overrides, filename)) return overrides[filename]
    if (cache.has(filename)) return cache.get(filename).exports
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    const loaded = new Module(filename, module)
    cache.set(filename, loaded)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const native = loaded.require.bind(loaded)
    loaded.require = (name) => name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : native(name)
    loaded._compile(compiled, filename)
    return loaded.exports
  }
  return load
}
