const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function loadTs(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const native = loaded.require.bind(loaded)
  loaded.require = name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : native(name)
  loaded._compile(compiled, filename)
  return loaded.exports
}
const { filterHistoryReducer: reduce, INITIAL_FILTER_HISTORY: initial, FILTER_HISTORY_LIMIT } = loadTs('src/lib/filterHistory.ts')
const { EMPTY_FILTERS, filterChips, applyFilters } = loadTs('src/lib/filters.ts')
const change = (state, update, group) => reduce(state, { type: 'change', update, group })

test('removes one selected condition without disturbing any other condition and restores the exact prior state', () => {
  const filters = { ...EMPTY_FILTERS, query: '브랜드', mains: ['비타민C', '엽산'], mainMode: 'any', forms: ['정제'], manufacturers: ['제조원'], subInclude: ['원료 A'], subExclude: ['원료 B'], weightMin: 300, weightMax: 800, marker: { name: '비타민 C', unit: 'mg', min: 10, max: 100 } }
  const selected = change(initial, filters)
  const original = JSON.stringify(filters)
  for (const chip of filterChips(filters)) {
    const removed = change(selected, chip.remove(filters))
    assert.equal(filterChips(removed.current).length, filterChips(filters).length - 1)
    assert.ok(!filterChips(removed.current).some(item => item.key === chip.key))
    assert.deepEqual(filterChips(removed.current).map(item => item.key), filterChips(filters).filter(item => item.key !== chip.key).map(item => item.key))
    assert.deepEqual(reduce(removed, { type: 'restore', index: removed.previous.length - 1 }).current, filters)
  }
  assert.equal(JSON.stringify(filters), original)
})

test('recovers matching references after a mistaken incompatible condition, including zero-result searches', () => {
  const products = [{ id: 'one', name: '비타민 제품', manufacturer: '제조원', mainDetail: '', form: '정제', mainIngredients: ['비타민C'], subIngredients: [], markers: [] }]
  const selected = change(initial, { ...EMPTY_FILTERS, mains: ['비타민C'] })
  const wrong = change(selected, previous => ({ ...previous, mains: [...previous.mains, '엽산'] }))
  assert.equal(applyFilters(products, wrong.current).length, 0)
  const restored = reduce(wrong, { type: 'restore', index: wrong.previous.length - 1 })
  assert.deepEqual(applyFilters(products, restored.current).map(product => product.id), ['one'])
  const cleared = change(restored, EMPTY_FILTERS)
  assert.deepEqual(reduce(cleared, { type: 'restore', index: cleared.previous.length - 1 }).current, restored.current)
})

test('typing a search term is one undo step; a later editing session is a new step', () => {
  const selected = change(initial, { ...EMPTY_FILTERS, mains: ['비타민C'] })
  let state = change(selected, previous => ({ ...previous, query: '종' }), 'query')
  state = change(state, previous => ({ ...previous, query: '종근' }), 'query')
  state = change(state, previous => ({ ...previous, query: '종근당' }), 'query')
  assert.equal(state.previous.length, 2)
  assert.deepEqual(state.previous.at(-1), selected.current)
  state = reduce(state, { type: 'end-edit' })
  state = change(state, previous => ({ ...previous, query: '서흥' }), 'query')
  assert.equal(state.previous.at(-1).query, '종근당')
  assert.equal(reduce(state, { type: 'restore', index: state.previous.length - 1 }).current.query, '종근당')
})

test('range entry coalesces without overwriting the prior bounds, and discrete selections remain separate', () => {
  let state = change(initial, { ...EMPTY_FILTERS, weightMin: 3 }, 'weight-range')
  state = change(state, previous => ({ ...previous, weightMin: 300 }), 'weight-range')
  state = reduce(state, { type: 'end-edit' })
  state = change(state, previous => ({ ...previous, weightMax: 800 }), 'weight-range')
  state = change(state, previous => ({ ...previous, forms: ['정제'] }))
  assert.deepEqual(state.previous.map(previous => [previous.weightMin, previous.weightMax]), [[null, null], [300, null], [300, 800]])
})

test('returning to an earlier selection restores the entire condition set and continues from that point', () => {
  const first = change(initial, { ...EMPTY_FILTERS, mains: ['비타민C'] })
  const second = change(first, previous => ({ ...previous, forms: ['정제'] }))
  const third = change(second, previous => ({ ...previous, subExclude: ['원료 A'] }))
  const restored = reduce(third, { type: 'restore', index: 1 })
  assert.deepEqual(restored.current, first.current)
  assert.deepEqual(restored.previous, [EMPTY_FILTERS])
  const continued = change(restored, previous => ({ ...previous, forms: ['분말'] }))
  assert.deepEqual(continued.current, { ...first.current, forms: ['분말'] })
  assert.deepEqual(continued.previous, [EMPTY_FILTERS, first.current])
})

test('no-op actions do not add history and retained history stays bounded', () => {
  assert.equal(change(initial, { ...EMPTY_FILTERS }), initial)
  assert.equal(reduce(initial, { type: 'restore', index: -1 }), initial)
  assert.equal(reduce(initial, { type: 'restore', index: 100 }), initial)
  let state = initial
  for (let index = 1; index <= 30; index++) state = change(state, { ...EMPTY_FILTERS, query: String(index) })
  assert.equal(state.previous.length, FILTER_HISTORY_LIMIT)
  assert.equal(state.previous[0].query, '10')
  assert.equal(state.previous.at(-1).query, '29')
})

test('changing the product dataset clears obsolete condition history rather than enabling invalid restores', () => {
  const state = change(initial, { ...EMPTY_FILTERS, mains: ['비타민C'] })
  assert.deepEqual(reduce(state, { type: 'clear' }), initial)
})
