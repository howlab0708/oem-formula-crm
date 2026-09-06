/* eslint-disable @typescript-eslint/no-require-imports -- Existing Node test runner uses CommonJS. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { mainIngredientSummary } = load('src/lib/mainAnalytics.ts')
const { buildBriefing } = load('src/lib/export/briefing.ts')
const { applyFilters, EMPTY_FILTERS } = load('src/lib/filters.ts')
const product = (mainIngredients) => ({ id: 'x', name: '', manufacturer: '', form: '정제', mainIngredients, subIngredients: [], markers: [], mainDetail: '' })

test('main statistics count equivalent names once per product without modifying originals', () => {
  const products = [product(['비타민 C', '비타민C(고시형)', '비타민B2']), product(['비타민C', '비타민B2(Riboflavin)']), product([])]
  const original = JSON.stringify(products)
  const result = mainIngredientSummary(products)
  assert.equal(result.stats.average, 4 / 3)
  assert.equal(result.stats.median, 2)
  assert.deepEqual(result.stats.histogram.map((b) => b.count), [1, 0, 2])
  assert.equal(result.topIngredients.length, 2)
  assert.equal(result.topCombos.length, 1)
  assert.equal(result.topCombos[0].count, 2)
  assert.equal(result.topCombos[0].share, 2 / 3)
  assert.equal(JSON.stringify(products), original)
})

test('all main pairs are counted even after the tenth ingredient; 10+ means ten or more', () => {
  const mains = Array.from({ length: 11 }, (_, i) => `원료${i}`)
  const result = mainIngredientSummary([product(mains), product(['원료9', '원료10'])])
  assert.equal(result.stats.histogram[10].count, 1)
  assert.deepEqual(result.topCombos[0].ingredients, ['원료10', '원료9'])
  assert.equal(result.topCombos[0].count, 2)
  assert.equal(mainIngredientSummary([product(['A', 'B'])]).topCombos.length, 0)
  assert.equal(mainIngredientSummary([]).stats.histogram.length, 0)
})

test('main charts and briefing use exactly the current filtered population', () => {
  const products = [product(['A', 'B']), product(['A', 'B']), product(['C'])]
  const selected = applyFilters(products, { ...EMPTY_FILTERS, mains: ['A'] })
  const briefing = buildBriefing(selected, EMPTY_FILTERS, products.length)
  assert.equal(briefing.referenceCount, 2)
  assert.equal(briefing.main.topCombos[0].share, 1)
  assert.equal(briefing.main.stats.average, 2)
})
