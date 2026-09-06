/* eslint-disable @typescript-eslint/no-require-imports -- Offline catalogue generator. */
// A small dashboard index derived from the existing, reviewed ingredient catalogue.
// Keep the full catalogue and source evidence out of the initial dashboard bundle.
const fs = require('node:fs')
const path = require('node:path')
const catalog = require('../src/data/functionalIngredients.json')
const compact = value => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const notified = catalog.filter(item => item.category === 'notified')
const notifiedNames = [...new Set(notified.flatMap(item => [item.name, ...item.standards.map(s => s.name)]))]
const notifiedKeys = new Set(notifiedNames.map(compact))
const recognizedNames = [...new Set(catalog
  .filter(item => item.category === 'recognized' && !item.historicalRecognition)
  .flatMap(item => item.standards.map(s => s.name)))].filter(name => !notifiedKeys.has(compact(name))).sort()
const ranges = notified.flatMap(item => {
  const intakes = item.standards.flatMap(s => s.intakes)
  // Different functionality/dose/basis, fixed amounts and lower-bound-only standards
  // have no single range position. Do not choose an arbitrary functionality.
  const unique = [...new Map(intakes.map(i => [`${i.basis}|${i.amount}`, i])).values()]
  if (unique.length !== 1) return []
  const intake = unique[0]
  const amount = intake.amount.normalize('NFKC').replace(/µ/g, 'μ')
  const match = /^(?:[^0-9]*로서\s*)?([\d,.]+)\s*[~∼]\s*([\d,.]+)\s*(mg|g|μg)$/.exec(amount)
  if (!match) return []
  const min = Number(match[1].replace(/,/g, ''))
  const max = Number(match[2].replace(/,/g, ''))
  if (!(min >= 0 && max > min)) return []
  return [{ingredient: item.name, basis: intake.basis, min, max, unit: match[3], sourceUrl: item.standards[0].sourceUrl}]
})
fs.writeFileSync(path.join(__dirname, '../src/data/dashboardReferences.json'), JSON.stringify({
  reviewedOn: '2026-09-05', sourceUrl: 'https://www.mfds.go.kr/brd/m_211/view.do?seq=14973',
  recognizedNames, ranges,
}, null, 2) + '\n')
