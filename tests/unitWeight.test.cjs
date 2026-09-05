const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function loadTs(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const loaded = new Module(filename,module)
  loaded.filename=filename
  loaded.paths=Module._nodeModulePaths(path.dirname(filename))
  const native=loaded.require.bind(loaded)
  loaded.require=name=>name.startsWith('.')?loadTs(path.resolve(path.dirname(filename),`${name}.ts`)):native(name)
  loaded._compile(compiled,filename)
  return loaded.exports
}
const {parseUnitWeightMg}=loadTs('src/lib/unitWeight.ts')
const {mapHeaders,rowToProduct}=loadTs('src/lib/csvSchema.ts')
const {weightSummary}=loadTs('src/lib/analytics.ts')
const {applyFilters,EMPTY_FILTERS}=loadTs('src/lib/filters.ts')
const codec=loadTs('src/lib/datasetSnapshot.ts')
const parse=(intakeMethod,extra={})=>parseUnitWeightMg({form:'정제',intakeMethod,...extra})

test('uses one pill, never one intake or one day',()=>{
  assert.equal(parse('1일 3회, 1회2캡슐(250mg/1캡슐)',{form:'경질캡슐'}),250)
  assert.equal(parse('1일 2회, 1회 2정(1정당 900mg)'),900)
  assert.equal(parse('1일 2회, 1회 2정(1,000mg)'),500)
  assert.equal(parse('1회 2정(500mg×2정)'),500)
  assert.equal(parse('1회 2정, 1,000mg/2정'),500)
  assert.equal(parse('1회 2캡슐(1.2g)',{form:'연질캡슐'}),600)
  assert.equal(parse('1정 500㎎'),500)
  assert.equal(parse('1정 중량: 0.75 g'),750)
  assert.equal(parse('1회 500mg(2정)'),250)
})

test('does not infer unit mass from unqualified specifications, nutrients or volume',()=>{
  assert.equal(parse('1일 3회, 1회 3정',{declaredWeight:'2.25g'}),null)
  assert.equal(parse('1일 1회, 1회 2정 비타민C 1,000mg'),null)
  assert.equal(parse('1일 1회, 1회 1캡슐(2ml)'),null)
  assert.equal(parse('1회 1포(2g)',{form:'분말'}),null)
  assert.equal(parse('1일 1회 1캡슐(500mg)',{form:'액상'}),null)
  assert.equal(parse(''),null)
  assert.equal(parse('1회 1포(6g/환)',{form:'환'}),null)
})

test('rejects variable counts, conflicts, zero and missing denominators',()=>{
  for(const input of ['1회 1~2정(1,000mg)','1정(500mg), 1정당 600mg','500mg/0정','1정(0mg)','1회 2정(500~600mg)','1회 2정(500mg씩)','1회 2정(1.100mg)','0.5정(500mg)','1/2정(500mg)','1회 1g(17환) / 3g(50환 또는 1포)']) assert.equal(parse(input),null,input)
  assert.equal(parse('1정(500mg), 1정당 500mg'),500)
  assert.equal(parse('1회 1포[캡슐(400mg), 2정(500mg, 600mg)]'),null)
  assert.equal(parse('1정(500mg~600mg)'),null)
  assert.equal(parse('',{declaredWeight:'2정(500mg, 600mg)'}),null)
})

test('CSV import preserves old fields and adds verified unit mass; export columns round trip',()=>{
  const mapping=mapHeaders(['PRDLST_NM','PRDT_SHAP_CD_NM','NTK_MTHD','STDR_STND'])
  const product=rowToProduct(['영양칼슘비타민','캡슐','1일 3회, 1회2캡슐(250mg/1캡슐)','칼슘: 표시량(285.9mg/1500mg)의 80~150%'],mapping,0)
  assert.equal(product.weightMg,1500)
  assert.equal(product.unitWeightMg,250)
  const exported=mapHeaders(['제품명','제조원','제형','규격','주원료','지표성분 함량','부원료','1알 중량(mg)','섭취방법'])
  assert.equal(exported.index.unitWeight,7)
  const restored=rowToProduct([product.name,'제조원','캡슐',product.weightLabel,'','칼슘: 표시량(285.9mg/1500mg)의 80~150%','','250',product.intakeMethod],exported,0)
  assert.equal(restored.unitWeightMg,250)
})

test('median and weight filtering include verified pill units only, with no legacy fallback',()=>{
  const base={id:'test',name:'test',manufacturer:'',form:'정제',formRaw:'정',weightLabel:'2g',weightMg:2000,mainIngredients:[],mainDetail:'',markers:[],subIngredients:[]}
  const products=[{...base,unitWeightMg:250},{...base,unitWeightMg:750},{...base,unitWeightMg:null},{...base},{...base,form:'액상',unitWeightMg:10000}]
  assert.deepEqual(weightSummary(products),{median:500,sampleSize:2})
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,weightMin:200,weightMax:300}).map(p=>p.unitWeightMg),[250])
  assert.equal(weightSummary(products.slice(2)),null)
})

test('new snapshot format preserves exact unit weights, intake sources and absent legacy fields',()=>{
  const base={id:'test',name:'test',manufacturer:'',form:'정제',formRaw:'정',weightLabel:'2g',weightMg:2000,mainIngredients:[],mainDetail:'',markers:[],subIngredients:[]}
  const products=[base,{...base,unitWeightMg:null,intakeMethod:''},{...base,unitWeightMg:333.333,intakeMethod:'1회 3정(1g)'}]
  const meta={generation:'pill',imported_rows:products.length}
  assert.deepEqual(codec.unpackSnapshot(JSON.parse(JSON.stringify(codec.packSnapshot(meta,products))),meta),products)
  assert.throws(()=>codec.unpackSnapshot({...codec.packSnapshot(meta,products),version:1},meta))
})
